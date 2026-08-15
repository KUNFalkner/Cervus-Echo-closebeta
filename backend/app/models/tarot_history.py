"""塔罗抽牌历史（按用户持久化，支持跨端同步）。

ponytail: 历史以「每次抽牌」为维度，每条由 ts（毫秒时间戳）唯一标识，
故同一天可累积多条记录（解决「一直都是 1」）。
cards / counsel 用 JSON 存原始牌阵与星语解读，避免为可变结构单独建表。
time 为本地 HH:MM，spread 为牌阵类型（time=过去现在未来 / celtic=凯尔特十字）。
"""
from sqlalchemy import Column, Integer, String, BigInteger, JSON, ForeignKey

from app.models.database import Base


class TarotHistory(Base):
    __tablename__ = "tarot_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String(10), nullable=False)  # YYYY-MM-DD（展示用）
    time = Column(String(8), nullable=True)  # HH:MM（本地时间，展示用）
    spread = Column(String(16), nullable=True)  # 牌阵类型：time / celtic
    ts = Column(BigInteger, nullable=False, default=0)  # 抽牌时间戳（ms），每条唯一，用于跨端 upsert
    question = Column(String(500), nullable=True)
    cards = Column(JSON, nullable=True)  # 牌阵的原始结构
    counsel = Column(JSON, nullable=True)  # { text, source } 或 null
