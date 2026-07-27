from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json

router = APIRouter()

# 连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            # 广播消息给所有连接
            await manager.broadcast(json.dumps({
                "type": "message",
                "room_id": room_id,
                "user_id": message.get("user_id"),
                "nickname": message.get("nickname", "匿名用户"),
                "content": message.get("content", ""),
                "timestamp": message.get("timestamp")
            }))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
