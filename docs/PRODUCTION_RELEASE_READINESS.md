# 伏羲平台 16088 正式发布前状态与核对清单

> 更新时间：2026-09-08 20:45（Asia/Shanghai）
>
> 用途：给控制面 / Release Agent 做发布前事实核对。本文区分“GitHub 已确认事实”和“需要本地 / GitLab / 16088 现场核对的事实”。
>
> 当前裁定：**NOT READY FOR 16088**。原因不是功能线本身未完成，而是 MCP onboarding 与项目管理 Task v2 两条已验收主线尚未汇合成一个唯一 Production RC。

---

## 1. GitHub 已确认事实

### 1.1 MCP onboarding 主线

当前 GitHub `main`：

- commit：`447f4e47c02748366e10109d0d49a14a4b90b8a5`
- 已包含：PR #15 + PR #18

已完成的用户侧变化：

1. 用户在“接入平台 MCP”时显式选择 Host：WorkBuddy / Cursor / Codex / 其它工具；Known Host 不再依赖 runtime auto detect。
2. WorkBuddy 走确定性 profile；Cursor 为兼容 profile；Codex 当前无确定性安装 profile；其它工具走发现/兼容模式，不自动安装。
3. Agent 正常路径收敛为：`Prompt → 1 次唯一 shell 入口 → onboarding/bootstrap 程序内部完成安装 → COMPLETE/FAILED`。
4. launcher 已移除巨型 Base64/eval 外壳，保留 Node<18 前置阻断、有限 retry、timeout、onboarding SHA-256、1 MiB 限制、`step=LOAD` structured error 与子进程错误透传。
5. 默认 Prompt 已精简，不再要求 Agent 预检查 Node、扫描目录、解码 launcher 或读取配置做二次确认。
6. 最近一次真实 WorkBuddy 验收：1 次 shell、1 次入口、无额外侦察、`COMPLETE`、程序 `totalMs=3881`；Host reload / trust 仍属于宿主交互边界。

这条线已完成开发与测试，后续不再继续优化 bootstrap/launcher 字符数，除非新的 Host 证据显示必要。

### 1.2 项目管理 Task v2 主线

当前 GitHub 特性分支：

- `feat/project-management-module`
- tip：`3225ea6b32e93390b25b0243eb329f499d14b5e4`
- 已包含平台 PR #12、前端 PR #13

冻结契约：

1. 无项目绑定：写路径 `prototype_direct_changes`，权威字段 `directChangeId`。
2. 有项目绑定：唯一主账本 Task v2，权威字段 `taskId + candidateId`。
3. legacy `prototype_changes` / bare `changeId` 写入禁止并 fail-closed；只保留兼容读取。
4. 项目审核主路径改为“正式版 vs 单一待审修订”，历史尝试折叠。
5. 每个 task 至多 1 条 `ready` 待审修订；新成功提交替换旧 ready。
6. 项目绑定的“让 AI 修改”改走 `/projects/:id/tasks`，不再写入 `/changes`。
7. MCP 已增加 Task v2 工具：`list_project_nodes`、`list_project_tasks`、`get_project_task`、`create_project_task`、`accept_project_task`、`submit_task_candidate`、`list_task_candidates`、`adopt_task_candidate`、`return_task_candidate`。
8. legacy MCP 写工具应返回 `LEGACY_CHANGEID_FORBIDDEN`。

项目总控台 #11 的阶段事实：

- 16077 项目管理切主 release：`20260908-161433-3225ea6b`
- 平台 tip：`3225ea6b`
- Skill develop tip：`802837259368319a307041ad11a6d66bfff922ff`
- 阶段状态：CLOSED / 用户验收通过 / runtime 冒烟 PASS（limited）
- residual：Task v2/LEGACY live probe、MCP × Skill 宿主核验；当时明确“16088 另开”。

### 1.3 两条线当前未汇合

GitHub 比较结果：

- `main@447f4e47`
- `feat/project-management-module@3225ea6b`
- 状态：**diverged**
- 项目管理分支相对 main：ahead 25 commits / behind 10 commits
- merge-base：`2cb0419cefda45e1c66f2210f377b4ad2df44b29`

两条线存在实质代码重叠，至少包括：

- `backend/database/db.js`
- `backend/routes/integrations.js`
- `backend/services/db-bootstrap-sessions.js`
- `backend/services/prompt-template-defaults.js`
- `backend/services/standalone-bootstrap.js`
- `frontend/src/components/McpOnboardingDialog.vue`
- `mcp-server/package.json`
- `mcp-server/src/bootstrap.js`
- `mcp-server/tests/bootstrap.test.js`
- `mcp-server/tests/integration.js`
- `mcp-server/tests/standalone-bootstrap.test.js`

因此正式发布前必须做**语义级 integration**，不能简单认为“合并无冲突 = 可以发布”。

### 1.4 当前 GitHub 侧非 blocker

以下问题不应阻塞 16088：

- Issue #17：Mock 预览与真实动态变量展示不一致。
- Issue #19：提示词模板已自定义时，“恢复默认”按钮因 `dirty` 判定错误被禁用。
- PR #14：旧的 evidence-only draft，内容中的 BLOCKED 已被后续 #13 修复与 16077 CLOSED 事实覆盖；建议后续标记 superseded/关闭，避免误导。

---

## 2. 操作员已报告、但需要控制面独立核对的事实

以下不是 GitHub 可独立证明的运行时事实，控制面 Agent 应从本地 / GitLab / 16077 / 16088 重新核对：

1. 最新 MCP onboarding 测试 release：`20260908-190712-447f4e47` 已部署到 16077。
2. 该 release 来自 GitLab `main` 新鲜构建；16077 health/page 200，未认证 bootstrap 401。
3. GitLab 平台 `main` 已同步 GitHub `main@447f4e47`。
4. 16088 在上述测试发布过程中未被触碰。
5. 当前本地工作区是否仍干净、各 worktree / branch 是否与远端一致。
6. GitLab 项目管理分支 / develop / main 的实际 commit 拓扑。
7. GitLab Skill `develop/main` 是否已包含 Task v2 `8028372`，以及是否同时包含 onboarding Skill 最新改动。
8. 16088 当前实际运行 release / platform commit / Skill commit / PM2 PID / symlink / manifest。

控制面不得根据本文把这些“待核对项”直接升级成生产事实。

---

## 3. 用户需要注意的正式版本行为变化

### MCP 接入

- 首次接入前需要先选择正在使用的 AI Host。
- WorkBuddy 为当前稳定/推荐路径；Cursor 为兼容路径；Codex 暂无确定性安装 profile；其它工具不会自动猜安装路径。
- 标准路径只有一个平台生成入口，不再要求 AI 自己下载 ZIP、拼 manifest、猜配置目录或做恢复编排。
- WorkBuddy 仍可能需要用户在宿主 UI 完成终端授权、自定义 MCP 信任、reload/restart；这属于 Host 行为，不是伏羲安装失败。
- Bootstrap `COMPLETE` 不等于 Host `READY`；reload 后仍需 `check_connection` / `tools/list` 验证。

### 项目管理 / AI 修改

- “项目内 AI 修改”从 legacy `changeId` 切到 Task v2 的 `taskId + candidateId`。
- “无项目的独立原型修改”继续使用 `directChangeId`，不应被 Task v2 影响。
- 项目审核 UI 改为“正式版 vs 唯一待审修订”，历史尝试不再作为主决策卡片并列。
- 旧项目写入型 MCP 工具应 fail-closed；不能期待旧 Agent 继续靠 legacy `changeId` 修改项目内原型。
- 平台与 `fuxi-prototype` Skill 必须同阶段对齐，否则可能出现“平台已切 Task v2、Skill 仍发旧 changeId”或反向不兼容。

---

## 4. 距离 16088 正式发布的剩余 Gate

### Gate A — 生产基线

控制面只读核对 16088：

- 当前 release ID
- 当前平台 commit
- 当前 Skill commit / package fingerprint
- PM2 app / PID
- Nginx 指向
- release symlink / manifest
- `/api/health`
- 当前原型 ID + 关键 metadata
- project bindings / active checkouts
- 生产数据目录、SQLite、repos、uploads 的真实落点

**产出：** production baseline；不执行部署写操作。

### Gate B — 双线汇合成唯一 RC

以最新 `main@447f4e47` 为 onboarding 基线，把项目管理 `3225ea6b` 的 Task v2 语义集成进最终候选，或采用等价但可审计的 integration 方式。

Integration review 必须明确证明同时保住：

- 显式 Host 选择
- WorkBuddy deterministic profile
- 最新 short launcher / Prompt
- session-specific onboarding
- Node guard / retry / SHA / structured error
- Task v2 `taskId + candidateId`
- `directChangeId`
- legacy 项目写 fail-closed
- 单一待审修订
- MCP Task v2 tool set

只解决集成，不新增产品功能。

### Gate C — Skill 双线对齐

核对并形成唯一 `fuxi-prototype` release candidate：

- 包含 Task v2 契约（锁定参考：`8028372`）
- 包含 onboarding 单入口/少思考约束的最新 Skill 改动
- 不保留会诱导 Agent 使用 legacy project `changeId` 写路径的标准指导

平台与 Skill 必须锁定成明确的一对 commits。

### Gate D — 完整自动化回归

对最终统一 RC 至少执行：

- backend full test
- frontend test + production build
- MCP syntax/check
- bootstrap tests
- auth concurrency
- remote update
- MCP integration
- Task v2 / directChange / legacy fail-closed adversarial tests
- `git diff --check`

任何一条线的旧测试通过不能替代“双线合并后”的新测试。

### Gate E — 统一 RC 再部署 16077

必须用**双线汇合后的同一个最终 RC**重新部署 16077。之前：

- `3225ea6b` 只证明项目管理线；
- `447f4e47` 只证明最新 onboarding 线。

它们都不能单独作为 16088 最终 RC 证据。

16077 人工验收至少：

1. WorkBuddy onboarding：1 shell → COMPLETE → reload → `check_connection` / `tools/list`。
2. Project Task v2：创建任务 → 接受 → AI 提交 → 单一待审 → adopt/return。
3. legacy project write：`LEGACY_CHANGEID_FORBIDDEN`。
4. standalone prototype：`directChangeId` 正常。
5. owner/admin/editor 权限边界。
6. 已有项目和已有原型可正常访问。
7. Task v2/LEGACY live probe。
8. MCP × Skill 宿主真实 E2E。

### Gate F — 生产数据兼容 / 迁移预演

Task v2 涉及 collaboration schema / candidate ledger 迁移。正式切换前必须在隔离副本或等价安全环境验证：

- 旧项目 bindings
- 旧 pending change / 历史 change
- legacy 唯一绑定迁移
- 多绑定历史不臆造关系
- 旧 artifact path
- candidate/task schema 初始化
- 二次启动幂等
- 不产生不可解释的数据漂移

### Gate G — 锁定 GitLab `main`

正式环境只允许从内网 GitLab 两个 `main` 新鲜构建：

- 平台 GitLab `main` = 最终 Integration RC commit
- Skill GitLab `main` = 最终 Skill RC commit

禁止从本地 feature branch、GitHub worktree 或 16077 当前目录直接打生产包。

### Gate H — 生产发布与验收

按 `ops/skills/fuxi-platform-release/PRODUCTION_RELEASE.md` 执行：

1. fresh production baseline（< 1h）
2. file-level backup + SQLite integrity
3. GitLab 双 main fresh clone
4. full build/check/integration
5. immutable release manifest + SHA-256
6. 人工 `DEPLOY_FUXI_PRODUCTION` gate
7. 切换 16088
8. health / agent-bootstrap / Skill ZIP / MCP ZIP
9. `check_connection`
10. `deliver_project` 新建并更新“仅用于本次发布”的验收原型
11. preview / share link
12. 发布前全部旧原型、项目绑定、checkout zero drift
13. 记录 release ID、platform commit、Skill commit、backup ID、rollback command

只有上述证据齐全才可标记 Production PASS。

---

## 5. 控制面 Agent 核对任务

控制面 Agent 有本地与 GitLab 访问能力，请**先核对，不要直接合并或发布**。

请回写以下事实：

1. 本地所有相关 worktree：路径、branch、HEAD、clean/dirty。
2. GitHub `main` 与 `feat/project-management-module` 的 commit 关系是否仍与本文一致。
3. GitLab 平台：`main` / `develop` / 项目管理相关分支的 HEAD。
4. GitLab Skill：`main` / `develop` HEAD；明确 `8028372` 是否已进入 main，以及 onboarding Skill 最新提交是否同在 main。
5. 16077 当前 release、平台/Skill commit、是否就是 `20260908-190712-447f4e47`。
6. 16088 当前 release、平台/Skill commit、PM2 PID、Nginx/release pointer。
7. 16088 当前 production baseline 是否可安全采集；不要做写操作。
8. 评估双线 merge/rebase/cherry-pick 的最安全 integration 路径；列出真实冲突文件与语义风险。
9. 给出最终统一 RC 应锁定的平台 commit + Skill commit；如果尚不存在，明确“尚未形成”。
10. 对 Gate A~H 逐项给：`PASS / FAIL / NOT RUN / BLOCKED` + 证据。

最终只输出一个裁定：

- `READY FOR PRODUCTION RC`：仅表示可以进入最终 16077 RC 验收；
- `READY FOR 16088`：只有 Gate A~G 已完成且等待人工生产确认时才能使用；
- `NOT READY`：列出最小阻塞项。

---

## 6. 当前建议

在控制面核对完成前：

- 冻结 onboarding 与项目管理两条功能线，不继续加功能；
- 不直接发布 `main@447f4e47`；
- 不直接发布 `feat/project-management-module@3225ea6b`；
- 不触碰 16088；
- 下一阶段只做：**Production Integration → Unified RC → 16077 acceptance → 16088 release**。
