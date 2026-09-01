# Fuxi Platform

伏羲原型管理平台：Web 界面 + 后端 API + MCP server，管理 AI 生成的前端原型及其 runtime/profile 交付。

## 思考风格

- 不默认用户的判断正确；结合当前代码、测试、运行态和授权边界客观判断。
- 区分代码完成、提交、合并、推送、部署和 live verification，不用其中一个状态替代另一个。

## Git 操作规范

- 仓库 `zoesoftgitlab` 是伏羲平台 GitLab 远端；`origin` 是 GitHub，不作为伏羲生产源码来源。
- 平台当前集成和生产源码分支是 `main`；开发分支使用 `codex/` 前缀。
- 本项目不使用本地 `master` 或 GitLab `develop` 作为平台发布目标；本地 `master` 当前跟踪旧的 GitHub 分支，GitLab `develop` 不是已配置的远端分支。
- 平台变更应先在本地合并或快进到 `main`，再按当前会话确认后推送 `zoesoftgitlab/main`；禁止推送 GitHub `origin` 作为生产同步。
- 生产发布只能从 GitLab `main` 新鲜构建；测试环境可以使用已确认的本地提交，但不得将测试分支直接当作正式源码来源。
- 提交遵循 Conventional Commits：`type(scope): 中文标题`；body 写现象/根因 -> 改法；footer 使用 `Co-Authored-By: Codex <noreply@openai.com>`。
- 一个独立任务一个 commit；commit 前按改动范围执行必要的 `npm test`、`npm run build`、MCP 检查或文档检查。
- 不执行 force push，不用 reset/clean/checkout 覆盖用户改动；不把凭证、密码或长期 token 写入仓库。

## 伏羲平台与配套 Skill 的双边分析规则

- 配套 Skill 独立仓库路径：`D:\_projects\skills\prototype-manager-skills`；Skill 入口为 `fuxi-prototype`，当前分支为 `main`。
- 任何需求先同时分析 FuxiPlatform 与配套 Skill 两个仓库的影响，不能只看平台或只看 Skill。
- 重点检查双方的 API/工具契约、入口目录、分发包、版本/hash、运行时配置和验收链路；判断需求是否需要一边改、两边改或仅记录不改。
- 涉及平台接口、MCP 工具、Skill 入口、ZIP 分发、运行时 profile 或安装流程时，默认按跨仓库变更评估；不能因改动集中在一边就跳过另一边分析。
- 两边都改时分别提交、分别验证，并在发布记录中绑定 platform commit 与 Skill commit；只改一边时必须记录另一边无需修改的依据。

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
- `docs/`：体系持续事实入口（`TECHNICAL_DESIGN.md`、`MCP_SKILLS_EVOLUTION_JOURNEY.md`、`BACKLOG.md`）。
- `.backup/` 和 `.release/`：本地备份和发布产物，Git 忽略。

## 当前状态和下一步

- 管理员使用统计 v1.0 已完成正式发布；2026-08-29 只读探针确认当前生产 release 为 `20260828-185117-c1edcab0`，health `200`、bootstrap 未授权 `401`，GitHub `origin` 不作为生产来源。
- 阶段 20 已快进到本地 `main` 并完成 16077 release `20260830-092500-adf7ea7f` 验收；阶段 21 安全同步已完成，阶段 22 项目模块首批增量已部署测试环境，尚未部署 16088。
- 生产入口 `http://192.168.2.145:16088`（Nginx）仍运行 release `20260828-185117-c1edcab0`；16077 当前测试 release 为 `20260901-182503-da787bef`，健康 200、bootstrap 未授权 401、认证 API 回读和 10 次只读基线通过。
- 原型规范和适配器在独立仓库 `D:\_projects\skills\prototype-manager-skills`。
- 平台代码、MCP 源码和维护者发布技能提交到本仓库；原型设计规范提交到技能包仓库。
- 不写凭证、密码或长期 token 进仓库或文档。
- 当前主线：无 Git 轻协作 MVP（任务交接、候选预览、人工采用、基础版本 CAS）已完成代码和验收；GitLab Provider 真实环境验收已废弃，默认继续使用无 Git 轻协作，详见 `docs/BACKLOG.md`。
- 阶段 18 MCP/Skill 延后更新已由用户确认验收；后续暂放事项统一维护在 `docs/BACKLOG.md`。
- 阶段 20 已完成；阶段 21 已完成只读仓库治理，BL-003/004 已关闭，BL-006 已完成只读评估但实际处置仍待人工决策。BL-007 主目标已完成平台实现、本地/API 回归和 16077 跨用户真实复核；阶段 22 已确认固定打开第一个已绑定菜单，并完成项目列表分页/筛选、绑定选择器服务端搜索分页和 MCP 签出门禁修复；真实浏览器验收、组件拆分和端到端性能样本仍待完成，详见 `docs/NEXT_ITERATION_PLAN.md`、`docs/PHASE22_PROJECT_MODULE_IA.md`、`docs/PHASE22_PROJECT_MODULE_EVIDENCE.md` 和 `docs/prototypes/project-module-2-0/index.html`。
- 暂放、待决和后续技术债务不得在本文件重复展开，以 `docs/BACKLOG.md` 为唯一 backlog 入口。

## 测试环境部署约定

- `16077` 后续默认走轻量部署：`build-release.ps1 -Lightweight` 仍执行前端构建、不可变归档、SHA-256、远端备份、Nginx/健康检查；跳过每次全量 MCP 集成回归，由用户人工测试。
- 只有准备发布 `16088` 时才使用完整构建、MCP 校验/集成、生产基线和发布验收门禁。
