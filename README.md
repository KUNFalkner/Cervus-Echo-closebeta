# 校园树洞社区

> 一个可复制、多分校、半匿名的校园社区网络 — "帮学生探索自己的平台"

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite | Composition API, Pinia, Vue Router |
| 后端 | Python + FastAPI | 异步 REST API, WebSocket |
| 数据库 | SQLite + SQLAlchemy | 轻量级，零配置 |
| 认证 | JWT + 微信 OAuth | 支持用户名密码/微信登录 |
| 动画 | anime.js + GSAP | 列表入场、页面过渡、滚动效果 |
| 设计 | 液态玻璃 (Glassmorphism) | Apple 风格半透明毛玻璃 UI |

## 快速开始

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
python init_db.py
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 3. 访问

- 前端: http://localhost:5173
- API 文档: http://localhost:8000/docs
- 测试账号: `founder` / `20100606`

## API 总览

| 端点 | 说明 |
|---|---|
| `POST /api/users/wechat-login` | 微信登录 (dev stub) |
| `POST /api/users/login` | 用户名密码登录 → JWT |
| `GET /api/users/me` | 获取当前用户 (需 JWT) |
| `POST /api/posts/` | 创建帖子 (敏感词过滤) |
| `GET /api/posts/` | 帖子列表 (分页/分类/搜索) |
| `GET /api/posts/:id` | 帖子详情 |
| `POST /api/posts/:id/comments` | 评论 |
| `POST /api/posts/:id/star` | 加星 (Karma +1) |
| `POST /api/reports/` | 举报帖子/评论 |
| `GET /api/admin/reports` | 管理端举报列表 |
| `WS /ws/chat/main` | WebSocket 聊天室 |

## 项目结构

```
├── frontend/            # Vue 3 前端
│   └── src/
│       ├── views/       # 页面 (Login, Home, PostDetail, Chat, Admin, Profile)
│       ├── components/  # 组件 (PostCard, Toast, ReportModal)
│       ├── stores/      # Pinia 状态管理
│       ├── utils/       # API + 动画工具
│       └── styles/      # 全局样式 (DESIGN.md 令牌)
├── backend/             # FastAPI 后端
│   └── app/
│       ├── api/         # 路由 (posts, users, chat, admin, reports)
│       ├── models/      # SQLAlchemy 模型
│       ├── schemas/     # Pydantic 验证
│       ├── services/    # 敏感词过滤
│       ├── auth.py      # JWT 认证
│       └── wechat.py    # 微信 OAuth
├── DESIGN.md            # 设计系统
└── PRODUCT.md           # 产品定义
```

## 待办

- [x] Beta v0.1.0: 发帖、评论、举报、Star/Karma、敏感词过滤
- [x] Beta v0.2.0: JWT 认证、微信登录桩、Vue 3 重写
- [ ] v0.3.0: 微信登录（真实 AppID）、校园大使后台增强
- [ ] v1.0.0: 塔罗占卜、AI 心理咨询
