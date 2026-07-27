from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SchoolBase(BaseModel):
    code: str
    name: str
    short_name: Optional[str] = None
    level: str = "三星"

class SchoolCreate(SchoolBase):
    pass

class School(SchoolBase):
    id: int
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True
