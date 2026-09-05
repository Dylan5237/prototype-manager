# 阶段 29：MCP 首次接入性能与进程并发优化

状态：`implemented`（本地代码与回归测试完成，尚未部署测试环境）

## 目标

缩短 AI 助手执行“接入平台 MCP”时的确定性步骤，避免重复下载、重复安装、重复连接验证和 refresh token 竞争；不新增伏羲客户端，不改变 MCP 业务工具契约。

## 实现

### 首次安装入口

- 平台接入提示词只保留客户端识别、manifest 写入、MCP ZIP 获取和一次 `bootstrap.js install`；不再要求 AI 手工下载/解压 Skill ZIP，也不再单独运行 `preflight`。
- `bootstrap.js install` 内部完成预检、制品校验、备份、配置合并、Skill 安装和首次 MCP 自检。
- 已完成且本地文件仍完整时返回 `status=COMPLETE` + `reason=ALREADY_COMPLETE`，不重复下载或覆盖。
- 首次接入与后续 launcher 更新共用 `install/update.lock`；失败后清理 staging，manifest 可通过 `--cleanup-manifest` 清理。
- WorkBuddy 使用已确认的 `~/.workbuddy/mcp.json` 和 `~/.workbuddy/skills/fuxi-prototype` 默认目标；其他未知客户端仍要求提示词提供明确绝对路径。

### 进程与请求并发

- 新增跨进程文件锁，保护同一凭据文件的 refresh token 轮换；检测已退出进程遗留的过期锁。
- MCP 进程内对 token 获取和 refresh 使用 single-flight，多个并发 `tools/call` 共享一次刷新请求。
- `check_connection` 首次调用前主动加载本地凭据，避免仅凭凭据文件启动时误报 `unconfigured`。
- launcher 已完成 refresh 后，将短期 access token 和过期时间传给子 MCP，避免 launcher 与子进程在同一次启动中重复 refresh。
- refresh token 文件采用临时文件 + rename 原子写入。
- 后续更新的 MCP/Skill 下载改为并行。

## 验证证据

- `mcp-server`: `npm run check` 通过；Bootstrap 测试 6/6；鉴权并发测试 2/2；远程更新测试 3/3；完整 MCP 集成测试通过；更新试验通过。
- `backend`: `npm test` 通过，65/65。
- 鉴权并发测试覆盖：同一 MCP 进程内并发请求 single-flight、两个 MCP 进程共享轮换 refresh token 时串行化并均返回 `verified`。
- 本阶段只修改平台仓库与配套 Skill 接入契约；未推送远程、未部署 16077/16088。

## 后续真实环境验收

在部署 16077 后，使用 WorkBuddy 和 DSH 分别记录：客户端识别耗时、MCP ZIP 获取耗时、`bootstrap install` 总耗时、首次自检结果、重载耗时、重载后 `check_connection` 和 `tools/list` 结果。DSH 的真实配置目录尚未从源码/报告中确认，不能用 WorkBuddy 路径替代。
