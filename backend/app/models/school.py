from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.models.database import Base

class School(Base):
    __tablename__ = "schools"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # 学校代码，如 JSKS, KSLJ
    name = Column(String, nullable=False)  # 学校全称
    short_name = Column(String)  # 简称
    level = Column(String, default="三星")  # 四星/三星
    is_active = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime(timezone=True), server_default=func.now())
