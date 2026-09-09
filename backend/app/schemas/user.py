from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    username: str
    nickname: str
    avatar: Optional[str] = None

class UserCreate(UserBase):
    # 用户名：3-20 位，仅字母/数字/下划线
    username: str = Field(min_length=3, max_length=20, pattern=r"^[A-Za-z0-9_]+$")
    # 密码：必填，至少 8 位，且需同时含字母与数字
    password: str = Field(min_length=8, max_length=64)
    # 昵称：1-20 位，不能为空
    nickname: str = Field(min_length=1, max_length=20)
    # 学校：仅允许白名单（后端按 School 表二次校验），此处给个合理范围
    school_id: Optional[str] = Field(default=None, min_length=2, max_length=16)
    # 入学年份：动态滑动窗口——在读高中生最长 3 年学制，可选 [今年-3, 今年]。
    # 用 validator 而非 ge/le：窗口随真实日期每年自动滑动，永不"做死"。
    enrollment_year: Optional[int] = Field(default=None)
    # 班级：现实一个班一般 ≤ 55 人
    class_number: Optional[int] = Field(default=None, ge=1, le=55)
    # 学号：4-10 位纯数字（过渡方案；将来学校名单制再精确化）。
    # 以 int 承接前端输入，用 validator 限定位数区间。
    student_number: Optional[int] = Field(default=None, ge=1, le=9999999999)
    # 注册身份自选：student（默认）/ teacher。school_official 不开放自注册。
    role: str = Field(default="student", pattern=r"^(student|teacher)$")

    @field_validator("enrollment_year")
    @classmethod
    def _check_enrollment_year(cls, v):
        if v is None:
            return v
        this_year = datetime.now().year
        if not (this_year - 3 <= v <= this_year):
            raise ValueError(f"入学年份只能是 {this_year - 3}–{this_year}（在读年级范围）")
        return v

    @field_validator("student_number")
    @classmethod
    def _check_student_number(cls, v):
        if v is None:
            return v
        if not (4 <= len(str(v)) <= 10):
            raise ValueError("学号需为 4–10 位数字")
        return v

    @field_validator("password")
    @classmethod
    def _check_password_strength(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("密码需同时包含字母和数字")
        return v

    @field_validator("nickname")
    @classmethod
    def _strip_nickname(cls, v: str) -> str:
        return v.strip()

class UserUpdate(BaseModel):
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    password: Optional[str] = None
    is_anonymous: Optional[bool] = None
    real_name: Optional[str] = None
    profile_bg: Optional[str] = None

class User(UserBase):
    id: int
    uid: Optional[str] = None
    is_anonymous: bool = True
    real_name: Optional[str] = None
    role: str = "student"
    approved: bool = True
    enrollment_year: Optional[int] = None
    class_number: Optional[int] = None
    student_number: Optional[int] = None
    school_id: str = "ZC"
    profile_bg: str = ""
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
    profile_bg: str = ""
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
