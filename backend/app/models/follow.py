from sqlalchemy import Column, Integer, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.models.database import Base


class Follow(Base):
    """关注关系：follower_id 关注 followee_id。禁止自关，唯一对。"""
    __tablename__ = "follows"

    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, index=True)
    followee_id = Column(Integer, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('follower_id', 'followee_id', name='uq_follow_pair'),
    )
