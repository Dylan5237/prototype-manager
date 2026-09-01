# 阶段 24：本地打包性能基线

> 日期：2026-09-01
> 脚本：`mcp-server/tests/performance/phase24-local-baseline.js`
> 原始报告：`.release/phase24-local-packaging-baseline.json`（本地忽略目录）

## 环境

- Windows `win32/x64`，Node `v22.22.1`
- CPU：12th Gen Intel(R) Core(TM) i9-12900H，20 逻辑核
- 每个样本固定执行 10 次；共 30 次，无失败。
- `packProjectIncludingFirstZipValidation` 包含实现内部首次 ZIP 校验；`validateZipReadback` 是额外回读校验。

## 结果

| payload | ZIP bytes | validateProject p50/p95 ms | pack+校验 p50/p95 ms | ZIP 回读 p50/p95 ms |
|---:|---:|---:|---:|---:|
| 1 MB | 1,049,356 | 1.36 / 3.75 | 36.55 / 45.77 | 2.14 / 2.86 |
| 20 MB | 20,978,383 | 3.32 / 13.98 | 1,256.08 / 1,728.46 | 58.45 / 118.33 |
| 80 MB | 83,912,143 | 5.00 / 8.26 | 6,827.46 / 7,696.72 | 351.54 / 440.83 |

## 结论与边界

- 当前本地最慢阶段是大文件 `packProjectIncludingFirstZipValidation`，80 MB p95 为 `7,696.72 ms`；优化前后对比尚未建立，不能写成“已提速”。
- 现有流程整体读入内存并同步压缩/校验；下一步是否流式化或 worker 化，需要结合真实环境内存峰值和事件循环指标决定。
- 本报告只证明本地打包链路；MCP 接入、Skill/MCP 更新、AI 生成质量、真实上传/解压/版本回读和 16077 端到端仍为 `UNVERIFIED`。

## 随后落地的稳定性改造

- `deliver_project` 现在返回 `timingsMs`，可以区分校验、签出门禁、上传和各个回读阶段；结构化失败也保留当前阶段和耗时。
- Node 19.8+ 上传使用 `fs.openAsBlob` 惰性 Blob，Node 18 保留 Buffer 回退；MCP integration 已确认版本、README、预览、幂等和部分失败门禁不变。
- 16077 只读链路的 10 次基线见 [PHASE24_16077_BASELINE.md](PHASE24_16077_BASELINE.md)；写入型上传仍需单独授权和真实样本，不能用本地压包结果替代。
