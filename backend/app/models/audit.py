from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.models.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, index=True)          # 操作者 user id
    action = Column(String)                          # 如 report_view / report_resolve / reveal
    detail = Column(String, nullable=True)           # 目标与摘要（如 report_id=3 target=post/12）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
