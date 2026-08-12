from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, UniqueConstraint
from sqlalchemy.sql import func
from app.models.database import Base


class Conversation(Base):
    """1:1 私信会话。user_a/user_b 按 id 升序规整，保证唯一配对。"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_a = Column(Integer, index=True)
    user_b = Column(Integer, index=True)
    last_message = Column(Text, nullable=True)
    last_time = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('user_a', 'user_b', name='uq_conv_pair'),
    )


class DirectMessage(Base):
    """私信消息。read=False 表示收信方尚未读。"""
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, index=True)
    sender_id = Column(Integer, index=True)
    content = Column(Text)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
