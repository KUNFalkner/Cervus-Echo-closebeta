from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import random
import os
import io

from app.models.database import get_db
from app.models.user import User as UserModel
from app.models.post import Comment as CommentModel, Post as PostModel
from app.models.school import School as SchoolModel
from app.models.follow import Follow
from app.models.star import UserStar
from app.models.like import UserLike
from app.models.notification import Notification as NotificationModel
from app.schemas.user import (
    UserCreate, UserUpdate, User as UserSchema, PublicUser,
    LoginRequest, TokenResponse, WechatLoginRequest,
)
from app.auth import create_token, require_user
from app.services.password import hash_password, is_legacy_hash, verify_password
from app.core.ratelimit import rate_limit, get_client_ip
from app.wechat import code_to_openid

# 头像落盘目录：backend/static/avatars/
_AVATAR_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "static", "avatars",
)
os.makedirs(_AVATAR_DIR, exist_ok=True)
MAX_AVATAR_PX = 256

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
def login_user(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # 频率限制：同 IP 登录 10 次/分钟，防爆破
    rate_limit("login", 10, 60, ip=get_client_ip(request))
    # 凭据放在请求体里；此前走查询参数会把明文密码写进各级访问日志
    username, password = body.username, body.password
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="账号不存在，请先注册")
    if getattr(user, "banned", False):
        raise HTTPException(status_code=403, detail="该账号已被封禁，请联系管理员")

    if user.password:
        if not password:
            raise HTTPException(status_code=401, detail="请输入密码")
        if not verify_password(password, user.password):
            raise HTTPException(status_code=401, detail="密码错误")
        # 老账号的无盐 sha256 在这次成功登录时静默升级为 bcrypt
        if is_legacy_hash(user.password):
            user.password = hash_password(password)
            db.commit()

    token = create_token(user.id, user.uid)
    return TokenResponse(access_token=token, user=UserSchema.model_validate(user))


# ── Current user ──────────────────────────────────────────────────────
@router.get("/me", response_model=UserSchema)
def get_me(user: UserModel = Depends(require_user)):
    return user

@router.get("/search", response_model=List[PublicUser])
def search_users(
    q: str = Query(..., min_length=1, max_length=40, description="按昵称或用户名搜索"),
    db: Session = Depends(get_db),
):
    """全局搜索：按昵称或用户名模糊匹配（不暴露 uid / 真实姓名，排除已封禁）。"""
    like = f"%{q}%"
    users = (
        db.query(UserModel)
        .filter(
            UserModel.banned == False,
            (UserModel.nickname.ilike(like)) | (UserModel.username.ilike(like)),
        )
        .order_by(UserModel.karma.desc())
        .limit(20)
        .all()
    )
    return users


@router.get("/{user_id}", response_model=PublicUser)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """他人主页公开信息（不暴露 uid / 真实姓名）。"""
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    return target

@router.get("/me/comments", response_model=list)
def my_comments(user: UserModel = Depends(require_user), db: Session = Depends(get_db)):
    """当前用户发表过的评论，附带所属帖子标题（帖子已删则为 null）。"""
    comments = db.query(CommentModel).filter(CommentModel.user_id == user.id)\
        .order_by(CommentModel.created_at.desc()).limit(50).all()
    out = []
    for c in comments:
        post = db.query(PostModel).filter(PostModel.id == c.post_id).first()
        out.append({"id": c.id, "content": c.content, "created_at": c.created_at,
                    "post_id": c.post_id, "post_title": post.title if post else None})
    return out


# ── Registration (legacy) ─────────────────────────────────────────────
@router.post("/", response_model=TokenResponse)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db)):
    # 频率限制：同 IP 注册 3 次/小时，防批量造号
    rate_limit("register", 3, 3600, ip=get_client_ip(request))
    if body.username in ("founder",) or body.username.endswith("ambassador"):
        raise HTTPException(status_code=400, detail="该用户名不可用")

    if db.query(UserModel).filter(UserModel.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")

    nickname = body.nickname or _gen_nick()
    sid = body.school_id or "JSKS"
    # 学校白名单校验：仅允许种子库内的学校
    if not db.query(SchoolModel).filter(SchoolModel.code == sid).first():
        raise HTTPException(status_code=400, detail="学校不存在或不在允许列表")

    uid = _gen_uid(sid, body.enrollment_year or 2024, body.class_number or 1, body.student_number or 1)

    if db.query(UserModel).filter(UserModel.uid == uid).first():
        raise HTTPException(status_code=400, detail="该学号已被注册")

    pwh = hash_password(body.password) if body.password else None
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
# 说明：原先的 GET "/"（返回全部用户的 id 与 role）是越权链的信息泄漏源头，
# 且前端从未调用，连同同样无人使用的 GET /uid/{uid}、GET /{user_id} 一并移除。
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
        target.password = hash_password(update.password)

    if update.nickname is not None:
        if not update.nickname.strip():
            raise HTTPException(status_code=400, detail="账户名不能为空")
        target.nickname = update.nickname.strip()
    if update.avatar is not None:
        target.avatar = update.avatar
    if update.is_anonymous is not None:
        target.is_anonymous = update.is_anonymous
    if update.profile_bg is not None:
        target.profile_bg = update.profile_bg

    db.commit()
    db.refresh(target)
    return target


# ── 头像上传（仅本人或管理员）：缩放转 WebP 落盘，DB 仅存路径 ──────────────
@router.post("/{user_id}/avatar", response_model=UserSchema)
async def upload_avatar(
    user_id: int,
    file: UploadFile = File(...),
    current: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    is_self = current.id == user_id
    is_admin = current.role in ("founder", "ambassador")
    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="无权修改他人头像")

    data = await file.read()
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGBA")
        img.thumbnail((MAX_AVATAR_PX, MAX_AVATAR_PX), Image.LANCZOS)
    except Exception:
        raise HTTPException(status_code=400, detail="图片无法解析，请换一张")

    out = os.path.join(_AVATAR_DIR, f"{user_id}.webp")
    img.save(out, "WEBP", quality=88)

    target.avatar = f"/avatars/{user_id}.webp"
    db.commit()
    db.refresh(target)
    return target


# ── 介绍卡片背景上传（仅本人或管理员）：缩放转 WebP 落盘，DB 存 url(/backgrounds/..) ──
_BG_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "static", "backgrounds",
)
os.makedirs(_BG_DIR, exist_ok=True)
MAX_BG_PX = 1280


@router.post("/{user_id}/background", response_model=UserSchema)
async def upload_background(
    user_id: int,
    file: UploadFile = File(...),
    current: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    target = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")

    is_self = current.id == user_id
    is_admin = current.role in ("founder", "ambassador")
    if not is_self and not is_admin:
        raise HTTPException(status_code=403, detail="无权修改他人背景")

    data = await file.read()
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        img.thumbnail((MAX_BG_PX, MAX_BG_PX), Image.LANCZOS)
    except Exception:
        raise HTTPException(status_code=400, detail="图片无法解析，请换一张")

    out = os.path.join(_BG_DIR, f"{user_id}.webp")
    img.save(out, "WEBP", quality=82)

    target.profile_bg = f"url(/backgrounds/{user_id}.webp)"
    db.commit()
    db.refresh(target)
    return target


# ── 账号注销（本人，密码确认）──
@router.delete("/me")
def delete_my_account(
    body: dict,
    user: UserModel = Depends(require_user),
    db: Session = Depends(get_db),
):
    """注销当前账号：需密码确认（无密码账户免密）。级联清理社交关系与通知。"""
    pw = (body.get("password") or "") if isinstance(body, dict) else ""
    if user.password:
        if not pw:
            raise HTTPException(status_code=400, detail="请输入密码以确认注销")
        if not verify_password(pw, user.password):
            raise HTTPException(status_code=400, detail="密码错误")

    # 级联清理：关注关系、星标、点赞、通知（帖子/评论为去规范化存储，保留不删）
    db.query(Follow).filter(
        (Follow.follower_id == user.id) | (Follow.followee_id == user.id)
    ).delete(synchronize_session=False)
    db.query(UserStar).filter(UserStar.user_id == user.id).delete(synchronize_session=False)
    db.query(UserLike).filter(UserLike.user_id == user.id).delete(synchronize_session=False)
    db.query(NotificationModel).filter(
        (NotificationModel.recipient_id == user.id) | (NotificationModel.actor_id == user.id)
    ).delete(synchronize_session=False)
    db.query(UserModel).filter(UserModel.id == user.id).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}
