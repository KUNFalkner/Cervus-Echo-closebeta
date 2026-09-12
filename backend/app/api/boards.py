from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_user, require_site_admin
from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.board import Board
from app.models.post import Post

router = APIRouter(prefix="/api/boards", tags=["boards"])


class BoardOut(BaseModel):
    id: int
    key: str
    name: str
    icon: str
    description: str
    sort_order: int
    active: bool


class BoardIn(BaseModel):
    key: str
    name: str
    icon: str = "📝"
    description: str = ""
    sort_order: int = 0
    active: bool = True


@router.get("", response_model=list[BoardOut])
def list_boards(all: bool = False, user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """公开列表默认只返回启用中的板块；创始人/大使带 ?all=1 可见含已隐藏的全部。"""
    q = db.query(Board)
    if not all:
        q = q.filter(Board.active == True)
    rows = q.order_by(Board.sort_order, Board.id).all()
    return [BoardOut(id=r.id, key=r.key, name=r.name, icon=r.icon, description=r.description, sort_order=r.sort_order, active=r.active) for r in rows]


@router.post("", response_model=BoardOut)
def create_board(payload: BoardIn, user: UserModel = Depends(require_site_admin), db: Session = Depends(get_db)):
    key = (payload.key or "").strip()
    if not key or not key.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="板块 key 只能为字母数字下划线")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="板块名不能为空")
    if db.query(Board).filter(Board.key == key).first():
        raise HTTPException(status_code=400, detail="该板块 key 已存在")
    b = Board(key=key, name=payload.name.strip(), icon=payload.icon, description=payload.description, sort_order=payload.sort_order, active=True)
    db.add(b); db.commit(); db.refresh(b)
    return BoardOut(id=b.id, key=b.key, name=b.name, icon=b.icon, description=b.description, sort_order=b.sort_order, active=b.active)


@router.put("/{board_id}", response_model=BoardOut)
def update_board(board_id: int, payload: BoardIn, user: UserModel = Depends(require_site_admin), db: Session = Depends(get_db)):
    b = db.query(Board).filter(Board.id == board_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="板块不存在")
    if payload.key and payload.key != b.key:
        if not payload.key.replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail="板块 key 只能为字母数字下划线")
        if db.query(Board).filter(Board.key == payload.key, Board.id != board_id).first():
            raise HTTPException(status_code=400, detail="该板块 key 已存在")
        b.key = payload.key
    if payload.name.strip():
        b.name = payload.name.strip()
    b.icon = payload.icon
    b.description = payload.description
    b.sort_order = payload.sort_order
    b.active = payload.active
    db.commit(); db.refresh(b)
    return BoardOut(id=b.id, key=b.key, name=b.name, icon=b.icon, description=b.description, sort_order=b.sort_order, active=b.active)


@router.delete("/{board_id}")
def delete_board(board_id: int, user: UserModel = Depends(require_site_admin), db: Session = Depends(get_db)):
    b = db.query(Board).filter(Board.id == board_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="板块不存在")
    used = db.query(Post).filter(Post.category.like(f"%{b.key}%")).count()
    if used > 0:
        raise HTTPException(status_code=409, detail=f"该板块下还有 {used} 条帖子，无法删除（可改为隐藏）")
    db.delete(b); db.commit()
    return {"ok": True, "deleted": 1}
