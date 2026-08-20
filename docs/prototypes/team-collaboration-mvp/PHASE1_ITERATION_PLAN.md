# 团队协同模块第一阶段迭代计划

> **历史计划说明（2026-08-20）**：GitLab 真实验收不再是当前 MVP 门禁。当前实施入口已切换为 [无 Git 轻协作 MVP](../lightweight-collaboration-mvp/DESIGN_SUMMARY.md)；本文保留第一阶段底座的实现与验收记录。

> 基线日期：2026-08-14<br>
> 设计依据：[FULL_DESIGN.md](./FULL_DESIGN.md)<br>
> 当前分支：`feature/project-collaboration`<br>
> 阶段状态：代码完成，本地自动化验收完成，真实 GitLab 环境验收待配置<br>
> 阶段目标：建立可信的协同领域底座，不提前实现 Agent handoff 和业务界面。

## 1. 第一性原理优先级

协同模块第一阶段只解决一个问题：**在不破坏现有原型数据和功能的前提下，让后续 Agent 修改拥有唯一权限判定、唯一仓库抽象和可证明幂等的事件底座。**

由此得到四条优先级原则：

1. 先保护不可逆风险：旧数据、权限越界、`main` 直推、重复事件。
2. 先建立唯一事实入口：数据库迁移、`AuthorizationService`、`GitProvider`。
3. 先让失败可验证：错误码、审计、Provider 回读、自动化测试。
4. 不实现第一阶段退出条件之外的能力：页面、handoff、构建 Worker、MR 审核和版本发布全部延后。

## 2. Kano 模型

| 能力 | Kano 分类 | 为什么 | 第一阶段处理 |
|---|---|---|---|
| 增量迁移且保留旧数据 | 基本型 | 数据一旦破坏，所有新能力失去意义 | 必须完成并做旧库兼容测试 |
| 固定角色和统一授权入口 | 基本型 | 权限散落会产生绕过路径 | 必须完成，Web/MCP/后台可复用 |
| 私有仓库与 `main` 保护 | 基本型 | 没有它就不是受控协同 | 必须完成 Provider 能力和请求级测试 |
| Webhook 去重 | 基本型 | GitLab 至少一次投递会重复推进状态 | 必须用唯一约束和重复事件测试证明 |
| 审计脱敏 | 基本型 | 无法追责或泄漏凭据都不可接受 | 必须完成最小审计存取层 |
| Provider 健康检查 | 期望型 | 越准确，故障定位和上线把握越高 | 完成版本/namespace 探测和结构化结果 |
| 事务与单次持久化 | 期望型 | 降低 sql.js 多表写入中间态 | 完成新领域事务入口；旧服务渐进迁移 |
| 统一错误码 | 期望型 | 降低后续 Web/MCP 接入成本 | Provider/授权底座统一提供 |
| 页面和实时状态 | 魅力型 | 能提升感知，但不增加底座可信度 | 不做 |
| 自动冲突建议 | 魅力型且违背约束 | 会诱导平台猜测合并 | 明确禁止 |
| 自定义权限编排 | 反向型 | 增加管理员认知负担并破坏固定规则 | 明确不做 |

## 3. 优先级结论

| 优先级 | 交付项 | 阻断关系 |
|---:|---|---|
| P0 | 数据库增量迁移、事务入口 | 阻断所有后续领域写入 |
| P0 | `AuthorizationService` 固定权限 | 阻断仓库供应和后续 handoff |
| P0 | `GitProvider` / `GitLabProvider`、私有仓库、`main` 保护 | 阻断真实协同 |
| P0 | Webhook 幂等、审计脱敏 | 阻断事件驱动状态同步 |
| P1 | 健康检查、错误映射、请求模拟集成测试 | 阻断第一阶段本地签收 |
| P2 | Agent handoff 和界面 | 进入第二阶段后处理 |

## 4. 迭代批次

### I0：设计冻结与计划基线

范围：

- 固化交互原型、设计摘要和全量详细设计；
- 固化 Kano 优先级和 commit 边界；
- 明确真实 GitLab 与 Build Worker 是真实环境门禁。

退出条件：

- 设计包校验通过；
- 第一阶段没有未决产品根决策；
- 实施顺序和不做范围明确。

### I1：数据迁移与固定权限

范围：

- 增加协同字段和目标领域表；
- 增加迁移版本记录；
- 增加新领域事务入口，成功只持久化一次；
- 实现 `AuthorizationService.can/assertCan`；
- 兼容旧的 `owner/editor/viewer`，新协作语义收敛为平台管理员/项目管理员/项目成员。

测试：

- 空库初始化；
- 旧表数据保留和新增字段默认值；
- 重复初始化幂等；
- 固定权限矩阵；
- Agent scope 不超过委托用户且无治理权。

退出条件：

- 迁移可重复执行且不丢旧数据；
- 所有设计动作得到唯一授权结果；
- 未授权操作抛出稳定错误码。

### I2：Git Provider 与仓库保护

范围：

- 定义与 GitLab 无关的 `GitProvider` 接口；
- 实现 GitLab REST 客户端、健康检查和 namespace 校验；
- 幂等供应私有仓库并初始化 `main`；
- 显式配置 `allowed_to_push: No one`、`allowed_to_merge: Maintainer`、禁止 force push；
- 将 Provider 身份写回原型协同字段；
- 认证信息仅来自环境变量或构造注入，不进入数据库、日志和错误消息。

测试：

- 模拟 GitLab HTTP 请求的路径、方法、body 和认证头；
- 已存在仓库返回同一身份；
- 保护分支已存在时回读并校验；
- API 错误不泄漏 token；
- 仓库不是 private 或 `main` 允许 push 时拒绝签收。

退出条件：

- Fake/HTTP 模拟环境能供应私有仓库；
- `main` 保护配置被回读为禁止直推和 force push；
- 未配置真实 GitLab 时返回明确的 `GIT_PROVIDER_NOT_CONFIGURED`。

### I3：Webhook 幂等与审计

范围：

- 以 `provider + event_id` 唯一约束登记事件；
- 保存稳定 payload digest，不把 payload 全量落库；
- 支持 received/processing/processed/failed 状态；
- 重复投递返回同一事件，不重复执行处理器；
- 审计 metadata 递归移除 token、secret、password、authorization、源码和完整提示词字段。

测试：

- 相同事件并行/重复登记只有一行；
- 重放不重复调用处理器；
- 失败可重试并保留脱敏错误；
- 审计记录同时支持人类 actor 和 delegated session；
- metadata 中敏感键和超长值被清除或截断。

退出条件：

- 重复事件幂等；
- 审计不含敏感原文；
- 处理失败不会伪造成功。

### I4：第一阶段总体验收

范围：

- 运行后端测试脚本；
- 运行 MCP 集成回归和前端构建，确认底座改动没有破坏既有能力；
- 执行 `git diff --check`、UTF-8/BOM/final-LF 和工作区残留检查；
- 记录本地证据与真实环境待验项。

退出条件：

- 本地自动化门禁全绿；
- 真实 GitLab 验收步骤可执行但不以 mock 结果冒充；
- 下一阶段只依赖 GitLab 实例配置和 Agent handoff 业务实现。

## 5. Commit 计划

测试跟随对应功能提交，不创建“最后补测试”的独立尾包。

| 顺序 | Commit | 内容 |
|---:|---|---|
| C0 | `feat(协同): 冻结MVP设计与第一阶段迭代计划` | 原型、全量设计、计划、docs allowlist |
| C1 | `feat(协同): 建立领域迁移与固定权限底座` | schema、事务、AuthorizationService、测试 |
| C2 | `feat(协同): 接入GitLab仓库供应与main保护` | Provider、GitLab 适配、供应服务、测试 |
| C3 | `feat(协同): 增加Webhook幂等与脱敏审计` | 事件/审计服务、测试脚本、回归门禁 |
| C4 | `feat(协同): 完成第一阶段集成验收` | 真实存取层纵向测试、本计划实绩、测试结果、真实环境待验项 |

所有 commit 使用仓库约定 author 和 `Co-Authored-By: Codex <noreply@openai.com>`；不推送，等待用户确认后才推送 `zoesoftgitlab/develop`。

## 6. 当前事实与验收边界

已确认事实：

- 当前代码尚无协同领域表、统一 AuthorizationService 或 GitLab Provider；
- 现有项目权限分散在路由中，角色为 `owner/editor/viewer`；
- 当前数据库是 sql.js，写入后导出整个数据库文件；
- 当前环境没有配置任何 `GITLAB_*` 变量；
- Node.js 运行时满足内置 `fetch` 和 `node:test`。

因此第一阶段可以完成代码、数据库和模拟 HTTP 集成验收，但以下结论必须在真实环境补证：

- 内网 GitLab 的实际版本、license 和可用 API；
- Group Access Token 的 namespace 权限；
- 真实仓库直接 push `main` 被 GitLab 拒绝；
- 真实 Webhook 的签名能力和事件头字段。

官方实现依据：

- [Projects API](https://docs.gitlab.com/api/projects/)
- [Protected branches API](https://docs.gitlab.com/api/protected_branches/)
- [Project webhooks API](https://docs.gitlab.com/api/project_webhooks/)
- [Metadata API](https://docs.gitlab.com/api/metadata/)

## 7. 第一阶段完成记录

| 批次 | 状态 | Commit | 证据 |
|---|---|---|---|
| I0 | 完成 | `52fdc2e` | 设计包严格校验 0 error / 0 warning |
| I1 | 完成 | `925f373` | 6 项迁移、事务、串行写和权限测试通过 |
| I2 | 本地完成 | `3048ec9` | 模拟官方 GitLab API 请求、仓库供应和 main 保护；累计 14 项测试通过 |
| I3 | 完成 | `82efc7d` | HMAC/legacy secret、重放幂等、失败重试、脱敏审计和 HTTP raw-body 回归；累计 22 项测试通过 |
| I4 | 完成 | 本提交 | 真实 sql.js 存取层纵向切片；后端 23/23、MCP check/integration、前端 build、设计包与卫生门禁通过 |

## 8. 第一阶段验收结论

### 已完成

- 旧数据库可增量升级，旧项目、原型和版本数据保留；迁移重复执行幂等。
- 新协同领域具备事务写和异步串行写入口。
- 固定权限规则统一进入 `AuthorizationService`；Agent 权限是用户权限与 delegated scope 的交集，且无治理权。
- GitLab 细节被封装在 `GitProvider` 边界内；业务层不接触 token 和 GitLab 专有认证字段。
- 仓库供应强制 `private + main`，分支保护强制 `allowed_to_push: No one`、Maintainer 合并和禁止 force push。
- Provider 健康检查和仓库供应拥有服务端 API，未配置时 fail closed。
- Webhook 支持 GitLab 19+ HMAC-SHA256 和旧版 secret 两种验证路径，均要求稳定事件 ID 和时间窗口。
- `provider + event_id` 唯一约束承担重放幂等；失败事件可重试，processed 事件不重复调用处理器。
- 审计 metadata 递归移除凭据、源码和完整提示词类字段，限制深度、键数量和字符串长度。
- npm 测试脚本已固化，测试与对应功能同 commit 交付。

### 本地证据

- `backend/npm test`：23 tests，23 pass，0 fail。
- `frontend/npm run build`：成功，1686 modules transformed；存在既有单 chunk > 500 kB 警告，不阻断本阶段。
- `mcp-server/npm run check`：通过。
- `mcp-server/npm run test:integration`：通过，22 个 MCP tools 与既有协作/会话/交付路径均返回 verified。
- 设计包校验：0 error / 0 warning。

### 真实环境门禁

当前环境没有配置 `GITLAB_BASE_URL`、`GITLAB_TOKEN`、`GITLAB_NAMESPACE_ID` 或 Webhook secret/signing token，因此以下项目不能用本地测试替代：

1. 读取内网 GitLab 实际版本、edition、namespace 和 token scope；
2. 创建真实临时 private project；
3. 使用非服务账号执行 `git push origin main` 并确认 GitLab 拒绝；
4. 触发真实 Push/MR Webhook，确认实例提供的 ID、timestamp 和签名头；
5. 删除真实临时 project，确认无残留。

结论：**第一阶段代码和本地自动化验收完成；真实 GitLab 接受性验收处于外部配置门禁，不能声明已完成。**
