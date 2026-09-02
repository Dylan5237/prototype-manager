# 阶段 25：MCP 接入 Bootstrap 确定性改造

> 状态：已实现，待 16077 测试环境验证
>
> 范围：伏羲 Web 接入提示词、MCP 分发包、首次本地接入、Skill/MCP 验证；不新增独立伏羲客户端，不增加伏羲 AI 对话功能。
>
> 平台仓库：`D:\_projects\platform\FuxiPlatform`
>
> Skill 仓库：`D:\_projects\skills\prototype-manager-skills`

## 1. 产品边界

伏羲仍然是轻量 Web 原型查看、发布和分享平台。用户继续使用已有的 Codex、WorkBuddy、Cursor 等 AI 工具；伏羲只提供接入材料、MCP/Skill 分发和原型业务能力。

用户体验保持：

```text
登录伏羲 -> 点击“接入平台 MCP” -> 复制提示词给 AI -> AI 自动完成接入 -> 新会话使用伏羲
```

不做：

- 独立桌面客户端或新的伏羲 AI 工作台；
- 浏览器直接修改用户电脑配置；
- Skill 仓库保存平台登录、凭据或直接业务 API 实现；
- 用“提示词已生成”“MCP 进程已启动”冒充接入成功。

## 2. 目标架构

```text
伏羲 Web / agent-bootstrap
  └─ 短提示词 + 一次性接入参数 + MCP/Skill release 清单
       ↓ HTTPS（AI 助手原生联网能力）
AI 助手下载 MCP 包到临时目录
       ↓ Node.js（MCP 包内 bootstrap.js）
PRECHECK -> DOWNLOAD/VERIFY -> BACKUP -> CONFIGURE -> CONNECT -> VERIFY
       ├─ 写入已有 AI 工具的 MCP 配置
       ├─ 安装 fuxi-prototype Skill
       └─ 启动 launcher.js / server.js 并调用 check_connection
             ↓ MCP stdio + HTTP
        伏羲平台 API
```

初次接入不存在“通过 MCP 下载 MCP”的循环：下载阶段使用 AI 助手已有的 HTTP/Shell/Node 能力；只有 MCP 包安装并启动后，才使用 MCP 协议。

## 3. 实现契约

### 3.1 Bootstrap 输入

`bootstrap.js` 接收临时 manifest 文件，不把 token 和连接码放入命令行参数：

```json
{
  "schema": "fuxi-bootstrap/2",
  "bootstrapId": "...",
  "apiUrl": "http://...",
  "installToken": "...",
  "connectCode": "...",
  "artifacts": {
    "mcp": { "url": "...", "sha256": "...", "size": 123 },
    "skill": { "url": "...", "sha256": "...", "size": 456 }
  },
  "client": {
    "name": "auto",
    "mcpConfig": "...",
    "skillTarget": "..."
  }
}
```

动态旧分发接口没有摘要时，Bootstrap 必须至少计算本地 SHA-256、检查 ZIP 入口和文件大小；不可变 release manifest 优先提供服务端摘要。

### 3.2 Bootstrap 命令

```text
node bootstrap.js preflight --manifest <临时绝对路径>
node bootstrap.js install   --manifest <临时绝对路径> --mcp-zip <已下载 MCP ZIP> --skill-zip <已下载 Skill ZIP>
node bootstrap.js verify    --state <状态绝对路径>
```

- `preflight`：只读识别客户端、配置、Skill 目录、Node 和权限；不下载、不写入。
- `install`：校验已下载制品（未传本地 ZIP 时才下载）、备份、原子安装、写配置、启动 MCP 自检、保存状态。
- `verify`：只读读取状态和安装结果；客户端重新加载由 AI 工具完成并单独报告。

每个命令输出单一 JSON 结果，失败退出码非 0，并包含结构化 `step`、`code`、`message`、`nextAction`；不得输出凭据。

### 3.3 成功标准

```json
{
  "ok": true,
  "status": "COMPLETE",
  "mcpConnected": true,
  "skillReady": true,
  "reloadRequired": true,
  "postReloadVerified": false
}
```

`reloadRequired` 不阻塞 Bootstrap；新会话验证是后续客户端状态。

## 4. 提示词契约

平台生成的提示词必须明确区分：

1. MCP 尚未接入前：使用 AI 助手自身的终端、文件和 HTTP 能力下载并运行 Bootstrap。
2. MCP 接入后：调用伏羲 MCP 工具 `check_connection({})`，确认 `ok=true` 且 `authentication=verified`。
3. 接入阶段禁止调用 `deliver_project`、`upload_project`、删除、回滚、恢复等业务或高风险工具。
4. 检查 `tools/list` 至少包含 `check_connection`、`validate_project`、`pack_project`、`validate_zip`、`deliver_project`。
5. Skill 发现必须报告文件存在和客户端是否重新加载，不用文件存在冒充客户端可用。

提示词必须包含明确的停止条件：客户端不支持、配置路径不明、下载/摘要失败、写权限不足、MCP 工具不可见、认证失败、连接码过期或部分安装失败时，立即停止并报告结构化结果。

## 5. 性能与稳定性目标

- Bootstrap API P95 小于 2 秒；
- 本地预检小于 3 秒；
- 正常内网下下载、安装和连接自检 P95 小于 30 秒；
- 所有网络请求有超时和有限重试；
- MCP/Skill 下载并行，配置写入串行；
- 安装状态可恢复，失败不重复执行完整流程；
- 连接兑换具备 `bootstrapId`/设备 nonce 级别的恢复能力；
- 记录各阶段耗时，但不记录 token、连接码和 refresh token。

## 6. 仓库职责与改动边界

### FuxiPlatform

- `backend/routes/integrations.js`：bootstrap manifest/提示词、受限制品下载信息；
- `mcp-server/src/bootstrap.js`：本地确定性接入入口；
- `mcp-server/src/launcher.js`：已有运行时启动和后续更新；
- `mcp-server/src/server.js`：MCP 工具和平台 API 连接；
- MCP README、集成测试、接入文档。

### prototype-manager-skills

- `fuxi-prototype/SKILL.md` 和 `references/workflow-contract.md`：声明 MCP 前置接入与连接验证边界；
- `cache/`：只通过能力缓存脚本重建，不手工修改 `tools.json`；
- 不新增平台登录、凭据或业务 API 实现。

## 7. 验证门禁

### 本地

- MCP 全部 Node 语法检查；
- Bootstrap 单元测试：预检、JSON 配置合并、下载摘要、路径穿越、超时、回滚、MCP 自检；
- MCP 隔离集成测试：bootstrap -> connect -> check_connection；
- 前端 build；
- Skill 单元、行为、黄金样例、cache 校验；
- 两仓 clean、提交绑定。

### 16077

- 使用轻量不可变 release 部署，不触碰 16088；
- 验证 health、未登录 bootstrap 401、登录 bootstrap 200；
- 验证 bootstrap prompt 的明确步骤和工具名；
- 验证 MCP/Skill ZIP 入口和排除项；
- 验证真实 `check_connection`、`tools/list` 和一次新命名原型交付；
- 记录 release ID、platform commit、Skill commit 和测试结果。

## 8. 实施顺序

1. 增加 Bootstrap 基础模块和单元测试；
2. 改造 bootstrap manifest 和提示词；
3. 同步 Skill 前置接入契约并重建 cache；
4. 运行本地全量门禁；
5. 构建轻量 release；
6. 部署 16077 并做真实回读；
7. 根据真实客户端证据补充具体 Adapter，不凭猜测声明支持。
