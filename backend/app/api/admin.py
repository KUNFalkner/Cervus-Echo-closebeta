from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta
from collections import Counter

from app.auth import require_admin
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.post import Post as PostModel, Comment as CommentModel
from app.models.report import Report as ReportModel
from app.models.tarot_history import TarotHistory
from app.models.board import Board
from app.services.perm import assert_can_moderate, assert_can_mute, assert_can_ban

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
    limit: int = 100,
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    users = db.query(UserModel).offset(skip).limit(limit).all()
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
    q = db.query(ReportModel)
    if status:
        q = q.filter(ReportModel.status == status)
    reports = q.order_by(ReportModel.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for r in reports:
        reporter = db.query(UserModel).filter(UserModel.id == r.reporter_id).first()
        result.append({
            "id": r.id,
            "reporter_uid": reporter.uid if reporter else None,
            "reporter_nickname": reporter.nickname if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })
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
    return {"message": "状态更新成功"}

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

@router.get("/stats")
def admin_stats(
    admin: UserModel = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """创始人 / 大使数据看板：仅做数据聚合展示，不含任何管理操作。"""
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
    # 大使仅能看本校帖子；创始人看全部
    if admin.role == "ambassador":
        query = query.filter(PostModel.user_school == admin.school_id)
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
