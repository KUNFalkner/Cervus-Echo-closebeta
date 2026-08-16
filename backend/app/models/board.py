from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from app.models.database import Base


class Board(Base):
    """话题板块（受创始人/大使管理的固定分类目录）。

    复用原有 Post.category 字段作为板块 key，故不改动 posts 表结构；
    本表只是「目录元数据」（名称/图标/排序/启停），由创始人后台维护。
    """

    __tablename__ = "boards"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)  # 与 Post.category 对齐，如 'study'
    name = Column(String, nullable=False)
    icon = Column(String, default="📝")
    description = Column(String, default="")
    sort_order = Column(Integer, default=0)
    active = Column(Boolean, default=True)  # false=软隐藏（不出现在公开筛选，但存量帖子保留）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
