from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ReportCreate(BaseModel):
    reporter_id: int
    target_type: str
    target_id: int
    reason: str

class Report(BaseModel):
    id: int
    reporter_id: int
    target_type: str
    target_id: int
    reason: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
