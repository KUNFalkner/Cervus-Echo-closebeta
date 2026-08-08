from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class MessageBase(BaseModel):
    content: str
    room_id: str

class MessageCreate(MessageBase):
    user_id: int

class Message(MessageBase):
    id: int
    user_id: Optional[int] = None   # 匿名发言没有 user_id
    created_at: datetime

    class Config:
        from_attributes = True
