"""阅后即焚：焚毁语义的唯一事实源（私信 source='dm' / 群聊 source='group' 通用）。

两条硬规则：
1. 焚毁消息的 content 恒为 NULL，正文只以密文存在 content_enc —— 数据库里没有明文可泄。
2. 受众的明文只有一个出口：view_plain()。列表/WS 广播一律走 render_for()，
   否则「拉取历史即置已读」会在用户真正看到内容之前就把消息烧掉。

时间一律 naive UTC：库里 server_default=func.now() 存的是裸串（无时区），
SQLAlchemy 读回来是 naive datetime，混用带时区的 now() 会直接报错。
"""
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.burn import MessageRead
from app.models.conversation import DirectMessage
from app.models.message import Message
from app.services.crypto import decrypt_text

BURN_MODES = ("any", "all", "per_user")
DEFAULT_BURN_MODE = "per_user"
BURN_TTL = timedelta(days=30)          # 30 天没打开也销毁（跟 Snapchat 一致）
PLACEHOLDER = "🔥 阅后即焚消息"          # 会话列表摘要 / 通知里显示的占位
BURNED_TEXT = "🔥 此消息已焚毁"

# ponytail: 进程级节流；多 worker 会各扫一遍，但清扫是幂等的，无害。
# 真要精确控制再换成 DB 里的一行锁。
_last_sweep = 0.0
_SWEEP_INTERVAL = 300.0


def utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_expired(msg, now: Optional[datetime] = None) -> bool:
    return bool(
        msg.burn_mode
        and msg.expires_at is not None
        and msg.expires_at <= (now or utcnow_naive())
    )


def _plain(msg) -> Optional[str]:
    """取明文：焚毁消息从密文解，普通消息直接读。"""
    if msg.content_enc:
        try:
            return decrypt_text(msg.content_enc)
        except Exception:
            return None
    return msg.content


def _sender_id(msg) -> int:
    """私信(DirectMessage)用 sender_id，群聊(Message)用 user_id。"""
    sid = getattr(msg, "sender_id", None)
    return sid if sid is not None else msg.user_id


def _row(db: Session, source: str, message_id: int, user_id: int) -> Optional[MessageRead]:
    return (
        db.query(MessageRead)
        .filter(
            MessageRead.source == source,
            MessageRead.message_id == message_id,
            MessageRead.user_id == user_id,
        )
        .first()
    )


def arm_burn(db: Session, msg, source: str, mode: str, audience: Iterable[int], content_enc: str) -> None:
    """发送焚毁消息：写模式/到期时间/密文，并为每位受众预插一行（受众快照）。

    预插 = 发送那一刻的成员名单固定下来：后入群的人看不到历史焚毁消息，
    也避免「一直拉人导致 all 模式永远触发不了」。
    """
    msg.burn_mode = mode
    msg.content_enc = content_enc
    msg.content = None
    msg.expires_at = utcnow_naive() + BURN_TTL
    for uid in audience:
        if uid == _sender_id(msg):
            continue
        db.add(MessageRead(source=source, message_id=msg.id, user_id=uid))


def burn_global(db: Session, msg, source: str, hard: bool = False) -> None:
    """全局焚毁：所有人都看不到（发送者那份也一起）。

    hard=True（30 天到期）连密文一起清空 = 真销毁，创始人也解不开。
    """
    now = utcnow_naive()
    if msg.burned_at is None:
        msg.burned_at = now
    if hard:
        msg.content_enc = None
        msg.content = None
    # 把所有人那份标记为已焚，顺带清掉未读红点
    (
        db.query(MessageRead)
        .filter(
            MessageRead.source == source,
            MessageRead.message_id == msg.id,
            MessageRead.burned_at.is_(None),
        )
        .update({MessageRead.burned_at: now}, synchronize_session=False)
    )


def after_view(db: Session, source: str, msg, viewer_id: int) -> bool:
    """受众看过明文后按模式推进焚毁。返回是否触发了全局焚毁。"""
    now = utcnow_naive()
    row = _row(db, source, msg.id, viewer_id)
    if row is None:
        row = MessageRead(source=source, message_id=msg.id, user_id=viewer_id)
        db.add(row)
    if row.read_at is None:
        row.read_at = now
    db.flush()

    if msg.burn_mode == "any":
        burn_global(db, msg, source)
        return True

    if msg.burn_mode == "per_user":
        row.burned_at = now
        db.flush()
        others = (
            db.query(MessageRead)
            .filter(
                MessageRead.source == source,
                MessageRead.message_id == msg.id,
                MessageRead.burned_at.is_(None),
            )
            .count()
        )
        if others == 0:
            # 所有人都各自焚完 -> 发送者手里那份也变已焚（同 Snapchat）
            burn_global(db, msg, source)
            return True
        return False

    # all：等最后一位没读过的人读完
    pending = (
        db.query(MessageRead)
        .filter(
            MessageRead.source == source,
            MessageRead.message_id == msg.id,
            MessageRead.read_at.is_(None),
        )
        .count()
    )
    if pending == 0:
        burn_global(db, msg, source)
        return True
    return False


def render_for(db: Session, source: str, msg, viewer_id: int, now: Optional[datetime] = None) -> dict:
    """列表 / WS 广播用：这条消息对 viewer 长什么样。永不带受众的明文。"""
    now = now or utcnow_naive()
    if msg.burn_mode is None:
        return {"burn_mode": None, "content": msg.content, "burned": False, "state": "permanent"}
    if msg.burned_at is not None or is_expired(msg, now):
        return {"burn_mode": msg.burn_mode, "content": None, "burned": True, "state": "burned"}
    if _sender_id(msg) == viewer_id:
        return {"burn_mode": msg.burn_mode, "content": _plain(msg), "burned": False, "state": "own"}
    row = _row(db, source, msg.id, viewer_id)
    if row is not None and row.burned_at is not None:
        return {"burn_mode": msg.burn_mode, "content": None, "burned": True, "state": "burned"}
    return {"burn_mode": msg.burn_mode, "content": None, "burned": False, "state": "pending"}


def view_plain(db: Session, source: str, msg, viewer_id: int) -> Optional[str]:
    """唯一取明文入口：受众点开看。看完按模式推进焚毁。"""
    if msg.burn_mode is None:
        return msg.content
    if msg.burned_at is not None or is_expired(msg):
        return None
    plain = _plain(msg)
    if _sender_id(msg) != viewer_id:
        after_view(db, source, msg, viewer_id)
        db.commit()
    return plain


def maybe_sweep(db: Session) -> int:
    """惰性清扫到期的焚毁消息（5 分钟最多一次）。挂在各只读入口即可，无需定时任务。"""
    global _last_sweep
    now_ts = datetime.now(timezone.utc).timestamp()
    if now_ts - _last_sweep < _SWEEP_INTERVAL:
        return 0
    _last_sweep = now_ts
    now = utcnow_naive()
    n = 0
    for model, source in ((DirectMessage, "dm"), (Message, "group")):
        rows = (
            db.query(model)
            .filter(
                model.burn_mode.isnot(None),
                model.burned_at.is_(None),
                model.expires_at.isnot(None),
                model.expires_at <= now,
            )
            .all()
        )
        for m in rows:
            burn_global(db, m, source, hard=True)
            n += 1
    if n:
        db.commit()
    return n
