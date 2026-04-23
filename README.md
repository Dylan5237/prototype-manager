# 伏羲元构 — AI产出原型管理平台

> **AI产出原型管理平台**：专门管理AI以前端项目形式生成的原型，支持产品经理上传原型项目并开放给公司团队查看、协作。

## 快速访问

| 服务 | 地址 | 说明 |
|---|---|---|
| 管理平台 | http://localhost:3000 | 前端界面 |
| 后端API | http://localhost:3001 | API服务 |
| 默认账号 | `admin / admin123` | 首次登录使用 |

## 手动重启服务

```bash
# 后端（端口3001）
cd prototype-manager/backend
node server.js

# 前端（端口3000）
cd prototype-manager/frontend
npm run dev
```

## 核心功能

### P0 — 基础能力（已实现）

| 功能 | 说明 |
|---|---|
| **用户认证** | JWT + bcrypt 账号密码登录，支持管理员/上传者/查看者三种角色 |
| **权限控制** | 细粒度权限：查看者只能浏览，上传者可管理自己的原型，管理员拥有全部权限 |
| **SQLite持久化** | 纯JavaScript实现（sql.js），零配置、单文件数据库，自动迁移旧JSON数据 |

### P1 — 管理增强（已实现）

| 功能 | 说明 |
|---|---|
| **原型管理** | 创建原型、上传ZIP、GitHub同步、删除 |
| **分类系统** | 支持按业务线/产品线分类，首页可筛选 |
| **搜索功能** | 按原型名称、描述实时搜索 |
| **网页预览** | 自动注入`<base>`标签+路径转换，在新页签中完整预览可交互网页 |
| **源码查看** | 项目文件树浏览，点击文件查看源码 |
| **设计文档** | 自动提取项目中的README.md，在"设计文档"Tab中渲染展示 |
| **用户管理** | 管理员可创建用户、分配角色 |

### P2 — 协作深化（规划中）

| 功能 | 说明 |
|---|---|
| **评论反馈** | 查看者可在原型下留言，产品经理收到反馈通知 |
| **版本历史** | 每次上传/GitHub同步自动生成新版本，支持回滚和对比 |
| **访问统计** | 记录浏览次数、最近查看时间，了解原型热度 |

### P3 — 进阶优化（规划中）

| 功能 | 说明 |
|---|---|
| **自动构建** | 上传源码ZIP后自动执行`npm install && npm run build` |
| **收藏关注** | 用户标记常用原型，个人工作台快捷入口 |
| **批量操作** | 批量上传、批量分类、批量删除 |

## 技术架构

```
伏羲元构/
├── backend/              # Node.js + Express 后端
│   ├── database/         # SQLite 数据库层（sql.js）
│   ├── middleware/       # JWT认证 + 权限中间件
│   ├── routes/           # API路由（认证/原型/预览）
│   ├── services/         # 业务逻辑层（数据库操作/GitHub同步/README提取）
│   └── server.js         # 服务入口
│
├── frontend/             # Vue 3 + Vite + Element Plus
│   ├── src/views/        # 页面（登录/首页/详情/用户管理）
│   ├── src/stores/       # Pinia 全局状态（认证）
│   ├── src/api/          # API封装（自动携带Token）
│   └── public/           # 静态资源（favicon.svg）
│
└── .agents/skills/fuxi-packager/  # 打包上传技能
    ├── SKILL.md          # 技能说明
    └── pack-and-upload.js # 一键打包上传脚本
```

## 权限矩阵

| 操作 | 管理员 | 上传者 | 查看者 |
|---|---|---|---|
| 查看原型/预览/源码/README | ✅ | ✅ | ✅ |
| 创建原型 | ✅ | ✅ | ❌ |
| 修改/删除自己的原型 | ✅ | ✅ | ❌ |
| 修改/删除他人的原型 | ✅ | ❌ | ❌ |
| 上传ZIP / 同步GitHub | ✅ | ✅（仅自己的） | ❌ |
| 管理分类/用户 | ✅ | ❌ | ❌ |

## 快速开始

### 1. 启动后端

```bash
cd prototype-manager/backend
npm install
npm start
# 默认端口 3001
```

首次启动会自动：
- 创建SQLite数据库（`data/app.db`）
- 创建默认管理员账号：`admin / admin123`
- 迁移旧JSON数据（如有）

### 2. 启动前端

```bash
cd prototype-manager/frontend
npm install
npm run dev
# 默认端口 3000
```

### 3. 访问系统

打开 http://localhost:3000，使用默认账号登录。

## 打包上传技能

内置 `fuxi-packager` 技能，支持一键打包项目并上传到伏羲元构：

```bash
# 命令行方式
node .agents/skills/fuxi-packager/pack-and-upload.js <项目路径> [原型名称] [描述]

# 示例
node .agents/skills/fuxi-packager/pack-and-upload.js AuthComponent "权限校验原型" "基于Vue3的权限管理组件"
```

脚本自动完成：构建检测 → 打包ZIP（含README） → 登录 → 创建/查找原型 → 上传 → 验证README提取。

## 数据库Schema

### 核心表

- `users` — 用户（id, username, password_hash, nickname, role）
- `categories` — 分类（id, name, description）
- `prototypes` — 原型（id, name, description, github_url, entry_file, category_id, created_by, sync_status）
- `prototype_tags` — 标签关联（prototype_id, tag_name）
- `prototype_versions` — 版本历史（P2预留）
- `readme_cache` — README缓存（prototype_id, content, file_path）

## 配置说明

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端服务端口 | `3001` |
| `JWT_SECRET` | JWT密钥（生产环境必须修改） | `fuxi-secret-key-change-in-production` |

## 注意事项

1. **JWT Secret**：生产部署时务必通过环境变量设置强密钥
2. **密码安全**：首次部署后建议立即修改默认管理员密码
3. **README提取**：上传/同步后自动扫描 `README.md` / `readme.md` / `docs/README.md`
4. **SQLite限制**：单进程安全，未来如需多进程部署建议迁移至PostgreSQL/MySQL

## 更新日志

| 版本 | 内容 |
|---|---|
| v1.0 | MVP：原型上传、GitHub同步、网页预览、源码查看 |
| v1.1 | P0+P1：用户认证、权限控制、SQLite持久化、分类/搜索、README设计文档、用户管理、品牌升级（伏羲元构） |
