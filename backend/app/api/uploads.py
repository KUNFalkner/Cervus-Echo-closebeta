from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from typing import List
import os, io, uuid, pathlib
from PIL import Image
from app.auth import require_user
from app.models.user import User as UserModel

router = APIRouter()
_UPLOAD_DIR = pathlib.Path(__file__).resolve().parent.parent.parent / "static" / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMG_PX = 1280
MAX_IMAGES = 9

@router.post("/", response_model=dict)
async def upload_images(
    files: List[UploadFile] = File(...),
    current: UserModel = Depends(require_user),
):
    """接收多张图片，统一转 webp 缩图后存到 static/uploads/，返回可访问 URL 列表。"""
    if not files:
        raise HTTPException(status_code=400, detail="未收到图片")
    if len(files) > MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"最多上传 {MAX_IMAGES} 张图片")

    urls = []
    for f in files:
        data = await f.read()
        try:
            img = Image.open(io.BytesIO(data))
            img = img.convert("RGBA")
            img.thumbnail((MAX_IMG_PX, MAX_IMG_PX), Image.LANCZOS)
        except Exception:
            raise HTTPException(status_code=400, detail="图片无法解析，请换一张")
        name = f"{uuid.uuid4().hex}.webp"
        img.save(str(_UPLOAD_DIR / name), "WEBP", quality=85)
        urls.append(f"/uploads/{name}")
    return {"urls": urls}
