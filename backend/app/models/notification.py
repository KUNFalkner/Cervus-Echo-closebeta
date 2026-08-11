from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.models.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, index=True)      # 接收通知的用户
    actor_id = Column(Integer, nullable=True)        # 触发动作的用户
    actor_name = Column(String, nullable=True)       # 触发者昵称/账户名（快照）
    type = Column(String, default="reply")           # reply | like | mention
    post_id = Column(Integer, nullable=True, index=True)
    comment_id = Column(Integer, nullable=True)
    post_title = Column(String, nullable=True)       # 帖子标题快照，便于展示
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
