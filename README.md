# 伏羲平台 — AI 原型管理与协作平台

伏羲是 AI 生成前端原型的托管、预览、版本和协作控制面，提供 Web 管理界面、后端 API 和面向 Agent 的 MCP Server。它不提供网页代码编辑器；修改由本地 IDE 或已接入的 AI Agent 完成，平台负责交付校验、候选预览、人工采用和版本保护。

## 当前状态（2026-08-27）

- 管理员使用统计 v1.0 已完成 16077 测试和 16088 正式环境 live verification；正式 release 为 `20260826-202055-cc32bd96`，GitHub `origin` 不作为生产来源。
- 当前工作区已快进到本地 `main` @ `6359908`；平台统计代码已进入上述生产 release，但 GitLab `main` 仍待外部推送确认，未把未确认的推送结果写成已完成。
- 16077 测试入口和 16088 生产入口当前健康检查、页面访问正常；健康检查只证明服务存活，业务验收以对应发布证据和用户确认结果为准。
- 当前主流程是“创建/修改原型 → 校验并交付 → 预览/回读”；项目协作使用“任务码 → 候选 ZIP → 独立预览 → 负责人采用/退回 → 基础版本 CAS”闭环。
- 阶段 18 MCP/Skill 延后更新已由用户确认验收；发布 Skill 工程化、GitLab Provider 真实验收和非阻塞技术债务暂放，统一记录在 docs/BACKLOG.md。

## 快速访问

| 服务 | 地址 / 入口 | 说明 |
|---|---|---|
| 本地前端 | <http://localhost:3000> | Vite 开发服务 |
| 本地后端 | <http://localhost:3001> | Express API；健康检查 `/api/health` |
| 测试环境 | <http://192.168.2.145:16077> | 隔离测试环境，发布前先验证 |
| 生产环境 | <http://192.168.2.145:16088> | 内网 Nginx 入口；发布需单独确认 |
| MCP Server | [`mcp-server/`](mcp-server/) | Agent 的 stdio 结构化操作入口 |

## 快速开始

要求 Node.js `>=18`。

### 启动后端

```bash
cd backend
npm install
npm start
```

首次启动会创建 SQLite 数据库和运行目录：`backend/data/app.db`、`backend/repos/`、`backend/uploads/`。开发数据库会按代码初始化本地账号；生产环境不要依赖内置凭证，首次登录后立即通过用户管理修改账号信息。密码、token 和密钥不写入 README、脚本或 Git。

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:3000>。前端开发服务默认将 API 请求发往 `http://localhost:3001`。

### 接入 MCP

本地直接启动：

```bash
cd mcp-server
npm start
```

推荐在平台登录后点击“接入平台 MCP”，把生成的提示词交给 AI 客户端。客户端按自身原生机制安装 Skill、配置 MCP，并使用一次性连接码完成首次接入；后续通过本地凭据文件刷新会话。

MCP 连接变量：

| 变量 | 用途 | 默认 / 说明 |
|---|---|---|
| `FUXI_API_URL` | 伏羲后端地址 | `http://localhost:3001` |
| `FUXI_CONNECT_CODE` | 首次接入的一次性连接码 | 推荐方式，不写入仓库 |
| `FUXI_CREDENTIALS_FILE` | 本地 refresh token 文件 | `~/.fuxi/mcp-credentials.json` |
| `FUXI_TOKEN` | 兼容旧流程的短期 token | 不自动刷新 |
| `FUXI_USERNAME` / `FUXI_PASSWORD` | 无连接码或 refresh token 时的兼容登录 | 仅放在当前进程环境 |
| `FUXI_INSTALL_ROOT` | MCP/Skill 本地运行时根目录 | `~/.fuxi/agent-runtime` |

完整工具清单、结果字段、错误码和接入方式见 [`mcp-server/README.md`](mcp-server/README.md)。当前源码提供 30 个 MCP 工具。

## 当前能力

### 原型管理

- 用户认证、平台管理员/编辑者/查看者权限、用户组和分类管理。
- 原型创建、ZIP 校验/上传/下载、版本历史、版本备注、回滚、回收站和归属转移。
- 原型预览、源码文件查看、README 提取与渲染、评论、图片附件、访问统计和免登录分享链接。
- `deliver_project` 是推荐的 Agent 交付入口：支持创建、更新和项目绑定更新，并带幂等键、版本/入口文件保护和强制回读。

### 项目与轻协作

- 项目门户、菜单配置、原型绑定、项目成员、签出/签入、快照和恢复。
- 项目成员可以发起一次性 AI 修改任务；Agent 下载当前源码并上传候选 ZIP。
- 候选先独立校验和预览，不改变当前原型；项目负责人或平台管理员显式采用后才生成正式版本。
- 采用时比较基础版本与当前版本；版本变化会拒绝旧候选并标记为过期，不自动合并。

### MCP / Skill 分发与更新

- 首页接入提示词包含 Skill 与 MCP 的受控下载地址，使用短期 token 和一次性连接码。
- MCP 会话支持 refresh token 轮换、撤销和版本心跳。
- 管理员可发布不可变 MCP/Skill release；稳定 launcher 在 AI 客户端下次启动前执行下载、摘要校验、Smoke、原子切换和失败回滚。
- 更新闭环代码、本地回归和 16077 真实验收已完成用户确认；深链接、静默更新、多平台守护进程等不属于当前 MVP。

## 明确不属于当前默认合同

- 不提供网页代码编辑器、实时共同编辑、CRDT 或通用任务看板。
- 轻协作 MVP 不依赖外部 Git 仓库、分支、MR、服务账号或源码自动合并。
- 自动构建、收藏、批量操作、Fork、文件级 Diff 和模板市场仍未实现；不要把旧规划文档中的目标当成已提供能力。

## 仓库结构

```text
FuxiPlatform/
├── backend/                         # Node.js + Express + sql.js
│   ├── database/                    # SQLite schema、迁移与串行写入
│   ├── routes/                      # auth/prototypes/projects/integrations 等 API
│   ├── services/                    # 权限、协作、交付、版本和发布服务
│   └── server.js                    # 后端入口
├── frontend/                        # Vue 3 + Vite + Element Plus + Pinia
├── mcp-server/                      # stdio MCP 源码、校验/打包和 launcher
├── docs/                            # 技术设计、迭代证据和当前 MVP 设计
└── ops/skills/fuxi-platform-release/ # 只读预检、构建、测试发布和回滚技能
```

运行数据、上传原型、备份和 release 产物默认不纳入 Git：`backend/data/`、`backend/repos/`、`backend/uploads/`、`.backup/`、`.release/`。

## 本地验证

```bash
cd backend
npm test

cd ../frontend
npm run build

cd ../mcp-server
npm run check
npm run test:integration
npm run test:remote-update
```

后端测试串行执行协作、项目绑定、直接修改、Agent 更新和公告回归；MCP 集成测试使用隔离临时后端，当前会核对 30 个工具及安全交付、连接码/刷新会话和项目协作路径。测试通过只代表本地代码证据，不替代真实 16077、16088 或 GitLab 验收。

## 配置与发布

后端常用变量：

| 变量 | 用途 |
|---|---|
| `PORT` | 后端端口，默认 `3001` |
| `FUXI_DB_PATH` | 可选 SQLite 文件路径，默认 `backend/data/app.db` |
| `JWT_SECRET` | JWT 签名密钥；生产必须通过安全环境注入强随机值 |
| `FUXI_SKILL_DIR` | 可分发的 `fuxi-prototype` Skill 目录，必须包含 `SKILL.md` |
| `FUXI_MCP_DIR` | 可分发的 MCP 目录，默认仓库内 `mcp-server/` |

发布规则：

1. 测试环境使用 `ops/skills/fuxi-platform-release/quick-deploy-test.ps1`，走 `-Lightweight` 并部署到隔离的 16077。
2. 生产环境只使用 `deploy-production-from-gitlab.ps1`，从两个仓库的 `main` 新鲜构建，完成完整 build/check/integration 门禁后才可切换 16088。
3. 生产上传、切换、回滚和备份清理都需要当前会话的明确确认；不要运行旧的 `update-intranet.sh`。

详见 [`ops/skills/fuxi-platform-release/SKILL.md`](ops/skills/fuxi-platform-release/SKILL.md)、[`OPERATION_MANUAL.md`](OPERATION_MANUAL.md)、[`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md) 和 [`docs/BACKLOG.md`](docs/BACKLOG.md)。

## 权威文档

- [`mcp-server/README.md`](mcp-server/README.md)：MCP 配置、30 个工具、统一结果和本地验证。
- [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)：平台边界、数据模型、交付与运行约束。
- [`docs/prototypes/lightweight-collaboration-mvp/DESIGN_SUMMARY.md`](docs/prototypes/lightweight-collaboration-mvp/DESIGN_SUMMARY.md)：当前轻协作 MVP 的产品决策和验收边界。
- [`docs/MCP_SKILLS_EVOLUTION_JOURNEY.md`](docs/MCP_SKILLS_EVOLUTION_JOURNEY.md)：带日期的阶段历史和证据；历史数字不自动代表当前运行态。
- [`ops/skills/fuxi-platform-release/PRODUCTION_RELEASE.md`](ops/skills/fuxi-platform-release/PRODUCTION_RELEASE.md)：测试/生产发布入口和确认门禁。
