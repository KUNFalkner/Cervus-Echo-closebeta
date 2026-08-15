"""塔罗抽牌历史（按用户持久化，支持跨端同步）。

ponytail: 历史以「日期」为维度（每日一抽），(user_id, date) 唯一。
cards / counsel 用 JSON 存原始牌阵与星语解读，避免为可变结构单独建表。
"""
from sqlalchemy import Column, Integer, String, BigInteger, JSON, ForeignKey

from app.models.database import Base


class TarotHistory(Base):
    __tablename__ = "tarot_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD
    ts = Column(BigInteger, nullable=False, default=0)  # 最近一次写入时间戳（ms），用于跨端合并时取最新
    question = Column(String(500), nullable=True)
    cards = Column(JSON, nullable=True)  # 三张牌的原始结构
    counsel = Column(JSON, nullable=True)  # { text, source } 或 null
