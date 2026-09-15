# Issue #48 P0 INVALID_REFRESH_TOKEN — 独立验证证据

> 角色：伏羲·验证（独立；不根据实现者自报判 PASS）
> 日期：2026-09-15
> 范围：静态代码合同 + 本地单测 + 隔离真实后端上的 HTTP/MCP 门禁 A–C
> 环境：本 Cloud Agent worktree；**未部署 16077/16088，未投影 GitLab，不合入 main**

**结论：`PASS (code/contract)`。合入 ≠ PASS。生产未部署，不得把本结论写成 16088 已修复。**

## 1. 锁 tip（开跑时实测）

| 项 | 锁定值 | 本席实测 |
|---|---|---|
| 施工 base | GitHub `main` @ `4036bc954a58ab58b2b49928992dca3e7a7c30d2` | `git rev-parse main` 相同；`merge-base(main, HEAD)` 相同 |
| 验证 tip / PR #50 head | `fix/48-mcp-refresh-token-race` @ `953bbc81a490769f36e5126b7d16de61ed32348d` | 全长一致；相对 `main` **ahead 1 / behind 0** |
| PR | [#50](https://github.com/Dylan5237/prototype-manager/pull/50) | `baseRefOid=4036bc95…`，`headRefOid=953bbc81…`，`MERGEABLE` |
| PR #49 | 关闭 / 不在验证范围 | `CLOSED` @ `977e7d93eb58fa5f573709923be5b9ba6b3b3356`，base 曾为 `feat/project-management-module` |
| Skill tip | 验证方案记 `8028372`（合同绑定） | 本 worktree **无** `prototype-manager-skills` 源码；GitHub `Dylan5237` 下无该仓。见 §5 |

祖先关系：`4036bc95` **is ancestor of** `953bbc81`（`git merge-base --is-ancestor` 通过）。

## 2. 架构合同核对（相对 `main` @ `4036bc95`）

对照 Issue #48 总架构师最小修复合同。本席只认 `953bbc81` 源码，不认 PR 自述。

### 2.1 Refresh：锁 + 锁内重读；401 后再读并重试一次

**代码有。** `mcp-server/src/server.js` `refreshAccessTokenInternal`：

- `acquireFileLock(CREDENTIALS_FILE + '.refresh.lock')`
- 锁内 `applyCredentialData(readCredentialData())`
- `postRefresh(presented)`；仅当 `INVALID_REFRESH_TOKEN` 时再读文件；若 token 已变则再 `postRefresh` **一次**，否则抛出原错误

`mcp-server/src/update-runtime.js` `getSessionAuth` 使用同一 lock 文件名，401 后重读并最多再试一次。

`main` 上 `rotateSession` 是单槽立即覆盖 hash、无宽限、无 debounce。未知 token 在修复前后都只返回 `INVALID_REFRESH_TOKEN`，**没有**按 `user_id` 批量 `revoked_at`。

### 2.2 一次 refresh 竞态不得吊销兄弟会话 / 整族

**代码有。**

- `createSession` 只 `INSERT` 新行，注释与实现均为「绝不撤销同一用户既有设备」
- `rotateSession` 对未知 / 过期宽限 token 只返回 `INVALID_REFRESH_TOKEN`，不写 `revoked_at`
- `revokeSession(id)` 仍只更新这一行
- 连接码兑换路径 `POST /api/auth/mcp/connect` 只 `createSession`

### 2.3 Bootstrap CONNECT 失败不得把同 session 已轮换凭据回滚成旧 refresh

**代码有。** `main` 在 CONNECT/selfTest 失败时无条件 `restoreBackup(credentialsBackup, credentialsFile)`。`953bbc81` 改为 `restoreCredentialsPreservingLiveSession`：同 `sessionId` 则 `kept-rotated`；不同 `sessionId` 才恢复备份。`install()` 的 `catch` 已改调该函数。

### 2.4 可选短宽限 — 存在，须记实值

**存在。** 非「秒级」，而是常量：

| 常量 | 值 | 作用 |
|---|---|---|
| `REFRESH_REUSE_GRACE_MS` | **120_000（2 min）** | 刚被换下的 `previous_refresh_token_hash` 可兑回**当前** token；超时只 `INVALID_REFRESH_TOKEN`，不吊销 |
| `REFRESH_ROTATION_DEBOUNCE_MS` | **3_600_000（1 h）** | 当前 token 在窗口内再 refresh **不轮换**，返回同一 refresh |

为实现宽限，服务端增加 `previous_refresh_token_hash` / `rotated_at` / `current_refresh_token_enc`（AES-256-GCM，密钥派生自 `JWT_SECRET`）。这是可选缓释的实现代价，不是合同禁止项；未做密钥轮换/存储审计。

### 2.5 禁止：`check_connection` 在 `authentication=INVALID_REFRESH_TOKEN` 时 `ok=true`

**代码已改。** `main` 固定 `contentJson({ ok: true, … authentication })`，事故 JSON 因此可以 `ok: true` + `INVALID_REFRESH_TOKEN`。`953bbc81` 改为：

```text
ok = authentication === 'verified' || authentication === 'unconfigured'
```

死 token 时 `ok=false`、`isError=true`，并带 `nextAction`（换发连接码）。`/api/health` 仍可为 `status=ok`；禁止的是工具级 `ok=true` 与认证死锁并存，不是禁止 health 探针本身。

## 3. 回归门 A–C（本席实测）

### 3.1 仓库内测试（独立重跑，不采用 owner 自报计数）

在 `953bbc81` 上：

| 命令 | 实测 |
|---|---|
| `backend` `npm test` | **97/97 PASS**（owner 曾报 82/82 — 不采用） |
| 其中 `tests/mcp-sessions.test.js` | 3/3：connect 不吊销兄弟；宽限内旧 token 兑回当前；过期宽限 `INVALID` 且 `revokedAt=null`；显式 revoke 不族杀 |
| `mcp-server` `npm run check` | PASS |
| `mcp-server` `npm run test:auth-concurrency` | **4/4 PASS**（owner 曾报 6/6 — 不采用） |
| `mcp-server` `npm run test:bootstrap` | **18/18 PASS**（owner 曾报 17/17 — 不采用；含 CONNECT 失败同 session 不回滚） |
| `mcp-server` `npm run test:remote-update` | **3/3 PASS** |

auth-concurrency 覆盖：同进程 single-flight；**两个真实 MCP 子进程**共享凭据文件 + mock refresh API 串行化后均 `verified`；401 后重读重试；死 token `ok=false`/`isError` + 有连接码则换发。

### 3.2 隔离真实后端 + 真实 MCP（本席 /tmp harness，非产品代码）

脚本：`/tmp/verify-issue-48-gates.js`（不入库）。隔离复制 `backend/`，临时 PORT、`JWT_SECRET=verify-48-secret`，默认 `admin/admin123`，对 `953bbc81` 的 `POST /api/auth/mcp/refresh` 与 `src/server.js` stdio MCP。

结果（2026-09-15，本机）：

```json
{
  "ok": true,
  "results": {
    "A": {
      "pass": true,
      "liveCount": 2,
      "debounceReturnedSameToken": true,
      "graceReturnedCurrentToken": true
    },
    "B": {
      "pass": true,
      "authentications": ["verified", "verified"],
      "liveCount": 2
    },
    "C": {
      "pass": true,
      "deadOk": false,
      "deadAuthentication": "INVALID_REFRESH_TOKEN",
      "deadIsError": true,
      "liveCount": 3
    }
  }
}
```

| 门 | 验证方案要求 | 本席做法 | 结果 |
|---|---|---|---|
| **A** 轮换后仍可用；旧 refresh 拒绝且不杀兄弟 | 合法 session refresh；当前 token 仍可用；旧 token 按契约；兄弟仍活 | HTTP：首次 refresh 轮换；1h debounce 内当前 token 再 refresh 返回**同一** token；宽限内旧 token 兑回当前；第二台设备 session 仍 200；`revokedAt` 空的会话数=2 | **PASS** |
| **B** 多实例不互吊销 | ≥2 MCP 进程；不得把整族打成死 token | 两进程共享同一凭据文件并发 `check_connection`，均 `ok=true`/`verified`；live session 仍为 2 | **PASS（隔离真实后端）** |
| **C** 死 token 明确失败 + 换发路径；无假健康 | 伪造/吊销 refresh；`ok=false`；可换发连接码 | 伪造 refresh：`isError`、`ok=false`、`authentication=INVALID_REFRESH_TOKEN`、health 仍 ok、有 `nextAction`。随后 `FUXI_CONNECT_CODE` 换发**新** sessionId，原两台设备 session 仍未 revoke（liveCount=3） | **PASS** |

事故复现点「`ok=true` + `INVALID_REFRESH_TOKEN`」在本 tip 的死 token 路径上**未再出现**。

### 3.3 验证方案中未跑 / 不能宣称的部分

| 项 | 状态 |
|---|---|
| 墙钟等待 ≥20 min | **未跑**。等价合同：debounce 1h 内当前 token 不轮换（门 A HTTP 已证）；宽限 2min 过后旧 token `INVALID` 且不吊销（`mcp-sessions` 回拨 `rotated_at` 单测已证）。未证明「20 分钟后文件未更新仍可用」——那本就应失败，应用新 token。 |
| WorkBuddy / 10× `node.exe` / deviceLabel `DESKTOP-N09059V` | **未复现**。本席是隔离后端 + 2 个 MCP 进程。 |
| 16077 / 16088 live | **未部署、未打生产 API**。事故环境 16088 仍是未知 release。 |
| 完整 `bootstrap install` CONNECT 失败端到端 | **未跑全量 install**。有 helper 单测 + `install()` catch 源码。 |
| `mcp-server` `npm run test:integration` | **本轮未跑**（更长交付链路；门 A–C 已用更小的真实后端 harness 覆盖认证面）。 |

## 4. 判定

**`PASS (code/contract)`**

- 锁 tip 与控制面/PR #50 一致；#49 未纳入。
- 五条架构合同在 `953bbc81` 源码中成立；门 A–C 在本地单测 + 隔离真实后端双进程下成立。
- 宽限实值为 **2 min**（可选合同，长于「秒级」但短）；debounce **1 h**。
- **剩余运行时风险**：未在 WorkBuddy/16088 上复跑事故机；未做 20 min 墙钟；完整 bootstrap install 失败路径只有单元+代码；`current_refresh_token_enc` 把当前 refresh 密文放进 SQLite。
- **不是** 阶段/生产 PASS。发版、投影 GitLab、合入 `main` 仍须用户授权。合入本 PR **不等于** 现场已恢复。

## 5. 配套 Skill（双边）

- Skill 入口 `fuxi-prototype` **不实现** refresh/session；只消费 MCP 工具。
- 本修不改工具名/入参。成功路径仍是 `ok=true` 且 `authentication=verified`（与 `docs/PHASE25_MCP_ONBOARDING_BOOTSTRAP.md` 一致）。
- 失败路径从「health ok 且工具 `ok=true` + `INVALID_REFRESH_TOKEN`」改为工具 `ok=false`/`isError`，与 Skill 文档「必须 verified」同向，不要求 Skill 改入口。
- 本环境无 Skill 仓，**未**对 tip `8028372` 做源码 diff。依据：平台 API/MCP 工具契约无 Skill 必须跟随的破坏性成功路径变更。

## 6. 明确未做

- 未改产品逻辑（本 PR 仅证据文档 + gitignore 白名单）。
- 未 `git push` `main`/`develop`，未 force，未发 16077/16088。
- 未把 owner 自报测试计数当作证据。
