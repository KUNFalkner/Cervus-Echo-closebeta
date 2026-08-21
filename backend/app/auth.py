"""JWT auth utilities. ponytail: single-file auth, split only if OAuth flows grow."""
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.user import User as UserModel

IS_PROD = os.getenv("TREEHOLE_ENV", "dev").lower() == "prod"
_secret = os.getenv("TREEHOLE_SECRET")
if not _secret:
    if IS_PROD:
        raise RuntimeError("生产环境必须设置 TREEHOLE_SECRET 环境变量")
    _secret = "cervus-dev-secret-change-in-prod"
    print("[WARN] 未设置 TREEHOLE_SECRET，正在使用开发默认密钥，切勿用于生产环境")

SECRET_KEY = _secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)


def create_token(user_id: int, uid: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "uid": uid, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    """Returns the current user from JWT, or None if no valid token."""
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None:
        return None
    return _user_from_payload(payload, db)


def _user_from_payload(payload: dict, db: Session) -> Optional[UserModel]:
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    return db.query(UserModel).filter(UserModel.id == user_id).first()


def require_user(
    user: Optional[UserModel] = Depends(get_current_user),
) -> UserModel:
    """Like get_current_user, but raises 401 if no valid token."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    return user


def require_admin(
    user: UserModel = Depends(require_user),
) -> UserModel:
    if user.role not in ("founder", "ambassador"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    return user


def require_founder(
    user: UserModel = Depends(require_user),
) -> UserModel:
    if user.role != "founder":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅创始人可操作")
    return user


def ws_authenticate(token: Optional[str], db: Session) -> Optional[UserModel]:
    """WebSocket 握手鉴权：浏览器无法为 WS 设置自定义 header，因此 token 走查询参数。"""
    if not token:
        return None
    payload = decode_token(token)
    if payload is None:
        return None
    return _user_from_payload(payload, db)
