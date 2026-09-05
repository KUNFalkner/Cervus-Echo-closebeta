from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.models.database import Base


class MessageRead(Base):
    """阅后即焚的「谁读过 / 谁那份已焚」记录。

    source: 'dm' | 'group'；message_id 是对应表里的消息 id（跨表，故不用外键）。
    发送时就为每位受众预插一行 = 受众快照：后加入群的人拿不到历史焚毁消息，
    也避免「一直拉人导致 all 模式永远触发不了」。
    """
    __tablename__ = "message_reads"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(8), index=True)
    message_id = Column(Integer, index=True)
    user_id = Column(Integer, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    burned_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("source", "message_id", "user_id", name="uq_read"),)


class BurnAuditLog(Base):
    """创始人解开阅后即焚原文的留痕：谁、何时、以什么理由解开了哪条。"""
    __tablename__ = "burn_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, index=True)
    source = Column(String(8))
    message_id = Column(Integer, index=True)
    sender_id = Column(Integer)
    reason = Column(String(200))
    actor_ip = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
