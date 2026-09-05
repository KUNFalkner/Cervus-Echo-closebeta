import os
import pathlib
import mimetypes

# Windows 上 Python 默认不识别 .webp，显式注册以便正确返回 image/webp
mimetypes.add_type("image/webp", ".webp")

# 加载 .env（必须早于任何 os.getenv 读取，也必须在导入 app.api 之前，
# 因为 auth.py 在导入时就会读取 TREEHOLE_SECRET / TREEHOLE_ENV）。
# load_dotenv 默认不会覆盖已存在的环境变量（与 shell 已 export 的共存）。
try:
    from dotenv import load_dotenv
    _BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent
    # 优先加载 backend/.env（与 uvicorn 启动目录无关，路径稳定）
    load_dotenv(dotenv_path=str(_BACKEND_DIR / ".env"))
except Exception as _e:  # dotenv 缺失也不应阻断开发模式启动
    print(f"[WARN] 加载 .env 失败（不影响开发模式）: {_e}")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.api import posts, users, chat, reports, admin, schools, notifications, uploads, tarot, social, dm, boards, polls, burn, groups

app = FastAPI(
    title="鹿鸣回音社区 API",
    description="鹿鸣回音社区后端API - Beta v0.1.8",
    version="0.1.8"
)


# ── 增量迁移：评论楼中楼需要 comments.parent_id 列 ────────────────────────
# 项目未使用自动建表/迁移工具，部署库已存在但可能缺少新列，
# 在启动时幂等补齐，保证新功能在旧库上也能直接工作。
def _migrate_comment_parent():
    try:
        from sqlalchemy import inspect as _sa_inspect, text as _text
        from app.models.database import engine
        _insp = _sa_inspect(engine)
        _cols = [c["name"] for c in _insp.get_columns("comments")]
        if "parent_id" not in _cols:
            with engine.begin() as _conn:
                _conn.execute(_text("ALTER TABLE comments ADD COLUMN parent_id INTEGER"))
            print("[MIGRATE] comments.parent_id 已添加")
    except Exception as _e:
        print(f"[MIGRATE] 跳过 comments.parent_id 迁移: {_e}")


def _migrate_comment_fields():
    """评论插图 + 编辑标记所需的列（幂等）。"""
    try:
        from sqlalchemy import inspect as _sa_inspect, text as _text
        from app.models.database import engine
        _insp = _sa_inspect(engine)
        _cols = [c["name"] for c in _insp.get_columns("comments")]
        _added = []
        for _col, _sql in [
            ("images", "ALTER TABLE comments ADD COLUMN images STRING"),
            ("edited", "ALTER TABLE comments ADD COLUMN edited BOOLEAN"),
            ("edited_at", "ALTER TABLE comments ADD COLUMN edited_at TIMESTAMP"),
        ]:
            if _col not in _cols:
                with engine.begin() as _conn:
                    _conn.execute(_text(_sql))
                _added.append(_col)
        if _added:
            print(f"[MIGRATE] comments 已添加列: {', '.join(_added)}")
    except Exception as _e:
        print(f"[MIGRATE] 跳过 comments 字段迁移: {_e}")


_migrate_comment_parent()
_migrate_comment_fields()


def _migrate_add_columns(table: str, cols):
    """幂等补列。cols 为 [(列名, 完整 ALTER 语句)]。"""
    try:
        from sqlalchemy import inspect as _sa_inspect, text as _text
        from app.models.database import engine
        _have = [c["name"] for c in _sa_inspect(engine).get_columns(table)]
        _added = []
        for _col, _sql in cols:
            if _col not in _have:
                with engine.begin() as _conn:
                    _conn.execute(_text(_sql))
                _added.append(_col)
        if _added:
            print(f"[MIGRATE] {table} 已添加列: {', '.join(_added)}")
    except Exception as _e:
        print(f"[MIGRATE] 跳过 {table} 补列: {_e}")


def _migrate_burn_indexes():
    """清扫与统计要按 expires_at / burn_mode / is_anonymous 过滤，补上索引。"""
    try:
        from sqlalchemy import text as _text
        from app.models.database import engine
        with engine.begin() as _conn:
            for _sql in (
                "CREATE INDEX IF NOT EXISTS ix_dm_burn ON direct_messages(burn_mode, burned_at)",
                "CREATE INDEX IF NOT EXISTS ix_dm_expires ON direct_messages(expires_at)",
                "CREATE INDEX IF NOT EXISTS ix_msg_burn ON messages(burn_mode, burned_at)",
                "CREATE INDEX IF NOT EXISTS ix_msg_expires ON messages(expires_at)",
                "CREATE INDEX IF NOT EXISTS ix_posts_anon ON posts(is_anonymous)",
            ):
                _conn.execute(_text(_sql))
    except Exception as _e:
        print(f"[MIGRATE] 跳过阅后即焚索引: {_e}")


# ── 阅后即焚所需列（私信 direct_messages / 群聊 messages 同构）──
# 只存密文：焚毁消息的 content 恒为 NULL，正文只写 content_enc。
# burned_at = 已焚时间；expires_at = 30 天兜底到期时间。
_BURN_COLS = [
    ("burn_mode", "ALTER TABLE {t} ADD COLUMN burn_mode VARCHAR(8)"),
    ("content_enc", "ALTER TABLE {t} ADD COLUMN content_enc TEXT"),
    ("burned_at", "ALTER TABLE {t} ADD COLUMN burned_at TIMESTAMP"),
    ("expires_at", "ALTER TABLE {t} ADD COLUMN expires_at TIMESTAMP"),
]
for _t in ("direct_messages", "messages"):
    _migrate_add_columns(_t, [(c, s.format(t=_t)) for c, s in _BURN_COLS])

# 会话列表摘要：最后一条是焚毁消息时不显示明文
_migrate_add_columns("conversations", [
    ("last_message_burned", "ALTER TABLE conversations ADD COLUMN last_message_burned BOOLEAN DEFAULT 0"),
])

# 匿名发帖统计的唯一数据源：发帖时由服务端落库（User.is_anonymous 只是偏好，前端表单没读它）
_migrate_add_columns("posts", [
    ("is_anonymous", "ALTER TABLE posts ADD COLUMN is_anonymous BOOLEAN DEFAULT 0"),
])
_migrate_burn_indexes()

# ── 增量迁移：全文搜索 FTS5 虚拟表 ───────────────────────────────────────
# 启动时幂等建表并回填存量数据，新帖/新评论在写库时实时同步索引。
try:
    from app.search_index import ensure_fts_tables, backfill_fts
    ensure_fts_tables()
    backfill_fts()
except Exception as _e:
    print(f"[FTS] 初始化失败（搜索将回退 LIKE）: {_e}")

# 构建后的前端目录（production preview 同源托管用）
_DIST = pathlib.Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

# CORS：默认只放行本地开发端口，部署时用 TREEHOLE_ORIGINS 逗号分隔覆盖
_origins = os.getenv("TREEHOLE_ORIGINS")
ALLOWED_ORIGINS = (
    [o.strip() for o in _origins.split(",") if o.strip()]
    if _origins
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(posts.router, prefix="/api/posts", tags=["posts"])
app.include_router(chat.router, tags=["chat"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(schools.router, prefix="/api/schools", tags=["schools"])
app.include_router(notifications.router)
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(tarot.router, tags=["tarot"])
app.include_router(social.router, prefix="/api/social", tags=["social"])
app.include_router(dm.router, prefix="/api/dm", tags=["dm"])
app.include_router(burn.router, prefix="/api/burn", tags=["burn"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(boards.router, tags=["boards"])
app.include_router(polls.router, tags=["polls"])

@app.get("/")
async def root():
    if _DIST.exists():
        return FileResponse(str(_DIST / "index.html"))
    return {"message": "欢迎来到鹿鸣回音社区 API - Beta v0.1.8"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# ── 静态资源与生产预览托管 ──
# 头像目录由 app/api/users.py 在导入时创建，位置是 backend/static/avatars
_AVATAR_DIR = pathlib.Path(__file__).resolve().parent.parent / "static" / "avatars"

# 用户上传头像（与前端同源，避免跨域）。必须早于下方 SPA 兜底路由注册，
# 否则 /{full_path:path} 会抢先匹配并把图片请求回成 index.html。
_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(_AVATAR_DIR)), name="avatars")

# 帖子图片：用户上传到 static/uploads/，与前端同源托管
_UPLOAD_DIR = pathlib.Path(__file__).resolve().parent.parent / "static" / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOAD_DIR)), name="uploads")

# 个人介绍卡片背景图片：用户上传到 static/backgrounds/，与前端同源托管
_BG_DIR = pathlib.Path(__file__).resolve().parent.parent / "static" / "backgrounds"
_BG_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/backgrounds", StaticFiles(directory=str(_BG_DIR)), name="backgrounds")

if _DIST.exists():
    _assets = _DIST / "assets"
    _tarot = _DIST / "tarot"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")
    if _tarot.exists():
        app.mount("/tarot", StaticFiles(directory=str(_tarot)), name="tarot")

    @app.get("/{full_path:path}")
    async def _spa(full_path: str):
        # /api、/ws、/docs、/health、/avatars 等已由上方路由优先匹配，这里兜底返回 SPA
        return FileResponse(str(_DIST / "index.html"))
