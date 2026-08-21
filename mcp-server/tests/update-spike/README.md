# Windows 延后更新技术试验

这是一个与伏羲服务端、真实 AI 客户端和真实用户凭据隔离的 Node.js 本地试验。它只验证最难的本地事实：平台确认后不能直接改文件，待更新必须在 AI 客户端下一次启动前被消费，并且更新失败不能破坏旧版本。

## 运行

```powershell
cd D:\_projects\platform\FuxiPlatform\mcp-server
npm run test:update-spike
```

脚本在 `%TEMP%` 下创建临时旧版/新版 MCP 与 Skill，执行完成后自动清理。输出中的 `success`、`digestFailure`、`smokeFailure`、`runningClient` 和 `concurrentUpdater` 是本次试验的证据字段。

## 试验边界

- `browser-confirmation` 只写入 `pending-update.json`，代表用户在伏羲页面点击了“安排下次启动更新”。
- `launcher.js` 代表 AI 客户端启动入口：先检查客户端是否仍在运行，再消费待更新，成功后才启动 MCP。
- `updater.js` 代表本地固定更新流程：临时目录、SHA-256、`node --check`、MCP Smoke、Skill 发现、current/previous 原子指针和锁。
- `credentials.json` 与版本目录分离，试验会比较更新前后的内容是否完全不变。

## 这项试验没有证明什么

它没有证明真实下载、服务端通知、AI 客户端原生启动钩子、真实 Skill 缓存刷新或 16077 端到端验收。下一阶段需要把“待更新记录”和“启动前消费”接入真实 MCP/Skill 安装包；在此之前不注册 Windows 深链接，也不实现后台常驻服务。
