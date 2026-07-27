from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import posts, users, messages, chat, reports, admin, schools

app = FastAPI(
    title="校园树洞社区 API",
    description="校园树洞社区后端API - Beta v0.1.8",
    version="0.1.8"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(posts.router, prefix="/api/posts", tags=["posts"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])
app.include_router(chat.router, tags=["chat"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(schools.router, prefix="/api/schools", tags=["schools"])

@app.get("/")
async def root():
    return {"message": "欢迎来到校园树洞社区 API - Beta v0.1.8"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
