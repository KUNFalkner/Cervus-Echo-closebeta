from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Optional, Set
from datetime import datetime, timezone
import json
import logging

from app.auth import ws_authenticate
from app.models.database import SessionLocal
from app.models.message import Message
from app.models.user import User
from app.models.group import ChatGroup, ChatGroupMember
from app.services.mute import is_muted, mute_message
from app.services.sensitive_words import sensitive_filter
from app.core.ratelimit import rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()

HISTORY_LIMIT = 50
MAX_CONTENT_LEN = 2000


def iso_utc(dt):
    """SQLite 的 func.now() 存的是 UTC 裸时间；不标时区前端会按本地时区解析，差好几个钟头。"""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# 连接管理：按房间分组，互不串台
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}

    def join(self, room_id: str, websocket: WebSocket):
        self.rooms.setdefault(room_id, set()).add(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        peers = self.rooms.get(room_id)
        if not peers:
            return
        peers.discard(websocket)
        if not peers:
            self.rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, message: str):
        """单个死连接不得中断其他人的投递。"""
        dead = []
        for connection in list(self.rooms.get(room_id, ())):
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(room_id, connection)


manager = ConnectionManager()


def load_history(room_id: str):
    """最近 HISTORY_LIMIT 条历史，按时间正序返回。"""
    db = SessionLocal()
    try:
        rows = (
            db.query(Message, User.nickname, User.avatar)
            .outerjoin(User, User.id == Message.user_id)
            .filter(Message.room_id == room_id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(HISTORY_LIMIT)
            .all()
        )
        return [
            {
                "type": "message",
                "id": msg.id,
                "room_id": msg.room_id,
                "user_id": msg.user_id,
                "nickname": nickname or "匿名用户",
                "avatar": avatar,
                "content": msg.content,
                "timestamp": iso_utc(msg.created_at),
            }
            for msg, nickname, avatar in reversed(rows)
        ]
    except Exception:
        logger.exception("加载聊天历史失败 room_id=%s", room_id)
        return []
    finally:
        db.close()


def save_message(room_id: str, user_id, content: str):
    """落库并返回消息 id 与服务端时间戳。"""
    db = SessionLocal()
    try:
        row = Message(room_id=room_id, user_id=user_id, content=content)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id, iso_utc(row.created_at) or iso_utc(datetime.now(timezone.utc))
    except Exception:
        db.rollback()
        logger.exception("保存聊天消息失败 room_id=%s", room_id)
        return None, iso_utc(datetime.now(timezone.utc))
    finally:
        db.close()


def authenticate(token: Optional[str]):
    """握手期鉴权：返回 (user_id, nickname, avatar)，token 无效返回 None。"""
    db = SessionLocal()
    try:
        user = ws_authenticate(token, db)
        if user is None:
            return None
        return user.id, user.nickname or "匿名用户", user.avatar
    finally:
        db.close()


def load_sender_state(user_id: int):
    """返回 (禁言提示或 None, 最新昵称, 最新头像, 是否封禁)。

    复用同一次查询顺带取最新昵称/头像：否则广播会一直用握手那一刻的旧值，
    用户改完头像得重连才生效。
    """
    db = SessionLocal()
    try:
        sender = db.query(User).filter(User.id == user_id).first()
        if sender is None:
            return None, None, None, False
        muted = mute_message(sender) if is_muted(sender) else None
        banned = getattr(sender, "banned", False)
        return muted, sender.nickname, sender.avatar, banned
    finally:
        db.close()


def can_join_room(user_id: int, room_id: str) -> bool:
    """群聊房间 group/{gid} 仅成员可连；公共聊天室教师/校方不可进。

    注意：前端隐藏「聊天室」标签只是界面，真正的闸门在这里 —— 否则教师
    可以直接连 WS 读发。私信（dm）不受此限，教师仍可私信学生。
    """
    db = SessionLocal()
    try:
        # 公共聊天室（chat/*）：教师/校方不可进
        if room_id.startswith("chat/"):
            u = db.query(User).filter(User.id == user_id).first()
            return not (u and u.role in ("teacher", "school_official"))
        # 私信（dm/*）不受限：教师仍可私信学生
        if not room_id.startswith("group/"):
            return True
        try:
            gid = int(room_id.split("/", 1)[1])
        except (IndexError, ValueError):
            return False
        g = db.query(ChatGroup).filter(ChatGroup.id == gid, ChatGroup.disbanded_at.is_(None)).first()
        if g is None:
            return False
        member = (
            db.query(ChatGroupMember)
            .filter(
                ChatGroupMember.group_id == gid,
                ChatGroupMember.user_id == user_id,
                ChatGroupMember.left_at.is_(None),
            )
            .first()
        )
        return member is not None
    finally:
        db.close()


@router.websocket("/ws/{room_id:path}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: Optional[str] = None):
    # 浏览器原生 WebSocket 无法带自定义 header，token 走查询参数
    identity = authenticate(token)
    if identity is None:
        await websocket.close(code=4401)
        return
    user_id, nickname, avatar = identity

    # 群聊房间 group/{gid} 仅成员可连（公共聊天室无此限制）
    if not can_join_room(user_id, room_id):
        await websocket.close(code=4403)
        return

    is_group_room = room_id.startswith("group/")

    await websocket.accept()
    manager.join(room_id, websocket)
    try:
        # 群聊历史走 REST（需要按查看者脱敏焚毁内容），WS 只负责实时推送
        if not is_group_room:
            for item in load_history(room_id):
                await websocket.send_text(json.dumps(item, ensure_ascii=False))

        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                if not isinstance(message, dict):
                    raise ValueError("payload is not an object")
            except (json.JSONDecodeError, ValueError):
                # 畸形帧直接丢弃，不能让整条连接陪葬
                continue

            # 输入中状态等信令：仅转发给同房间其他人，不落库
            msg_type = message.get("type")
            if msg_type in ("typing", "stop"):
                await manager.broadcast(room_id, json.dumps({
                    "type": msg_type,
                    "sender_id": user_id,
                }, ensure_ascii=False))
                continue

            if is_group_room:
                # 群消息必须走 POST /api/groups/{gid}/messages（携带焚毁模式）
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "detail": "群聊消息请通过发送接口提交",
                }, ensure_ascii=False))
                continue

            content = (message.get("content") or "").strip()
            if not content:
                continue
            content = content[:MAX_CONTENT_LEN]
            # 私信同样过敏感词过滤（与帖子/评论一致：命中词打码为 *）
            content = sensitive_filter.filter_text(content)

            # 身份只认握手时认证出来的那个人，客户端帧里的 user_id / nickname 一律忽略
            # 封禁 / 禁言拦截：仅向发送者回送错误帧，不影响房间其他人
            muted, cur_nickname, cur_avatar, banned = load_sender_state(user_id)
            if banned:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "detail": "账号已被封禁，无法发送消息",
                }, ensure_ascii=False))
                continue
            if muted:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "detail": muted,
                }, ensure_ascii=False))
                continue

            # 频率限制：聊天 15 条/分钟（与禁言同款：仅回送错误帧，不影响房间）
            try:
                rate_limit("chat", 15, 60, user_id=user_id)
            except Exception as e:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "detail": getattr(e, "detail", "操作过于频繁"),
                }, ensure_ascii=False))
                continue

            msg_id, created_at = save_message(room_id, user_id, content)

            await manager.broadcast(room_id, json.dumps({
                "type": "message",
                "id": msg_id,
                "room_id": room_id,
                "user_id": user_id,
                "nickname": cur_nickname or nickname,
                "avatar": cur_avatar if cur_avatar is not None else avatar,
                "content": content,
                "timestamp": created_at,
            }, ensure_ascii=False))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("聊天连接异常 room_id=%s", room_id)
    finally:
        manager.disconnect(room_id, websocket)
