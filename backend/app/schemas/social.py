from pydantic import BaseModel
from typing import List, Optional


class FollowStateOut(BaseModel):
    following_ids: List[int] = []


class CreateConversation(BaseModel):
    peer_id: int


class SendMessage(BaseModel):
    content: str


class PostUpdate(BaseModel):
    """作者编辑自己的帖子，字段均可选，只更新提供的字段。"""
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    hide_uid: Optional[bool] = None
