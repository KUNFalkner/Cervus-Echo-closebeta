from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List
from datetime import datetime, timezone
import json
import logging

from app.auth import require_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.conversation import Conversation, DirectMessage
from app.models.burn import MessageRead
from app.models.notification import Notification as NotificationModel
from app.schemas.social import CreateConversation, SendMessage
from app.schemas.user import PublicUser
from app.services.sensitive_words import sensitive_filter
from app.services.mute import is_muted, mute_message, assert_not_banned
from app.services.notif import create_notification
from app.services import burn as burn_svc
from app.services.crypto import encrypt_text
from app.core.ratelimit import rate_limit
from app.api.chat import manager as ws_manager  # 复用聊天 WS 的连接管理器，向 dm/{conv_id} 房间广播信令

router = APIRouter(tags=["dm"])

MAX_DM_LEN = 4000


def _peer_id(conv: Conversation, me: int) -> int:
    return conv.user_b if conv.user_a == me else conv.user_a


def _iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _peer_public(db: Session, peer_id: int) -> dict:
    peer = db.query(UserModel).filter(UserModel.id == peer_id).first()
    if peer:
        return PublicUser.model_validate(peer).model_dump()
    # 对方已注销：返回占位，避免前端崩溃
    return {
        "id": peer_id, "nickname": "已注销用户", "avatar": None,
        "role": "student", "school_id": "", "profile_bg": "",
        "karma": 0, "is_anonymous": True,
    }


@router.get("/conversations")
def list_conversations(
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    burn_svc.maybe_sweep(db)
    convs = (
        db.query(Conversation)
        .filter((Conversation.user_a == user.id) | (Conversation.user_b == user.id))
        # 【站长 2026-09-17】我删除的会话不再出现在我的列表（对方视角不受影响）
        .filter(
            or_(
                Conversation.user_a != user.id,
                Conversation.hidden_a.isnot(True),
            ),
            or_(
                Conversation.user_b != user.id,
                Conversation.hidden_b.isnot(True),
            ),
        )
        .order_by(Conversation.last_time.desc())
        .all()
    )
    now = burn_svc.utcnow_naive()
    out = []
    for c in convs:
        pid = _peer_id(c, user.id)
        # 未读：永久消息沿用 read 列；焚毁消息 = 我那份还没焚（没看/没过期）
        unread = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.conversation_id == c.id,
                DirectMessage.sender_id != user.id,
                DirectMessage.burned_at.is_(None),
                or_(DirectMessage.expires_at.is_(None), DirectMessage.expires_at > now),
            )
            .filter(
                or_(
                    and_(DirectMessage.burn_mode.is_(None), DirectMessage.read == False),
                    and_(
                        DirectMessage.burn_mode.isnot(None),
                        ~db.query(MessageRead.id).filter(
                            MessageRead.source == "dm",
                            MessageRead.message_id == DirectMessage.id,
                            MessageRead.user_id == user.id,
                            MessageRead.burned_at.isnot(None),
                        ).exists(),
                    ),
                )
            )
            .count()
        )
        # 会话摘要：最后一条焚毁消息且已焚 -> 显示已焚占位
        last = (
            db.query(DirectMessage)
            .filter(DirectMessage.conversation_id == c.id)
            .order_by(DirectMessage.id.desc())
            .first()
        )
        burned_last = bool(last and last.burn_mode and (last.burned_at is not None or burn_svc.is_expired(last, now)))
        summary = burn_svc.BURNED_TEXT if burned_last else c.last_message
        if last and last.burn_mode and not burned_last and c.last_message == burn_svc.PLACEHOLDER:
            summary = burn_svc.PLACEHOLDER
        out.append({
            "id": c.id,
            "peer": _peer_public(db, pid),
            "last_message": summary,
            "last_time": _iso(c.last_time),
            "unread": unread,
            "last_burned": burned_last,
        })
    return out


@router.post("/conversations")
def create_conversation(
    body: CreateConversation,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    if body.peer_id == user.id:
        raise HTTPException(status_code=400, detail="不能给自己发私信")
    peer = db.query(UserModel).filter(UserModel.id == body.peer_id).first()
    if not peer:
        raise HTTPException(status_code=404, detail="用户不存在")
    a, b = sorted([user.id, body.peer_id])
    conv = db.query(Conversation).filter(Conversation.user_a == a, Conversation.user_b == b).first()
    if not conv:
        conv = Conversation(user_a=a, user_b=b)
        db.add(conv)
        db.commit()
        db.refresh(conv)
    return {"id": conv.id, "peer": PublicUser.model_validate(peer).model_dump()}


@router.get("/conversations/{conv_id}/messages")
async def list_messages(
    conv_id: int,
    limit: int = Query(50, ge=1, le=100),
    before: int = None,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not (conv.user_a == user.id or conv.user_b == user.id):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    q = db.query(DirectMessage).filter(DirectMessage.conversation_id == conv_id)
    if before:
        q = q.filter(DirectMessage.id < before)
    msgs = q.order_by(DirectMessage.id.desc()).limit(limit).all()[::-1]
    # 收信方打开会话即标记已读（仅永久消息；焚毁消息等 view 接口）
    read_ids = []
    for m in msgs:
        if m.sender_id != user.id and not m.read and m.burn_mode is None:
            m.read = True
            read_ids.append(m.id)
    db.commit()
    # 已读回执：实时通知发信方（发信方正停留在该会话即可收到）
    if read_ids:
        try:
            await ws_manager.broadcast(f"dm/{conv_id}", json.dumps({
                "type": "read",
                "conversation_id": conv_id,
                "message_ids": read_ids,
                "reader_id": user.id,
            }, ensure_ascii=False))
        except Exception:
            logging.getLogger(__name__).exception("DM read-receipt broadcast failed")
    now = burn_svc.utcnow_naive()
    out = []
    for m in msgs:
        item = {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "sender_id": m.sender_id,
            "read": bool(m.read),
            "created_at": _iso(m.created_at),
        }
        r = burn_svc.render_for(db, "dm", m, user.id, now)
        item.update(r)  # burn_mode / content / burned / state
        if getattr(m, "recalled", False):
            item.update({"recalled": True, "content": None, "burn_mode": None})
        out.append(item)
    return out


@router.post("/conversations/{conv_id}/messages")
async def send_message(
    conv_id: int,
    body: SendMessage,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    rate_limit("dm", 30, 60, user_id=user.id)
    if is_muted(user):
        raise HTTPException(status_code=403, detail=mute_message(user))
    assert_not_banned(user)
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not (conv.user_a == user.id or conv.user_b == user.id):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    # 发消息即解除双方隐藏态（删除会话后对方回信，会话重新出现在列表——微信语义）
    conv.hidden_a = False
    conv.hidden_b = False
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="消息不能为空")
    hits = sensitive_filter.find_hits(content)
    if hits:
        raise HTTPException(status_code=400, detail=f"消息包含违规词语（{hits[0]}…），请修改后重试")
    content = content[:MAX_DM_LEN]
    burn_mode = (body.burn_mode or "").strip() or None
    if burn_mode and burn_mode not in burn_svc.BURN_MODES:
        raise HTTPException(status_code=400, detail="无效的焚毁模式")

    msg = DirectMessage(conversation_id=conv_id, sender_id=user.id, content=content)
    db.add(msg)
    if burn_mode:
        # 焚毁消息：正文只以密文落库，content 置空；会话摘要存占位
        enc = encrypt_text(content)
        db.flush()
        burn_svc.arm_burn(db, msg, "dm", burn_mode, [_peer_id(conv, user.id)], enc)
        msg.content = None
        conv.last_message = burn_svc.PLACEHOLDER
    else:
        conv.last_message = content
    conv.last_time = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    # 私信通知对方（焚毁消息不泄漏明文摘要）
    pid = _peer_id(conv, user.id)
    try:
        create_notification(
            db, recipient_id=pid, actor_id=user.id,
            actor_name=user.nickname or user.username, ntype="dm",
            post_id=conv.id,
            post_title=burn_svc.PLACEHOLDER if burn_mode else ((content[:30] + "…") if len(content) > 30 else content),
        )
    except Exception:
        # 通知写入失败不应阻断私信主流程，但需记录以便排查
        logging.getLogger(__name__).exception("create DM notification failed")
    # 实时推送新消息给同房间对方（对方正停留在该会话即可秒收；否则依赖轮询/重新打开）
    now = burn_svc.utcnow_naive()
    r = burn_svc.render_for(db, "dm", msg, pid, now) if burn_mode else None
    try:
        await ws_manager.broadcast(f"dm/{conv_id}", json.dumps({
            "type": "message",
            "id": msg.id,
            "conversation_id": conv_id,
            "sender_id": user.id,
            "content": None if burn_mode else content,
            "burn_mode": burn_mode,
            "burned": bool(r and r["burned"]),
            "state": (r or {}).get("state", "pending") if burn_mode else "permanent",
            "read": False,
            "created_at": _iso(msg.created_at),
        }, ensure_ascii=False))
    except Exception:
        logging.getLogger(__name__).exception("DM live-message broadcast failed")
    return {
        "id": msg.id,
        "conversation_id": conv_id,
        "sender_id": user.id,
        "content": content if not burn_mode else None,
        "burn_mode": burn_mode,
        "read": False,
        "created_at": _iso(msg.created_at),
    }


@router.delete("/conversations/{conv_id}/messages/{mid}")
async def recall_dm_message(
    conv_id: int,
    mid: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """撤回私信：仅发送者本人（站长 2026-09-17）。软删除 + WS 通知对方。"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not (conv.user_a == user.id or conv.user_b == user.id):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    m = db.query(DirectMessage).filter(
        DirectMessage.id == mid, DirectMessage.conversation_id == conv_id).first()
    if not m or m.sender_id != user.id:
        raise HTTPException(status_code=403, detail="只能撤回自己发送的消息")
    if getattr(m, "recalled", False):
        raise HTTPException(status_code=400, detail="消息已撤回")
    m.recalled = True
    db.commit()
    try:
        await ws_manager.broadcast(f"dm/{conv_id}", json.dumps({
            "type": "recall", "conversation_id": conv_id, "id": mid,
        }, ensure_ascii=False))
    except Exception:
        logging.getLogger(__name__).exception("DM recall broadcast failed")
    return {"id": mid, "recalled": True}


@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """删除会话（站长 2026-09-17）：仅隐藏我的视图，对方不受影响；
    对方再来新消息时自动重新出现（微信语义）。"""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if conv.user_a == user.id:
        conv.hidden_a = True
    elif conv.user_b == user.id:
        conv.hidden_b = True
    else:
        raise HTTPException(status_code=403, detail="无权访问该会话")
    db.commit()
    return {"id": conv_id, "deleted": True}
