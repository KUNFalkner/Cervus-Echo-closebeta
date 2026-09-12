"""禁言状态判定。单一事实来源，供发帖/评论/私信/聊天复用。"""
from datetime import datetime, timezone

from fastapi import HTTPException


def is_muted(user) -> bool:
    """用户当前是否处于禁言状态。"""
    if user is None or user.muted_until is None:
        return False
    # SQLite 存的是带 UTC 时区的时间；与 now(utc) 直接比较
    until = user.muted_until
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > datetime.now(timezone.utc)


def assert_not_banned(user) -> None:
    """封禁拦截：被封用户即使 JWT 未过期，也不允许再发布任何内容。

    此前封禁只在登录处校验（users.py），旧 token 在有效期内仍可发帖/评论/
    私信/聊天，管理处置形同虚设——这里作为统一闸门供各发言入口调用。
    """
    if user is not None and getattr(user, "banned", False):
        raise HTTPException(status_code=403, detail="该账号已被封禁，无法发布内容")


def mute_message(user) -> str:
    """生成给前端的禁言提示，含解禁时间。"""
    until = user.muted_until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    iso = until.isoformat() if until else ""
    return f"你已被禁言，预计 {iso} 解禁"
