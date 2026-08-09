"""禁言状态判定。单一事实来源，供发帖/评论/聊天复用。"""
from datetime import datetime, timezone


def is_muted(user) -> bool:
    """用户当前是否处于禁言状态。"""
    if user is None or user.muted_until is None:
        return False
    # SQLite 存的是带 UTC 时区的时间；与 now(utc) 直接比较
    until = user.muted_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > datetime.now(timezone.utc)


def mute_message(user) -> str:
    """生成给前端的禁言提示，含解禁时间。"""
    until = user.muted_until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    iso = until.isoformat() if until else ""
    return f"你已被禁言，预计 {iso} 解禁"
