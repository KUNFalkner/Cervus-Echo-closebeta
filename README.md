# 校园树洞社区

> 一个可复制、多分校、半匿名的校园社区网络 — "帮学生探索自己的平台"

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite | 单文件 `src/App.jsx`（React 18 + Hooks），动画用 anime.js + GSAP |
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
| `POST /api/posts/:id/star` | 加星（star_count +1；Karma 计分待完善） |
| `POST /api/reports/` | 举报帖子/评论 |
| `GET /api/schools/` | 学校列表（12 所昆山高中） |
| `GET /api/messages/` | 消息相关接口 |
| `GET /api/admin/stats` `users` `reports` | 管理端：数据/用户/举报 |
| `WS /ws/chat/main` | WebSocket 聊天室 |

## 项目结构

```
├── frontend/                  # React 18 + Vite 前端（单文件架构）
│   ├── src/
│   │   ├── App.jsx            # 全部页面/组件/逻辑（Login, Home, PostDetail, Chat, Admin, Profile…）
│   │   ├── App.css            # 全局样式（液态玻璃令牌）
│   │   ├── index.css          # 基础样式
│   │   └── main.jsx           # 入口
│   ├── index.html
│   └── package.json           # 版本 0.1.9
├── backend/                   # FastAPI 后端（版本 0.1.8）
│   └── app/
│       ├── api/               # 路由 (posts, users, chat, messages, reports, admin, schools)
│       ├── models/            # SQLAlchemy 模型 (user, post, report, school, star, message)
│       ├── schemas/           # Pydantic 验证
│       ├── services/          # 敏感词过滤
│       ├── auth.py            # JWT 认证
│       └── wechat.py          # 微信 OAuth（当前为 dev stub）
├── DESIGN.md                  # 设计系统
├── PRODUCT.md                 # 产品定义
└── .codegraph/                # CodeGraph 代码索引（本地，已 gitignore）
```

## 待办

- [x] Beta v0.1.0: 发帖、评论、举报、Star、敏感词过滤
- [x] Beta v0.1.8: JWT 认证、微信登录桩、12 所学校/大使体系、液态玻璃 UI
- [x] v0.2.x: Star/Karma 内容治理机制（加星/取消可切换、Karma 计分、热门排序治理）
- [ ] v0.3.0: 微信登录（真实 AppID）、校园大使后台增强
- [ ] v1.0.0: 塔罗占卜、AI 心理咨询

> 注意：本 README 此前误写为 "Vue 3 重写"，实际前端为 **React 18 单文件架构**（见上方项目结构）。
