from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.models.database import get_db
from app.models.message import Message
from app.schemas.message import MessageCreate, Message

router = APIRouter()

@router.post("/", response_model=Message)
def create_message(message: MessageCreate, db: Session = Depends(get_db)):
    db_message = Message(**message.model_dump())
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

@router.get("/{room_id}", response_model=List[Message])
def read_messages(room_id: str, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    messages = db.query(Message).filter(Message.room_id == room_id).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    return messages
