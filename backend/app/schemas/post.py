from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional, List

class PostBase(BaseModel):
    title: str
    content: str
    category: str = "general"
    forum: str = "main"  # "main" 或学校代码
    is_announcement: bool = False
    tags: Optional[str] = None
    images: Optional[List[str]] = None  # 图片 URL 列表

class PostCreate(PostBase):
    # user_id / user_uid / user_school 不再由客户端提供，一律取自 JWT 认证结果
    display_name: Optional[str] = None
    hide_uid: bool = False

class Post(PostBase):
    id: int
    user_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    user_school: Optional[str] = None
    hide_uid: bool = False
    author_avatar: Optional[str] = None
    like_count: int = 0
    star_count: int = 0
    comment_count: int = 0
    created_at: datetime

    # 历史脏数据（计数字段为 NULL）会让整个列表接口 500，这里统一兜底
    @field_validator("is_announcement", "hide_uid", mode="before")
    @classmethod
    def _default_false(cls, v):
        return False if v is None else v

    @field_validator("like_count", "star_count", "comment_count", mode="before")
    @classmethod
    def _default_zero(cls, v):
        return 0 if v is None else v

    @field_validator("title", "content", mode="before")
    @classmethod
    def _default_str(cls, v):
        return "" if v is None else v

    @field_validator("category", mode="before")
    @classmethod
    def _default_category(cls, v):
        return "general" if v is None else v

    @field_validator("forum", mode="before")
    @classmethod
    def _default_forum(cls, v):
        return "main" if v is None else v

    @field_validator("images", mode="before")
    @classmethod
    def _split_images(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [u for u in v.split(",") if u.strip()]
        return v or []

    class Config:
        from_attributes = True

class CommentBase(BaseModel):
    content: str

class CommentCreate(CommentBase):
    # post_id 取自路径，user_id / user_uid 取自 JWT 认证结果
    display_name: Optional[str] = None
    hide_uid: bool = False

class CommentUpdate(CommentBase):
    # 编辑评论只改内容
    pass

class Comment(CommentBase):
    id: int
    post_id: int
    user_id: int
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    hide_uid: bool = False
    author_avatar: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
