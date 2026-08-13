# 伏羲原型体系技术方案设计文档

> 版本: 1.0
> 更新日期: 2026-08-12
> 文档定位: 伏羲原型体系的完整技术方案设计，包含但不限于整体架构、环境信息、使用手册、详细设计说明和迭代计划
> 配套文档: [MCP_SKILLS_EVOLUTION_JOURNEY.md](MCP_SKILLS_EVOLUTION_JOURNEY.md) 记录迭代旅程和阶段验证证据

## 文档维护约定

- 本文档同时记录"当前可用事实"和"后续迭代计划"。已实现能力必须有代码、测试或真实环境证据；只有设计结论时标记为 `todo` 或 `in-progress`。
- 每完成一个阶段，同步更新状态、验收证据、遗留和下一阶段入口。
- 环境地址可以记录；账号、密码、长期 token、私密密钥和本机凭证文件不得写入本文档或 Git。
- 两个项目各自维护独立 Git 仓库：平台代码在 `FuxiPlatform`，原型规范和适配器在 `prototype-manager-skills`。

## 目录

1. 整体架构
2. 环境信息
3. 使用手册
4. 详细设计说明
5. 数据安全与兼容策略
6. 迭代计划
7. 当前工作区事实

---

## 1. 整体架构

### 1.1 体系定位

伏羲原型体系把"原型生成 -> 交付 -> 管理 -> 预览"从"本地上传 + 手动管理"重构为 AI 原生体系：

- **FuxiPlatform**：平台本体 + MCP 工具层，承接登录认证、原型管理、上传、版本、预览、项目协作等结构化操作。
- **prototype-manager-skills**：只保留可替换原型设计规范和固定伏羲适配规则，不再保存平台登录、上传、凭证或打包脚本。
- **Agent 工作流**：读取一个原型规范 + 伏羲适配器生成原型，再通过伏羲 MCP 上传和管理。

### 1.2 项目边界

两个项目保持独立，各自维护独立 Git 仓库和 commit 节奏：

| 项目 | 路径 | 职责 | 禁止承担 |
|---|---|---|---|
| 伏羲平台 | `D:\_projects\platform\FuxiPlatform` | Web 平台、后端 API、MCP server、生产兼容和平台接入体验 | 原型视觉规范、组件设计知识 |
| 原型技能包 | `D:\_projects\skills\prototype-manager-skills` | 单一入口 Skill、可替换原型规范、SkyUI 查询能力、固定伏羲适配契约 | 平台登录脚本、本地凭证、直接实现平台 API |

### 1.3 架构总览

```text
用户 / AI 助手
    |
    | 只调用一个用户入口 Skill
    v
fuxi-skyui-prototype
    |-- 原型设计规范：视觉、布局、交互、内容和页面结构
    |-- SkyUI 知识：通过确定性 CLI 查询真实组件示例/API/图标
    |-- 伏羲交付契约：入口、相对资源、README、校验和打包
    `-- MCP 编排：创建/更新/上传/回读/预览和项目协作
                         |
                         v
              Fuxi Platform MCP Server
                         |
                         v
                 Fuxi Backend API
                         |
               SQLite + prototype repos
                         |
                         v
              Fuxi Web 管理与预览界面
```

### 1.4 单一入口与内部模块化

"用户只使用一个 Skill"不等于把所有实现写进一个文件。目标分发单元为：

```text
fuxi-skyui-prototype/
|-- SKILL.md                       <- 用户和 AI 助手看到的唯一入口
|-- agents/openai.yaml             <- 客户端识别元数据
|-- references/                   <- 渐进式披露参考文档
|   |-- workflow-contract.md       <- 模式、状态机、工具序列和完成证据
|   |-- prototype-spec.md          <- 设计语言（天宫规范）
|   |-- skyui-runtime.md           <- SkyUI 组件查询和运行时约定
|   `-- fuxi-adapter.md            <- 打包、入口、ZIP 约束
|-- scripts/sky-ui-docs/          <- SkyUI 真实文档查询工具
|   |-- run.mjs
|   |-- cli.mjs
|   `-- cli.test.mjs
`-- assets/vue3-skyui-starter/    <- 新项目脚手架模板
```

- `SKILL.md` 编排需求分析、生成、构建、校验和 MCP 操作。
- `prototype-spec` 负责设计语言，可替换；首先完整实现以天宫设计规则为基础。
- `skyui-runtime` 把组件语义映射到 Vue 3 + SkyUI，并通过真实文档查询避免臆测 API。
- `fuxi-adapter` 是固定平台契约，不随设计规范替换。
- MCP 是外部能力。Skill 只能在 AI 助手已接入 MCP 后调用其工具，不能绕过 MCP Host 的授权和配置。

### 1.5 三维解耦模型

长期目标是把设计规范、组件实现和平台交付拆成三个正交维度：

| 维度 | 示例 | 变化影响 |
|---|---|---|
| 设计规范 | 天宫、其他 B 端规范 | 视觉、布局、交互和内容 |
| 运行时组件实现 | Vue 3 + SkyUI、Vue 3 + Element Plus、static HTML | 工程结构和组件代码 |
| 平台适配 | 伏羲适配器 | 入口、资源、README、ZIP 和上传契约 |

第一阶段不追求任意组合。先交付经过验证的 `天宫 + Vue 3 + SkyUI + 伏羲`，再证明同一设计规范可以替换组件实现。

### 1.6 可替换规范模型

```text
prototype-specs/
|-- tiangong/        <- 可替换的设计规范之一
|   |-- SKILL.md     <- 声明 requires: [fuxi-adapter]
|   `-- references/  <- 色板、布局、交互、标注
`-- static-html/     <- 另一个设计规范
fuxi-adapter/        <- 固定的平台契约，所有规范都 requires 它
fuxi-skyui-prototype/<- 单一入口，内部编排以上各层
```

每个 `prototype-specs/<name>/SKILL.md` 用 front-matter 声明 `requires: [fuxi-adapter]`。设计规范只能定义视觉、布局、交互和内容，不能重复定义入口文件、打包规则或 ZIP 排除项。

### 1.7 MCP 与 Skill 分发链路

用户在伏羲首页点「接入平台 MCP」按钮后，平台生成的提示词同时包含 Skill ZIP 和 MCP ZIP 两个下载地址。AI 助手一次拉取两个包，自动安装到原生目录并配置 stdio 连接，最后调 `check_connection` 验证连通。

```text
伏羲首页
  |-- [接入平台 MCP] 按钮
  v
/api/integrations/agent-bootstrap  (requireAuth)
  |-- 生成短期 token (1h)
  |-- 组装提示词 (含 Skill + MCP 下载地址)
  `-- 返回 { prompt, token, expiresAt, skillUrl, mcpUrl }
  v
AI 助手按提示词执行:
  1. 识别客户端原生 Skill 目录和 MCP 配置机制
  2. 下载 Skill ZIP -> 安装到 Skill 目录 (验证 SKILL.md 可发现)
  3. 下载 MCP ZIP -> 解压到本地工具目录，配置 stdio
  4. 调用 check_connection 验证连通
  5. 确认 fuxi-skyui-prototype 可调用
```

分发过滤规则（`EXCLUDED_NAMES`）：`.git`、`.npmrc`、`.credentials.json`、`node_modules`、`dist`、`build`、`coverage`、`tests`、`*.zip`、`*.log`。

---

## 2. 环境信息

### 2.1 开发环境

| 项目 | 技术与要求 | 默认入口 |
|---|---|---|
| 前端 | Vue `3.3.11`、Vite `5.0.8`、Element Plus `2.4.4`、Node.js `>=18` | `frontend/`，开发端口 `3000` |
| 后端 | Node.js、Express `4.18.2`、sql.js `1.14.1`、Node.js `>=18` | `backend/server.js`，默认端口 `3001` |
| MCP | Node.js `>=18`、stdio、无第三方运行依赖 | `mcp-server/src/server.js` |
| 技能包 | Markdown Skill、references、Node.js CLI | `prototype-manager-skills/` |
| SkyUI 文档 Skill | `sky-ui-docs`，要求 Vue `>=3.2.0`、`@sky/sky-ui >=2.1.145` | 内部 GitLab 仓库 |

### 2.2 MCP 配置

| 环境变量 | 用途 |
|---|---|
| `FUXI_API_URL` | 伏羲后端地址，默认 `http://localhost:3001` |
| `FUXI_TOKEN` | 平台签发的短期 MCP token，优先使用 |
| `FUXI_USERNAME` / `FUXI_PASSWORD` | 无 token 时的兼容登录方式，不应写入仓库 |

生产平台入口为 `http://192.168.2.145:16088`（Nginx，2026-08-13 起）。生产环境中的已有原型是兼容基线；允许创建隔离命名的新验收原型，不允许把已有原型当测试目标。

### 2.3 Skill 与 MCP 分发配置

| 环境变量 | 用途 | 回退 |
|---|---|---|
| `FUXI_SKILL_DIR` | 可分发的 `fuxi-skyui-prototype` Skill 目录，必须包含 `SKILL.md` | 无，未配置时返回 `503 SKILL_DISTRIBUTION_UNAVAILABLE` |
| `FUXI_MCP_DIR` | 可分发的伏羲 MCP 目录，必须包含 `src/server.js` | 仓库内 `mcp-server` |

MCP 是天然内置的（源码在平台仓库 `mcp-server/`）；Skill 通过 `FUXI_SKILL_DIR` 指向技能包仓库目录。生产环境必须配置 `FUXI_SKILL_DIR`，否则分发接口返回 503。

### 2.4 生产环境拓扑

| 项 | 值 |
|---|---|
| Host | `192.168.2.145` |
| SSH user | `root`；密码须来自 `FUXI_SSH_PASSWORD` |
| Pinned ED25519 指纹 | `ssh-ed25519 255 d0:c5:d3:c9:5f:a9:3c:b9:17:3b:6f:5c:e7:1d:61:d1` |
| Legacy 项目路径 | `/zoesoft/fuxi/fuxi-platform` |
| Release root | `/zoesoft/fuxi/releases` |
| Shared data root | `/zoesoft/fuxi/shared` |
| Backup root | `/zoesoft/fuxi/backups` |
| PM2 app | `fuxi-backend` |
| PM2 可执行 | `/root/.npm-global/bin/pm2`；非登录 SSH 不在 `PATH` 中 |
| Backend | Node.js `20.20.2`，端口 `3001` |
| Frontend | Nginx 端口 `16088`（原 80 被 k3s Traefik CNI 占用），root 在 legacy 项目路径下 |
| Nginx config | `/etc/nginx/sites-available/fuxi` |
| Git 分支 | `feature/project-collaboration` |

持久化路径（生产数据当前在 legacy 项目树下）：

- `backend/data/app.db`
- `backend/repos/`
- `backend/uploads/`
- `backend/.env`

### 2.5 SkyUI 依赖策略

SkyUI 仅能从内部 npm registry 获取。registry 可用于开发和构建，最终上传产物不依赖该地址，也不得打包 `.npmrc`、`node_modules/` 或其他开发机状态。

### 2.6 已知风险

- 非阻断日志告警：生产启动时 `backend/services/proxy.js` 在 Linux 尝试 Windows `reg query`，产生 `/bin/sh: reg: not found` 后正确降级为直连；error 日志最后修改于启动后的 `2026-08-11 21:07:01`，后续验收期间无新增。后续应按 `process.platform === 'win32'` 屏蔽该探测，避免污染 PM2 error log。
- API 备份不能替代服务器文件级备份；生产应定期一致性备份 `backend/data/app.db` 与 `backend/repos/`，并演练恢复。
- SkyUI 为私有依赖，构建机必须能够访问技能中声明的私有 registry；公开 npm 镜像不提供该包。
- 分享短链接访客预览可能返回 `401`，不能以创建者 token 可预览替代访客链接验收。

---

## 3. 使用手册

### 3.1 首次接入

1. 用户登录伏羲平台，在首页点击「接入平台 MCP」。
2. 平台生成短期 token（有效期 1 小时），并复制包含 MCP 配置和连接验证要求的提示词。
3. 用户把提示词发送给其 AI 助手（如 Kimi、Codex、WorkBuddy 等），由助手安装单一入口 Skill、配置 MCP Host 并调用 `check_connection`。
4. token 过期后回平台重新生成，不在项目目录保存凭证。

不同 AI 客户端的自动安装能力不完全一致。最终提示词必须允许助手先识别自身 MCP/Skill 配置机制；需要文件写入或外部连接授权时，必须向用户请求客户端原生授权。

### 3.2 创建新原型

用户表达示例：

```text
使用 fuxi-skyui-prototype，根据这份需求生成 SkyUI 原型，创建为新的伏羲原型并返回预览地址。
```

标准流程：

1. Skill 分析需求、页面、交互和验收范围。
2. 对使用到的 SkyUI 组件执行真实文档、API、示例和图标查询。
3. 生成 Vue 3 + SkyUI 原型，设置 Vite `base: './'`。
4. 构建后使用 `validate_project`、`pack_project` 和 `validate_zip` 校验交付物。
5. MCP 调用 `deliver_project`（mode `create`）创建新记录并上传。
6. 调用 `get_prototype`、`get_readme` 和 `get_preview_url` 回读校验。
7. 向用户报告原型 ID、版本、README 状态和预览地址；任一步失败均不得声称上传成功。

### 3.3 更新已有原型

1. 必须由用户提供明确原型 ID，或通过列表查询得到唯一候选后让用户确认。
2. 更新前调用 `get_prototype` 回读目标和当前版本；禁止按模糊名称直接覆盖。
3. 本地构建与校验通过后，向明确的 `prototypeId` 调用 `deliver_project`（mode `update`）。
4. 上传后再次回读，确认 `affectedScope: target-prototype-only`、新版本号、入口文件和预览地址。
5. 默认不删除、不回滚、不恢复快照、不强制释放签出；这些操作必须走 MCP 的 `confirm: true` 二次确认。

### 3.4 MCP 工具分组

当前 MCP 共 22 个工具：

- 原型核心：`check_connection`、`list_prototypes`、`create_prototype`、`get_prototype`、`get_readme`、`get_preview_url`、`upload_zip`
- 项目协作：`list_projects`、`get_project`、`bind_prototype_to_project`、`checkout_prototype`、`checkin_prototype`、`create_snapshot`
- 高风险操作：`restore_snapshot`、`delete_prototype`、`rollback_version`、`force_release_checkout`，均要求 `confirm: true`
- 本地交付：`validate_project`、`validate_zip`、`pack_project`、`upload_project`、`deliver_project`

`deliver_project` 是推荐的安全交付入口，支持 `create`、`update`、`project-bound-update` 三种模式，内置幂等键、乐观版本和强制回读。`create_prototype` + `upload_project` 保留为底层兼容工具，普通交付不应使用。

### 3.5 旧技能替换流程

旧的 `fuxi-packager` 和 `deployment-validator` 已废弃。如果当前有正在运行的 AI 会话还在用旧技能，不需要关掉会话：重新点一次「接入平台 MCP」复制提示词，发给同一个会话，AI 助手会原地替换成新技能和 MCP 配置，替换完成后直接继续工作即可。

---

## 4. 详细设计说明

### 4.1 原型规范契约

每个规范必须声明 `prototype_spec`、`supported_runtimes`、`preferred_runtime`、`supported_profiles`（可选）和 `requires`。规范只定义设计语言，不复制伏羲平台规则。下一版契约需要增加组件实现 profile，使天宫不再与 Element Plus 强绑定。

目标结构：

```yaml
prototype_spec: tiangong
supported_profiles:
  - vue3-skyui
  - vue3-element-plus
preferred_profile: vue3-skyui
requires:
  - fuxi-adapter
```

规则：

- `prototype_spec` 是 `prototype-specs/` 下的文件夹名，必须唯一。
- `supported_runtimes` 来自 `fuxi-adapter` 的固定列表，不能自造新运行时。
- `preferred_runtime` 必须是 `supported_runtimes` 之一。
- `supported_profiles` 存在时，`preferred_profile` 必填且必须是其中之一。
- 一次生成只读取一个 profile；组件库不得静默混用。
- `requires: [fuxi-adapter]` 强制，因为伏羲平台规则不放在规范里。
- 规范只拥有视觉语言、布局、交互和内容约定，不得重新定义入口文件、预览路径、README 提取或 ZIP 排除。

### 4.2 SkyUI 知识接入

已评估 `sky-ui-docs`：它适合作为组件事实查询能力，不是完整原型规范。接入时必须解决：

- 把 CLI 和必要文档查询能力纳入单一 Skill 分发；用户不需要额外安装第二个 Skill。
- 保持查询项目实际安装的 `@sky/sky-ui/dist/skill-docs`，不依赖模型记忆臆测组件 API。
- 修复其当前测试与安装实现不一致：实测 37 页中 33 通过、4 失败，失败集中在 `@latest` 正式依赖安装与旧 devDependency 测试预期冲突。
- 固定可重现的依赖策略，避免在缺文档时未经许可自动升级项目 SkyUI 版本。
- 验证 SkyUI CSS、SVG iconfont 和字体被 Vite 本地构建处理，预览时不要求内部 registry、私有 CDN 或本机路径。

查询命令约定：

```text
node <skill-dir>/scripts/sky-ui-docs/run.mjs --project-dir <project-dir> list
node <skill-dir>/scripts/sky-ui-docs/run.mjs --project-dir <project-dir> <component> examples
node <skill-dir>/scripts/sky-ui-docs/run.mjs --project-dir <project-dir> <component> api <section>
node <skill-dir>/scripts/sky-ui-docs/run.mjs --project-dir <project-dir> icon search <keyword>
```

查询实现适配自内部 `sky-web-skill/sky-ui-docs` commit `92dc88a`，保持确定性查询行为由内置 Node 测试覆盖。

### 4.3 伏羲交付契约

- 可识别入口：`dist/index.html`、`build/index.html`、`index.html`、`public/index.html`。
- Vite 项目设置 `base: './'`，静态资源使用相对路径。
- ZIP 小于 `100 MB`，排除源码禁项、依赖、测试、数据库、凭证和本机配置。
- 根目录包含 `README.md`，记录原型用途、页面、交互、运行时、规范、适配器和已知限制。
- 上传前后都要校验；更新必须绑定明确 `prototypeId`，上传后回读平台状态。

README 元数据字段：

```yaml
prototype_spec: tiangong
runtime: vite-vue3
runtime_profile: vue3-skyui
fuxi_adapter: fuxi-skyui-prototype
entry_file: index.html
```

校验顺序：构建/类型校验 -> `validate_project` -> `pack_project` -> `validate_zip` -> 全部通过后上传。

### 4.4 交付状态机

```text
DISCOVER -> PLAN -> QUERY_SKYUI -> GENERATE -> BUILD -> VALIDATE
                                              |
                                              v
PREFLIGHT -> deliver_project -> COMPLETE
```

失败后不得跳步前进。`local-only` 在 `VALIDATE` 后结束。

### 4.5 deliver_project 设计

`deliver_project` 是推荐的安全交付入口，内置幂等、乐观版本和强制回读。三种模式：

- `create`：提供新名称；工具创建新记录并证明已有原型版本未被改动。
- `update`：提供精确 `prototypeId`、`expectedVersion` 和当前 `expectedEntryFile`（存在时）。
- `project-bound-update`：额外提供精确 `projectId` 和 `projectPrototypeId`；当前 MCP 用户必须持有活动签出。

完成条件：`status=COMPLETE`、返回 ID 匹配目标、README/预览回读通过、影响范围匹配模式。

停止条件：

- 多个可能的更新目标。
- 缺少明确的预期版本。
- `IDEMPOTENCY_CONFLICT`、`VERSION_CONFLICT`、`TARGET_MISMATCH` 或 `CHECKOUT_REQUIRED`。
- `DELIVERY_PARTIAL_FAILURE`：不盲目重试，先回读精确返回的原型 ID。
- 更新目标已是 `vue3-element-plus`：保留并停止，不通过此 SkyUI 流程迁移。
- SkyUI 文档能力缺失或过期。
- 构建、类型、资源、打包或 MCP 校验失败。
- 认证或权限失败。
- 回读指向不同原型 ID。
- 请求会修改命名目标之外的生产数据。

### 4.6 高风险操作守护

- 删除、回滚、恢复快照和强制释放签出均要求 `confirm: true`，且只授权一次具名操作。
- 单一 Skill 默认不主动调用这些工具。
- 生产验收先只读审计和备份，再创建全新测试原型完成写入验收；禁止借用已有原型做上传、回滚、分享或权限测试。

### 4.7 后端 API 路由

| 路由前缀 | 文件 | 职责 |
|---|---|---|
| `/api/auth` | `backend/routes/auth.js` | 登录、用户管理、MCP token |
| `/api/prototypes` | `backend/routes/prototypes.js` | 原型 CRUD、版本、ZIP 上传 |
| `/api/projects` | `backend/routes/projects.js` | 项目协作、签出/签入、快照 |
| `/api/groups` | `backend/routes/groups.js` | 用户组管理 |
| `/api/integrations` | `backend/routes/integrations.js` | Agent bootstrap、Skill/MCP 分发 |
| `/preview` | `backend/routes/preview.js` | 原型预览 |
| `/api/s` | `backend/routes/share.js` | 分享链接 |

### 4.8 分发接口设计

`backend/routes/integrations.js` 提供三个端点：

- `GET /api/integrations/agent-bootstrap`：`requireAuth`，生成短期 token（1h）和提示词。
- `GET /api/integrations/skill-package`：`requireAuth`，返回 Skill ZIP。
- `GET /api/integrations/mcp-package`：`requireAuth`，返回 MCP ZIP。

`configuredSkillDir()` 在 `FUXI_SKILL_DIR` 未配置时返回 `null`，`agent-bootstrap` 返回 `503 SKILL_DISTRIBUTION_UNAVAILABLE`。`configuredMcpDir()` 默认回退到平台仓库内 `mcp-server`。

### 4.9 前端页面结构

| 页面 | 文件 | 职责 |
|---|---|---|
| 首页 | `frontend/src/views/HomeView.vue` | 原型列表、搜索、接入 MCP 按钮 |
| 原型详情 | `frontend/src/views/PrototypeDetail.vue` | 预览、源码、README、版本、评论 |
| 项目视图 | `frontend/src/views/ProjectView.vue` | 项目门户、菜单、签出/签入 |
| 管理分发 | `frontend/src/views/AdminDistribution.vue` | 原型归属转移 |
| 用户管理 | `frontend/src/views/AdminUsers.vue` | 用户和角色 |
| 回收站 | `frontend/src/views/RecycleBinView.vue` | 已删除原型恢复 |

### 4.10 生产发布技能

维护者专用 `fuxi-platform-release` Skill 已固化并安装到 `C:\Users\howyo\.codex\skills\fuxi-platform-release`。内置：

- 全量构建
- 只读生产预检（`capture-production-baseline.ps1`、`probe-production.ps1`）
- 不可变 release 部署（`build-release.ps1`、`remote-deploy.sh`、`remote-preflight.sh`）
- 文件级备份（1 小时基线）
- 不可变 release
- 失败恢复和显式回滚（`rollback-release.ps1`、`remote-rollback.sh`）
- 发布后验收（`verify-production-release.ps1`）

默认只读，生产上传、切换和回滚必须在当前会话获得明确确认。

---

## 5. 数据安全与兼容策略

### 5.1 生产保护原则

- 生产环境 `192.168.2.145` 的已有原型是兼容基线。允许新增测试数据，但不得改写、删除、转移或重新上传已有原型。
- 生产写入前必须先备份 SQLite 数据库和原型仓库目录，并记录备份时间、路径、文件数量、大小和数据库完整性结果。
- 先执行只读兼容审计，再使用独立命名的新原型完成写入验收；禁止借用已有原型做上传、回滚、分享或权限测试。
- 重构期间保持现有 HTTP API、原型 ID、入口文件、版本历史、README、预览 URL、分享链接和项目绑定行为兼容。
- 任何 schema 或存储迁移必须先在生产备份副本上演练，验证旧数据可读、旧预览可开、回滚可用后，才允许进入生产执行确认。

### 5.2 备份策略

生产发布前执行文件级备份，包含：

- `backend/data/app.db`（SQLite 数据库）
- `backend/repos/`（原型仓库目录）
- `backend/uploads/`（上传文件）
- `backend/.env`（环境配置）
- 前一个 release tree 和 release 指针

备份归档为 tar.gz，记录 SHA-256 校验值。最新生产备份 ID 为 `20260811-210601-pre-20260811-210455-24264705`，规模约 1.8G，归档 `439,878,042` bytes，`sha256sum -c` 为 `OK`。

### 5.3 兼容验收标准

- 所有已有 prototype ID 仍然存在。
- 名称、描述、入口、归属者、版本等关键字段零差异。
- 项目数量、绑定、签出状态无漂移。
- 仅新增验收原型，不触碰已有数据。
- 分享短链接访客预览可达。

### 5.4 本地 CI 隔离

本地 CI 集成测试默认使用临时目录中的独立数据库、`repos` 和 `uploads`，不连接生产环境。生产验收验证与隔离测试证据分开记录。

---

## 6. 迭代计划

### 状态图例

| 状态 | 含义 |
|---|---|
| `done` | 已实现并完成当前阶段验收 |
| `in-progress` | 已开始，仍有未闭环项 |
| `todo` | 尚未开始 |
| `blocked` | 被外部条件阻塞 |
| `deferred` | 暂缓，不影响当前主线 |

### 阶段 0-13（已完成）

详见 [MCP_SKILLS_EVOLUTION_JOURNEY.md](MCP_SKILLS_EVOLUTION_JOURNEY.md)。涵盖架构确认、MCP 最小闭环、安全编排、一键接入、生产发布与兼容验收。

### 阶段 14: 技能内置与分发对齐

状态: `todo`

目标: 把 Skill 分发从「外挂 env」改成「内置 + env 回退」，与 MCP 同构。

任务:

- 在平台仓库新增 `skills/` 目录，内置技能包副本。
- `configuredSkillDir()` 改为三级回退: `FUXI_SKILL_DIR` -> 平台内置 `skills/` -> `null`。
- 在 `ops/` 下加同步脚本，单向同步技能包仓库 -> 平台 `skills/`。
- 挂到 `fuxi-platform-release` 发布前检查。
- 更新 `.gitignore` 放行 `skills/` 源码。

验收标准:

- 不配 `FUXI_SKILL_DIR` 时分发接口返回 200，不再 503。
- 配 `FUXI_SKILL_DIR` 时行为不变（开发调试回退）。
- 生产 release 自包含技能包，不依赖外部目录。

### 阶段 15: 平台运维增强

状态: `todo`

目标: 补齐生产运维的薄弱环节。

任务:

- 定期一致性备份 `backend/data/app.db` 与 `backend/repos/`，并演练恢复。
- 按 `process.platform === 'win32'` 屏蔽 `backend/services/proxy.js` 的 Windows `reg query` 探测。
- SkyUI 私有 registry 可用性监控告警。

### 阶段 16: 原型规范扩展

状态: `deferred`

目标: 证明可替换规范模型，增加新的设计规范或运行时 profile。

---

## 7. 当前工作区事实

截至 2026-08-12：

- **FuxiPlatform** 当前分支: `feature/project-collaboration`。
- 平台阶段 11-13 与维护者发布 Skill 已提交并通过不可变 release 部署生产；生产业务代码固定在 `2426470`，后续本地 `8ecb5f6` 仅修正维护者只读探查脚本，不改变线上业务行为。
- 最新平台 commit: `f1e6da9`（`feat(验收): 完成伏羲新版生产发布与兼容闭环`）。
- 本文档位于 `docs/TECHNICAL_DESIGN.md`，由 `.gitignore` 明确放行并作为体系持续事实入口。
- 技能包目录已重构为: `AGENTS.md`、`SKILLS-README.md`、`fuxi-adapter/`、`acceptance/stage10/`、`prototype-specs/tiangong/`、`prototype-specs/static-html/`、`fuxi-skyui-prototype/`。
- `prototype-manager-skills` 是独立 Git 仓库，当前分支 `master`，最新 commit `52ed07b`，尚未配置远程。
- 生产运行 release `20260811-210455-24264705`，`/api/health` 为 `200`，`/api/integrations/agent-bootstrap` 未登录为 `401`，MCP/Skill 分发和新数据验收均通过。
- `sky-ui-docs` 的确定性 Node CLI 已内置到单一入口 Skill；外部 GitLab 项目仍是上游来源。
- 生产已有 52 个原型（含本次新增验收原型），发布前 50 个旧 ID 全部保留，15 个关键字段零差异。

## 更新规则

每完成一个阶段，必须更新:

- 阶段状态。
- 已完成事项。
- 验收证据，优先写命令或可复核结果。
- 遗留风险和下一阶段入口。

不要把"代码已写"单独当作完成。只有对应验收验证也完成后，阶段才能标记为 `done`。
