from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import random
import hashlib
import uuid

from app.models.database import get_db
from app.models.user import User as UserModel
from app.schemas.user import (
    UserCreate, UserUpdate, User as UserSchema,
    TokenResponse, WechatLoginRequest,
)
from app.auth import create_token, get_current_user, require_user
from app.wechat import code_to_openid

router = APIRouter()

ADJECTIVES = ["快乐的", "神秘的", "可爱的", "聪明的", "勇敢的", "温柔的", "活泼的", "安静的"]
ANIMALS = ["小猫", "小狗", "小兔", "小熊", "小狐狸", "小松鼠", "小熊猫", "小海豚"]


def _gen_nick():
    return f"{random.choice(ADJECTIVES)}{random.choice(ANIMALS)}"


def _gen_uid(school_id: str, year: int, cls: int, num: int) -> str:
    return f"{school_id}{year:04d}{cls:02d}{num:02d}"


# ── WeChat login ──────────────────────────────────────────────────────
@router.post("/wechat-login", response_model=TokenResponse)
async def wechat_login(body: WechatLoginRequest, db: Session = Depends(get_db)):
    try:
        wx_user = await code_to_openid(body.code)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Look up or create user by wechat_openid
    user = db.query(UserModel).filter(
        UserModel.wechat_openid == wx_user.openid
    ).first()

    if not user:
        username = f"wx_{wx_user.openid[-8:]}"
        user = UserModel(
            username=username,
            nickname=_gen_nick(),
            uid=_gen_uid("JSKS", 2024, 1, random.randint(1, 99)),
            wechat_openid=wx_user.openid,
            school_id="JSKS",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_token(user.id, user.uid)
    return TokenResponse(access_token=token, user=UserSchema.model_validate(user))


# ── Username/password login (legacy, returns JWT now) ──────────────────
@router.post("/login", response_model=TokenResponse)
def login_user(username: str = "", password: str = "", db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="账号不存在，请先注册")

    if user.password:
        if not password:
            raise HTTPException(status_code=401, detail="请输入密码")
        pwh = hashlib.sha256(password.encode()).hexdigest()
        if user.password != pwh:
            raise HTTPException(status_code=401, detail="密码错误")

    token = create_token(user.id, user.uid)
    return TokenResponse(access_token=token, user=UserSchema.model_validate(user))


# ── Current user ──────────────────────────────────────────────────────
@router.get("/me", response_model=UserSchema)
def get_me(user: UserModel = Depends(require_user)):
    return user


# ── Registration (legacy) ─────────────────────────────────────────────
@router.post("/", response_model=TokenResponse)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if body.username in ("founder",) or body.username.endswith("ambassador"):
        raise HTTPException(status_code=400, detail="该用户名不可用")

    if db.query(UserModel).filter(UserModel.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")

    nickname = body.nickname or _gen_nick()
    sid = body.school_id or "JSKS"
    uid = _gen_uid(sid, body.enrollment_year or 2024, body.class_number or 1, body.student_number or 1)

    if db.query(UserModel).filter(UserModel.uid == uid).first():
        raise HTTPException(status_code=400, detail="该学号已被注册")

    pwh = hashlib.sha256(body.password.encode()).hexdigest() if body.password else None
    user = UserModel(
        username=body.username, nickname=nickname, uid=uid,
        password=pwh, school_id=sid,
        enrollment_year=body.enrollment_year, class_number=body.class_number,
        student_number=body.student_number,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id, user.uid)
    return TokenResponse(access_token=token, user=UserSchema.model_validate(user))


# ── User CRUD ─────────────────────────────────────────────────────────
@router.get("/", response_model=List[UserSchema])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(UserModel).offset(skip).limit(limit).all()


@router.get("/uid/{uid}", response_model=UserSchema)
def read_user_by_uid(uid: str, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.uid == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.get("/{user_id}", response_model=UserSchema)
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    user_id: int,
    update: UserUpdate,
    current: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    is_self = current.id == user_id
    is_admin = current.role in ("founder", "ambassador")

    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="无权修改他人信息")

    # 密码只能本人修改
    if update.password is not None:
        if not is_self:
            raise HTTPException(status_code=403, detail="无权限修改他人密码")
        if not update.password.strip():
            raise HTTPException(status_code=400, detail="密码不能为空")
        target.password = hashlib.sha256(update.password.encode()).hexdigest()

    if update.nickname is not None:
        if not update.nickname.strip():
            raise HTTPException(status_code=400, detail="账户名不能为空")
        target.nickname = update.nickname.strip()
    if update.avatar is not None:
        target.avatar = update.avatar
    if update.is_anonymous is not None:
        target.is_anonymous = update.is_anonymous

    db.commit()
    db.refresh(target)
    return target
