from pydantic import BaseModel
from datetime import datetime

class MessageBase(BaseModel):
    content: str
    room_id: str

class MessageCreate(MessageBase):
    user_id: int

class Message(MessageBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True
