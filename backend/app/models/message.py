from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.models.database import Base

class Message(Base):
    """聊天室消息。room_id='chat/main' 是公共聊天室；'group/{gid}' 是自建群聊。

    阅后即焚字段同 direct_messages：burn_mode 非空时 content 为 NULL、正文在 content_enc。
    """
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    room_id = Column(String, index=True)
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    burn_mode = Column(String(8), nullable=True, index=True)
    content_enc = Column(Text, nullable=True)
    burned_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # 撤回（2026-09-17）：软删除，仅发送者本人可撤；对外只渲染「消息已撤回」
    recalled = Column(Boolean, default=False)
