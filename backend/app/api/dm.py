from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import logging

from app.auth import require_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.conversation import Conversation, DirectMessage
from app.models.notification import Notification as NotificationModel
from app.schemas.social import CreateConversation, SendMessage
from app.schemas.user import PublicUser
from app.services.sensitive_words import sensitive_filter
from app.services.mute import is_muted, mute_message
from app.services.notif import create_notification
from app.core.ratelimit import rate_limit

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
    convs = (
        db.query(Conversation)
        .filter((Conversation.user_a == user.id) | (Conversation.user_b == user.id))
        .order_by(Conversation.last_time.desc())
        .all()
    )
    out = []
    for c in convs:
        pid = _peer_id(c, user.id)
        unread = (
            db.query(DirectMessage)
            .filter(
                DirectMessage.conversation_id == c.id,
                DirectMessage.sender_id != user.id,
                DirectMessage.read == False,
            )
            .count()
        )
        out.append({
            "id": c.id,
            "peer": _peer_public(db, pid),
            "last_message": c.last_message,
            "last_time": _iso(c.last_time),
            "unread": unread,
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
def list_messages(
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
    # 收信方打开会话即标记已读
    for m in msgs:
        if m.sender_id != user.id and not m.read:
            m.read = True
    db.commit()
    return [{
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "content": m.content,
        "read": bool(m.read),
        "created_at": _iso(m.created_at),
    } for m in msgs]


@router.post("/conversations/{conv_id}/messages")
def send_message(
    conv_id: int,
    body: SendMessage,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    rate_limit("dm", 30, 60, user_id=user.id)
    if is_muted(user):
        raise HTTPException(status_code=403, detail=mute_message(user))
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    if not (conv.user_a == user.id or conv.user_b == user.id):
        raise HTTPException(status_code=403, detail="无权访问该会话")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="消息不能为空")
    content = sensitive_filter.filter_text(content)[:MAX_DM_LEN]
    msg = DirectMessage(conversation_id=conv_id, sender_id=user.id, content=content)
    db.add(msg)
    conv.last_message = content
    conv.last_time = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    # 私信通知对方
    pid = _peer_id(conv, user.id)
    try:
        create_notification(
            db, recipient_id=pid, actor_id=user.id,
            actor_name=user.nickname or user.username, ntype="dm",
            post_id=conv.id,
            post_title=(content[:30] + "…") if len(content) > 30 else content,
        )
    except Exception:
        # 通知写入失败不应阻断私信主流程，但需记录以便排查
        logging.getLogger(__name__).exception("create DM notification failed")
    return {
        "id": msg.id,
        "conversation_id": conv_id,
        "sender_id": user.id,
        "content": content,
        "read": False,
        "created_at": _iso(msg.created_at),
    }
