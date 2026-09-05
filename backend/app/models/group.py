from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.models.database import Base


class ChatGroup(Base):
    """用户自建群聊。disbanded_at 非空 = 已解散（软删，历史消息保留）。"""
    __tablename__ = "chat_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64))
    creator_id = Column(Integer, index=True)
    member_count = Column(Integer, default=1)
    disbanded_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatGroupMember(Base):
    """群成员。left_at 非空 = 已移出（软踢）。"""
    __tablename__ = "chat_group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, index=True)
    user_id = Column(Integer, index=True)
    last_read_message_id = Column(Integer, default=0)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    left_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_member"),)
