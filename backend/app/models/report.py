from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.models.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, index=True)
    target_type = Column(String)  # "post" or "comment"
    target_id = Column(Integer, index=True)
    reason = Column(Text)
    status = Column(String, default="pending")  # pending, reviewed, resolved
    created_at = Column(DateTime(timezone=True), server_default=func.now())
