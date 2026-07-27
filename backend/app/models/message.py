from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.models.database import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    room_id = Column(String, index=True)
    content = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
