# 伏羲平台 — AI 原型管理平台

> **AI 原型管理平台**：专门管理AI以前端项目形式生成的原型，支持产品经理上传原型项目并开放给公司团队查看、协作。

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
| **原型管理** | 创建原型、删除；原型文件统一由 `.agents/skills/fuxi-packager` Skill 打包上传 |
| **ZIP 下载** | 原型详情页一键下载当前版本源码 ZIP |
| **分类系统** | 支持按业务线/产品线分类，首页可筛选 |
| **搜索功能** | 按原型名称、描述实时搜索 |
| **网页预览** | 自动注入`<base>`标签+路径转换，在新页签中完整预览可交互网页 |
| **源码查看** | 项目文件树浏览，点击文件查看源码 |
| **设计文档** | 自动提取项目中的README.md，在"设计文档"Tab中渲染展示 |
| **用户管理** | 管理员可创建用户、分配角色；支持用户组批量管理 |

### P2 — 协作深化（已实现）

| 功能 | 说明 |
|---|---|
| **协作成员** | "协作"取代"分享"，被加入协作者的用户对该原型拥有读写权限 |
| **用户组批量协作** | 管理员可创建用户组，将原型批量协作给整组 |
| **评论反馈** | 已登录用户可在原型下留言，支持 Ctrl+V 粘贴图片，支持删除自己的评论 |
| **版本历史** | 每次 Skill 上传自动生成新版本，支持回滚和删除，保留最近10个版本 |
| **访问统计** | 记录浏览次数，展示总次数/近7天/近30天趋势 |
| **免登录分享链接** | `/prototype/:id` 链接复制给他人，未登录自动以访客身份进入 |

### P3 — 进阶优化（规划中）

| 功能 | 说明 |
|---|---|
| **自动构建** | 上传源码ZIP后自动执行`npm install && npm run build` |
| **收藏关注** | 用户标记常用原型，个人工作台快捷入口 |
| **批量操作** | 批量上传、批量分类、批量删除 |

## 技术架构

```
伏羲平台/
├── backend/              # Node.js + Express 后端
│   ├── database/         # SQLite 数据库层（sql.js）
│   ├── middleware/       # JWT认证 + 权限中间件
│   ├── routes/           # API路由（认证/原型/预览/评论/统计）
│   ├── services/         # 业务逻辑层（数据库操作/GitHub同步/README提取/评论/统计）
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

| 操作 | 管理员 | 上传者 | 协作者 | 查看者 |
|---|---|---|---|---|
| 查看原型/预览/源码/README/下载 ZIP | ✅ | ✅ | ✅ | ✅ |
| 创建原型 | ✅ | ✅ | ❌ | ❌ |
| 修改/删除自己的原型 | ✅ | ✅ | ❌ | ❌ |
| 修改/删除他人的原型 | ✅ | ❌ | ❌ | ❌ |
| 管理被协作的原型（编辑/上传/版本） | ✅ | ✅（仅限创建者） | ✅ | ❌ |
| 管理协作者/用户组 | ✅ | ✅（仅限创建者） | ❌ | ❌ |
| 管理分类/用户/用户组 | ✅ | ❌ | ❌ | ❌ |

> 注："协作者"不是全局角色，而是由原型创建者或管理员通过"协作成员"添加到单个原型的用户。

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



## 数据库Schema

### 核心表

- `users` — 用户（id, username, password_hash, nickname, role）
- `categories` — 分类（id, name, description）
- `prototypes` — 原型（id, name, description, github_url, entry_file, category_id, created_by, sync_status, visit_count）
- `prototype_tags` — 标签关联（prototype_id, tag_name）
- `prototype_versions` — 版本历史（id, prototype_id, version_number, version_label, file_path, entry_file, note, created_at）
- `prototype_shares` — 协作者关联（prototype_id, user_id, created_at）
- `user_groups` — 用户组（id, name, description, created_at）
- `user_group_members` — 用户组成员（group_id, user_id, created_at）
- `readme_cache` — README缓存（prototype_id, content, file_path）
- `comments` — 评论反馈（id, prototype_id, user_id, content, images, parent_id, created_at）
- `comment_images` — 评论图片（id, comment_id, filename, original_name, created_at）
- `prototype_visits` — 访问记录（id, prototype_id, visitor_ip, user_id, visited_at）

## 配置说明

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 后端服务端口 | `3001` |
| `JWT_SECRET` | JWT密钥（生产环境必须修改） | `fuxi-secret-key-change-in-production` |

## 注意事项

1. **JWT Secret**：生产部署时务必通过环境变量设置强密钥
2. **密码安全**：首次部署后建议立即修改默认管理员密码
3. **README提取**：Skill 上传后自动扫描 `README.md` / `readme.md` / `docs/README.md`
4. **SQLite限制**：单进程安全，未来如需多进程部署建议迁移至PostgreSQL/MySQL

## 更新日志

| 版本 | 内容 |
|---|---|
| v1.0 | MVP：原型上传、GitHub同步、网页预览、源码查看 |
| v1.1 | P0+P1：用户认证、权限控制、SQLite持久化、分类/搜索、README设计文档、用户管理、品牌升级（伏羲平台） |
| v1.2 | P2：评论反馈（支持图片）、版本历史（自动备份/回滚）、访问统计 |
| v1.3 | 协作权限重构：前端上传入口统一为 Skill、新增 ZIP 下载、"分享"改为"协作"（协作者可读写）、用户组批量协作、免登录分享链接 |
