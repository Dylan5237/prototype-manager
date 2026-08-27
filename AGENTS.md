# Fuxi Platform

伏羲原型管理平台：Web 界面 + 后端 API + MCP server，管理 AI 生成的前端原型及其 runtime/profile 交付。

## 怎么跑起来

- 后端：`cd backend && npm install && npm start`（端口 3001，SQLite）
- 前端：`cd frontend && npm install && npm run dev`（端口 3000）
- MCP：`cd mcp-server && node src/server.js`（stdio，需 `FUXI_API_URL` + `FUXI_TOKEN`）
- 前端构建：`cd frontend && npm run build`（Vite production build；当前 package script 不含 `vue-tsc`）

## 技术栈

Vue 3.3 + Vite 5 + Element Plus 2.4（前端）；Node.js + Express 4 + sql.js 1.14（后端）；Node.js stdio MCP（mcp-server）。

## 目录与约定

- `backend/`：API 路由、服务层、SQLite 数据库；数据在 `backend/data/app.db` 和 `backend/repos/`。
- `frontend/`：Vue SPA，页面在 `src/views/`，API 封装在 `src/api/`。
- `mcp-server/`：面向 Agent 的 30 个结构化工具，源码在 `src/server.js`。
- `ops/skills/fuxi-platform-release/`：维护者发布技能，内置只读预检、不可变 release、备份和回滚脚本。
- `docs/`：体系持续事实入口（`TECHNICAL_DESIGN.md`、`MCP_SKILLS_EVOLUTION_JOURNEY.md`）。
- `.backup/` 和 `.release/`：本地备份和发布产物，Git 忽略。

## 当前状态和下一步

- 管理员使用统计 v1.0 已完成正式发布；当前生产 release 为 `20260826-202055-cc32bd96`，GitHub `origin` 不作为生产来源。
- 当前工作区已快进到本地 `main` @ `6359908`；统计代码已在生产，平台变更尚未推送到 GitLab `main`，推送前仍需当前会话单独确认。
- 生产入口 `http://192.168.2.145:16088`（Nginx）；16077 测试入口与 16088 生产入口当前健康和页面可达，完整业务验收以发布证据和用户确认记录为准。
- 原型规范和适配器在独立仓库 `D:\_projects\skills\prototype-manager-skills`。
- 平台代码、MCP 源码和维护者发布技能提交到本仓库；原型设计规范提交到技能包仓库。
- 不写凭证、密码或长期 token 进仓库或文档。
- 当前主线：无 Git 轻协作 MVP（任务交接、候选预览、人工采用、基础版本 CAS）已完成代码和验收；Git provider 真实环境验收暂放，详见 `docs/BACKLOG.md`。
- 阶段 18 MCP/Skill 延后更新已由用户确认验收；后续暂放事项统一维护在 `docs/BACKLOG.md`。

## 测试环境部署约定

- `16077` 后续默认走轻量部署：`build-release.ps1 -Lightweight` 仍执行前端构建、不可变归档、SHA-256、远端备份、Nginx/健康检查；跳过每次全量 MCP 集成回归，由用户人工测试。
- 只有准备发布 `16088` 时才使用完整构建、MCP 校验/集成、生产基线和发布验收门禁。
