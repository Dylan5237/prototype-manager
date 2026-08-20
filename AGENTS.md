# Fuxi Platform

伏羲原型管理平台：Web 界面 + 后端 API + MCP server，管理 AI 生成的 Vue/SkyUI 前端原型。

## 怎么跑起来

- 后端：`cd backend && npm install && npm start`（端口 3001，SQLite）
- 前端：`cd frontend && npm install && npm run dev`（端口 3000）
- MCP：`cd mcp-server && node src/server.js`（stdio，需 `FUXI_API_URL` + `FUXI_TOKEN`）
- 前端构建：`cd frontend && npm run build`（含 `vue-tsc --noEmit`）

## 技术栈

Vue 3.3 + Vite 5 + Element Plus 2.4（前端）；Node.js + Express 4 + sql.js 1.14（后端）；Node.js stdio MCP（mcp-server）。

## 目录与约定

- `backend/`：API 路由、服务层、SQLite 数据库；数据在 `backend/data/app.db` 和 `backend/repos/`。
- `frontend/`：Vue SPA，页面在 `src/views/`，API 封装在 `src/api/`。
- `mcp-server/`：面向 Agent 的 26 个结构化工具，源码在 `src/server.js`。
- `ops/skills/fuxi-platform-release/`：维护者发布技能，内置只读预检、不可变 release、备份和回滚脚本。
- `docs/`：体系持续事实入口（`TECHNICAL_DESIGN.md`、`MCP_SKILLS_EVOLUTION_JOURNEY.md`）。
- `.backup/` 和 `.release/`：本地备份和发布产物，Git 忽略。

## 当前状态和下一步

- 当前分支 `feature/project-collaboration`，生产已部署 release `20260811-210455-24264705`。
- 生产入口 `http://192.168.2.145:16088`（Nginx），52 个原型，已有 50 个零漂移。
- 原型规范和适配器在独立仓库 `D:\_projects\skills\prototype-manager-skills`。
- 平台代码、MCP 源码和维护者发布技能提交到本仓库；原型设计规范提交到技能包仓库。
- 不写凭证、密码或长期 token 进仓库或文档。
- 当前主线：无 Git 轻协作 MVP（任务交接、候选预览、人工采用、基础版本 CAS），先验收并发布 `16077`；生产发布需另行确认。

## 测试环境部署约定

- `16077` 后续默认走轻量部署：`build-release.ps1 -Lightweight` 仍执行前端构建、不可变归档、SHA-256、远端备份、Nginx/健康检查；跳过每次全量 MCP 集成回归，由用户人工测试。
- 只有准备发布 `16088` 时才使用完整构建、MCP 校验/集成、生产基线和发布验收门禁。
