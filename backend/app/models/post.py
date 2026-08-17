from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.models.database import Base

class Post(Base):
    __tablename__ = "posts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    username = Column(String)
    title = Column(String)
    content = Column(Text)
    category = Column(String, default="general")
    forum = Column(String, default="main")
    is_announcement = Column(Boolean, default=False)
    tags = Column(String)
    display_name = Column(String)
    user_uid = Column(String)
    user_school = Column(String)
    images = Column(String, default=None)  # 逗号分隔的图片 URL 列表
    hide_uid = Column(Boolean, default=False)
    like_count = Column(Integer, default=0)
    star_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, index=True)
    user_id = Column(Integer, index=True)
    content = Column(Text)
    display_name = Column(String)
    user_uid = Column(String)
    hide_uid = Column(Boolean, default=False)
    # 楼中楼：父评论 id；NULL 表示顶层评论。自引用，不强制外键以保证迁移简单。
    parent_id = Column(Integer, default=None, index=True)
    images = Column(String, default=None)  # 逗号分隔的图片 URL 列表（与帖子图一致，存 /uploads/xxx.webp）
    edited = Column(Boolean, default=False)  # 是否被编辑过（前端展示「已编辑」标记）
    edited_at = Column(DateTime(timezone=True), default=None)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
