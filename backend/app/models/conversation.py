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
    last_message_burned = Column(Boolean, default=False, nullable=True)
    # 会话隐藏（2026-09-17，站长要求可删除会话）：各视角独立隐藏；
    # 对方再来新消息时自动取消隐藏（微信语义）
    hidden_a = Column(Boolean, default=False)
    hidden_b = Column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint('user_a', 'user_b', name='uq_conv_pair'),
    )


class DirectMessage(Base):
    """私信消息。read=False 表示收信方尚未读。

    阅后即焚字段（burn_mode 非空即焚毁消息）：
    - content 恒为 NULL，正文只以密文存 content_enc（数据库里没有明文可泄）
    - burned_at 非空 = 已焚；expires_at = 30 天兜底到期时间
    """
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, index=True)
    sender_id = Column(Integer, index=True)
    content = Column(Text)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    burn_mode = Column(String(8), nullable=True, index=True)
    content_enc = Column(Text, nullable=True)
    burned_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # 撤回（2026-09-17）：软删除，仅发送者本人可撤；对外只渲染「消息已撤回」
    recalled = Column(Boolean, default=False)
