from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.auth import get_current_user, require_user
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.follow import Follow
from app.schemas.user import PublicUser
from app.services.notif import create_notification

router = APIRouter(tags=["social"])


def _public(u: UserModel) -> dict:
    return PublicUser.model_validate(u).model_dump()


@router.post("/follow/{target_id}")
def follow(
    target_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    if target_id == user.id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if db.query(Follow).filter(
        Follow.follower_id == user.id, Follow.followee_id == target_id
    ).first():
        raise HTTPException(status_code=400, detail="已经关注了")
    db.add(Follow(follower_id=user.id, followee_id=target_id))
    db.commit()
    # 被关注者收到通知（自己关注自己已拦截，不会自通知）
    try:
        create_notification(
            db, recipient_id=target_id, actor_id=user.id,
            actor_name=user.nickname or user.username, ntype="follow",
        )
    except Exception:
        pass
    return {"ok": True, "following": True}


@router.delete("/follow/{target_id}")
def unfollow(
    target_id: int,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    f = db.query(Follow).filter(
        Follow.follower_id == user.id, Follow.followee_id == target_id
    ).first()
    if not f:
        raise HTTPException(status_code=400, detail="尚未关注")
    db.delete(f)
    db.commit()
    return {"ok": True, "following": False}


@router.get("/followers/{user_id}", response_model=List[PublicUser])
def list_followers(
    user_id: int,
    db: Session = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    ids = [r[0] for r in db.query(Follow.follower_id).filter(Follow.followee_id == user_id).all()]
    users = db.query(UserModel).filter(UserModel.id.in_(ids)).all() if ids else []
    return [_public(u) for u in users]


@router.get("/following/{user_id}", response_model=List[PublicUser])
def list_following(
    user_id: int,
    db: Session = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    ids = [r[0] for r in db.query(Follow.followee_id).filter(Follow.follower_id == user_id).all()]
    users = db.query(UserModel).filter(UserModel.id.in_(ids)).all() if ids else []
    return [_public(u) for u in users]


@router.get("/follow-state")
def follow_state(
    ids: str = Query("", description="逗号分隔的用户 id 列表"),
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return {"following_ids": []}
    rows = db.query(Follow.followee_id).filter(
        Follow.follower_id == user.id, Follow.followee_id.in_(id_list)
    ).all()
    return {"following_ids": [r[0] for r in rows]}


@router.get("/stats/{user_id}")
def social_stats(user_id: int, db: Session = Depends(get_db)):
    followers = db.query(Follow).filter(Follow.followee_id == user_id).count()
    following = db.query(Follow).filter(Follow.follower_id == user_id).count()
    return {"followers": followers, "following": following}
