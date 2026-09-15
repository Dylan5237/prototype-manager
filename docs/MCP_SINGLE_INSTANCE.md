# MCP 单实例与跨进程 refresh 单飞

> 状态：平台本地实现（跟进 #48 / #52）。不宣称 16077/16088 已部署。  
> 依赖：#50 `fix/48-mcp-refresh-token-race` 的锁内重读 / 401 再试 / 短宽限。  
> 配套 Skill：`fuxi-prototype` 不启动 MCP、不实现 refresh/session，**无需改 Skill 仓库**。

## 合同

同一台机器上，**同一 `FUXI_CREDENTIALS_FILE`（同一逻辑设备会话）只允许一个 MCP 运行时拥有连接**。

stdio MCP 无法把两个 AI 宿主接到同一个 stdin/stdout，因此不实现“第二宿主 attach 到已有进程”。策略写死如下：

| `FUXI_MCP_INSTANCE_POLICY` | 行为 |
|---|---|
| `takeover`（默认） | 后起者成为 owner：向现有 live pid（及 launcher 记录的 child pid）发 `SIGTERM`，等待其退出后占用锁。超时不 `SIGKILL`，失败并给出 pid/锁路径指引。 |
| `fail` | 现有 live owner 时立即失败（退出码 2），stderr 说明如何关闭另一实例。 |
| `shared` | 不占实例锁。仅用于测试或诊断（例如验证 refresh 文件锁本身）。 |

死 pid / 空锁：直接收回。launcher 先占实例锁，再 refresh；子 `server.js` 通过 `FUXI_MCP_INSTANCE_OWNER_PID` 继承，不二次抢锁。

## Refresh 跨进程单飞

`mcp-server/src/server.js` 与 `update-runtime.js` 共用 `withRefreshLock(credentialsFile)`：

1. 锁文件：`${credentialsFile}.refresh.lock`（`wx` + pid，死进程可收回）
2. 持锁期间执行 refresh HTTP；锁内重读凭证；401 后再读一次并最多再试一次（#50）
3. 凭证仍为 tmp + rename 原子写
4. 进程内仍用 `refreshPromise` 单飞

实例锁减少并发 refresh；refresh 文件锁覆盖接管窗口内的短暂双进程重叠。

## 非目标

- 不改 WorkBuddy / Cursor 内核
- 不把 access token 写入凭证文件
- 不发版、不投影 GitLab、不宣称生产已修复
