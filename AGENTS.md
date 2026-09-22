# Fuxi Platform

伏羲原型管理平台：Web 界面 + 后端 API + MCP server，管理 AI 生成的前端原型及其 runtime/profile 交付。

## 思考风格

- 不默认用户的判断正确；结合当前代码、测试、运行态和授权边界客观判断。
- 区分代码完成、提交、合并、推送、部署和 live verification，不用其中一个状态替代另一个。

## Git 操作规范

- **Write authority（写权威）** = GitHub `origin`（本仓 Issues / PRs / 合入）。Agent 落地与耐久决策只认这里。`origin` 是唯一写权威，不是镜像仓。
- **`zoesoftgitlab`**（仅当本机已配置该 remote 名时）= 可选同历史 **投影**，并且/或者当前 `deploy-*-from-gitlab.ps1` / 16077 / 16088 **读取** 的 deploy/manifest tip 远端。它 **不是** write authority，**不是** 生产源码 SoT，**不是** 代码权威的唯一事实源。本检出当前只登记了 `origin`；不要发明未出现在 `git remote -v` 里的 remote。
- 平台分支分层保持 `feat/*` → 评审合入 `develop`（测试集成）→ 独立确认后合入 `main`（生产发布枝）；本地与各远端尽量同名。**落地权威在 GitHub**：先在 `origin` 合入，再把同历史 **快进（FF）投影** 到已配置的 `zoesoftgitlab` 对应枝。部署脚本若仍从 GitLab 新鲜克隆，必须先确认投影 tip 已 FF 自权威 tip，才能宣称可部署。
- **双 tip（必须显式区分，禁止偷换）：**

  | Tip | 含义 | 禁止说法 |
  | --- | --- | --- |
  | **Write authority tip** | GitHub `origin` 默认枝（或 Command Center 点名枝）在 PR merge 后的 tip。Issues / PRs / Agent 合入只认此 tip。 | 把 GitLab / 投影 / 发布 SHA 写成写权威 |
  | **Deploy / manifest tip** | `deploy-test-from-gitlab.ps1` / `deploy-production-from-gitlab.ps1` 当前新鲜克隆的提交（今日脚本消费 GitLab `develop` → 16077、GitLab `main` → 16088）。可滞后；宣称可部署前须已从权威 tip FF。 | 把它写成 write SoT、生产源码 SoT 或唯一事实源 |

- 反置合同是反模式：禁止把 GitLab 写成唯一生产/写权威，禁止把 GitHub 降为「仅镜像」。部署脚本今天 **消费** GitLab tip 作为 deploy floor；该 tip 并非 write SoT。
- 投影 tip 的 SHA **可以** 与权威 tip 不同（例如多一串 projection merge）；这是预期形态，不是要把 GitHub tip force 盖成 GitLab merge tip。禁止 force push。
- 提交遵循 Conventional Commits：`type(scope): 中文标题`；body 写现象/根因 -> 改法；footer 使用 `Co-Authored-By: Codex <noreply@openai.com>`。
- 一个独立任务一个 commit；commit 前按改动范围执行必要的 `npm test`、`npm run build`、MCP 检查或文档检查。
- 不用 reset/clean/checkout 覆盖用户改动；不把凭证、密码或长期 token 写入仓库。

## 伏羲平台与配套 Skill 的双边分析规则

- 配套 Skill 独立仓库路径：`D:\_projects\skills\prototype-manager-skills`；Skill 入口为 `fuxi-prototype`。Skill 的 16077/16088 脚本今日仍新鲜克隆 GitLab `develop` / `main` 作为 **deploy/manifest tip**（可滞后，须 FF 自该 Skill 仓的写权威 tip）；这不是把 Skill GitLab 写成写权威。Skill 仓自身的 AGENTS 远程合同不在本文件改写范围内。
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
- `mcp-server/`：面向 Agent 的 MCP 工具（本分支源码含 Task v2；生产切流未宣称完成），源码在 `src/server.js`。
- `ops/skills/fuxi-platform-release/`：维护者发布技能，内置只读预检、不可变 release、备份和回滚脚本。
- `docs/`：体系持续事实入口（`TECHNICAL_DESIGN.md`、`MCP_SKILLS_EVOLUTION_JOURNEY.md`、`BACKLOG.md`）。
- `.backup/` 和 `.release/`：本地备份和发布产物，Git 忽略。

## 当前状态和下一步

- 管理员使用统计 v1.0 已完成正式发布；2026-08-29 只读探针确认当前生产 release 为 `20260828-185117-c1edcab0`，health `200`、bootstrap 未授权 `401`。该身份锁的是当时 16088 的 **deploy/manifest tip**（脚本消费的 GitLab `main` 克隆），write authority 仍为 GitHub `origin`。
- 阶段 20 已快进到本地 `main` 并完成 16077 release `20260830-092500-adf7ea7f` 验收；阶段 21 安全同步已完成，阶段 22 项目模块首批增量已部署测试环境，尚未部署 16088。
- 生产入口 `http://192.168.2.145:16088`（Nginx）仍运行 release `20260828-185117-c1edcab0`；16077 当前测试 release 为 `20260902-095755-97fc9e9a`，健康 200、bootstrap 未授权 401、认证 API 回读、项目高保真列表/三栏工作台和预览 iframe 浏览器复测通过。
- 原型规范和适配器在独立仓库 `D:\_projects\skills\prototype-manager-skills`。
- 平台代码、MCP 源码和维护者发布技能提交到本仓库；原型设计规范提交到技能包仓库。
- 不写凭证、密码或长期 token 进仓库或文档。
- 当前主线：无 Git 轻协作 MVP（任务交接、候选预览、人工采用、基础版本 CAS）已完成代码和验收；GitLab Provider 真实环境验收已废弃，默认继续使用无 Git 轻协作，详见 `docs/BACKLOG.md`。
- 阶段 18 MCP/Skill 延后更新已由用户确认验收；后续暂放事项统一维护在 `docs/BACKLOG.md`。
- 阶段 20 已完成；阶段 21 已完成只读仓库治理，BL-003/004 已关闭，BL-006 已完成只读评估但实际处置仍待人工决策。BL-007 主目标已完成平台实现、本地/API 回归和 16077 跨用户真实复核；阶段 22 已确认固定打开第一个已绑定菜单，并完成高保真项目列表/三栏工作台接入、项目列表分页/筛选、绑定选择器服务端搜索分页、MCP 签出门禁、预览 ResizeObserver 误报修复、`ProjectWorkspace` 主内容拆分和任务/成员/快照权限显示对齐；目标项目的真实浏览器入口/iframe 复测已通过，完整角色路径、任务/成员/快照职责拆分和端到端性能样本仍待完成。阶段 24 已增加本地写入型 multipart 预备基线；详见 `docs/NEXT_ITERATION_PLAN.md`、`docs/PHASE22_PROJECT_MODULE_IA.md`、`docs/PHASE22_PROJECT_MODULE_EVIDENCE.md` 和 `docs/PHASE24_LOCAL_UPLOAD_BASELINE.md`。
- 暂放、待决和后续技术债务不得在本文件重复展开，以 `docs/BACKLOG.md` 为唯一 backlog 入口。

## 测试环境部署约定

- 用户已于 2026-09-02 明确授权后续 16077 测试环境部署无需逐次确认；执行仍必须使用本 Skill 的安全脚本和 `DEPLOY_FUXI_TEST` 门禁参数。该授权不包含 16088 生产发布、远程推送、删除或回滚。
- `16077` 后续统一运行 `deploy-test-from-gitlab.ps1`（或其兼容包装 `quick-deploy-test.ps1`）：新鲜克隆平台与 Skill 的 GitLab `develop`（**deploy/manifest tip**，不是 write SoT），再执行前端构建、不可变归档、SHA-256、远端备份、Nginx/健康检查；禁止直接打包任意 worktree。宣称测发前，该 GitLab `develop` 须已 FF 自 GitHub 权威 tip。
- 只有准备发布 `16088` 时才使用完整构建、MCP 校验/集成、生产基线和发布验收门禁。`deploy-production-from-gitlab.ps1` 今日仍新鲜克隆 GitLab `main` 作为生产 **deploy/manifest tip**（同样不是 write SoT）；切换前须已 FF 自 `origin/main`。
