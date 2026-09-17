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


def can_see_uid(viewer: Optional[UserModel], hide_uid: bool, content_school: Optional[str] = None, target_user_id: Optional[int] = None) -> bool:
    """谁能看到发帖人的真实学号 UID（隐私体系 v2，站长 2026-09-17 钦定）。

    规则（严格收敛）：
    - founder：唯一无条件可见者（治理暴力/违禁内容的最高权限）
    - 大使/教师/校方：一律不可见——即使本校、即使内容未隐藏。
      唯一例外：存在一条 status='approved' 的 uid_grants 授权
      （actor=viewer, target=该用户），查看后授权即标记 used（一次性）。
    - 匿名内容（hide_uid）对上述所有人同样被授权门拦住。
    - 未登录：不可见。

    target_user_id：调用方必须尽量传入内容作者的用户 id——授权是"对单个目标
    用户"的，没有它就无法核销一次性授权（此时对非 founder 一律返回 False）。
    """
    if viewer is None:
        return False
    if viewer.role == "founder":
        return True
    # 非founder：唯一通道 = founder 批准的一次性授权
    if target_user_id is None:
        return False
    if viewer.role not in ("ambassador", "teacher", "school_official"):
        return False
    # 授权核销放到 API 层（需要写库标记 used）；这里只读判断
    from app.models.uid_grant import UidGrant
    from app.models.database import SessionLocal
    db = SessionLocal()
    try:
        g = db.query(UidGrant).filter(
            UidGrant.actor_id == viewer.id,
            UidGrant.target_user_id == target_user_id,
            UidGrant.status == "approved",
        ).first()
        return g is not None
    finally:
        db.close()


def consume_uid_grant(viewer: UserModel, target_user_id: int) -> bool:
    """核销一次性授权：存在 approved 授权则标记 used 并返回 True（本次可见）。"""
    if viewer.role not in ("ambassador", "teacher", "school_official"):
        return False
    from app.models.uid_grant import UidGrant
    from app.models.database import SessionLocal
    from datetime import datetime, timezone
    db = SessionLocal()
    try:
        g = db.query(UidGrant).filter(
            UidGrant.actor_id == viewer.id,
            UidGrant.target_user_id == target_user_id,
            UidGrant.status == "approved",
        ).first()
        if not g:
            return False
        g.status = "used"
        g.used_at = datetime.now(timezone.utc)
        db.commit()
        return True
    finally:
        db.close()


def approver_scope(actor: UserModel) -> Optional[str]:
    """教师审核的作用域：founder → None（全部）；已批准的校方 → 本校校码；其余 403。

    站长无法核实 12 所学校的老师真假，所以审核按校下放给本校校方，
    founder 只在某校还没有校方账号时兜底。
    """
    if actor.role == "founder":
        return None
    if actor.role == "school_official" and actor.approved:
        return actor.school_id
    raise HTTPException(status_code=403, detail="仅本校校方或站长可审核教师")


def view_scope(actor: UserModel) -> Optional[str]:
    """管理后台的可见范围：founder 全域（None）；其余管理角色（大使/校方/教师）仅本校。"""
    return None if actor.role == "founder" else actor.school_id


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
