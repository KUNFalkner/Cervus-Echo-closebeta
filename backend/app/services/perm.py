"""管理权限作用域：founder 全域，ambassador 仅限本校。"""
from typing import Optional

from fastapi import HTTPException

from app.models.user import User as UserModel


def can_moderate(actor: UserModel, target_school: Optional[str]) -> bool:
    """actor 是否有权处置属于 target_school 的内容/用户。"""
    if actor.role == "founder":
        return True
    if actor.role == "ambassador":
        return target_school == actor.school_id
    return False


def assert_can_moderate(actor: UserModel, target_school: Optional[str], what: str = "内容"):
    if not can_moderate(actor, target_school):
        raise HTTPException(status_code=403, detail=f"大使只能管理本校{what}")


def can_see_uid(viewer: Optional[UserModel], hide_uid: bool, content_school: Optional[str] = None) -> bool:
    """谁能看到发帖人的真实学号 UID（与前端 canSeeUid 规则保持一致）。

    未登录者一律看不到；创始人全看；大使可看本校的、以及未主动隐藏的；
    普通学生只能看到未隐藏的。
    """
    if viewer is None:
        return False
    if viewer.role == "founder":
        return True
    if viewer.role == "ambassador":
        return content_school == viewer.school_id or not hide_uid
    return not hide_uid


def assert_can_mute(actor: UserModel, target: UserModel):
    """禁言校验：不能禁言管理员；大使仅可禁言本校学生。"""
    if target.role in ("founder", "ambassador"):
        raise HTTPException(status_code=403, detail="不能禁言管理员")
    assert_can_moderate(actor, target.school_id, "用户")


def assert_can_ban(actor: UserModel, target: UserModel):
    """封禁校验：与禁言同权，但同样不能封禁管理员/创始人。"""
    if target.role in ("founder", "ambassador"):
        raise HTTPException(status_code=403, detail="不能封禁管理员")
    assert_can_moderate(actor, target.school_id, "用户")
