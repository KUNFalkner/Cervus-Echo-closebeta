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

SECRET_KEY = os.getenv("TREEHOLE_SECRET", "treehole-dev-secret-change-in-prod")
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
    user_id = payload.get("sub")
    if user_id is None:
        return None
    return db.query(UserModel).filter(UserModel.id == int(user_id)).first()


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
