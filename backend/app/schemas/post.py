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
    # 公告受众（founder 特权，2026-09-17）：'all' / 'students_only'；非 founder 服务端强制 all
    audience: str = "all"

class PostCreate(PostBase):
    # user_id / user_uid / user_school 不再由客户端提供，一律取自 JWT 认证结果
    display_name: Optional[str] = None
    hide_uid: bool = False
    # 匿名标记：前端按 isAdmin/isAnon 决定，服务端落库作为匿名统计唯一数据源
    is_anonymous: bool = False

class Post(PostBase):
    id: int
    # 匿名帖对外抹成 None（2026-09-16 核心修复：user_id 明文=去匿名化链条）
    user_id: Optional[int] = None
    username: Optional[str] = None
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    user_school: Optional[str] = None
    hide_uid: bool = False
    is_anonymous: bool = False
    is_pinned: int = 0  # 0=无 1=个人主页置顶 2=论坛置顶
    # 公告受众：'all' / 'students_only'（founder 特权，仅公告帖有意义）
    audience: str = "all"
    # 匿名帖的属主标记：user_id 抹除后前端靠它显示 编辑/删除 按钮（仅属主本人为 True）
    is_own: bool = False
    author_avatar: Optional[str] = None
    like_count: int = 0
    star_count: int = 0
    comment_count: int = 0
    created_at: datetime

    # 历史脏数据（计数字段为 NULL）会让整个列表接口 500，这里统一兜底
    @field_validator("is_announcement", "hide_uid", "is_anonymous", mode="before")
    @classmethod
    def _default_false(cls, v):
        return False if v is None else v

    @field_validator("is_pinned", mode="before")
    @classmethod
    def _default_pinned(cls, v):
        return 0 if v is None else v

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
    images: Optional[List[str]] = None  # 图片 URL 列表

class CommentCreate(CommentBase):
    # post_id 取自路径，user_id / user_uid 取自 JWT 认证结果
    display_name: Optional[str] = None
    hide_uid: bool = False
    parent_id: Optional[int] = None  # 楼中楼：回复的父评论 id；NULL=顶层

class CommentUpdate(CommentBase):
    # 编辑评论：可改内容与图片
    pass

class Comment(CommentBase):
    id: int
    post_id: int
    user_id: int
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    hide_uid: bool = False
    parent_id: Optional[int] = None  # 楼中楼：父评论 id；NULL=顶层
    author_avatar: Optional[str] = None
    edited: bool = False
    edited_at: Optional[datetime] = None
    created_at: datetime

    @field_validator("images", mode="before")
    @classmethod
    def _split_images(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            return [u for u in v.split(",") if u.strip()]
        return v or []

    @field_validator("edited", mode="before")
    @classmethod
    def _default_false(cls, v):
        return False if v is None else v

    class Config:
        from_attributes = True
