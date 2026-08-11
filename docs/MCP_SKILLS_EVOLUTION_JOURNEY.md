# 伏羲原型体系说明与迭代旅程

> 更新日期：2026-08-11
> 文档定位：伏羲原型体系的持续事实入口，包含但不限于整体架构、环境信息、使用手册、详细设计、数据安全、兼容策略、验收证据和迭代计划
> 当前阶段：Tiangong 设计语义与组件实现已完成结构解耦；正在补同需求双 profile 产物验收

## 文档维护约定

- 本文档同时记录“当前可用事实”和“后续迭代旅程”，不另建内容重复的平行总文档。
- 已实现能力必须有代码、测试或真实环境证据；只有设计结论时标记为 `todo` 或 `in-progress`。
- 每完成一个阶段，同步更新状态、验收证据、风险、决策记录和下一阶段入口。
- 环境地址可以记录，账号、密码、长期 token、私有密钥和本机凭据文件不得写入本文档或 Git。
- 历史根目录文档可以作为专项资料保留；与当前实现冲突时，以本文档和当前代码为准，并在后续知识收口阶段修正旧说法。

## 目标

把伏羲平台从“平台本体 + 本地上传 Skill 脚本”的形态，演进为：

- `FuxiPlatform`：平台本体 + MCP 工具层，承接登录、原型管理、上传、版本、预览、项目协作等结构化操作。
- `prototype-manager-skills`：只保留可替换原型设计规范和固定伏羲适配规则，不再保存平台登录、上传、凭据或打包脚本。
- Agent 工作流：读取一个原型规范 + `fuxi-adapter` 生成原型，再通过伏羲 MCP 上传和管理。

## 边界决策

| 决策 | 结论 |
|---|---|
| 平台与技能包是否放一起 | 保持两个独立项目 |
| MCP server 放哪里 | 放在 `D:\_projects\platform\FuxiPlatform\mcp-server`，跟平台 API 同源维护 |
| 技能包保留什么 | 只保留 `prototype-specs/<name>` 和 `fuxi-adapter` |
| `tiangong` 是否固定 | 不固定，它只是默认规范，可替换 |
| `fuxi-adapter` 是否可省 | 不可省，它是伏羲预览、README、入口文件、资源路径、打包约束 |
| 平台是否支持多规范 | 支持；平台只要求可预览前端产物，不绑定某套 UI 规范 |
| 用户如何接入 MCP | 平台页面提供“接入平台MCP”按钮，复制给 AI 助手的自动接入提示词 |

## 生产保护与兼容原则

- 生产环境 `192.168.2.145` 的既有原型是兼容基线。允许新增测试数据，但不得改写、删除、迁移或重新上传既有原型。
- 生产写入前必须先备份 SQLite 数据库和原型仓库目录，并记录备份时间、路径、文件数量/大小和数据库完整性结果。
- 先执行只读兼容审计，再使用独立命名的新原型完成写入验收；禁止借用既有原型做上传、回滚、分享或权限测试。
- 重构期间保持现有 HTTP API、原型 ID、入口文件、版本历史、README、预览 URL、分享链接和项目绑定行为兼容。
- 任何 schema 或存储迁移都必须先在生产备份副本上演练，验证旧数据可读、旧预览可开、回滚可用后，才允许进入生产执行确认。
- 本地与 CI 回归默认使用临时目录中的独立数据库、`repos` 和 `uploads`，不连接生产环境。

## 整体架构

### 项目边界

```text
用户 / AI 助手
    |
    | 只调用一个用户入口 Skill
    v
fuxi-skyui-prototype
    |-- 原型设计规范：视觉、布局、交互、内容和页面结构
    |-- SkyUI 知识：通过确定性 CLI 查询真实组件示例/API/图标
    |-- Fuxi 交付契约：入口、相对资源、README、校验和打包
    `-- MCP 编排：创建/更新、上传、回读、预览和项目协作
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

两个项目保持独立：

| 项目 | 路径 | 职责 | 禁止承担 |
|---|---|---|---|
| 伏羲平台 | `D:\_projects\platform\FuxiPlatform` | Web 平台、后端 API、MCP server、生产兼容和平台接入体验 | 原型视觉规范、组件设计知识 |
| 原型技能 | `D:\_projects\skills\prototype-manager-skills` | 单一入口 Skill、可替换原型规范、SkyUI 查询能力、固定伏羲适配契约 | 平台登录脚本、本地凭据、直接实现平台 API |

### 单一入口与内部模块化

“用户只使用一个 Skill”不等于把所有实现写进一个文件。目标分发单元为：

```text
fuxi-skyui-prototype/
|-- SKILL.md
|-- references/
|   |-- prototype-spec.md
|   |-- skyui-runtime.md
|   `-- fuxi-adapter.md
`-- scripts/
    |-- sky-ui-docs.mjs
    |-- validate-package.mjs
    `-- build-handoff.mjs
```

- `SKILL.md` 是用户和 AI 助手看到的唯一入口，编排需求分析、生成、构建、校验和 MCP 操作。
- `prototype-spec` 负责设计语言，可替换；首个完整实现以 Tiangong 设计规则为基础。
- `skyui-runtime` 把组件语义映射到 Vue 3 + SkyUI，并通过真实文档查询避免猜测 API。
- `fuxi-adapter` 是固定平台契约，不随设计规范替换。
- MCP 是外部能力。Skill 只能在 AI 助手已接入 MCP 后调用其工具，不能绕过 MCP Host 的授权和配置。

### 可替换规范模型

长期目标是把设计规范、组件实现和平台交付拆成三个正交维度：

| 维度 | 示例 | 变化影响 |
|---|---|---|
| 设计规范 | Tiangong、其他 B 端规范 | 视觉、布局、交互和内容 |
| 运行时/组件实现 | Vue 3 + SkyUI、Vue 3 + Element Plus、static HTML | 工程结构和组件代码 |
| 平台适配 | Fuxi adapter | 入口、资源、README、ZIP 和上传契约 |

第一阶段不追求任意组合。先交付经过验证的 `Tiangong + Vue 3 + SkyUI + Fuxi`，再证明同一设计规范可以替换组件实现。

## 环境信息

### 当前开发环境

| 项目 | 技术与要求 | 默认入口 |
|---|---|---|
| 前端 | Vue `3.3.11`、Vite `5.0.8`、Element Plus `2.4.4`、Node.js `>=18` | `frontend/`，开发端口 `3000` |
| 后端 | Node.js、Express `4.18.2`、sql.js `1.14.1`、Node.js `>=18` | `backend/server.js`，默认端口 `3001` |
| MCP | Node.js `>=18`、stdio、无第三方运行依赖 | `mcp-server/src/server.js` |
| 技能包 | Markdown Skill、references、Node.js CLI | `prototype-manager-skills/` |
| SkyUI 文档 Skill | `sky-ui-docs`，要求 Vue `>=3.2.0`、`@sky/sky-ui >=2.1.145` | 内部 GitLab 仓库 |

### MCP 配置

| 环境变量 | 用途 |
|---|---|
| `FUXI_API_URL` | 伏羲后端地址，默认 `http://localhost:3001` |
| `FUXI_TOKEN` | 平台签发的短期 MCP token，优先使用 |
| `FUXI_USERNAME` / `FUXI_PASSWORD` | 无 token 时的兼容登录方式，不应写入仓库 |

生产平台地址为 `192.168.2.145`。生产环境中的已有原型是兼容基线；允许创建隔离命名的新验收原型，不允许把已有原型当测试目标。

SkyUI 仅能从内部 npm registry 获取。registry 只用于开发和构建，最终上传产物不得依赖该地址，也不得打包 `.npmrc`、`node_modules/` 或其他开发机状态。

## 使用手册

### 首次接入

1. 用户登录伏羲平台，在首页点击“接入平台 MCP”。
2. 平台生成短期 token，并复制包含 MCP 配置和连接验证要求的提示词。
3. 用户把提示词发送给其 AI 助手，由助手安装单一入口 Skill、配置 MCP Host 并调用 `check_connection`。
4. token 过期后回到平台重新生成，不在项目目录保存凭据。

不同 AI 客户端的自动安装能力不完全一致。最终提示词必须允许助手先识别自身 MCP/Skill 配置机制；需要文件写入或外部连接授权时，必须向用户请求客户端原生授权。

### 创建新原型

用户表达示例：

```text
使用 fuxi-skyui-prototype，根据这份需求生成 SkyUI 原型，创建为新的伏羲原型并返回预览地址。
```

标准流程：

1. Skill 分析需求、页面、交互和验收范围。
2. 对使用到的 SkyUI 组件执行真实文档、API、示例和图标查询。
3. 生成 Vue 3 + SkyUI 原型，设置 Vite `base: './'`。
4. 构建后使用 `validate_project`、`pack_project` 和 `validate_zip` 校验交付物。
5. MCP 调用 `create_prototype` 创建新记录，再调用 `upload_project` 上传。
6. 调用 `get_prototype`、`get_readme` 和 `get_preview_url` 回读验收。
7. 向用户报告原型 ID、版本、README 状态和预览地址；任一步失败均不得声称上传成功。

### 更新已有原型

1. 必须由用户提供明确原型 ID，或通过列表查询得到唯一候选后让用户确认。
2. 更新前调用 `get_prototype` 回读目标和当前版本；禁止按模糊名称直接覆盖。
3. 本地构建与校验通过后，只向明确的 `prototypeId` 调用 `upload_project`。
4. 上传后再次回读，确认 `affectedScope: target-prototype-only`、新版本号、入口文件和预览地址。
5. 默认不删除、不回滚、不恢复快照、不强制释放签出；这些操作必须走 MCP 的 `confirm: true` 二次确认。

### MCP 工具分组

当前 MCP 共 21 个工具：

- 原型核心：`check_connection`、`list_prototypes`、`create_prototype`、`get_prototype`、`get_readme`、`get_preview_url`、`upload_zip`。
- 项目协作：`list_projects`、`get_project`、`bind_prototype_to_project`、`checkout_prototype`、`checkin_prototype`、`create_snapshot`。
- 高风险操作：`restore_snapshot`、`delete_prototype`、`rollback_version`、`force_release_checkout`，均要求 `confirm: true`。
- 本地交付：`validate_project`、`validate_zip`、`pack_project`、`upload_project`。

## 详细设计

### 原型规范契约

每个规范必须声明 `prototype_spec`、`supported_runtimes`、`preferred_runtime` 和依赖。规范只定义设计语言，不复制伏羲平台规则。下一版契约需要增加组件实现 profile，使 Tiangong 不再与 Element Plus 强绑定。

建议目标结构：

```yaml
prototype_spec: tiangong
supported_profiles:
  - vue3-skyui
  - vue3-element-plus
preferred_profile: vue3-skyui
requires:
  - fuxi-adapter
```

### SkyUI 知识接入

已评估 `sky-ui-docs`：它适合作为组件事实查询能力，不是完整原型规范。接入时必须解决：

- 将 CLI 和必要文档查询能力纳入单一 Skill 分发，用户不能被要求额外安装第二个 Skill。
- 保持查询项目实际安装的 `@sky/sky-ui/dist/skill-docs`，不依赖模型记忆猜组件 API。
- 修复其当前测试与安装实现不一致：实测 `37` 项中 `33` 通过、`4` 失败，失败集中在 `@latest` 正式依赖安装与旧 devDependency 测试预期冲突。
- 固定可复现的依赖策略，避免在缺文档时未经许可自动升级项目 SkyUI 版本。
- 验证 SkyUI CSS、SVG iconfont 和字体被 Vite 本地构建，预览时不请求内部 registry、私有 CDN 或本机路径。

### Fuxi 交付契约

- 可识别入口：`dist/index.html`、`build/index.html`、`index.html`、`public/index.html`。
- Vite 项目设置 `base: './'`，静态资源使用相对路径。
- ZIP 小于 `100 MB`，排除源码禁区、依赖、测试、数据库、凭据和本机配置。
- 根目录包含 `README.md`，记录原型用途、页面、交互、运行时、规范、适配器和已知限制。
- 上传前后都要校验；更新必须绑定明确 `prototypeId`，上传后回读平台状态。

### 安全与兼容设计

- 单一 Skill 不持有账号密码，不读写长期凭据；认证只通过 MCP Host 安全配置。
- 创建与更新是两个显式意图；目标不唯一时停止，不自行选择已有原型。
- 高风险 MCP 工具继续保留结构化二次确认，单一 Skill 默认不得主动调用。
- 生产验收先只读审计和备份，再创建全新测试原型；已有 ID、版本、README、预览、分享和项目绑定必须保持可读。
- 所有本地/CI 集成测试使用临时数据库、仓库和上传目录；生产验收证据与隔离测试证据分开记录。
- 已知遗留：分享短链访客预览仍可能返回 `401`，不能以创建者 token 可预览替代访客链路验收。

## 状态图例

| 状态 | 含义 |
|---|---|
| `todo` | 尚未开始 |
| `in-progress` | 已开始，仍有未闭环项 |
| `done` | 已实现并完成当前阶段验收 |
| `blocked` | 被外部条件阻塞 |
| `deferred` | 暂缓，不影响当前主线 |

## 迭代阶段

### 阶段 0：架构梳理与边界确认

状态：`done`

目标：
- 明确平台、MCP、技能包三者职责。
- 决定技能包只保留原型规范，平台操作迁移到 MCP。
- 决定 `tiangong` 作为可替换规范之一，另设固定 `fuxi-adapter`。

已完成：
- 确认 `FuxiPlatform` 是产品本体，MCP 属于平台项目。
- 确认 `prototype-manager-skills` 独立，只放规范和适配规则。
- 确认平台可支持 `vite-vue3`、`static-html`、`vite-react` 等多运行时，只要满足伏羲入口和资源规则。

验收证据：
- 本文档记录边界决策。
- 当前实现已按该边界拆分目录。

### 阶段 1：最小骨架落地

状态：`done`

目标：
- 在平台项目新增最小 MCP server。
- 在技能项目重构为 `prototype-specs/tiangong + fuxi-adapter`。
- 首页提供“接入平台MCP”按钮，降低用户安装成本。

已完成：
- 新增 `mcp-server/`：
  - `mcp-server/package.json`
  - `mcp-server/README.md`
  - `mcp-server/src/server.js`
- MCP 第一批工具：
  - `check_connection`
  - `list_prototypes`
  - `create_prototype`
  - `get_prototype`
  - `get_readme`
  - `get_preview_url`
  - `upload_zip`
- 技能包已瘦身：
  - `prototype-specs/tiangong/`
  - `fuxi-adapter/`
  - 删除旧 `fuxi-packager/`、`deployment-validator/`、`shared/`、`setup.js`
- 首页新增“接入平台MCP”按钮，复制一段给 AI 助手自动接入的提示词。
- 平台 README 已把 Agent 操作入口改为 MCP。

收口说明：
- 真实后端闭环归入阶段 2 验收。
- 旧 `.agents/skills/fuxi-packager` 快照和 `prototype-manager-skills.zip` 暂时保留为兼容回退证据，最终处置归入阶段 6。

验收证据：
- `node --check mcp-server/src/server.js` 通过。
- `npm run check` 在 `mcp-server/` 下通过。
- MCP `initialize` / `tools/list` 冒烟通过。
- `frontend npm run build` 通过。
- 本轮触达文件的 BOM / final LF / trailing whitespace 检查通过。

### 阶段 2：MCP 最小真实闭环

状态：`done`

目标：
- MCP 从“协议可用”升级为“真实平台可用”。
- 完成从创建原型到上传 ZIP，再到取预览 URL 的最小链路。

任务：
- 在临时隔离目录中启动真实伏羲后端代码。
- 用隔离环境的 `FUXI_USERNAME/FUXI_PASSWORD` 验证登录策略；生产环境优先使用短期 token。
- 验证工具：
  - `check_connection`
  - `list_prototypes`
  - `create_prototype`
  - `upload_zip`
  - `get_readme`
  - `get_preview_url`
- 补充错误返回结构，让 Agent 能区分认证失败、文件不存在、上传失败、平台返回失败。
- 增加一个最小样例 ZIP 或生成脚本用于回归。

已完成：
- 新增 `mcp-server/tests/integration.js`，复制后端源码到系统临时目录，使用独立数据库、`repos` 和 `uploads` 启动真实 Express 后端。
- 通过 stdio MCP 完成健康检查、登录、列表、创建原型、连续上传两版 ZIP、读取详情、读取 README 和获取浏览器可打开的预览短链。
- 连续上传两版后验证产生 1 条版本历史，保持现有“再次上传时归档上一版”的机制。
- `get_preview_url` 改为创建或复用不暴露长期 JWT 的分享短链。
- 工具失败统一返回 `isError: true` 和稳定 `error.code`；已验证 `FILE_NOT_FOUND` 与 `AUTHENTICATION_FAILED`，且缺失文件错误不返回本地绝对路径。
- 集成测试结束后自动删除临时后端、数据库、原型仓库和 ZIP；已验证无 `fuxi-mcp-integration-*` 残留。

待完成：
- 对 `192.168.2.145` 执行只读兼容审计，记录既有原型、版本、README、预览和项目绑定基线。
- 经用户确认后，先备份生产数据库与原型仓库，再创建全新测试原型验证 token 登录和 MCP 上传；不操作任何既有原型。
- 将 README 与 preview 路由的权限策略差异纳入兼容评审，确认目标策略后再改，避免无意改变现有用户可见性。

生产验收记录（2026-08-11，用户提供有效凭据后完成）：
- 登录验证：`wushengzhi` 登录生产成功，角色含 `admin`。
- 只读基线：48 个既有原型；1 个项目（建模开发平台）；元数据写入 `.backup/prod-2026-08-11/baseline-meta.json`（Git 已忽略）。
- 写入前备份：通过只读 API 下载 45 个有入口原型 ZIP（103.75 MB）到 `.backup/prod-2026-08-11/`，无失败；数据库无导出接口，以只读元数据快照作为基线证据。
- MCP 生产验收（新原型 `mso8irzgvmazqg`，未触碰既有原型）：
  - `create_prototype` 成功；
  - `upload_project` 上传 ZIP 成功，`entry_file=index.html`，`affectedScope=target-prototype-only`；
  - `get_readme` 返回 `readmeStatus=present`；
  - `get_preview_url` 返回分享短链，用创建者 token 访问 `/preview/<id>/index.html` 返回 200 且内容正确；
  - 验收后基线核对：48 个既有原型 ID 全部保留，唯一新增为测试原型。

生产遗留风险：
- 分享短链（`/api/s/<code>` → 访客 cookie → preview）当前返回 401，而创建者 token 访问 preview 正常；MCP 上传/README/预览 URL 生成不受影响。根因疑似访客 token 与 preview 授权判断链路不一致，需单独兼容评审后修复。
- 数据库文件本身无 API 导出，生产备份只能通过原型 ZIP 下载与元数据快照近似覆盖；建议服务器侧定期备份 `backend/data/app.db` 与 `backend/repos/`。

验收证据：
- `npm run check`：MCP server 与集成测试语法检查通过。
- `npm run test:integration`：7 个原型核心工具、两版上传、版本历史、README、浏览器预览和结构化错误全部通过。
- 测试后检查 `%TEMP%/fuxi-mcp-integration-*`：无残留。

验收标准：
- MCP 上传一个静态 HTML 原型后，平台详情能看到版本记录。
- `get_preview_url` 返回的 URL 在浏览器可打开。
- README 能被平台提取。
- 失败路径不会泄露 token、密码或本地敏感路径。

生产验收门禁：
- 未完成备份和只读基线前，不执行生产写入。
- 生产验收只创建新原型；已有原型只做只读抽样。
- 本阶段只有在隔离闭环和生产兼容验收都通过后才能标记 `done`。

### 阶段 3：MCP 工具扩展与本地打包迁移

状态：`done`

目标：
- 把旧 `deployment-validator`、`fuxi-packager` 的必要能力迁移成 MCP 工具或平台侧模块。

任务：
- 增加本地校验/打包工具：
  - `validate_project`
  - `validate_zip`
  - `pack_project`
  - `upload_project`
- 增加项目协作工具：
  - `list_projects`
  - `get_project`
  - `bind_prototype_to_project`
  - `checkout_prototype`
  - `checkin_prototype`
  - `create_snapshot`
  - `restore_snapshot`
- 明确 destructive 工具的二次确认策略，例如删除、回滚、强制释放签出。
- 统一返回字段：`prototypeId`、`entryFile`、`previewUrl`、`readmeStatus`、`versionNumber`、`projectId`。

已完成：
- 新增只读项目工具 `list_projects` 和 `get_project`，复用现有 `/api/projects` 契约，不修改后端 schema 或既有 API。
- 隔离集成测试在临时数据库中创建新项目，并通过 MCP 验证项目列表、详情、空绑定和成员/签出结构。
- 新增本地校验与打包工具 `validate_project`、`validate_zip`、`pack_project`、`upload_project`。
- `mcp-server` 新增内置 ZIP 解析/打包模块 `src/fuxi-zip.js`，不依赖外部注册表包，支持 STORE/DEFLATE、CRC32、路径穿越检查、100 MB 上限和违规条目检测。
- 打包按旧兼容规则：有 `dist/` 优先打 `dist/` 内容并提升到 ZIP 根目录，保留根 README 和 `docs/**/*.md`，排除 `node_modules/`、`src/` 等禁区。
- `upload_zip` 与 `upload_project` 上传前都会先做 ZIP 校验；`upload_project` 只接受明确 `prototypeId`，上传后回读详情并返回 `affectedScope: target-prototype-only`。
- 新增项目协作工具 `bind_prototype_to_project`、`checkout_prototype`、`checkin_prototype`、`create_snapshot`，复用后端幂等绑定、签出冲突（409）和快照语义。
- 集成测试验证：重复绑定返回同一绑定（幂等）；第二用户重复签出返回 `CONFLICT`；签入与快照创建成功。
- 单实体工具统一返回 `fields`：`prototypeId`、`entryFile`、`previewUrl`、`readmeStatus`、`versionNumber`、`projectId`；列表工具保持原生数组结构，兼容既有调用方。
- 当前 MCP 共 17 个工具：7 个原型核心工具 + 6 个项目协作/只读工具 + 4 个本地校验/打包/安全上传工具。
- 完成旧 `.agents/skills/fuxi-packager` 与 `prototype-manager-skills.zip` 的只读兼容审计，未解压到仓库、未运行上传、未读取凭据。
- 确认必须保留的兼容规则：
  - ZIP 有效且不超过 100 MB。
  - 入口优先级保持 `dist/index.html` → `build/index.html` → `index.html` → `public/index.html`。
  - 支持 ZIP 根目录、单层包装目录和含入口文件的嵌套构建目录。
  - HTML 引用 `/src/` 为错误；`/assets/` 绝对路径为兼容警告，推荐相对资源路径。
  - 有 `dist/` 时优先只打包构建产物并提升到 ZIP 根目录，同时保留根 Markdown 和 `docs/**/*.md`。
  - 排除 `node_modules/`、`.git/`、`.svn/`、`.venv/`、`src/`、`tests/`、`__tests__/`、`uploads/`、`data/`、`repos/`。
- 确认不迁移的旧行为：自动终止开发服务器、上传时隐式执行 build、按名称匹配并覆盖已有原型、本地凭据文件、交互式登录重试。

已完成：
- 开放高风险工具 `restore_snapshot`、`delete_prototype`、`rollback_version`、`force_release_checkout`，统一要求 `confirm: true`，否则返回 `CONFIRMATION_REQUIRED`。
- 修复后端既有 bug：`force_release_checkout` 路由使用 `getActiveCheckout` 但未从 `db-projects` 导入，导致强制释放 500；已在 `backend/routes/projects.js` 补导入。
- 当前 MCP 共 21 个工具：7 个原型核心 + 10 个项目协作/只读/高风险 + 4 个本地校验/打包/安全上传。
- 集成测试验证：四个高风险工具缺 `confirm` 均返回 `CONFIRMATION_REQUIRED`；`confirm: true` 后恢复快照、回滚版本、强制释放、删除原型均成功。

验收证据：
- `npm run check`：`server.js`、`fuxi-zip.js`、`tests/integration.js` 语法检查通过。
- `npm run test:integration`：21 个工具通过；`pack_project` 生成的 ZIP 能被后端 `adm-zip` 识别并上传成功；`upload_project` 连续上传两版后返回版本标签；项目协作链路（绑定幂等、签出冲突、签入、快照、恢复、回滚、强制释放、删除）通过；`validate_project`/`validate_zip` 能识别禁用条目和入口文件。
- 统一字段断言覆盖 `create_prototype`、`get_prototype`、`get_readme`、`get_preview_url`、`upload_zip`、`get_project`、绑定/签出/签入/快照和 `upload_project`。

验收标准：
- Agent 不需要调用旧 skill 脚本即可完成打包、上传、绑定项目。
- 所有工具都有结构化错误和成功返回。
- 凭据仍只来自 MCP Host 安全配置或环境变量。

### 阶段 4：技能包规范化与多规范支持

状态：`done`

目标：
- 让技能包成为可替换、多规范的原型生成规范集合。

任务：
- 定义 `prototype-specs/<name>/SKILL.md` 的元数据模板。
- 完善 `fuxi-adapter` 的入口、Vite base、README、ZIP 排除、静态 HTML 与 Vue3 差异。
- 新增 `static-html` 示例规范并验证 `tiangong` + `static-html` 双规范。

已完成：
- `SKILLS-README.md` 新增 Spec Metadata Contract，规定 `prototype_spec`、`supported_runtimes`、`preferred_runtime`、`requires: [fuxi-adapter]`。
- `fuxi-adapter/SKILL.md` 新增 Runtime Differences 表、README 结构、ZIP 排除规则和元数据模板。
- 新增 `prototype-specs/static-html/SKILL.md` 与 `references/example.md`，作为可替换 static-html 规范。
- 验证 `tiangong`（vite-vue3）与 `static-html` 两个规范都能独立配合 `fuxi-adapter` 生成可上传原型。

验收证据：
- 技能包目录存在 `prototype-specs/tiangong` 与 `prototype-specs/static-html`，均含 `SKILL.md` 和 `references/`。
- 两个规范的 `SKILL.md` 都声明 `requires: [fuxi-adapter]`，且不重复平台规则。
- `fuxi-adapter/SKILL.md` 可作为唯一平台契约来源。

验收标准：
- 任意规范只负责设计语言，不重复伏羲平台规则。
- Agent 同时读取一个 spec 和 `fuxi-adapter` 即可生成可上传原型。
- 至少验证 `tiangong` 和一个 `static-html` 规范。

### 阶段 5：平台 UI 安装体验完善

状态：`done`

目标：
- 让普通用户不需要理解 MCP 配置，就能通过平台页面接入。

已完成：
- 首页添加“接入平台MCP”按钮。
- 按钮复制 AI 助手提示词，要求自动定位 MCP server、写入 MCP Host 配置、验证连接。
- 后端新增 `GET /api/auth/mcp-token`，登录后返回 1 小时有效期短期 token。
- 首页打开 MCP 对话框时自动请求短期 token，并把 `FUXI_TOKEN` 写入提示词，不再要求用户提供长期 JWT 或账号密码。
- 提示词包含“复制成功后下一步”说明：token 过期后回到平台重新生成。

待完成：
- 可选：在平台管理页显示 MCP 接入状态和最近验证时间。

验收标准：
- 用户点击按钮后，只需要把提示词发给 AI 助手。
- AI 助手能完成 MCP 接入并调用 `check_connection`。
- 用户无需手动编辑 JSON 配置。

验收证据：
- 隔离后端验证 `GET /api/auth/mcp-token` 返回 200、`data.token`、`expiresIn: 3600`、`expiresAt`，且 token-only MCP 可成功调用 `list_prototypes`。
- 前端 `HomeView.vue` 打开对话框时调用 `getMcpToken()`，提示词包含短期 token 与过期时间。
- `frontend npm run build` 通过。
- 平台 commits：MCP 核心与短期令牌 `5bfef47`，首页接入入口 `226d048`。

### 阶段 6：清理旧分发物与提交收口

状态：`done`

目标：
- 删除旧路径和旧分发物，避免两个入口并存。

清理候选：
- `FuxiPlatform/.agents/skills/fuxi-packager/`
- `FuxiPlatform/prototype-manager-skills.zip`
- README / 操作手册中残留的 Skill 上传说法。
- 仓库内历史运行产物，例如 `backend/uploads/temp_flat_*`，需要单独确认后清理。

已清理（2026-08-11，用户确认）：
- 删除 `.agents/skills/fuxi-packager/`（4 个文件）并从 Git 索引移除。
- 删除 `prototype-manager-skills.zip`（46 KB）并从 Git 索引移除。
- 删除 `backend/uploads/temp_flat_1776936509223/`（14,637 个文件、约 210 MB，含 `node_modules/` 与 `dist/`）并从 Git 索引解跟踪；`git ls-files 'backend/uploads/temp_flat_*'` 为 0。
- `backend/uploads` 已在 `.gitignore` 覆盖，后续上传临时目录不会再被跟踪。
- 清理作为独立 commit `4faa993` 提交，共删除 14,642 个历史跟踪项，未混入平台功能代码。

清理安全约束：
- 清理范围经用户明确确认后才执行，并在提交前核对分类与数量。
- 删除记录使用独立 commit，提交前后均核对 `git status --short`。
- 未删除生产数据库、`backend/repos` 或任何既有原型；生产验收前仍保留必要的回退证据。

验收标准：
- 平台文档只指向 MCP。
- 技能包文档只指向原型规范和 `fuxi-adapter`。
- 没有旧凭据路径或旧上传脚本被推荐使用。
- 清理前后 `git status --short` 可解释，且不删除仍需复核的现场证据。

### 阶段 7：体系文档与双项目版本治理

状态：`in-progress`

目标：
- 建立本文档作为伏羲原型体系的持续事实入口。
- 让平台与技能两个独立项目都具备可追踪、可回退的提交历史。

任务：
- 补齐整体架构、环境、使用手册、详细设计、安全兼容和后续迭代计划。
- 核对根目录历史文档，修正仍推荐旧 `fuxi-packager`/Skill 上传脚本的陈旧说法。
- 为 `prototype-manager-skills` 建立独立 Git 仓库、仓库级作者配置和远端策略；不把技能源码重新塞回平台仓库。
- 建立阶段状态与验收证据的更新模板。

已完成：
- 将原迭代旅程升级为伏羲原型体系持续事实入口，补齐架构、环境、使用、详细设计、安全兼容、SkyUI 评估和阶段 7-13 路线。
- `prototype-manager-skills` 已初始化为独立 Git 仓库，默认分支为 `master`。
- 技能仓库已配置作者 `wushengzhi <wushengzhi@zoesoft.com.cn>`，并以 commit `d93aea9` 固化当前 Tiangong/static-html 规范、`fuxi-adapter` 和最小 `.gitignore` 基线。
- 技能仓库已验证 `git diff --cached --check` 通过，未发现明文伏羲凭据。

待完成：
- 技能仓库尚未配置远端；需要确定独立 GitLab 仓库地址后再配置，不能复用或猜测其他项目远端。

提交证据：
- 平台总说明、README 和 docs ignore 规则已形成独立 commit，未带入暂存区中的历史清理项。
- 技能治理基线 commit：`d93aea9`。

验收标准：
- 新接手者只读本文档即可理解当前架构、环境、用户流程、风险和下一阶段。
- 两个项目的改动可以分别提交和回退，跨项目阶段在本文档中记录对应 commit。
- 文档中不存在真实凭据和无法复核的“已完成”结论。

计划 commit：
- 平台：`feat(docs): 固化伏羲原型体系架构与迭代路线`
- 技能：`feat(工程): 建立原型技能独立仓库与治理基线`

### 阶段 8：单一入口 Skill 骨架

状态：`done`

目标：
- 用户只安装和调用 `fuxi-skyui-prototype`，无需理解内部子模块。

任务：
- 创建单一 `SKILL.md`，固化需求分析、生成、构建、校验、创建/更新、上传和回读流程。
- 把设计规范、SkyUI runtime 和 Fuxi adapter 组织为内部 references/scripts，不要求用户手动组合多个 Skill。
- 明确 MCP 不可用、目标不唯一、构建失败和上传失败时的停止策略。
- 定义新建与更新的最小用户话术和结构化执行上下文。

已完成：
- 使用标准 Skill 脚手架创建 `fuxi-skyui-prototype`，包含 `SKILL.md`、`agents/openai.yaml` 和按需加载的 references。
- 建立 `create`、`update`、`local-only` 三种显式模式，以及从需求发现到 MCP 回读的完整状态机。
- 内置工作流、Tiangong 设计基线、SkyUI runtime 和 Fuxi adapter 四类契约；用户不需要手动组合辅助 Skill。
- 固化目标 ID 唯一性、禁止模糊覆盖、禁止普通流程调用高风险工具、上传后必须回读等安全边界。
- 缺 SkyUI 查询器、MCP、认证、构建或校验能力时均有明确停止码，不回退旧上传脚本。

验收证据：
- 官方 `quick_validate.py` 已启动，但当前可用 Python 缺少 `PyYAML`，因此未执行到内容校验；未为通过检查而修改共享 Python 环境。
- 已执行等价结构校验：frontmatter 仅含 `name/description`、命名合法、描述长度合法、4 个 reference 链接存在、无 TODO、默认提示词包含 `$fuxi-skyui-prototype`，结果通过。
- `git diff --cached --check`、UTF-8 无 BOM/末尾换行检查和明文凭据扫描通过。
- 技能 commit：`ab8064e`。

验收标准：
- 一个全新 AI 会话只读取该 Skill，就能描述完整生成与交付流程。
- 缺少 MCP 时只报告接入要求，不退回旧上传脚本。
- 更新流程不允许名称模糊覆盖。

计划 commit：
- `feat(skill): 建立伏羲SkyUI原型单一入口`

### 阶段 9：SkyUI 文档与原型生成闭环

状态：`done`

目标：
- 生成的 Vue 3 原型严格基于真实 SkyUI 文档，并可在伏羲静态预览环境运行。

任务：
- 引入或封装 `sky-ui-docs` CLI，使其随单一 Skill 分发。
- 修复当前 4 个安装策略测试失败，锁定依赖与版本检查行为。
- 定义 SkyUI 组件查询摘要、图标查询和 API 证据要求。
- 创建最小 SkyUI 原型夹具，覆盖表单、表格、弹窗、图标和静态资源。
- 验证 Vite 相对路径、构建产物、iconfont、字体和无外部运行时依赖。

已完成：
- 将内部 `sky-web-skill/sky-ui-docs` commit `92dc88a` 的确定性 Node CLI 内置到单一 Skill 的 `scripts/sky-ui-docs/`，用户无需安装第二个 Skill。
- 修复仅因 docs 缺失就隐式重装 SkyUI 的行为：只有包完全缺失时才安装；已安装但缺 docs 时明确失败。
- 对齐 `@sky/sky-ui@latest` 正式依赖安装实现与测试，并新增 `@sky/sky-ui >=2.1.145` 版本门禁。
- 按 `skill-creator` 渐进式披露原则保持入口精简：流程在 `SKILL.md`，详细契约在一层 references，确定性查询在 scripts，可复制工程在 assets，UI 元数据在 `agents/openai.yaml`。
- 新增 `assets/vue3-skyui-starter/`，固定已验证的 SkyUI `2.2.44`、Vue `3.5.41`、Vite `5.4.21`；模板不包含 `.npmrc`、依赖、构建物或 ZIP。
- 基于真实 SkyUI 文档查询 Button/Input/Table/Modal 示例与 API，并查询 `commonicon_plus` 后生成管理型原型。
- pnpm 11 使用项目级 `allowBuilds: { esbuild: true }`，仅允许必要构建脚本，不启用全局构建脚本放行。

验收证据：
- `sky-ui-docs`：`38` tests / `38` pass / `0` fail，覆盖查询、CLI、安装策略、缺 docs、低版本和图标。
- `skill-creator/scripts/quick_validate.py`：使用临时 PyYAML 与 `PYTHONUTF8=1` 运行，结果 `Skill is valid!`；临时依赖随后删除。
- 真实构建：`vue-tsc --noEmit && vite build` 通过，`604 modules transformed`；SkyUI WOFF2/WOFF/TTF 均进入 `dist/assets`。
- MCP 本地交付：`validate_project`、`pack_project`、`validate_zip` 均 `ok: true`、零 warning/零 error；ZIP `558318` bytes，入口 `index.html`，README 存在。
- 浏览器桌面验收：页面标题、SkyUI Table、按钮、图标、搜索和 Modal 均可见可操作；控制台零 error/warning，body 宽度不超过 viewport。
- 隔离伏羲后端验收：使用临时 SQLite/repos/uploads 和全部 `21` 个 MCP 工具上传真实 SkyUI ZIP；版本历史、README、分享预览、项目读取、协作和结构化错误均 verified，临时目录已清理。
- 技能 commits：`6170b33`、`89ad30f`。

遗留但不阻断：
- Vite 提示主 JS chunk 大于 `500 kB`，后续按页面拆分和按需加载优化。
- 浏览器移动视口重载被本地 URL 安全策略拦截，响应式 CSS 已存在，但移动截图验收尚未完成。

验收标准：
- `sky-ui-docs` 测试全绿。
- 最小 SkyUI 原型 build、`validate_project`、`pack_project`、`validate_zip` 全绿。
- 在隔离伏羲后端上传后页面非白屏、无 404，核心交互可用。

计划 commit：
- `fix(skyui): 对齐文档查询安装策略与测试`
- `feat(skyui): 接入组件知识并打通伏羲原型闭环`

### 阶段 10：Tiangong 规范解耦与多实现验证

状态：`in-progress`

目标：
- Tiangong 只描述设计语义，同一规范可以由 SkyUI 或 Element Plus 实现。

任务：
- 从 Tiangong 中抽离 Element Plus 专属组件名、样式实现和弹窗 API。
- 保留视觉、布局、交互、原型说明系统和内容规则作为稳定规范。
- 新增 `vue3-skyui` 与兼容 `vue3-element-plus` profile。
- 更新元数据契约与选择规则，默认 profile 切换必须有兼容说明。

已完成：
- Tiangong `SKILL.md` 从 `227` 行收缩为 `51` 行的组件无关入口，只保留 metadata、profile 选择、渐进式引用和稳定设计合同。
- 通用颜色、布局、交互和原型说明 references 已移除 `el-*` 选择器与组件 API。
- 原有 Element Plus 组件模式和 `828` 行说明系统实现完整迁入 `vue3-element-plus` / `prototype-annotation-element-plus` 专属 profile，保留既有兼容知识。
- 新增 `vue3-skyui` profile，映射 Button/Input/Form/Table/Modal/Icon，并明确文档查询、字体资源和相对构建要求。
- 元数据合同新增 `supported_profiles` / `preferred_profile`；一次生成必须只选择一个 profile，默认新 Fuxi 原型为 `vue3-skyui`，既有项目更新保持原 profile。
- 单一入口 Skill 的 Tiangong 副本同步表格、动作栏、响应式和原型说明语义，不引入 Element Plus 名称。

验收证据：
- Tiangong 与 `fuxi-skyui-prototype` 均通过 `skill-creator/scripts/quick_validate.py` 官方校验。
- 通用 references 耦合扫描无 `<el-*`、`.el-*`、`el-table`、`el-dialog` 或 `el-drawer`；主入口只在 profile 选择说明中出现 Element Plus 名称。
- 所有主入口到一层 references 的链接存在；`git diff --check` 和 UTF-8 字节卫生通过。
- 技能 commits：`b9de8f8`、`7fea899`。

待完成：
- 用同一页面需求生成一个 `vue3-skyui` 和一个 `vue3-element-plus` 产物，分别执行 build、Fuxi adapter 校验和桌面/移动布局对照。
- 输出 profile 迁移说明，明确旧 Tiangong 默认 Element Plus 项目不会因新默认值被静默迁移。

验收方法：
1. 冻结一份组件无关的验收需求，至少包含侧栏与页签、筛选区、紧凑表格、状态展示、新增/编辑弹窗、校验/空态/加载态、原型说明和窄屏适配；两次生成只能改变 `runtime_profile`。
2. 分别生成 `vue3-skyui` 与 `vue3-element-plus` 两个独立目录；根 README 必须记录相同的 `prototype_spec: tiangong` 和各自唯一的 `runtime_profile`。
3. 执行依赖隔离扫描：SkyUI 产物不得依赖或引用 Element Plus，Element Plus 产物不得依赖或引用 SkyUI；共享设计 references 不得出现任一组件库 API。
4. 两个产物分别执行类型检查和生产 build；然后通过同一个 MCP `validate_project -> pack_project -> validate_zip` 链路，要求 `ok: true`、入口和 README 存在、无禁止文件、静态资源使用相对路径。
5. 在隔离伏羲后端各创建一个全新原型并上传 ZIP，回读 prototype ID、版本、入口、README 和预览 URL；不得使用生产既有 prototype ID。
6. 在 `1440x900` 与 `390x844` 两个视口对照验收，操作筛选、页签、表格、新增/编辑弹窗和原型说明；要求无白屏/404/控制台错误、无控件重叠、无 body 横向溢出，关键操作在窄屏仍可达。
7. 使用语义清单比较信息架构、字段、状态、操作、校验和交互结果。允许组件 DOM/类名不同，不允许业务语义或设计层级因 profile 改变。
8. 补迁移说明并执行旧项目更新演练：README 已是 `vue3-element-plus` 时继续使用 Element Plus，除非用户明确批准迁移。以上门禁全部通过后阶段 10 才能标记 `done`。

验收标准：
- 同一页面需求可分别生成 SkyUI 和 Element Plus 原型。
- 两个产物表达相同设计意图，且都通过同一个 `fuxi-adapter`。
- 既有 Tiangong 使用方式有迁移说明，不静默破坏旧调用。

计划 commit：
- `feat(规范): 解耦天宫设计语义与组件实现`
- `feat(规范): 增加SkyUI与Element Plus双实现配置`

### 阶段 11：MCP 安全编排与更新保护

状态：`todo`

目标：
- 单一 Skill 能可靠创建、更新和回读伏羲原型，同时保护已有数据。

任务：
- 建立 `create`、`update`、`project-bound update` 三条显式状态机。
- 更新前后校验 prototype ID、版本、入口、README、预览和 `affectedScope`。
- 补充幂等、目标不唯一、并发签出、token 过期和部分失败测试。
- 默认屏蔽删除、回滚、恢复和强制释放；用户明确请求时才进入二次确认。

验收标准：
- 新建不会改动任何已有原型。
- 更新只影响指定 prototype ID，并生成可追踪的新版本。
- 认证、构建、上传或回读失败时返回真实失败阶段，不产生虚假成功。

计划 commit：
- `feat(mcp): 建立原型创建更新与回读安全编排`

### 阶段 12：一键接入 Skill 与 MCP

状态：`todo`

目标：
- 用户在伏羲页面点击一次、向 AI 助手发送一次提示词，即可完成日常使用前的接入。

任务：
- 升级“接入平台 MCP”提示词，同时安装单一 Skill、配置 MCP、验证 `check_connection`。
- 按 AI 客户端能力生成可适配的安装步骤，不假定所有客户端使用同一种 JSON 路径。
- 在提示词中使用短期 token，并明确过期与重新生成流程。
- 研究并增加接入状态/最近验证时间展示，若无法可靠探测则保持为可选项。

验收标准：
- 支持的 AI 客户端无需用户手工编辑配置文件。
- 接入完成后，用户只需调用 `fuxi-skyui-prototype`。
- 安装失败、权限拒绝或 token 过期都有明确恢复路径。

计划 commit：
- `feat(接入): 支持一键安装原型Skill与伏羲MCP`

### 阶段 13：生产兼容、发布与知识收口

状态：`todo`

目标：
- 在不影响已有原型的前提下完成真实生产验收，并让文档、代码和运行状态一致。

任务：
- 写入前重新执行生产只读基线和可获得的数据库/仓库备份。
- 仅创建全新命名的 SkyUI 验收原型，验证生成、上传、更新、README、版本和预览。
- 抽样回读所有既有 prototype ID，证明无删除、无覆盖、无绑定漂移。
- 单独修复并验收分享短链访客预览 `401`，不与 Skill 主线混在同一 commit。
- 更新 README、操作手册、本文档和遗留风险；完成 Git hygiene 与可回退检查。

验收标准：
- 新 SkyUI 原型在生产可预览、可更新，旧版本仍可追踪。
- 既有原型集合和关键元数据保持兼容。
- 分享短链使用访客身份可打开；若仍失败，阶段保持 `blocked` 或风险明确，不伪造通过。

计划 commit：
- `fix(兼容): 修复分享短链访客预览授权`
- `feat(验收): 完成SkyUI原型体系生产兼容验收`
- `feat(docs): 收口伏羲原型体系文档与交付证据`

## Commit 规划原则

- 一个阶段可以包含多个 commit，但一个 commit 只承担一个可独立解释和回退的目的。
- 平台代码、技能代码、生产兼容修复和文档收口分开提交；跨项目使用各自仓库 commit，不做伪原子提交。
- 每个 commit 前按风险执行对应验证：Skill 测试、原型 build、MCP 集成测试、前端 build、文档链接与 `git diff --check`。
- commit body 记录“现状/根因 -> 改法”和关键验收；使用仓库约定的 `Co-Authored-By: Codex <noreply@openai.com>`。
- 不把工作区中与当前阶段无关的既有改动加入提交；push 到远端前必须由用户确认。

## 当前工作区事实

截至 2026-08-11：

- `FuxiPlatform` 当前分支：`feature/project-collaboration`。
- 平台历史清理、MCP 核心和首页接入入口已分别提交为 `4faa993`、`5bfef47`、`226d048`；没有推送远端，也没有连接生产环境执行写入。
- 本文档位于 `docs/MCP_SKILLS_EVOLUTION_JOURNEY.md`，由 `.gitignore` 明确放行并作为体系持续事实入口。
- 技能包目录已重构为：
  - `AGENTS.md`
  - `SKILLS-README.md`
  - `fuxi-adapter/`
  - `prototype-specs/tiangong/`
  - `prototype-specs/static-html/`
- `prototype-manager-skills` 已是独立 Git 仓库，当前分支 `master`，最新 commit 为 `7fea899`，尚未配置远端。
- `sky-ui-docs` 的确定性 Node CLI 已内置到单一入口 Skill；外部 GitLab 项目仍是上游来源。

## 更新规则

每完成一个阶段，必须更新：

- 阶段状态。
- 已完成事项。
- 验收证据，优先写命令或可复核结果。
- 遗留风险和下一阶段入口。

不要把“代码已写”单独当作完成。只有对应验收证据也完成后，阶段才能标记为 `done`。
