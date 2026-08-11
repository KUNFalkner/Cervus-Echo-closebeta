from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.auth import get_current_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.notification import Notification as NotificationModel

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _serialize(n: NotificationModel) -> dict:
    return {
        "id": n.id,
        "recipient_id": n.recipient_id,
        "actor_id": n.actor_id,
        "actor_name": n.actor_name,
        "type": n.type,
        "post_id": n.post_id,
        "comment_id": n.comment_id,
        "post_title": n.post_title,
        "read": bool(n.read),
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/unread-count")
def unread_count(
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user:
        return {"unread": 0}
    cnt = db.query(NotificationModel).filter(
        NotificationModel.recipient_id == user.id,
        NotificationModel.read == False,
    ).count()
    return {"unread": cnt}


@router.get("")
@router.get("/")
def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    q = db.query(NotificationModel).filter(NotificationModel.recipient_id == user.id)
    if unread_only:
        q = q.filter(NotificationModel.read == False)
    items = q.order_by(NotificationModel.created_at.desc(), NotificationModel.id.desc()).limit(limit).all()
    return [_serialize(n) for n in items]


@router.post("/{notif_id}/read")
def mark_read(
    notif_id: int,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    n = db.query(NotificationModel).filter(
        NotificationModel.id == notif_id,
        NotificationModel.recipient_id == user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="通知不存在")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    db.query(NotificationModel).filter(
        NotificationModel.recipient_id == user.id,
        NotificationModel.read == False,
    ).update({NotificationModel.read: True})
    db.commit()
    return {"ok": True}
