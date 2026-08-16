"""投票 / 问卷（创始人 / 大使可发起；用户每人每票，多选可勾）。

ponytail: Poll 存问题 + 选项(JSON 数组) + 是否多选；Vote 存 (poll_id,user_id,option_index)。
同一用户对同一投票的多次投票以「整体替换」语义处理：重新投票会先清旧票再插新票，
因此既能改票也能通过传空数组撤票。选项下标 option_index 即 options 数组下标。
"""
from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime

from sqlalchemy.sql import func
from app.models.database import Base


class Poll(Base):
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, index=True)
    question = Column(String, nullable=False)
    options = Column(JSON, nullable=False)        # ["选项A", "选项B", ...]
    multi = Column(Boolean, default=False)         # 是否允许多选
    created_by = Column(Integer, index=True, nullable=False)
    creator_role = Column(String, default="ambassador")
    closed = Column(Boolean, default=False)        # 是否已截止（截止后不可再投）
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=False)
    option_index = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
