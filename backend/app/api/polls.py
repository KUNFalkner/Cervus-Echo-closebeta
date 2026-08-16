from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from app.auth import require_user, require_admin
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.poll import Poll, Vote

router = APIRouter(prefix="/api/polls", tags=["polls"])


class PollIn(BaseModel):
    question: str
    options: List[str]
    multi: bool = False


class VoteIn(BaseModel):
    options: List[int] = []   # 选项下标数组；传空数组 = 撤票


def _poll_view(poll: Poll, db: Session, user: Optional[UserModel] = None) -> dict:
    """聚合每个投票的结果：总票数(去重人数) + 各选项票数与「我的投票」。"""
    total_options = len(poll.options or [])
    results = [0] * total_options
    voters = set()
    for v in db.query(Vote).filter(Vote.poll_id == poll.id).all():
        if 0 <= v.option_index < total_options:
            results[v.option_index] += 1
            voters.add(v.user_id)
    my = []
    if user is not None:
        my = [v.option_index for v in db.query(Vote).filter(
            Vote.poll_id == poll.id, Vote.user_id == user.id).all()]
    return {
        "id": poll.id,
        "question": poll.question,
        "options": poll.options,
        "multi": bool(poll.multi),
        "closed": bool(poll.closed),
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "total_votes": len(voters),
        "results": results,
        "my_votes": my,
    }


@router.get("", response_model=list)
def list_polls(
    all: bool = False,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """信息流投票：默认只列进行中的；创始人 / 大使带 ?all=1 可看含已截止的全部。
    每条都附带聚合结果与当前用户已投选项。"""
    q = db.query(Poll)
    if not all:
        q = q.filter(Poll.closed == False)
    rows = q.order_by(Poll.created_at.desc()).all()
    return [_poll_view(p, db, user) for p in rows]


@router.post("", response_model=dict)
def create_poll(payload: PollIn, user: UserModel = Depends(require_admin), db: Session = Depends(get_db)):
    """仅创始人 / 大使可发起投票。"""
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="投票问题不能为空")
    opts = [o.strip() for o in payload.options if o.strip()]
    if len(opts) < 2:
        raise HTTPException(status_code=400, detail="投票至少需要两个选项")
    if len(opts) > 12:
        raise HTTPException(status_code=400, detail="选项过多（最多 12 个）")
    p = Poll(question=payload.question.strip(), options=opts, multi=bool(payload.multi),
             created_by=user.id, creator_role=user.role, closed=False)
    db.add(p); db.commit(); db.refresh(p)
    return _poll_view(p, db, user)


@router.post("/{poll_id}/vote", response_model=dict)
def cast_vote(poll_id: int, payload: VoteIn, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    p = db.query(Poll).filter(Poll.id == poll_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="投票不存在")
    if p.closed:
        raise HTTPException(status_code=400, detail="该投票已截止")
    # 去重 + 范围校验
    opts = []
    for o in payload.options:
        try:
            o = int(o)
        except (TypeError, ValueError):
            continue
        if o < 0 or o >= len(p.options):
            raise HTTPException(status_code=400, detail="选项下标非法")
        if o not in opts:
            opts.append(o)
    if not p.multi and len(opts) > 1:
        raise HTTPException(status_code=400, detail="该投票为单选，只能选一个")
    # 整体替换：先清旧票，再插新票（支持改票 / 撤票）
    db.query(Vote).filter(Vote.poll_id == poll_id, Vote.user_id == user.id).delete()
    for o in opts:
        db.add(Vote(poll_id=poll_id, user_id=user.id, option_index=o))
    db.commit()
    return _poll_view(p, db, user)


@router.delete("/{poll_id}/vote", response_model=dict)
def retract_vote(poll_id: int, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    p = db.query(Poll).filter(Poll.id == poll_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="投票不存在")
    db.query(Vote).filter(Vote.poll_id == poll_id, Vote.user_id == user.id).delete()
    db.commit()
    return _poll_view(p, db, user)


@router.put("/{poll_id}/close", response_model=dict)
def close_poll(poll_id: int, user: UserModel = Depends(require_admin), db: Session = Depends(get_db)):
    """截止 / 重新开启投票（创始人 / 大使）。"""
    p = db.query(Poll).filter(Poll.id == poll_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="投票不存在")
    p.closed = not p.closed
    db.commit()
    return _poll_view(p, db, user)


@router.delete("/{poll_id}", response_model=dict)
def delete_poll(poll_id: int, user: UserModel = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.query(Poll).filter(Poll.id == poll_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="投票不存在")
    db.query(Vote).filter(Vote.poll_id == poll_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True, "deleted": 1}
