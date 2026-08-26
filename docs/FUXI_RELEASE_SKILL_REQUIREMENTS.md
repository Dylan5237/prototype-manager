# 伏羲测试与正式环境发布 Skill 需求文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | 伏羲测试与正式环境发布 Skill 需求文档 |
| 文档版本 | v0.1 |
| 编写依据 | 2026-08-26 伏羲管理员使用统计 v1.0 正式发布复盘 |
| 适用范围 | 伏羲平台测试环境 `16077`、正式环境 `16088` |
| 目标 | 将构建、测试部署、正式发布、业务验收、回滚和证据记录固化为可重复执行的发布流程 |
| 当前状态 | 需求阶段，尚未实现为独立 Skill |

## 2. 背景与问题

本次正式部署最终成功，但过程中暴露出多个依赖人工判断和脚本一致性的问题：

- 测试包和正式包存在 lightweight/full profile 区分，容易误用不完整包。
- 生产凭证没有天然暴露给执行进程，需要临时处理。
- 生产基线的绝对路径与旧 PowerShell 脚本不兼容。
- PowerShell `$LASTEXITCODE` 和 `$?` 的语义差异导致成功结果被误判失败。
- UTC 时间被按本地时间重复解析，刚采集的基线被误判为过期。
- PuTTY `plink` 和 `pscp` 对 host key 的参数格式要求不同。
- 本机维护脚本与仓库发布脚本存在 Skill 入口目录漂移。
- 生产切换成功后，旧验收脚本仍检查旧 Skill 目录，导致验收误报失败。
- 远程前置检查失败后留下了未切换的候选 release，需要人工判断是否保留和清理。
- health 200 只能证明服务存活，不能证明管理员统计、MCP、Skill、预览和分享链路可用。

因此，本 Skill 的目标不是封装几条上传命令，而是建立一个有状态、有证据、可恢复、可审计的发布状态机。

## 3. 产品目标

### 3.1 必须达成

1. 测试环境和正式环境严格隔离。
2. 测试环境先验证，正式环境后发布。
3. 测试和正式环境尽可能使用同一个 immutable release 包。
4. 正式写入前必须有新鲜基线和文件级备份。
5. 正式发布后必须验证真实业务路径，而不是只验证健康检查。
6. 任何失败都要明确说明失败阶段、影响范围和是否发生正式写入。
7. 失败重试不能覆盖失败现场，也不能盲目重复执行状态变更。
8. 所有发布结果都能通过 release、backup、commit、hash 和验收报告回溯。

### 3.2 不在目标范围内

- 不替代 GitLab/GitHub 的代码评审和合并流程。
- 不自动删除生产原型、备份、失败 release 或验收原型。
- 不绕过用户对正式发布和回滚的确认。
- 不将平台业务数据复制到第三方服务。
- 不把 health 200 当作完整发布验收。

## 4. 发布状态机

Skill 必须维护并输出明确状态，不允许只输出“成功/失败”：

```text
INSPECTION
  -> PACKAGE_READY
  -> TEST_DEPLOYED
  -> TEST_VERIFIED
  -> PRODUCTION_BASELINE_READY
  -> PRODUCTION_APPROVED
  -> UPLOADED
  -> BACKUP_COMPLETED
  -> SWITCHED
  -> LIVE_VERIFIED
```

异常状态：

```text
PACKAGE_FAILED
TEST_FAILED
BASELINE_FAILED
BACKUP_FAILED
UPLOAD_FAILED
SWITCH_FAILED
VERIFICATION_PENDING
ROLLBACK_REQUIRED
ROLLBACK_COMPLETED
```

每个状态必须记录：

- 开始时间和结束时间，统一使用 UTC。
- 执行命令或脚本版本。
- release ID。
- 平台 commit 和 Skill commit。
- 结果摘要。
- 是否发生远程写入。
- 失败时的恢复建议。

## 5. 环境与拓扑需求

### 5.1 测试环境

- 入口：`http://192.168.2.145:16077`
- 独立后端端口、PM2 应用和 Nginx 配置。
- 独立数据目录、原型仓库和上传目录。
- 允许使用过滤后的测试数据。
- 不得修改正式环境的数据库、原型、PM2 或 Nginx。

### 5.2 正式环境

- 入口：`http://192.168.2.145:16088`
- PM2 应用：`fuxi-backend`
- 正式 release 使用不可变目录。
- 持久化数据与 release 代码分离。
- 正式环境使用 pinned SSH host key。
- 禁止调用旧的原地更新脚本。

### 5.3 拓扑自检

每次执行前必须检查：

- 目标环境是否为预期端口。
- 当前 PM2 应用是否为预期应用。
- Nginx 是否指向预期入口。
- release 根目录和 backup 根目录是否存在。
- 当前 release 指针是否可读。
- 远端磁盘空间是否足够。
- SSH host key 是否匹配。

## 6. 凭证管理需求

### 6.1 本机配置

支持类似 GitLab 操作的专用本机配置文件：

```env
FUXI_SSH_PASSWORD=...
FUXI_USERNAME=...
FUXI_PASSWORD=...
```

建议固定在当前用户的 Fuxi Skill 目录下，不放进仓库。

### 6.2 安全要求

- 配置文件不提交 Git。
- 配置文件不进入 release archive。
- 检查 ACL，拒绝 `Everyone`、`Users` 等过宽权限。
- 只读取允许的键名。
- 禁止将配置内容打印到日志。
- 凭证只注入当前子进程。
- 流程完成后自动清除环境变量。
- 缺少凭证或配置格式错误时 fail-closed。

### 6.3 凭证生命周期

```text
检查配置 -> 读取到进程 -> 执行流程 -> 清除进程变量 -> 输出脱敏结果
```

不允许通过聊天消息传递密码，也不允许在命令历史中写入明文密码。

## 7. 发布源和版本需求

### 7.1 发布源

发布前必须明确：

- 平台仓库路径。
- Skill 仓库路径。
- 平台分支。
- Skill 分支。
- 两个仓库的 commit。
- 是否为正式允许的来源分支。

默认应使用正式发布来源。若使用本地 feature 分支，必须在报告中标注为“例外发布”，并要求额外确认。

### 7.2 工作区检查

- 代码仓库工作区必须干净，或明确列出允许的未提交文件。
- 不得将无关文件打入 release。
- 不得通过 reset、clean、checkout 强行覆盖用户改动。
- 发布包必须从已确认的 commit 构建。

### 7.3 同包晋级

测试验收通过的 release 应直接晋级正式环境。

如果测试后重新构建：

- release ID 变化时，默认视为新候选。
- 必须重新部署或重新验证测试环境。
- 只有明确标记为“仅发布工具修复”的变更，才允许走例外路径。

## 8. 构建与打包需求

### 8.1 测试构建

至少执行：

- 前端生产构建。
- 后端测试。
- MCP `node --check`。
- MCP 集成测试。
- Skill 入口和资源检查。

### 8.2 正式构建

正式发布必须使用 full profile，不得使用 lightweight profile。

正式包必须生成：

- `manifest.json`
- release ID
- platform commit
- Skill commit
- profile
- archive SHA-256
- 验证项列表

### 8.3 包结构契约

必须验证：

- `platform/backend/server.js`
- `platform/frontend/dist/index.html`
- `platform/mcp-server/src/server.js`
- `skills/fuxi-prototype/SKILL.md`
- `manifest.json`

禁止包含：

- `.git`
- `node_modules`
- 测试目录
- 日志
- `.env`
- 凭证文件
- `.npmrc`

## 9. 测试环境部署需求

### 9.1 测试部署命令

必须有单独的测试部署入口，例如：

```text
deploy-test
```

并要求确认口令：

```text
DEPLOY_FUXI_TEST
```

### 9.2 测试部署过程

1. 校验目标为 `16077`。
2. 校验 release archive 和 SHA-256。
3. 采集测试环境当前状态。
4. 创建测试备份。
5. 上传 immutable archive。
6. 远程解包和安装依赖。
7. 切换测试 release。
8. 重启测试 PM2。
9. 验证 health、Nginx 和业务 API。
10. 输出测试 release、backup 和状态。

### 9.3 测试验收

至少验证：

- 管理员登录。
- 管理员统计页面。
- 认证前业务接口 `401`。
- 认证后业务接口 `200`。
- 真实统计摘要字段。
- 行为事件记录。
- 当前前端关键文案。
- 旧文案确实消失。
- 统计接口不是模拟数据。

## 10. 正式发布前置需求

### 10.1 只读基线

必须采集：

- 当前 release。
- PM2 PID 和状态。
- 全部原型 ID 和关键元数据。
- 项目列表。
- 项目绑定。
- 成员。
- 签出状态。
- 当前持久化目录状态。

基线要求：

- 使用明确 UTC 时间。
- 创建时间距部署不超过 1 小时。
- 原型总数等于实际记录数。
- JSON 文件可读取。

### 10.2 文件级备份

生产写入前必须备份：

- `app.db`
- `repos`
- `uploads`
- backend env
- 当前 release 指针
- previous release 指针
- 关键配置和校验值

备份必须检查非空、SQLite 可读和 SHA-256。

### 10.3 正式确认

正式发布前必须得到当前会话的明确确认口令：

```text
DEPLOY_FUXI_PRODUCTION
```

确认信息必须明确说明：

- 目标环境。
- release ID。
- 平台和 Skill commit。
- 备份 ID。
- 是否重启 PM2。
- 失败后的恢复方式。
- 是否创建验收原型。

## 11. 正式部署需求

### 11.1 上传阶段

- 固定 host key。
- 兼容当前 PuTTY 版本的 `plink` 和 `pscp` 参数格式。
- 上传 archive、远程部署脚本和 baseline。
- 上传后远端重新计算 SHA-256。
- 校验 archive 文件名、manifest 和 release ID。

### 11.2 远端前置检查

切换前检查：

- 当前生产项目存在。
- 新 release ID 不存在。
- baseline 有效且未过期。
- 数据库存在。
- 持久化目录存在。
- 磁盘空间足够。
- 后端、前端、MCP、Skill 入口存在。

### 11.3 切换阶段

- 使用发布锁防止并发。
- 创建新的 release 目录。
- 先创建文件级备份。
- 安装依赖。
- 建立 shared 目录链接。
- 切换 current/project 指针。
- 重启 PM2。
- 验证本机健康和 Nginx 健康。

## 12. 正式发布后验收需求

### 12.1 基础运行

- `/api/health` 返回 200。
- Nginx 返回 200。
- PM2 在线。
- 当前 release 指针正确。
- 前端 hash 资源对应候选版本。

### 12.2 权限和业务接口

- 未登录 bootstrap 返回 401。
- 管理员认证 bootstrap 返回 200。
- 未登录管理员统计接口返回 401。
- 管理员认证后统计接口返回 200。
- 返回真实 `summary`、`trend`、`funnel`、`retention` 和行为分布结构。

### 12.3 Skill/MCP 分发

- Skill ZIP 下载 200。
- MCP ZIP 下载 200。
- ZIP 入口正确。
- ZIP 不包含禁止项。
- bootstrap prompt 包含 `check_connection` 和 `deliver_project`。
- prompt 不包含长期凭证。

### 12.4 新原型验收

必须使用单独命名的验收原型，不得修改已有业务原型：

1. `check_connection`
2. `pack_project`
3. `deliver_project(create)`
4. `get_prototype`
5. `get_readme`
6. `deliver_project(update)`
7. `get_preview_url`
8. 分享跳转 302
9. 访客预览 200

## 13. 数据兼容与零漂移需求

发布前后必须自动比较：

- 旧原型 ID 是否全部保留。
- 名称是否一致。
- 描述是否一致。
- 入口是否一致。
- Owner 是否一致。
- 版本是否一致。
- 项目数量是否一致。
- 项目绑定是否一致。
- 成员和签出状态是否一致。

除明确的验收原型外，不得存在其他新增原型。

## 14. 失败处理需求

### 14.1 分类处理

每个失败必须标记阶段：

- 构建失败。
- 打包失败。
- 基线失败。
- 备份失败。
- 上传失败。
- 解包失败。
- Skill/MCP 入口失败。
- PM2 启动失败。
- Health 失败。
- 业务验收失败。
- 数据零漂移失败。

### 14.2 禁止盲目重试

重试前必须：

- 读取上一次状态。
- 确认是否已经上传。
- 确认是否已经备份。
- 确认是否已经切换。
- 确认 release 目录是否已存在。
- 判断是否应该使用新 release ID。

### 14.3 回滚

回滚必须单独确认：

```text
ROLLBACK_FUXI_PRODUCTION
```

回滚需要支持：

- 指定 backup ID。
- 恢复 release 指针。
- 可选恢复数据。
- 重启 PM2。
- 回滚后再次验证 health、业务接口和前端资源。

## 15. 清理需求

清理不是发布的默认后置动作，必须独立确认。

清理前生成预览，包含：

- 失败 release。
- `/tmp` 临时文件。
- 旧备份。
- 本地 archive。
- baseline 文件。
- 验收原型。

默认策略：

- 失败 release 保留。
- 生产备份保留。
- 验收原型保留。
- 失败现场不自动删除。

## 16. 证据与报告需求

每次发布必须生成机器可读和人类可读两类结果。

### 16.1 机器可读结果

至少包含：

- 状态。
- release ID。
- backup ID。
- platform commit。
- Skill commit。
- archive SHA-256。
- baseline 路径。
- 测试结果。
- 生产结果。
- 验收结果。
- 回滚命令。
- 是否存在待清理对象。

### 16.2 人类报告

报告必须回答：

1. 发布了什么。
2. 发布到哪里。
3. 是否备份。
4. 是否切换成功。
5. 真实业务是否通过。
6. 旧数据是否零漂移。
7. 失败时是否写入生产。
8. 仍有哪些 warning、pending 和待确认清理项。

禁止只输出：

```text
health=200
deployment=complete
```

## 17. Skill 自身的验收标准

必须通过自动化或隔离环境验证：

- 缺少凭证时拒绝执行。
- 配置权限过宽时拒绝执行。
- archive hash 不匹配时拒绝执行。
- manifest 和文件名不匹配时拒绝执行。
- baseline 过期时拒绝执行。
- host key 不匹配时拒绝执行。
- 测试命令不能访问正式路径。
- 备份失败时不切换。
- PM2 启动失败时自动恢复。
- health 失败时自动恢复。
- 业务 API 验收失败时不误报成功。
- Skill 入口变化时能明确报错。
- 失败重试不会覆盖失败现场。
- 日志和报告不包含凭证。
- 正常结束后环境变量被清除。

## 18. 建议交付物

建议最终 Skill 至少包含：

```text
fuxi-platform-release/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── topology.md
│   ├── release-contract.md
│   ├── acceptance-contract.md
│   ├── credential-config.md
│   ├── failure-matrix.md
│   └── cleanup-policy.md
└── scripts/
    ├── probe-environment.ps1
    ├── build-release.ps1
    ├── deploy-test.ps1
    ├── verify-test.ps1
    ├── capture-production-baseline.ps1
    ├── deploy-production.ps1
    ├── verify-production.ps1
    ├── accept-production-mcp.ps1
    ├── rollback-production.ps1
    ├── cleanup-preview.ps1
    └── generate-release-report.ps1
```

## 19. MVP 优先级

### P0：第一版必须完成

- 测试/正式环境隔离。
- 专用凭证配置和清理。
- full release 构建和 SHA-256。
- 测试部署和验收。
- 生产基线和文件级备份。
- 正式发布确认门禁。
- host key 校验。
- PM2/Nginx 切换和失败恢复。
- 认证业务 API 验收。
- Skill/MCP 包验收。
- 旧数据零漂移。
- 新原型 MCP 验收。
- 机器可读发布报告。

### P1：第二版完成

- 失败状态自动恢复建议。
- 失败 release 清理预览。
- 发布前后差异报告。
- 发布结果写入项目演进文档。
- PuTTY/OpenSSH 工具版本自动探测。
- 失败注入测试。

### P2：后续增强

- GitLab 主分支自动拉取和构建。
- 多台服务器支持。
- 灰度发布。
- 自动发布通知。
- 发布历史查询和可视化。

## 20. 验收结论

当且仅当以下条件全部满足，Skill 才能输出 `LIVE_VERIFIED`：

- 测试环境已通过业务验收。
- 正式环境基线和备份有效。
- release 和 SHA-256 一致。
- 正式环境切换成功。
- PM2、Nginx、health 正常。
- 认证 bootstrap 和业务 API 正常。
- Skill/MCP 包正常。
- 新验收原型 create/update/preview/share 全部通过。
- 旧原型和项目状态零漂移。
- 凭证已清理。
- warning、pending 和待清理对象已经明确列出。

否则只能输出 `VERIFICATION_PENDING`、`ROLLBACK_REQUIRED` 或具体失败状态，不能输出正式发布完成。
