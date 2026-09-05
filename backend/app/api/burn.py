"""阅后即焚接口。

- view：受众取明文的唯一入口（看完按模式推进焚毁）
- burn：发送者手动焚毁
- reveal：创始人解密（审计 + 限流，禁止批量）
"""
import json
import logging
from datetime import timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.auth import require_user, require_founder
from app.core.ratelimit import rate_limit
from app.models.burn import BurnAuditLog
from app.models.conversation import Conversation, DirectMessage
from app.models.database import get_db
from app.models.group import ChatGroupMember
from app.models.message import Message
from app.models.user import User as UserModel
from app.services import burn as burn_svc
from app.services.crypto import decrypt_text
from app.api.chat import manager as ws_manager

router = APIRouter(tags=["burn"])
logger = logging.getLogger(__name__)


def _iso(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _load(db: Session, source: str, message_id: int):
    """source='dm' 取私信，'group' 取群聊消息；其它 source 一律不存在。"""
    if source == "dm":
        return db.query(DirectMessage).filter(DirectMessage.id == message_id).first()
    if source == "group":
        return db.query(Message).filter(Message.id == message_id).first()
    return None


def _group_id(msg) -> Optional[int]:
    """群聊消息的 room_id 形如 group/{gid}。"""
    room = getattr(msg, "room_id", "") or ""
    if room.startswith("group/"):
        try:
            return int(room.split("/", 1)[1])
        except ValueError:
            return None
    return None


def _room_of(source: str, msg) -> Optional[str]:
    if source == "dm":
        return f"dm/{msg.conversation_id}"
    gid = _group_id(msg)
    return f"group/{gid}" if gid is not None else None


def _sender_id_of(msg) -> int:
    """私信(DirectMessage)用 sender_id，群聊(Message)用 user_id。"""
    sid = getattr(msg, "sender_id", None)
    return sid if sid is not None else msg.user_id


def _assert_audience(db: Session, source: str, msg, user_id: int) -> None:
    """发送者本人或受众成员才有权看。"""
    if _sender_id_of(msg) == user_id:
        return
    if source == "dm":
        conv = db.query(Conversation).filter(Conversation.id == msg.conversation_id).first()
        if not conv or user_id not in (conv.user_a, conv.user_b):
            raise HTTPException(status_code=403, detail="无权查看该消息")
        return
    gid = _group_id(msg)
    if gid is None:
        raise HTTPException(status_code=400, detail="不是群聊消息")
    member = (
        db.query(ChatGroupMember)
        .filter(
            ChatGroupMember.group_id == gid,
            ChatGroupMember.user_id == user_id,
            ChatGroupMember.left_at.is_(None),
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="无权查看该消息")


async def _broadcast_burned(source: str, msg) -> None:
    """焚毁状态变化时通知房间内所有人把该条换成「已焚毁」。失败不影响主流程。"""
    room = _room_of(source, msg)
    if not room:
        return
    try:
        payload = json.dumps({"type": "burned", "source": source, "id": msg.id}, ensure_ascii=False)
        await ws_manager.broadcast(room, payload)
    except Exception:
        logger.exception("burned broadcast failed room=%s", room)


@router.post("/{source}/{message_id}/view")
async def view(
    source: str,
    message_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    msg = _load(db, source, message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="消息不存在")
    _assert_audience(db, source, msg, user.id)
    plain = burn_svc.view_plain(db, source, msg, user.id)
    if plain is None:
        return {"content": None, "burned": True, "state": "burned"}
    if _sender_id_of(msg) != user.id:
        await _broadcast_burned(source, msg)
    return {
        "content": plain,
        "burned": False,
        "state": "own" if _sender_id_of(msg) == user.id else "revealed",
        "burn_mode": msg.burn_mode,
    }


@router.post("/{source}/{message_id}/burn")
async def burn(
    source: str,
    message_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """发送者主动销毁：一律升级为全局焚毁（自己也看不到）。"""
    msg = _load(db, source, message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="消息不存在")
    if msg.burn_mode is None:
        raise HTTPException(status_code=400, detail="该消息不是阅后即焚消息")
    if _sender_id_of(msg) != user.id:
        raise HTTPException(status_code=403, detail="只有发送者可以焚毁")
    if msg.burned_at is not None:
        return {"ok": True, "burned": True, "already": True}
    burn_svc.burn_global(db, msg, source)
    db.commit()
    await _broadcast_burned(source, msg)
    return {"ok": True, "burned": True}


@router.get("/{source}/{message_id}")
def reveal(
    source: str,
    message_id: int,
    request: Request,
    reason: str = Query("", max_length=200),
    user: UserModel = Depends(require_founder),
    db: Session = Depends(get_db),
):
    """创始人解密阅后即焚原文。仅此一个入口，禁止批量，每次留痕 + 限流。"""
    rate_limit("burn_reveal", 10, 3600, user_id=user.id)
    msg = _load(db, source, message_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="消息不存在")
    plain = None
    if msg.content_enc:
        try:
            plain = decrypt_text(msg.content_enc)
        except Exception:
            raise HTTPException(status_code=500, detail="密文无法解密（密钥可能已更换）")
    db.add(BurnAuditLog(
        actor_id=user.id,
        source=source,
        message_id=message_id,
        sender_id=_sender_id_of(msg),
        reason=reason,
        actor_ip=request.client.host if request.client else None,
    ))
    db.commit()
    return {
        "content": plain,
        "destroyed": plain is None,   # 30 天到期后连密文都清了，谁也解不开
        "sender_id": _sender_id_of(msg),
        "created_at": _iso(msg.created_at),
        "burned_at": _iso(msg.burned_at),
        "warning": "本次解密已写入审计日志，仅限违规核查使用。",
    }
