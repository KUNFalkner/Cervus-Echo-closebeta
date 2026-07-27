from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.models.database import Base

class UserStar(Base):
    __tablename__ = "user_stars"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)  # 谁加的星
    post_id = Column(Integer, index=True)  # 哪个帖子
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', name='uq_user_post_star'),
    )
