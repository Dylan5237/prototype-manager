# 阶段 24：本地写入型上传预备基线

脚本：`backend/tests/performance/phase24-local-upload-baseline.js`
运行：`cd backend && npm run test:performance:phase24-local-upload`

## 测量范围

- 使用系统临时目录内的 SQLite、`repos`、`uploads` 和 ZIP 夹具；脚本结束时递归清理其唯一临时根目录。
- 以真实 HTTP multipart 调用 `POST /api/prototypes/:id/upload`，每个 1/20/80 MB ZIP 至少 3 次。
- 每次成功调用断言：增加一个正式版本记录、`GET /api/prototypes/:id` 回读成功、入口文件和解压后的 payload 大小一致。
- 另以真实 multipart 提交一个损坏 ZIP，断言请求被拒绝、正式版本表没有新增记录、原当前文件不变。

## 输出与边界

- 输出每档的 ZIP bytes、p50/p95/max、失败数、请求期间采样 RSS 峰值，以及 `monitorEventLoopDelay` p95/max 与 event-loop utilization。
- p50/p95 使用 nearest-rank 计算；RSS 与事件循环数据是本机可观测字段，不是预设性能阈值。
- 这是本地写入型**预备基线**：不读取或写入 16077/16088，不部署，也不构成任何远端、生产或 16077 验收。真实环境测试仍需单独授权、样本和验收记录。
