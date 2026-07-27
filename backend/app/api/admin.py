from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.post import Post as PostModel, Comment as CommentModel
from app.models.report import Report as ReportModel

router = APIRouter()

# 验证是否为管理员（创始人或大使）
def verify_admin(user_id: int, db: Session) -> bool:
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    return user and user.role in ["founder", "ambassador"]

@router.get("/users")
def admin_read_users(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    if not verify_admin(user_id, db):
        raise HTTPException(status_code=403, detail="无权限")
    users = db.query(UserModel).offset(skip).limit(limit).all()
    return [{
        "id": u.id,
        "uid": u.uid,
        "username": u.username,
        "nickname": u.nickname,
        "role": u.role,
        "is_anonymous": u.is_anonymous,
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users]

@router.get("/reports")
def admin_read_reports(
    user_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    if not verify_admin(user_id, db):
        raise HTTPException(status_code=403, detail="无权限")
    reports = db.query(ReportModel).order_by(ReportModel.created_at.desc()).offset(skip).limit(limit).all()

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
    user_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    if not verify_admin(user_id, db):
        raise HTTPException(status_code=403, detail="无权限")
    report = db.query(ReportModel).filter(ReportModel.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="举报不存在")
    report.status = status
    db.commit()
    return {"message": "状态更新成功"}

@router.get("/stats")
def admin_stats(
    user_id: int,
    db: Session = Depends(get_db)
):
    if not verify_admin(user_id, db):
        raise HTTPException(status_code=403, detail="无权限")
    return {
        "total_users": db.query(UserModel).count(),
        "total_posts": db.query(PostModel).count(),
        "total_comments": db.query(CommentModel).count(),
        "pending_reports": db.query(ReportModel).filter(ReportModel.status == "pending").count()
    }
