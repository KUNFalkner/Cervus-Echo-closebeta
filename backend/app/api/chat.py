from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
from datetime import datetime, timezone
import json
import logging

from app.models.database import SessionLocal
from app.models.message import Message
from app.models.user import User

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

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
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
            db.query(Message, User.nickname)
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
                "content": msg.content,
                "timestamp": iso_utc(msg.created_at),
            }
            for msg, nickname in reversed(rows)
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


@router.websocket("/ws/{room_id:path}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    try:
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

            content = (message.get("content") or "").strip()
            if not content:
                continue
            content = content[:MAX_CONTENT_LEN]

            user_id = message.get("user_id")
            if not isinstance(user_id, int):
                user_id = None

            msg_id, created_at = save_message(room_id, user_id, content)

            await manager.broadcast(room_id, json.dumps({
                "type": "message",
                "id": msg_id,
                "room_id": room_id,
                "user_id": user_id,
                "nickname": message.get("nickname") or "匿名用户",
                "content": content,
                "timestamp": created_at,
            }, ensure_ascii=False))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("聊天连接异常 room_id=%s", room_id)
    finally:
        manager.disconnect(room_id, websocket)
