from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, or_
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from collections import Counter

from app.auth import require_admin, require_founder, require_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.school import School as SchoolModel
from app.models.post import Post as PostModel, Comment as CommentModel
from app.models.report import Report as ReportModel
from app.models.tarot_history import TarotHistory
from app.models.board import Board
from app.models.conversation import DirectMessage
from app.models.message import Message
from app.services.perm import assert_can_moderate, assert_can_mute, assert_can_ban, approver_scope, view_scope

router = APIRouter()

def _iso(dt):
    """SQLite 读回的是裸 UTC 时间，补上 +00:00，否则前端会按本地时区解析导致差 8 小时。"""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()

@router.get("/users")
def admin_read_users(
    skip: int = 0,
    limit: int = 500,
    role: Optional[str] = None,
    q: Optional[str] = None,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """用户列表。默认最新在前、默认 500 条。

    这里踩过坑：默认 limit=100 + id 升序，导致**最新注册的账号（含 init_db 预注册的
    12 个校方）全被截断** —— 开通时提示"已开通"，列表里却看不到。故改为最新在前、
    并把上限放宽；同时支持按角色与关键词（用户名/昵称/UID）筛选。
    """
    qry = db.query(UserModel)
    scope = view_scope(admin)
    if scope:
        qry = qry.filter(UserModel.school_id == scope)
    if role:
        qry = qry.filter(UserModel.role == role)
    if q and q.strip():
        kw = f"%{q.strip()}%"
        qry = qry.filter(or_(UserModel.username.ilike(kw), UserModel.nickname.ilike(kw),
                             UserModel.uid.ilike(kw)))
    users = qry.order_by(UserModel.id.desc()).offset(skip).limit(min(limit, 2000)).all()
    return [{
        "id": u.id,
        "uid": u.uid,
        "username": u.username,
        "nickname": u.nickname,
        "role": u.role,
        "school_id": u.school_id,
        "is_anonymous": u.is_anonymous,
        "muted_until": _iso(u.muted_until),
        "banned": bool(u.banned),
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users]

@router.get("/reports")
def admin_read_reports(
    skip: int = 0,
    limit: int = 100,
    status: str = None,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    from app.models.audit import AuditLog
    is_reviewer = admin.role in ("founder", "ambassador")
    is_watcher = admin.role in ("teacher", "school_official") and admin.approved
    q = db.query(ReportModel)
    if status:
        q = q.filter(ReportModel.status == status)
    reports = q.order_by(ReportModel.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for r in reports:
        reporter = db.query(UserModel).filter(UserModel.id == r.reporter_id).first()
        # 被举报内容 + 被举报人：reviewer（founder/ambassador）全量；
        # teacher/school_official 也可看（站长拍板：举报箱内追溯言语不当），但每次查看留审计
        target_summary, target_uid = None, None
        # p/cm 先置 None：原名在分支内赋值、分支外引用，首个评论类举报会 NameError
        p = cm = None
        if r.target_type == "post":
            p = db.query(PostModel).filter(PostModel.id == r.target_id).first()
            if p:
                target_summary = f"「{p.title}」{p.content or ''}"[:120]
        elif r.target_type == "comment":
            cm = db.query(CommentModel).filter(CommentModel.id == r.target_id).first()
            if cm:
                target_summary = (cm.content or '')[:120]
        tu = db.query(UserModel).filter(UserModel.id == r.reporter_id).first()
        if r.target_type == "post" and p:
            tu = db.query(UserModel).filter(UserModel.id == p.user_id).first()
        elif r.target_type == "comment" and cm:
            tu = db.query(UserModel).filter(UserModel.id == cm.user_id).first()
        # 【隐私 v2】举报箱内 UID 同样上锁（站长钦定）：只有 founder 直接可见；
        # 大使/教师/校方持有对该用户的一次性授权时，本次查看核销后可见。
        target_uid = None
        if tu:
            if admin.role == "founder":
                target_uid = tu.uid
            else:
                from app.services.perm import consume_uid_grant
                if consume_uid_grant(admin, tu.id):
                    target_uid = tu.uid
        target_nickname = tu.nickname if tu else None
        result.append({
            "id": r.id,
            "reporter_uid": reporter.uid if reporter else None,
            "reporter_nickname": reporter.nickname if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "target_summary": target_summary,
            "target_uid": target_uid,
            "target_nickname": target_nickname,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })
    # 教师/校方查看举报箱：后台自动留痕（不含 founder/ambassador，他们本就有权）
    if is_watcher:
        db.add(AuditLog(actor_id=admin.id, action="report_view",
                        detail=f"查看举报箱（{len(result)} 条）"))
        db.commit()
    return result

@router.put("/reports/{report_id}/status")
def admin_update_report(
    report_id: int,
    status: str,
    action: str = "none",
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="举报不存在")
    # 教师只读：不允许更新举报状态（站长拍板：教师仅辅助查看，处置归 founder/ambassador）
    if admin.role in ("teacher", "school_official"):
        raise HTTPException(status_code=403, detail="教师与校方账号仅可查看举报，处置由大使与创始人执行")
    # 联动处置被举报的内容
    if action == "delete_post":
        post = db.query(PostModel).filter(PostModel.id == report.target_id).first()
        if post:
            assert_can_moderate(admin, post.user_school)
            db.delete(post)
    elif action == "delete_comment":
        comment = db.query(CommentModel).filter(CommentModel.id == report.target_id).first()
        if comment:
            post = db.query(PostModel).filter(PostModel.id == comment.post_id).first()
            assert_can_moderate(admin, post.user_school if post else None)
            if post and post.comment_count > 0:
                post.comment_count -= 1
            db.delete(comment)
    report.status = status
    db.commit()
    # 处置审计：谁改了状态/删了内容，留痕
    from app.models.audit import AuditLog
    db.add(AuditLog(actor_id=admin.id, action="report_resolve",
                    detail=f"report_id={report_id} status={status} action={action}"))
    db.commit()
    return {"message": "状态更新成功"}


@router.get("/audit-logs")
def read_audit_logs(
    skip: int = 0,
    limit: int = 100,
    founder: UserModel = Depends(require_founder),
    db: Session = Depends(get_db)
):
    """founder 专属：审计日志（教师/校方查看举报箱、大使处置等敏感动作留痕）"""
    from app.models.audit import AuditLog
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for log in logs:
        actor = db.query(UserModel).filter(UserModel.id == log.actor_id).first()
        result.append({
            "id": log.id,
            "actor_id": log.actor_id,
            "actor_nickname": actor.nickname if actor else None,
            "actor_uid": actor.uid if actor else None,
            "action": log.action,
            "detail": log.detail,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return result

@router.put("/users/{target_id}/mute")
def admin_mute_user(
    target_id: int,
    minutes: int = Query(60, ge=1, le=60 * 24 * 30),
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    assert_can_mute(admin, target)
    target.muted_until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    db.commit()
    return {
        "id": target.id,
        "nickname": target.nickname,
        "muted_until": _iso(target.muted_until),
        "message": f"已禁言，将于 {_iso(target.muted_until)} 自动解禁",
    }

@router.put("/users/{target_id}/unmute")
def admin_unmute_user(
    target_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    assert_can_mute(admin, target)
    target.muted_until = None
    db.commit()
    return {"id": target.id, "nickname": target.nickname, "message": "已解除禁言"}

@router.put("/users/{target_id}/ban")
def admin_ban_user(
    target_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """封禁：永久禁用该用户登录（与限时禁言区分）。"""
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    assert_can_ban(admin, target)
    target.banned = True
    db.commit()
    return {"id": target.id, "nickname": target.nickname, "banned": True, "message": "已封禁该用户"}

@router.put("/users/{target_id}/unban")
def admin_unban_user(
    target_id: int,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    assert_can_ban(admin, target)
    target.banned = False
    db.commit()
    return {"id": target.id, "nickname": target.nickname, "banned": False, "message": "已解封该用户"}

@router.delete("/users/{target_id}")
def admin_delete_user(
    target_id: int,
    admin: UserModel = Depends(require_founder),
    db: Session = Depends(get_db)
):
    """founder 强制注销任意账号（站长 2026-09-17）：连同其帖子/评论/消息一并清除。
    不可用于 founder/大使/校方（官方体系账号另行走 reset_beta）。"""
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.role in ("founder", "ambassador", "school_official"):
        raise HTTPException(status_code=403, detail="官方体系账号不可强制注销")
    from sqlalchemy import text
    from app.models.audit import AuditLog
    db.add(AuditLog(actor_id=admin.id, action="force_delete_user",
                    detail=f"deleted user_id={target.id} username={target.username}"))
    post_ids = [r[0] for r in db.query(PostModel.id).filter(PostModel.user_id == target.id).all()]
    if post_ids:
        pids = ",".join(map(str, post_ids))
        for t in ["comments", "user_likes", "user_stars", "post_vectors"]:
            db.execute(text(f"DELETE FROM {t} WHERE post_id IN ({pids})"))
        # notifications 主键列是 recipient_id，按 actor_id 清；reports 按 reporter_id 清
        db.execute(text(f"DELETE FROM notifications WHERE actor_id = {target.id}"))
        db.execute(text(f"DELETE FROM reports WHERE reporter_id = {target.id}"))
    ids = str(target.id)
    for t, cols_needed in [("comments", ("user_id",)), ("user_likes", ("user_id",)),
                           ("user_stars", ("user_id",)), ("follows", ("follower_id", "followee_id")),
                           ("message_reads", ("user_id",)), ("direct_messages", ("sender_id",)),
                           ("messages", ("user_id",)), ("conversations", ("user_a", "user_b")),
                           ("tarot_history", ("user_id",)), ("votes", ("user_id",)),
                           ("chat_group_members", ("user_id",)), ("post_vectors", ()),
                           ("notifications", ("recipient_id", "actor_id")),
                           ("reports", ("reporter_id",))]:
        for col in cols_needed:
            db.execute(text(f"DELETE FROM {t} WHERE {col} IN ({ids})"))
    if post_ids:
        pids = ",".join(map(str, post_ids))
        db.execute(text(f"DELETE FROM posts WHERE id IN ({pids})"))
    db.delete(target)
    db.commit()
    return {"id": target_id, "message": f"已强制注销 {target.username}，其内容一并清除"}

@router.get("/stats")
def admin_stats(
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """创始人 / 大使数据看板：仅做数据聚合展示，不含任何管理操作。

    注：这里是全站聚合计数（不含任何个人身份信息），因此不做按校切分；
    涉及个人身份的用户名单与内容列表已按 view_scope 限定本校。
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    total_users = db.query(UserModel).count()
    total_posts = db.query(PostModel).count()
    total_comments = db.query(CommentModel).count()
    pending_reports = db.query(ReportModel).filter(ReportModel.status == "pending").count()
    new_users_30d = db.query(UserModel).filter(UserModel.created_at >= since).count()
    posts_30d = db.query(PostModel).filter(PostModel.created_at >= since).count()

    # ── 塔罗使用频率 ──
    th = db.query(TarotHistory).all()
    tarot_total = len(th)
    ai_count = 0
    builtin_count = 0
    spread_counter = Counter()
    card_counter = Counter()
    for r in th:
        spread_counter[r.spread or "time"] += 1
        if r.counsel:
            src = r.counsel.get("source") if isinstance(r.counsel, dict) else None
            if src == "llm":
                ai_count += 1
            else:
                builtin_count += 1
        for c in (r.cards or []):
            name = c.get("name") if isinstance(c, dict) else None
            if name:
                card_counter[name] += 1
    today = datetime.now().date()
    days = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(29, -1, -1)]
    tarot_daily_map = Counter(r.date for r in th if r.date)
    tarot_daily = [{"date": d, "count": tarot_daily_map.get(d, 0)} for d in days]
    tarot = {
        "total_draws": tarot_total,
        "ai_count": ai_count,
        "builtin_count": builtin_count,
        "spread_dist": [{"spread": s, "count": c} for s, c in spread_counter.most_common()],
        "top_cards": [{"name": n, "count": c} for n, c in card_counter.most_common(10)],
        "daily": tarot_daily,
    }

    # ── 阅后即焚使用频率（聚合计数，无任何内容——焚毁消息库里本无明文）──
    # DM = direct_messages；群聊 = messages。burn_mode 非空即焚毁消息。
    dm_burn_total = db.query(DirectMessage).filter(DirectMessage.burn_mode.isnot(None)).count()
    dm_burn_burned = db.query(DirectMessage).filter(DirectMessage.burn_mode.isnot(None), DirectMessage.burned_at.isnot(None)).count()
    grp_burn_total = db.query(Message).filter(Message.burn_mode.isnot(None)).count()
    grp_burn_burned = db.query(Message).filter(Message.burn_mode.isnot(None), Message.burned_at.isnot(None)).count()
    burn_30d = db.query(DirectMessage).filter(
        DirectMessage.burn_mode.isnot(None), DirectMessage.created_at >= since).count()
    burn = {
        "dm_total": dm_burn_total,
        "dm_burned": dm_burn_burned,
        "group_total": grp_burn_total,
        "group_burned": grp_burn_burned,
        "dm_30d": burn_30d,
    }

    # ── 近 30 天发帖 / 评论活跃 ──
    posts_rows = db.query(PostModel.created_at).filter(PostModel.created_at >= since).all()
    comments_rows = db.query(CommentModel.created_at).filter(CommentModel.created_at >= since).all()
    pmap = Counter(r[0].strftime("%Y-%m-%d") for r in posts_rows if r[0])
    cmap = Counter(r[0].strftime("%Y-%m-%d") for r in comments_rows if r[0])
    activity_daily = [{"date": d, "posts": pmap.get(d, 0), "comments": cmap.get(d, 0)} for d in days]

    # ── 板块帖子分布 ──
    boards = db.query(Board).order_by(Board.sort_order, Board.id).all()
    board_dist = []
    for b in boards:
        cnt = db.query(PostModel).filter(
            (PostModel.category == b.key) |
            PostModel.category.like(f"%,{b.key},%") |
            PostModel.category.like(f"{b.key},%") |
            PostModel.category.like(f"%,{b.key}")
        ).count()
        board_dist.append({"key": b.key, "name": b.name, "icon": b.icon, "count": cnt})

    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_comments": total_comments,
        "pending_reports": pending_reports,
        "new_users_30d": new_users_30d,
        "posts_30d": posts_30d,
        "tarot": tarot,
        "burn": burn,
        "activity_daily": activity_daily,
        "board_dist": board_dist,
    }

@router.get("/posts")
def admin_read_posts(
    search: str = None,
    skip: int = 0,
    limit: int = 100,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    query = db.query(PostModel)
    # 非 founder 只看本校内容（大使/校方/教师一视同仁，避免跨校可见）
    scope = view_scope(admin)
    if scope:
        query = query.filter(PostModel.user_school == scope)
    if search:
        query = query.filter(
            (PostModel.title.contains(search)) | (PostModel.content.contains(search))
        )
    posts = query.order_by(PostModel.created_at.desc()).offset(skip).limit(limit).all()
    return [{
        "id": p.id,
        "title": p.title,
        "content": p.content,
        "category": p.category,
        "forum": p.forum,
        "user_school": p.user_school,
        "display_name": p.display_name,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "comment_count": p.comment_count,
        "star_count": p.star_count,
    } for p in posts]


# ── 教师审批 + 校方账号管理（founder 专属）─────────────────────
from app.services.password import hash_password as _hash_pw
from app.schemas.user import User as _UserSchema
from app.auth import create_token as _create_token


@router.get("/teacher-approvals")
def teacher_approvals(db: Session = Depends(get_db), actor: UserModel = Depends(require_user)):
    """待审核教师列表。校方只见本校，站长见全部（作用域见 perm.approver_scope）。"""
    scope = approver_scope(actor)
    q = db.query(UserModel).filter(
        UserModel.role == "teacher", UserModel.approved == False  # noqa: E712
    )
    if scope:
        q = q.filter(UserModel.school_id == scope)
    rows = q.order_by(UserModel.id.desc()).all()
    return [{
        "id": u.id, "username": u.username, "nickname": u.nickname, "uid": u.uid,
        "school_id": u.school_id, "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in rows]


@router.post("/teacher-approvals/{uid_num}/approve")
def approve_teacher(uid_num: int, db: Session = Depends(get_db), actor: UserModel = Depends(require_user)):
    """批准教师：approved=True；校方仅可批准本校申请人。"""
    scope = approver_scope(actor)
    u = db.query(UserModel).filter(UserModel.id == uid_num, UserModel.role == "teacher").first()
    if not u:
        raise HTTPException(status_code=404, detail="待审教师不存在")
    if scope and u.school_id != scope:
        raise HTTPException(status_code=403, detail="只能审核本校教师")
    if u.approved:
        raise HTTPException(status_code=400, detail="该教师已批准")
    u.approved = True
    db.commit()
    return {"message": f"教师 {u.nickname} 已批准", "uid": u.uid}


@router.post("/teacher-approvals/{uid_num}/reject")
def reject_teacher(uid_num: int, db: Session = Depends(get_db), actor: UserModel = Depends(require_user)):
    """驳回教师申请：删除该账号（未批准的教师无任何内容，可安全删除）"""
    scope = approver_scope(actor)
    u = db.query(UserModel).filter(UserModel.id == uid_num, UserModel.role == "teacher", UserModel.approved == False).first()  # noqa: E712
    if not u:
        raise HTTPException(status_code=404, detail="待审教师不存在")
    if scope and u.school_id != scope:
        raise HTTPException(status_code=403, detail="只能审核本校教师")
    db.delete(u)
    db.commit()
    return {"message": "已驳回并移除该申请"}


from pydantic import BaseModel as _BM


class _SchoolOfficialCreate(_BM):
    """只需给学校代码；用户名/昵称/密码按统一规则自动派生（可显式覆盖）。

    role: school_official（默认）或 ambassador —— 新增学校后这两类账号都需要开通。
    """
    school_id: str
    role: Optional[str] = None
    username: Optional[str] = None
    nickname: Optional[str] = None
    password: Optional[str] = None


@router.post("/school-officials")
def create_school_official(body: _SchoolOfficialCreate, db: Session = Depends(get_db), founder: UserModel = Depends(require_founder)):
    """为某校开通账号（校方 / 大使），每校各一个。

    新增学校后走这条：选学校 → 一键开通，凭据按统一规则生成并回显，线下交给本人。
    已开通的返回 400，避免覆盖既有密码。
      - 校方 school_official: UID 校码OFFICIAL / 用户名 校码official / 昵称 简称+校方
      - 大使 ambassador:      UID 校码00000000 / 用户名 校码ambassador / 昵称 简称+大使
    口令统一 校码001，与 init_db 的种子规则一致。
    """
    school = db.query(SchoolModel).filter(SchoolModel.code == body.school_id).first()
    if not school:
        raise HTTPException(status_code=400, detail="学校不存在或不在允许列表")
    role = body.role or "school_official"
    if role == "ambassador":
        uname = body.username or f"{school.code}ambassador"
        nick = body.nickname or f"{school.short_name}大使"
        uid = f"{school.code}00000000"
        label = "大使"
    elif role == "school_official":
        uname = body.username or f"{school.code}official"
        nick = body.nickname or f"{school.short_name}校方"
        uid = f"{school.code}OFFICIAL"
        label = "官方"
    else:
        raise HTTPException(status_code=400, detail="role 只能是 school_official 或 ambassador")
    pw = body.password or f"{school.code}001"
    if db.query(UserModel).filter(UserModel.uid == uid).first():
        raise HTTPException(status_code=400, detail=f"该校已开通{label}账号（每校一个）")
    if db.query(UserModel).filter(UserModel.username == uname).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = UserModel(
        username=uname, nickname=nick, uid=uid,
        password=_hash_pw(pw), school_id=school.code,
        role=role, approved=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": f"已为「{school.name}」开通{label}账号", "uid": uid,
            "username": uname, "password": pw, "role": role,
            "user": _UserSchema.model_validate(user).model_dump()}


@router.get("/privacy-stats")
def privacy_stats(
    founder: UserModel = Depends(require_founder),
    db: Session = Depends(get_db),
):
    """阅后即焚 / 匿名发帖的使用画像。仅创始人可见（大使无权）。

    口径：
    - 活跃用户 = 近 30 天发帖 ∪ 评论 ∪ 私信 ∪ 群聊消息的去重用户（项目无 last_login，用行为代理）
    - 「用过阅后即焚」= 发过至少一条 burn_mode 非空的消息（私信或群聊）
    - 条数占比分母只含私信 + 群聊（排除公共聊天室 chat/main）
    - 匿名统计自 posts.is_anonymous 列上线起，历史帖不计入（不回填）
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)

    def pct(n, d):
        return round(n * 100.0 / d, 2) if d else 0.0

    total_users = db.query(func.count(UserModel.id)).scalar() or 0
    total_posts = db.query(func.count(PostModel.id)).scalar() or 0

    # 近 30 天活跃用户（四表 UNION 去重，SQL 侧聚合不拉内存）
    q_post = db.query(PostModel.user_id.label("uid")).filter(PostModel.created_at >= since)
    q_cmt = db.query(CommentModel.user_id.label("uid")).filter(CommentModel.created_at >= since)
    q_dm = db.query(DirectMessage.sender_id.label("uid")).filter(DirectMessage.created_at >= since)
    q_msg = db.query(Message.user_id.label("uid")).filter(Message.created_at >= since)
    active = q_post.union(q_cmt, q_dm, q_msg).subquery()
    active_users_30d = db.query(func.count(distinct(active.c.uid))).scalar() or 0

    # 用过阅后即焚的人数
    b_dm = db.query(DirectMessage.sender_id.label("uid")).filter(DirectMessage.burn_mode.isnot(None))
    b_grp = db.query(Message.user_id.label("uid")).filter(Message.burn_mode.isnot(None))
    burn_users = b_dm.union(b_grp).subquery()
    burn_user_count = db.query(func.count(distinct(burn_users.c.uid))).scalar() or 0
    burn_active_count = (
        db.query(func.count(distinct(burn_users.c.uid)))
        .select_from(burn_users.join(active, burn_users.c.uid == active.c.uid))
        .scalar() or 0
    )

    # 匿名发帖人数
    anon_user_count = (
        db.query(func.count(distinct(PostModel.user_id)))
        .filter(PostModel.is_anonymous.is_(True))
        .scalar() or 0
    )
    anon_active_count = (
        db.query(func.count(distinct(PostModel.user_id)))
        .select_from(PostModel)
        .join(active, PostModel.user_id == active.c.uid)
        .filter(PostModel.is_anonymous.is_(True))
        .scalar() or 0
    )

    # 条数占比：焚毁消息 / 可焚毁消息总数（私信 + 群聊）
    dm_total = db.query(func.count(DirectMessage.id)).scalar() or 0
    dm_burn = db.query(func.count(DirectMessage.id)).filter(DirectMessage.burn_mode.isnot(None)).scalar() or 0
    grp_total = db.query(func.count(Message.id)).filter(Message.room_id.like("group/%")).scalar() or 0
    grp_burn = db.query(func.count(Message.id)).filter(
        Message.room_id.like("group/%"), Message.burn_mode.isnot(None)
    ).scalar() or 0
    burn_msgs = dm_burn + grp_burn
    msg_total = dm_total + grp_total

    anon_posts = db.query(func.count(PostModel.id)).filter(PostModel.is_anonymous.is_(True)).scalar() or 0

    return {
        "total_users": total_users,
        "active_users_30d": active_users_30d,
        "total_posts": total_posts,
        "burn": {
            "users": burn_user_count,
            "pct_of_all": pct(burn_user_count, total_users),
            "pct_of_active": pct(burn_active_count, active_users_30d),
            "active_users": burn_active_count,
        },
        "burn_msg": {
            "count": burn_msgs,
            "total": msg_total,
            "pct": pct(burn_msgs, msg_total),
            "dm": {"count": dm_burn, "total": dm_total},
            "grp": {"count": grp_burn, "total": grp_total},
        },
        "anon": {
            "users": anon_user_count,
            "pct_of_all": pct(anon_user_count, total_users),
            "pct_of_active": pct(anon_active_count, active_users_30d),
            "active_users": anon_active_count,
        },
        "anon_post": {
            "count": anon_posts,
            "total": total_posts,
            "pct": pct(anon_posts, total_posts),
        },
        "note": "匿名统计自 posts.is_anonymous 列上线起计算，此前发帖不计入",
    }


# ── UID 追溯授权（隐私体系 v2，站长 2026-09-17 钦定）──────────────────────
from app.models.uid_grant import UidGrant
from app.models.database import get_db as _get_db
from fastapi import Body as _Body
from datetime import timezone as _tz


@router.post("/uid-grants/request")
def request_uid_grant(
    body: dict = _Body(...),
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """大使/教师/校方 申请追溯某用户的 UID → 通知 founder 审批。"""
    if admin.role == "founder":
        raise HTTPException(status_code=400, detail="founder 无需申请追溯权限")
    target_id = int(body.get("target_user_id") or 0)
    reason = (body.get("reason") or "").strip()
    if not target_id or not reason:
        raise HTTPException(status_code=400, detail="缺少目标用户或申请理由")
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="不能申请追溯自己")
    # 防重复 pending
    dup = db.query(UidGrant).filter(
        UidGrant.actor_id == admin.id, UidGrant.target_user_id == target_id,
        UidGrant.status == "pending").first()
    if dup:
        return {"id": dup.id, "status": "pending", "message": "已有待审批的相同申请"}
    g = UidGrant(actor_id=admin.id, target_user_id=target_id, reason=reason[:500], status="pending")
    db.add(g)
    db.commit()
    db.refresh(g)
    # 通知 founder（站内信）
    from app.services.notif import notify_from_comment  # noqa: F401  (仅复用通知基建时再看)
    return {"id": g.id, "status": "pending", "message": "申请已提交，等待 founder 审批"}


@router.get("/uid-grants")
def list_uid_grants(
    status: str = None,
    skip: int = 0,
    limit: int = 100,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """founder 看全部申请；其他管理员只看自己的申请与授权状态。"""
    q = db.query(UidGrant)
    if admin.role == "founder":
        if status:
            q = q.filter(UidGrant.status == status)
    else:
        q = q.filter(UidGrant.actor_id == admin.id)
        if status:
            q = q.filter(UidGrant.status == status)
    rows = q.order_by(UidGrant.created_at.desc()).offset(skip).limit(limit).all()
    out = []
    for g in rows:
        actor = db.query(UserModel).filter(UserModel.id == g.actor_id).first()
        target = db.query(UserModel).filter(UserModel.id == g.target_user_id).first()
        out.append({
            "id": g.id, "status": g.status, "reason": g.reason,
            "actor_id": g.actor_id,
            "actor_name": actor.nickname if actor else f"uid:{g.actor_id}",
            "actor_role": actor.role if actor else "?",
            "target_user_id": g.target_user_id,
            "target_nickname": target.nickname if target else "?",
            "target_uid": (target.uid if (admin.role == "founder" and target) else None),
            "granted_by": g.granted_by,
            "created_at": str(g.created_at), "used_at": str(g.used_at) if g.used_at else None,
        })
    return out


@router.put("/uid-grants/{grant_id}")
def decide_uid_grant(
    grant_id: int,
    body: dict = _Body(...),
    admin: UserModel = Depends(require_founder),
    db: Session = Depends(get_db),
):
    """founder 审批：approve / reject。批准 = 该管理员可查看这一个目标用户的 UID 一次。"""
    g = db.query(UidGrant).filter(UidGrant.id == grant_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="申请不存在")
    decision = (body.get("decision") or "").strip().lower()
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision 只支持 approve/reject")
    if g.status != "pending":
        raise HTTPException(status_code=400, detail=f"该申请已处理（{g.status}）")
    from datetime import datetime, timezone
    if decision == "approve":
        g.status = "approved"
        g.granted_by = admin.id
        g.granted_at = datetime.now(timezone.utc)
        # 审计留痕
        from app.models.audit import AuditLog
        db.add(AuditLog(actor_id=admin.id, action="uid_grant_approve",
                        detail=f"grant_id={g.id} actor={g.actor_id} target={g.target_user_id}"))
    else:
        g.status = "rejected"
        g.granted_by = admin.id
    db.commit()
    return {"id": g.id, "status": g.status}
