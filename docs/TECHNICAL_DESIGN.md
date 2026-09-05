# 伏羲原型体系技术方案设计文档

> 版本: 1.1
> 更新日期: 2026-09-03
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
| 原型技能包 | `D:\_projects\skills\prototype-manager-skills` | 单一入口 Skill、可替换原型规范和 runtime profile、可选 SkyUI 查询能力、固定伏羲适配契约 | 平台登录脚本、本地凭证、直接实现平台 API |

### 1.3 架构总览

```text
用户 / AI 助手
    |
    | 只调用一个用户入口 Skill
    v
fuxi-prototype
    |-- 原型设计规范：视觉、布局、交互、内容和页面结构
    |-- 选定 runtime 知识：按 profile 查询真实组件示例/API/图标；SkyUI 仅在选中时加载
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
fuxi-prototype/
|-- SKILL.md                       <- 用户和 AI 助手看到的唯一入口
|-- agents/openai.yaml             <- 客户端识别元数据
|-- references/                   <- 渐进式披露参考文档
|   |-- workflow-contract.md       <- 模式、状态机、工具序列和完成证据
|   |-- prototype-spec.md          <- 选定规范和 profile 的共同契约
|   |-- skyui-runtime.md           <- 可选 SkyUI 组件查询和运行时约定
|   `-- fuxi-adapter.md            <- 打包、入口、ZIP 约束
|-- scripts/sky-ui-docs/          <- SkyUI 真实文档查询工具
|   |-- run.mjs
|   |-- cli.mjs
|   `-- cli.test.mjs
`-- assets/<runtime-profile>-starter/ <- 选定 profile 的新项目脚手架模板
```

- `SKILL.md` 编排需求分析、生成、构建、校验和 MCP 操作。
- `prototype-spec` 负责设计语言，可替换；首先完整实现以天宫设计规则为基础。
- runtime references 把组件语义映射到选定 profile；SkyUI 通过真实文档查询避免臆测 API。
- `fuxi-adapter` 是固定平台契约，不随设计规范替换。
- MCP 是外部能力。Skill 只能在 AI 助手已接入 MCP 后调用其工具，不能绕过 MCP Host 的授权和配置。

### 1.5 三维解耦模型

长期目标是把设计规范、组件实现和平台交付拆成三个正交维度：

| 维度 | 示例 | 变化影响 |
|---|---|---|
| 设计规范 | 天宫、其他 B 端规范 | 视觉、布局、交互和内容 |
| 运行时组件实现 | Vue 3 + SkyUI、Vue 3 + Element Plus、static HTML | 工程结构和组件代码 |
| 平台适配 | 伏羲适配器 | 入口、资源、README、ZIP 和上传契约 |

第一阶段不追求任意组合。当前验证基线为 `天宫 + Vue 3 + Element Plus + 伏羲`；SkyUI 保留为可选 profile，并要求显式选择或从既有项目检测得到。

### 1.6 可替换规范模型

```text
fuxi-prototype/specs/
|-- tiangong/        <- 可替换的设计规范之一
|   |-- SKILL.md     <- 声明 requires: [fuxi-adapter]
|   `-- references/  <- 色板、布局、交互、标注
`-- static-html/     <- 另一个设计规范
fuxi-adapter/        <- 固定的平台契约，所有规范都 requires 它
fuxi-prototype/<- 单一入口，内部编排以上各层
```

每个 `fuxi-prototype/specs/<name>/SKILL.md` 用 front-matter 声明 `name`、runtime/profile 和 `requires: [fuxi-adapter]`。设计规范只能定义视觉、布局、交互和内容，不能重复定义入口文件、打包规则或 ZIP 排除项。

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
  5. 确认 fuxi-prototype 可调用
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
| `FUXI_SKILL_DIR` | 可分发的 `fuxi-prototype` Skill 目录，必须包含 `SKILL.md` | 无，未配置时返回 `503 SKILL_DISTRIBUTION_UNAVAILABLE` |
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
| 发布来源分支 | `main`（内网 GitLab） |

持久化路径（生产数据当前在 legacy 项目树下）：

- `backend/data/app.db`
- `backend/repos/`
- `backend/uploads/`
- `backend/.env`

### 2.5 可选 runtime 依赖策略

SkyUI 仅能从内部 npm registry 获取。registry 可用于开发和构建，最终上传产物不依赖该地址，也不得打包 `.npmrc`、`node_modules/` 或其他开发机状态。

### 2.6 已知风险

- 非阻断日志告警：生产启动时 `backend/services/proxy.js` 在 Linux 尝试 Windows `reg query`，产生 `/bin/sh: reg: not found` 后正确降级为直连；error 日志最后修改于启动后的 `2026-08-11 21:07:01`，后续验收期间无新增。后续应按 `process.platform === 'win32'` 屏蔽该探测，避免污染 PM2 error log。
- API 备份不能替代服务器文件级备份；生产应定期一致性备份 `backend/data/app.db` 与 `backend/repos/`，并演练恢复。
- 选用 SkyUI profile 时，构建机必须能够访问技能中声明的私有 registry；未选用时不应访问该 registry。
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
使用 fuxi-prototype，根据这份需求选择合适的 runtime profile，创建新的伏羲原型并返回预览地址。
```

标准流程：

1. Skill 分析需求、页面、交互和验收范围。
2. 对选定 profile 使用真实组件文档、API、示例和图标查询；仅在选用 SkyUI 时查询 SkyUI docs。
3. 生成选定 runtime 的原型，设置 Vite `base: './'`（适用时）。
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

当前 MCP 共 30 个工具（以 `mcp-server/src/server.js` 和集成测试为准）：

- 原型核心：`check_connection`、`list_prototypes`、`create_prototype`、`get_prototype`、`get_readme`、`get_preview_url`、`upload_zip`
- 项目读取与协作：`list_projects`、`get_project`、`bind_prototype_to_project`、`checkout_prototype`、`checkin_prototype`、`create_snapshot`
- 轻协作候选：`create_change_handoff`、`create_prototype_change`、`redeem_prototype_change_handoff`、`get_prototype_change_status`、`submit_prototype_change`、`redeem_change_handoff`、`get_change_status`、`submit_change_candidate`
- 高风险操作：`restore_snapshot`、`delete_prototype`、`rollback_version`、`force_release_checkout`，均要求 `confirm: true`
- 本地交付：`validate_project`、`validate_zip`、`pack_project`、`upload_project`、`deliver_project`

`deliver_project` 是推荐的安全交付入口，支持 `create`、`update`、`project-bound-update` 三种模式，内置幂等键、乐观版本和强制回读。`create_prototype` + `upload_project` 保留为底层兼容工具，普通交付不应使用。

### 3.5 旧技能替换流程

旧的 `fuxi-packager` 和 `deployment-validator` 已废弃。如果当前有正在运行的 AI 会话还在用旧技能，不需要关掉会话：重新点一次「接入平台 MCP」复制提示词，发给同一个会话，AI 助手会原地替换成新技能和 MCP 配置，替换完成后直接继续工作即可。

---

## 4. 详细设计说明

### 4.1 原型规范契约

每个规范必须声明 `name`、`prototype_spec`、`supported_runtimes`、`preferred_runtime`、`supported_profiles`（可选）和 `requires`。规范只定义设计语言，不复制伏羲平台规则。

目标结构：

```yaml
prototype_spec: tiangong
supported_profiles:
  - vue3-element-plus
  - vue3-skyui
preferred_profile: vue3-element-plus
requires:
  - fuxi-adapter
```

规则：

- `name` 与 `fuxi-prototype/specs/` 下的文件夹名一致，`prototype_spec` 必须唯一。
- `supported_runtimes` 来自 `fuxi-adapter` 的固定列表，不能自造新运行时。
- `preferred_runtime` 必须是 `supported_runtimes` 之一。
- `supported_profiles` 存在时，`preferred_profile` 必填且必须是其中之一。
- 一次生成只读取一个 profile；组件库不得静默混用。
- `requires: [fuxi-adapter]` 强制，因为伏羲平台规则不放在规范里。
- 规范只拥有视觉语言、布局、交互和内容约定，不得重新定义入口文件、预览路径、README 提取或 ZIP 排除。

### 4.2 可选 runtime 知识接入

已评估 `sky-ui-docs`：它适合作为 SkyUI profile 的组件事实查询能力，不是完整原型规范。只有选中 SkyUI 时才接入：

- 把 CLI 和必要文档查询能力纳入单一 Skill 分发；用户不需要额外安装第二个 Skill。
- 保持查询项目实际安装的 `@sky/sky-ui/dist/skill-docs`，不依赖模型记忆臆测组件 API。
- 缺少 SkyUI package 或 docs 时返回 `SKYUI_DOCS_UNAVAILABLE`；只有显式授权的 setup 步骤允许安装锁定版本，查询命令不得隐式安装或升级。
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
fuxi_adapter: fuxi-prototype
entry_file: index.html
```

校验顺序：构建/类型校验 -> `validate_project` -> `pack_project` -> `validate_zip` -> 全部通过后上传。

### 4.4 交付状态机

```text
DISCOVER -> SELECT_PROFILE -> PLAN -> QUERY_RUNTIME -> GENERATE -> BUILD -> VALIDATE
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
- 更新目标 profile 与选定 profile 冲突：保留原 profile 并停止，不静默迁移。
- 选定 runtime 文档能力缺失或过期。
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
| `superseded` | 旧方案已被后续架构替代，不再按原任务实施 |

### 阶段 0-13（已完成）

详见 [MCP_SKILLS_EVOLUTION_JOURNEY.md](MCP_SKILLS_EVOLUTION_JOURNEY.md)。涵盖架构确认、MCP 最小闭环、安全编排、一键接入、生产发布与兼容验收。

### 阶段 14: 技能内置与分发对齐

状态: `superseded`

历史目标: 把 Skill 分发从「外挂 env」改成「内置 + env 回退」，与 MCP 同构。

当前结论: 不再在平台源码中维护 `skills/` 副本。Skill 保持独立仓库，发布时绑定 Skill commit 并生成不可变 ZIP；首次接入和阶段 18 launcher 更新链路负责分发、摘要校验、原子切换和回滚。以下任务保留为历史方案，不再执行。

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

状态: `superseded`

历史目标: 补齐生产运维的薄弱环节。

当前结论: 发布 Skill v1 已完成，剩余事项不再以旧阶段 15 整包启动；Linux 注册表探测日志作为 BL-004 进入阶段 20，其余事项只有重新进入 [BACKLOG.md](BACKLOG.md) 后才实施。

任务:

- 定期一致性备份 `backend/data/app.db` 与 `backend/repos/`，并演练恢复。
- 按 `process.platform === 'win32'` 屏蔽 `backend/services/proxy.js` 的 Windows `reg query` 探测。
- SkyUI 私有 registry 可用性监控告警。

### 阶段 16: 原型规范扩展

状态: `deferred`

目标: 证明可替换规范模型，增加新的设计规范或运行时 profile。

### 阶段 17: 无 Git 轻协作 MVP

状态: `completed`

目标: 项目成员通过任务码提交独立候选，负责人预览后显式采用；当前版本使用基础版本 CAS 保护。

权威设计：[lightweight-collaboration-mvp](prototypes/lightweight-collaboration-mvp/FULL_DESIGN.md)。

### 阶段 18: MCP stdio 与 Skill 延后更新

状态: `completed`（2026-08-27 用户确认验收）

目标: 已完成首次接入的用户在伏羲平台确认更新意图，AI 客户端下一次启动前由稳定 launcher 原子更新 MCP stdio 与 Skill，不重复完整接入。

权威设计：[agent-runtime-update-mvp](prototypes/agent-runtime-update-mvp/FULL_DESIGN.md)。

当前冻结边界:

- 服务端发布不可变 release manifest，MCP 会话上报本地 MCP/Skill 版本；用户点击只记录 update intent。
- AI 客户端下次启动时由版本无关的稳定 launcher 消费 intent，再执行下载、摘要校验、staging、原子切换、Smoke、回滚和结果回报。
- 浏览器不直接执行脚本，不注册 Windows 深链接，不运行常驻更新服务；当前客户端继续可用。
- 首次连接码有效期为 20 分钟、仍只消费一次；任务码继续 10 分钟，二者都不作为长期会话凭据。
- MVP 先做 stable 单渠道、Windows 设备、手动确认、下次启动和失败回滚；深链接、静默更新、多平台守护进程延后。

当前实现进度:

- 已落地服务端数据底座：`agent_releases`、`agent_update_intents`，以及 `mcp_sessions` 的 MCP/Skill/运行时版本回报字段。
- 已落地真实制品与最小 API：管理员从配置源目录生成 stable MCP/Skill ZIP，服务端保存并鉴权下载；用户查询设备更新、创建幂等更新意图、launcher claim、结果回报、MCP heartbeat。
- 已落地 Windows launcher：启动前下载、SHA-256、受限解压、MCP/Skill Smoke、current/previous 切换、native Skill 替换和结果回报。
- MCP `check_connection` 会上报运行时版本并返回第一条可用更新；旧服务端没有 heartbeat 时保持兼容，不阻断现有连接。
- 已通过后端测试、MCP 语法检查、远程更新协议测试和隔离集成测试；前端通知、launcher 更新和 16077 真实验收已由用户确认完成。

### 阶段 19: 管理员使用统计 v1.0

状态: `completed`（2026-08-26 已正式发布并完成 live verification）

目标: 用统一行为事件回答真实用户活跃、有效产出、协作交付和行为来源，完成后一次性发布到正式环境。

当前实现进度:

- 已落地 `usage_events` 统一事件表、事件幂等、来源归一化和敏感 metadata 过滤。
- 已覆盖登录失败/成功、原型访问/预览/创建/更新/删除/恢复/下载/分享、版本管理、项目协作、评论和 MCP 接入等核心动作。
- 已落地管理员使用总览、趋势、漏斗、行为分布、活跃用户、再次使用率、来源筛选和数据质量提示。
- 16077 已完成测试环境部署与页面资源验收；16088 已切换到完整 v1.0 release `20260826-202055-cc32bd96`，健康、Nginx、认证业务路由和管理员统计看板资源均已回读。

验收边界:

- 有效使用不包含单纯登录、打开页面；历史业务事实只用于补足上线前的创建、版本、访问和项目数据。
- 16077 已完成真实管理员页面复核；有效使用口径为成功完成业务动作，不把单纯登录或页面打开计为有效使用。
- 正式发布验收已完成前端构建、后端回归、MCP 集成、认证 bootstrap、Skill/MCP ZIP、备份、旧数据零漂移和新验收原型全链路。

正式发布证据（2026-08-26）:

- release：`20260826-202055-cc32bd96`；platform commit `cc32bd96756132d97cf7f8599c352dc91235d158`；Skill commit `20d9d69c92e4b3a39f18a25b87598a420ba51742`；SHA-256 `90a78b977dfd2a786d9c92d61884262c36a38a1089d2f2c7f2691a23b3c8f75c`。
- 生产备份：`20260826-202127-pre-20260826-202055-cc32bd96`；发布结果 `deployment_status=complete`、health `200`、bootstrap 未登录 `401`、Nginx `200`。
- 发布前只读基线：63 个原型、1 个项目；发布后 63 个原型、1 个项目，既有 ID/元数据/项目状态零漂移。
- 新验收原型：`mta2hdjc4f1g1q`，`deliver_project create/update` 版本 `0 → 1`，入口 `index.html`、README `present`、分享 `302 → 200`；未改写既有原型。
- 回滚命令（需再次明确确认）：`rollback-release.ps1 -BackupId 20260826-202127-pre-20260826-202055-cc32bd96 -ConfirmProductionRollback ROLLBACK_FUXI_PRODUCTION -RestoreData`。

### 阶段 20: Backlog 与性能基线收口

状态: `done`（2026-08-28 启动；2026-08-30 完成 16077 发布与命名验收）

目标: 关闭已完成或废弃的历史事项，实施前端主包拆分和 Linux 日志修复，生成发布现场清理预览，并为 MCP 接入、更新、生成与上传建立可诊断的性能/质量基线。

权威计划: [NEXT_ITERATION_PLAN.md](NEXT_ITERATION_PLAN.md)。执行证据: [PHASE20_EVIDENCE.md](PHASE20_EVIDENCE.md)。

当前边界:

- BL-001 已完成，BL-002 已废弃并以无 Git 轻协作为默认路径。
- BL-003、BL-004 已完成本地与 16077 验收并关闭；BL-005 明确不做；BL-006 已完成只读清理评估，任何实际删除仍需单独确认。
- 本阶段平台代码改动不改变 `fuxi-prototype` 的 API、MCP、ZIP、profile 或安装契约，Skill 仓库只做兼容性回归，不做无依据修改。
- 性能优化先建立分阶段基线；没有同环境前后对比的改动不计为性能成果。

---

## 7. 当前工作区事实

截至 2026-09-01：

- **FuxiPlatform** 阶段 20 开始前本地 `main` 与 `zoesoftgitlab/main` 均为 `c1edcab`；本轮修改已快进本地 `main` 并部署 16077，尚未推送 GitLab/GitHub 或部署 16088。
- 当前生产 release 为 `20260828-185117-c1edcab0`。2026-08-29 只读探针确认 PM2 有运行 PID、health `200`、bootstrap 未授权 `401`、持久化目录存在；这不是本轮阶段 20 的生产验收。
- 本文档位于 `docs/TECHNICAL_DESIGN.md`，由 `.gitignore` 明确放行并作为体系持续事实入口。
- `prototype-manager-skills` 是独立 Git 仓库；当前 `main` @ `20d9d69`。
- 16077 当前 release 为 `20260830-092500-adf7ea7f`，platform commit `adf7ea7`、Skill commit `20d9d69`；manifest、PM2/Nginx、认证 API、Skill/MCP 包和真实浏览器页面均已验收。
- 阶段 17 无 Git 轻协作 MVP 已完成代码和验收；阶段 18 MCP/Skill 延后更新已由用户确认验收。
- 阶段 20 已完成；BL-003/004 已关闭，BL-006 只保留实际处置决策，详见 [PHASE20_EVIDENCE.md](PHASE20_EVIDENCE.md) 和 [BACKLOG.md](BACKLOG.md)。
- 阶段 21 已完成仓库治理与安全同步：FuxiPlatform `main` 已更新 GitLab/GitHub 两端，协作分支与 tag 已按安全方案同步；Skill `main` 已更新 GitLab，两个主 worktree 无未跟踪文件。分支、tag、worktree 和残留处置证据见 [PHASE21_EVIDENCE.md](PHASE21_EVIDENCE.md)。
- 阶段 21 未执行分支/worktree 删除、强制推送、合并或部署；阶段 22 BL-007 已完成平台侧权限实现和本地/API 回归，16077 真实页面验收待执行。

### 阶段 26: 帮助中心与手册维护

状态: `completed`（2026-09-03；16077 部署与业务回读通过；手册引入提示词顺延下一阶段）

本阶段把原来写死在接入提示词中的“快速入门”沉淀为可维护的帮助内容源，但暂不改动提示词生成链路。产品仍保持轻量 Web 原型查看、发布和分享平台，不新增伏羲客户端或 AI 对话能力。

#### 用户入口与信息架构

- 顶部导航在「系统管理」后增加「帮助」，登录用户进入 `/help` 阅读已发布手册。
- 阅读页采用“左目录 / 中正文 / 右上下文”的三栏结构，支持标题、摘要和标识搜索，内容区域独立滚动，桌面端尽量一屏完成导航和阅读。
- 管理员从「系统管理 → 帮助中心 → 使用手册」或阅读页的「维护手册」进入 `/admin/help`；维护流程为编辑草稿 → 预览 → 保存 → 发布。
- 管理页只维护内置手册，新增文档保留 `slug`、`version` 和排序扩展点，避免本轮引入复杂的文档站点和权限模型。

#### 数据与 API

平台后端新增 `help_documents`：草稿字段与 `published_*` 快照分离。管理员编辑时，普通用户继续读取旧的已发布版本；发布动作才替换公开快照；归档不会物理删除文档。

- `GET /api/help-documents`：登录用户只返回已发布内容；管理员带 `includeDrafts=true` 可查看草稿和归档。
- `GET /api/help-documents/:slug`：按稳定标识读取文档。
- `POST /api/help-documents/:slug/preview`：管理员只读预览当前草稿，不写库。
- `PUT /api/help-documents/:slug`：管理员保存草稿。
- `POST /api/help-documents/:slug/publish`：管理员发布当前草稿。
- Markdown 统一转换为受控 HTML，移除脚本、事件属性和 `javascript:` 协议。

服务层同时暴露“读取已发布文档”的稳定边界，后续可以直接被提示词快照或 MCP 只读工具复用；本阶段不增加 `get_help` / `search_help` MCP 工具，不修改 `fuxi-prototype` Skill。

#### 后续提示词与 MCP 扩展点（本阶段不启用）

帮助中心完成 16077 验收后，再分两步接入原有流程：

1. 接入提示词增加受控变量 `{{quickStartGuide}}`、`{{helpVersion}}`，由后端读取最新 published 快照并在生成提示词时渲染，保证首次接入即可展示当时版本的入门手册。
2. 平台 MCP 增加只读 `get_help({ slug })` / `search_help({ query })`，复用同一 published 服务层；Skill 同步工具说明和能力缓存。动态读取失败时保留提示词快照作为 fallback。

这样既不让 AI 助手猜测变量含义，也不让提示词直接访问数据库；发布版本、读取权限和内容安全均由平台后端控制。上述第 1、2 步属于下一阶段，不计入本轮帮助中心验收。

详细需求、原型、技术路径和验收条件见 [PHASE26_HELP_CENTER.md](PHASE26_HELP_CENTER.md)；可点击设计稿见 [help-module-prototype](design/help-module-prototype/README.md)。阶段 27 的手册补全与分类扩展见 [PHASE27_HELP_MANUAL_CATEGORIES.md](PHASE27_HELP_MANUAL_CATEGORIES.md)。

### 阶段 27: 操作手册补全与帮助分类

状态: `completed`（2026-09-03；16077 测试环境验收通过）

阶段 27 在不增加伏羲客户端、不增加伏羲 AI 对话、不改变 MCP/Skill 契约的前提下，补齐面向首次用户的操作手册，并把帮助目录变成管理员可配置的分层分类。

#### 用户入口

- 普通用户从顶部「帮助」进入 `/help`，可按分类路径筛选已发布手册；页面只展示 published 快照。
- 管理员从「系统管理 → 帮助中心 → 使用手册」维护正文和多分类归属。
- 管理员从「系统管理 → 帮助中心 → 手册分类」维护分类树和当前分类的手册分发。

#### 数据模型

- `help_categories`：`slug`、名称、说明、`category_type`、`parent_id`、排序和 active/archived 状态；服务层阻止父级环和归档仍有活动子分类。
- `help_document_categories`：`document_slug` 与 `category_id` 的多对多关联；更新某个分类的分发集合时保留手册的其他分类。
- `help_documents` 的已发布快照模型保持不变；分类归档不会删除正文，普通用户不读取归档分类或归档手册。

#### 初始内容

数据库新增 11 篇已发布手册：`quick-start`、`mcp-onboarding`、`platform-basics`、`create-prototype`、`modify-prototype`、`prototype-delivery`、`faq`、`project-collaboration`、`spec-and-quality`、`prompt-recipes`、`troubleshooting`。初始分类以「基础入门 / 进阶使用」为根，向下覆盖「平台操作 / AI 原型设计」及 MCP 接入、创建、项目协作、质量交付等叶子目录。

#### API 与权限

- `GET /api/help-categories`：登录用户读取活动分类；管理员可带 `includeArchived=true&includeDocuments=true` 读取维护数据。
- `POST/PUT /api/help-categories`、`POST /api/help-categories/:id/archive|restore`：管理员维护分类。
- `PUT /api/help-categories/:id/documents`：管理员将手册分发到一个分类；`PUT /api/help-documents/:slug/categories` 支持从手册页维护多分类。
- `GET /api/help-documents?categoryId=`：按分类读取；服务层仍按用户/管理员区分 published 与草稿。
- 分类写操作仅允许 `admin` / `platform_admin`，服务层校验 ID、slug、父级、状态和手册存在性，并用事务写入关联。

#### 跨仓库边界与后续入口

本阶段只修改 FuxiPlatform。`prototype-manager-skills` 未修改，因为本阶段不改变 Skill 入口、能力缓存、runtime/profile、ZIP、安装流程或 MCP schema；其缓存校验结果为 `CACHE_VALID`。16077 已部署 release `20260903-174757-464ee5d9` 并完成健康、权限、手册、分类和页面资源回读；下一阶段再评估 `mcp.onboarding` 的 `{{quickStartGuide}}` / `{{helpVersion}}` 快照变量以及 MCP `get_help` / `search_help` 动态读取，并重新绑定两仓 commit。

### 阶段 28: 接入提示词引用已发布快速入门

状态: `completed`（2026-09-04；16077 测试环境验收通过）

阶段 28 将阶段 27 已验收的帮助中心内容接入已有 `GET /api/integrations/agent-bootstrap` 生成链路：

- `mcp.onboarding` 增加 `{{quickStartGuide}}` 和 `{{helpVersion}}`，并由后端读取 `quick-start` 的 published 快照；
- 快照拼接标题、版本、摘要和正文，去除 HTML 标签并限制为 12000 字符，不把草稿或归档内容注入提示词；
- 手册不可读取时使用最小兜底文本，接入任务继续执行原有客户端识别、安装和连接验证流程；
- 数据库启动时升级已有默认模板和 Mock，管理员自定义模板正文不覆盖，只补齐默认值和允许变量；
- 本阶段不增加 MCP `get_help/search_help`，不修改 `prototype-manager-skills`，不改变 token、连接码、manifest 和下载地址契约。

16077 已部署 release `20260904-094353-730a24ab` 并完成接入提示词真实生成回读：published `quick-start` v1.0 已注入，两个变量均已替换且未使用兜底；未登录 bootstrap 仍为 `401`。后续若增加 MCP 动态帮助工具，必须复用 published 服务层并重新评估平台与 Skill 两仓库契约。

### 阶段 29: MCP 首次接入性能与进程并发优化

状态: `implemented`（本地代码与回归测试完成，尚未部署测试环境）

详见 [PHASE29_MCP_ONBOARDING_PERFORMANCE.md](PHASE29_MCP_ONBOARDING_PERFORMANCE.md)。本阶段将首次接入收敛为“获取 MCP ZIP 以启动 Bootstrap + 一次 `bootstrap.js install` + 一次客户端重载后验证”，由安装器负责 Skill 下载、制品校验、备份、幂等和共享安装锁；MCP 运行时增加凭据文件首检、进程内 token single-flight、跨进程 refresh 文件锁和原子凭据写入，launcher 将已刷新 access token 传给子进程并并行下载后续更新制品。

平台仓库新增 `mcp-server/src/local-lock.js`；配套 `prototype-manager-skills` 同步更新 `fuxi-prototype/SKILL.md` 与 `references/workflow-contract.md`，不改变 MCP 工具 schema。当前本地验证通过，16077/16088 尚未发布。

## 更新规则

每完成一个阶段，必须更新:

- 阶段状态。
- 已完成事项。
- 验收证据，优先写命令或可复核结果。
- 遗留风险和下一阶段入口。

不要把"代码已写"单独当作完成。只有对应验收验证也完成后，阶段才能标记为 `done`。
