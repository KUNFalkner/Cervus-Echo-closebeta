from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    username: str
    nickname: str
    avatar: Optional[str] = None

class UserCreate(UserBase):
    password: Optional[str] = None
    school_id: Optional[str] = None
    enrollment_year: Optional[int] = None
    class_number: Optional[int] = None
    student_number: Optional[int] = None

class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    password: Optional[str] = None
    is_anonymous: Optional[bool] = None
    real_name: Optional[str] = None

class User(UserBase):
    id: int
    uid: Optional[str] = None
    is_anonymous: bool = True
    real_name: Optional[str] = None
    role: str = "student"
    enrollment_year: Optional[int] = None
    class_number: Optional[int] = None
    student_number: Optional[int] = None
    school_id: str = "ZC"
    star_count: int = 0
    karma: int = 0
    banned: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

# 他人主页公开信息：不暴露 uid / 真实姓名 / 账号等敏感字段
class PublicUser(BaseModel):
    id: int
    nickname: str
    avatar: Optional[str] = None
    role: str = "student"
    school_id: str = "ZC"
    karma: int = 0
    is_anonymous: bool = True

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


class WechatLoginRequest(BaseModel):
    code: str


class LoginRequest(BaseModel):
    username: str
    password: str = ""
