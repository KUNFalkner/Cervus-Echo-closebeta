"""群聊 API：用户自建多人聊天室（上限 50 人）。

规则（与方案一致）：
- 群不公开、不可搜索；只有成员能看到/进入。
- 成员即可拉人；创建者可踢人 / 改名 / 解散（软删）。
- 焚毁消息：发送时给每个非发送者成员预插 MessageRead 行（受众快照）；
  后入群者看不到历史焚毁消息。明文唯一出口是 POST /api/burn/group/{id}/view。
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.auth import require_user
from app.models.database import get_db, SessionLocal
from app.models.user import User as UserModel
from app.models.group import ChatGroup, ChatGroupMember
from app.models.message import Message
from app.models.burn import MessageRead
from app.schemas.social import SendMessage
from app.schemas.user import PublicUser
from app.services.sensitive_words import sensitive_filter
from app.services.mute import is_muted, mute_message, assert_not_banned
from app.services import burn as burn_svc
from app.services.crypto import encrypt_text
from app.core.ratelimit import rate_limit
from app.api.chat import manager as ws_manager

router = APIRouter(tags=["groups"])
logger = logging.getLogger(__name__)

MAX_GROUP_MEMBERS = 50
MAX_GROUP_NAME = 64
MAX_CONTENT_LEN = 2000


def _iso(dt):
    from datetime import timezone
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _get_group(db: Session, gid: int) -> ChatGroup:
    g = db.query(ChatGroup).filter(ChatGroup.id == gid).first()
    if g is None or g.disbanded_at is not None:
        raise HTTPException(status_code=404, detail="群不存在")
    return g


def _membership(db: Session, gid: int, user_id: int) -> Optional[ChatGroupMember]:
    return (
        db.query(ChatGroupMember)
        .filter(
            ChatGroupMember.group_id == gid,
            ChatGroupMember.user_id == user_id,
            ChatGroupMember.left_at.is_(None),
        )
        .first()
    )


def _require_member(db: Session, gid: int, user_id: int) -> ChatGroupMember:
    m = _membership(db, gid, user_id)
    if m is None:
        # 非成员一律 404：不暴露群是否存在
        raise HTTPException(status_code=404, detail="群不存在")
    return m


def _member_publics(db: Session, gid: int) -> List[dict]:
    rows = (
        db.query(UserModel)
        .join(ChatGroupMember, ChatGroupMember.user_id == UserModel.id)
        .filter(
            ChatGroupMember.group_id == gid,
            ChatGroupMember.left_at.is_(None),
        )
        .all()
    )
    return [PublicUser.model_validate(u).model_dump() for u in rows]


def _room(gid: int) -> str:
    return f"group/{gid}"


async def _broadcast_group(gid: int, payload: dict) -> None:
    try:
        await ws_manager.broadcast(_room(gid), json.dumps(payload, ensure_ascii=False))
    except Exception:
        logger.exception("group broadcast failed gid=%s", gid)


# ── 建群 ─────────────────────────────────────────────
@router.post("")
def create_group(
    body: dict,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    rate_limit("group_create", 5, 3600, user_id=user.id)
    assert_not_banned(user)
    name = (body.get("name") or "").strip()[:MAX_GROUP_NAME]
    member_ids = body.get("member_ids") or []
    if not name:
        raise HTTPException(status_code=400, detail="群名不能为空")
    if not isinstance(member_ids, list):
        raise HTTPException(status_code=400, detail="member_ids 必须是数组")

    ids = set(int(i) for i in member_ids)
    ids.discard(user.id)  # 创建者自动加入，去掉重复
    if len(ids) > MAX_GROUP_MEMBERS - 1:
        raise HTTPException(status_code=400, detail=f"群成员最多 {MAX_GROUP_MEMBERS} 人")
    if ids:
        valid = db.query(UserModel.id).filter(
            UserModel.id.in_(ids), UserModel.banned == False  # noqa: E712
        ).all()
        valid_ids = {r[0] for r in valid}
        if len(valid_ids) != len(ids):
            raise HTTPException(status_code=400, detail="存在无效或已封禁的用户")

    g = ChatGroup(name=name, creator_id=user.id, member_count=1 + len(ids))
    db.add(g)
    db.flush()
    db.add(ChatGroupMember(group_id=g.id, user_id=user.id))
    for uid in ids:
        db.add(ChatGroupMember(group_id=g.id, user_id=uid))
    db.commit()
    db.refresh(g)
    return {
        "id": g.id, "name": g.name, "creator_id": g.creator_id,
        "member_count": g.member_count, "created_at": _iso(g.created_at),
    }


# ── 我的群列表 ─────────────────────────────────────────
def _conv_summary(db: Session, g: ChatGroup, me: int) -> dict:
    """未读数 + 最后一条消息摘要（焚毁消息不泄明文）。"""
    now = burn_svc.utcnow_naive()
    last = (
        db.query(Message)
        .filter(Message.room_id == _room(g.id))
        .order_by(Message.id.desc())
        .first()
    )
    last_time = None
    summary = ""
    last_burned = False
    if last:
        last_time = _iso(last.created_at)
        last_burned = bool(last.burn_mode and (last.burned_at is not None or burn_svc.is_expired(last, now)))
        if last_burned:
            summary = burn_svc.BURNED_TEXT
        elif last.burn_mode:
            summary = burn_svc.PLACEHOLDER
        elif last.content:
            summary = last.content[:50]

    mem = _membership(db, g.id, me)
    # 未读游标：只数比我游标新、非我发的、未焚的消息
    base = (
        db.query(Message.id)
        .filter(
            Message.room_id == _room(g.id),
            Message.user_id != me,
            Message.burned_at.is_(None),
            or_(Message.expires_at.is_(None), Message.expires_at > now),
        )
    )
    unread = 0
    if mem:
        unread = base.filter(
            Message.id > (mem.last_read_message_id or 0),
            Message.burn_mode.is_(None),  # 焚毁消息不产生群聊红点（看点开行为太重）
        ).count()
    return {
        "id": g.id, "name": g.name, "creator_id": g.creator_id,
        "member_count": g.member_count, "last_message": summary,
        "last_time": last_time, "last_burned": last_burned, "unread": unread,
    }


@router.get("")
def list_groups(user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    burn_svc.maybe_sweep(db)
    rows = (
        db.query(ChatGroup)
        .join(ChatGroupMember, ChatGroupMember.group_id == ChatGroup.id)
        .filter(
            ChatGroupMember.user_id == user.id,
            ChatGroupMember.left_at.is_(None),
            ChatGroup.disbanded_at.is_(None),
        )
        .order_by(ChatGroup.id.desc())
        .all()
    )
    out = [_conv_summary(db, g, user.id) for g in rows]
    out.sort(key=lambda x: (x["last_time"] or ""), reverse=True)
    return out


@router.get("/unread")
def group_unread(user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    burn_svc.maybe_sweep(db)
    rows = (
        db.query(ChatGroup)
        .join(ChatGroupMember, ChatGroupMember.group_id == ChatGroup.id)
        .filter(
            ChatGroupMember.user_id == user.id,
            ChatGroupMember.left_at.is_(None),
            ChatGroup.disbanded_at.is_(None),
        )
        .all()
    )
    return {"unread": sum(_conv_summary(db, g, user.id)["unread"] for g in rows)}


# ── 群详情 / 成员 ───────────────────────────────────────
@router.get("/{gid}")
def group_detail(gid: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    return {
        "id": g.id, "name": g.name, "creator_id": g.creator_id,
        "member_count": g.member_count,
        "am_i_creator": g.creator_id == user.id,
        "created_at": _iso(g.created_at),
    }


@router.get("/{gid}/members")
def group_members(gid: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    rows = (
        db.query(UserModel, ChatGroupMember.joined_at)
        .join(ChatGroupMember, ChatGroupMember.user_id == UserModel.id)
        .filter(
            ChatGroupMember.group_id == gid,
            ChatGroupMember.left_at.is_(None),
        )
        .all()
    )
    return [
        {**PublicUser.model_validate(u).model_dump(), "joined_at": _iso(joined_at)}
        for u, joined_at in rows
    ]


# ── 拉人 / 踢人 ─────────────────────────────────────────
@router.post("/{gid}/members")
def add_members(
    gid: int,
    body: dict,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)  # 成员即可拉人
    assert_not_banned(user)
    rate_limit("group_add", 20, 3600, user_id=user.id)
    ids = set(int(i) for i in (body.get("user_ids") or []))
    ids.discard(user.id)
    if not ids:
        raise HTTPException(status_code=400, detail="没有要添加的用户")

    cur = (
        db.query(ChatGroupMember)
        .filter(ChatGroupMember.group_id == gid, ChatGroupMember.left_at.is_(None))
        .count()
    )
    if cur + len(ids) > MAX_GROUP_MEMBERS:
        raise HTTPException(status_code=400, detail=f"群成员最多 {MAX_GROUP_MEMBERS} 人")

    added = []
    for uid in ids:
        exist = (
            db.query(ChatGroupMember)
            .filter(ChatGroupMember.group_id == gid, ChatGroupMember.user_id == uid)
            .first()
        )
        if exist:
            if exist.left_at is not None:
                exist.left_at = None  # 被踢过的重新拉回 = 复活
                added.append(uid)
            continue
        db.add(ChatGroupMember(group_id=gid, user_id=uid))
        added.append(uid)

    g.member_count = cur + len(added)
    db.commit()
    return {"added": added, "member_count": g.member_count}


@router.delete("/{gid}/members/{uid}")
def kick_member(
    gid: int,
    uid: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    if g.creator_id != user.id:
        raise HTTPException(status_code=403, detail="只有群主可以移出成员")
    if uid == user.id:
        raise HTTPException(status_code=400, detail="群主不能移出自己")
    mem = _membership(db, gid, uid)
    if mem is None:
        raise HTTPException(status_code=404, detail="该成员不在群中")
    mem.left_at = burn_svc.utcnow_naive()
    g.member_count = max(0, (g.member_count or 1) - 1)
    db.commit()
    return {"message": "已移出成员"}


# ── 改名 / 解散 ─────────────────────────────────────────
@router.put("/{gid}/name")
def rename_group(
    gid: int,
    body: dict,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    if g.creator_id != user.id:
        raise HTTPException(status_code=403, detail="只有群主可以改名")
    rate_limit("group_edit", 20, 3600, user_id=user.id)
    name = (body.get("name") or "").strip()[:MAX_GROUP_NAME]
    if not name:
        raise HTTPException(status_code=400, detail="群名不能为空")
    g.name = name
    db.commit()
    return {"id": g.id, "name": g.name}


@router.post("/{gid}/leave")
def leave_group(gid: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """成员主动退群（群主请用解散；被移出与主动退群同构：left_at 标记）。"""
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    if g.creator_id == user.id:
        raise HTTPException(status_code=400, detail="群主请使用「解散群」")
    mem = _membership(db, gid, user.id)
    if mem is None:
        raise HTTPException(status_code=404, detail="你已不在群中")
    mem.left_at = burn_svc.utcnow_naive()
    g.member_count = max(0, (g.member_count or 1) - 1)
    db.commit()
    return {"message": "已退出群聊"}


@router.delete("/{gid}")
def disband_group(gid: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    if g.creator_id != user.id:
        raise HTTPException(status_code=403, detail="只有群主可以解散群")
    g.disbanded_at = burn_svc.utcnow_naive()
    db.commit()
    return {"message": "群已解散"}


# ── 群消息：历史（REST，脱敏 + 推进未读游标）──────────────
@router.get("/{gid}/messages")
def group_messages(
    gid: int,
    limit: int = 50,
    before: int = 0,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    # 可见性：永久消息全员可见；焚毁消息仅「发送者本人」或「发送时刻受众快照成员」可见
    # （后入群者不在快照里 -> 整条不可见，符合 Snapchat 语义）
    q = (
        db.query(Message)
        .filter(Message.room_id == _room(gid))
        .filter(
            or_(
                Message.burn_mode.is_(None),
                Message.user_id == user.id,
                db.query(MessageRead.id).filter(
                    MessageRead.source == "group",
                    MessageRead.message_id == Message.id,
                    MessageRead.user_id == user.id,
                ).exists(),
            )
        )
    )
    if before:
        q = q.filter(Message.id < before)
    msgs = q.order_by(Message.id.desc()).limit(min(limit, 100)).all()[::-1]

    # 昵称/头像批量取
    uids = {m.user_id for m in msgs}
    users = {u.id: u for u in db.query(UserModel).filter(UserModel.id.in_(uids)).all()} if uids else {}

    now = burn_svc.utcnow_naive()
    out = []
    for m in msgs:
        u = users.get(m.user_id)
        r = burn_svc.render_for(db, "group", m, user.id, now)
        out.append({
            "id": m.id,
            "user_id": m.user_id,
            "nickname": (u.nickname if u else "已注销用户"),
            "avatar": (u.avatar if u else None),
            "created_at": _iso(m.created_at),
            **r,
        })
    # 推进未读游标
    if msgs:
        mem = _membership(db, gid, user.id)
        top = max(m.id for m in msgs)
        if mem and top > (mem.last_read_message_id or 0):
            mem.last_read_message_id = top
            db.commit()
    return out


# ── 群消息：发送（REST，支持焚毁）────────────────────────
@router.post("/{gid}/messages")
async def send_group_message(
    gid: int,
    body: SendMessage,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    g = _get_group(db, gid)
    _require_member(db, gid, user.id)
    rate_limit("group_msg", 30, 60, user_id=user.id)
    if is_muted(user):
        raise HTTPException(status_code=403, detail=mute_message(user))
    assert_not_banned(user)

    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="消息不能为空")
    hits = sensitive_filter.find_hits(content)
    if hits:
        raise HTTPException(status_code=400, detail=f"消息包含违规词语（{hits[0]}…），请修改后重试")
    content = content[:MAX_CONTENT_LEN]
    burn_mode = (body.burn_mode or "").strip() or None
    if burn_mode and burn_mode not in burn_svc.BURN_MODES:
        raise HTTPException(status_code=400, detail="无效的焚毁模式")

    msg = Message(room_id=_room(gid), user_id=user.id, content=content)
    db.add(msg)
    if burn_mode:
        enc = encrypt_text(content)
        db.flush()
        # 受众 = 当前全体成员快照（不含发送者）
        audience = [
            r[0] for r in db.query(ChatGroupMember.user_id)
            .filter(
                ChatGroupMember.group_id == gid,
                ChatGroupMember.left_at.is_(None),
                ChatGroupMember.user_id != user.id,
            ).all()
        ]
        burn_svc.arm_burn(db, msg, "group", burn_mode, audience, enc)
        msg.content = None
    db.commit()
    db.refresh(msg)

    # 广播（焚毁消息对受众不泄明文）
    now = burn_svc.utcnow_naive()
    u = db.query(UserModel).filter(UserModel.id == user.id).first()
    r = burn_svc.render_for(db, "group", msg, user.id, now)  # 发送者视角
    await _broadcast_group(gid, {
        "type": "message",
        "id": msg.id,
        "room_id": _room(gid),
        "user_id": user.id,
        "nickname": (u.nickname if u else "匿名用户"),
        "avatar": (u.avatar if u else None),
        "content": None if burn_mode else content,
        "burn_mode": burn_mode,
        "state": r.get("state", "pending") if burn_mode else "permanent",
        "timestamp": _iso(msg.created_at),
    })
    return {
        "id": msg.id,
        "room_id": _room(gid),
        "user_id": user.id,
        "content": content if not burn_mode else None,
        "burn_mode": burn_mode,
        "created_at": _iso(msg.created_at),
    }
