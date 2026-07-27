from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class PostBase(BaseModel):
    title: str
    content: str
    category: str = "general"
    forum: str = "main"  # "main" 或学校代码
    is_announcement: bool = False
    tags: Optional[str] = None

class PostCreate(PostBase):
    user_id: int
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    user_school: Optional[str] = None
    hide_uid: bool = False

class Post(PostBase):
    id: int
    user_id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    user_school: Optional[str] = None
    hide_uid: bool = False
    like_count: int
    star_count: int = 0
    comment_count: int
    created_at: datetime

    class Config:
        from_attributes = True

class CommentBase(BaseModel):
    content: str

class CommentCreate(CommentBase):
    user_id: int
    post_id: int
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    hide_uid: bool = False

class Comment(CommentBase):
    id: int
    post_id: int
    user_id: int
    display_name: Optional[str] = None
    user_uid: Optional[str] = None
    hide_uid: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
