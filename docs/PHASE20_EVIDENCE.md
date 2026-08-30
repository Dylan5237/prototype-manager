# 阶段 20 执行与验收证据

> 证据日期：2026-08-30
>
> 当前结论：阶段 20 已完成本地实现、自动化回归、16077 发布、日志与真实浏览器页面验收；尚未推送 GitLab/GitHub，也未部署 16088。

## 1. Backlog 结果

| 事项 | 当前结果 | 尚欠条件 |
|---|---|---|
| BL-001 | 已按用户决策关闭，发布 Skill v1 保留历史证据 | 无 |
| BL-002 | 已废弃，默认使用无 Git 轻协作 | Provider 代码是否删除另立决策 |
| BL-003 | 本地和 16077 真实浏览器回归通过，已关闭 | 无 |
| BL-004 | 分支测试、后端全量和 16077 PM2 日志通过，已关闭 | 无 |
| BL-005 | 不做，状态为范围外 | 只有重新纳入范围才启动 |
| BL-006 | 只读预览完成，未删除任何对象 | 先产生有效替代备份，再决定处置清单 |

## 2. BL-003 前端分包

优化前基线：单一主 JS `1,356.25 kB`，gzip `434.85 kB`，1707 个模块，构建 21.71 秒，并出现大包告警。

本轮结果：

- 13 个页面路由改为按需加载。
- Vue、Element Plus、Element Plus Icons、Axios 拆为稳定 vendor chunk。
- Element Plus 改为按组件注册；图标继续全局注册，保持动态菜单与详情页行为兼容。
- 主入口 JS `23.64 kB`，gzip `9.20 kB`；最大 JS chunk 为 Element Plus `408.98 kB`，gzip `136.08 kB`，没有超过 500 kB 的 JS chunk 告警。
- 生产构建通过：1198 个模块，最终全量验收构建 35.02 秒。构建耗时受当时主机负载影响，只把体积作为本轮确定性成果，不宣称构建提速。
- 本地真实浏览器回归通过：登录后首页/原型列表、项目列表、项目工作台、管理员用户、使用统计、原型详情和独立预览；修复过程中发现并恢复全局图标注册，最终页面无新增 console warning/error。

## 3. BL-004 Linux 日志

- `getWindowsSystemProxy` 在非 `win32` 平台直接返回，不再调用 Windows 注册表命令。
- Windows、非 Windows和解析失败分支共 3 项测试通过；后端全量测试由 `46/46` 增至 `49/49` 并全部通过。
- 16077 于 2026-08-30 重启并执行核心页面/API 操作后，测试 error log 最后修改时间仍为 2026-08-28；历史累计 40 条 `reg: not found` 没有新增，启动 fatal 计数为 0。

## 4. BL-006 清理预览与备份风险

完整人工预览见 [PHASE20_CLEANUP_PREVIEW.md](PHASE20_CLEANUP_PREVIEW.md)，机器明细保存在忽略目录 `.release/phase20-cleanup-preview.json`。

- 本地 `.release` 188 项、本地 `.backup` 6 项；远端 release 49 个（生产 10、测试 39），生产 backup 9 个，验收原型 3 个。
- 8 个近期生产备份只有 3 个 symlink、没有普通数据文件，不能作为数据可恢复备份；最早一份备份包含 17,938 个普通文件，仍是当前唯一被清单验证为含真实文件的备份。
- 根因是 immutable release 把持久化目录改为 symlink 后，原 `tar`/`du` 未解引用。发布脚本已改为解引用归档，并在生成后检查 `data/app.db` 和普通文件数量。
- 新增隔离夹具验证，结果 `PASS`：16,432 bytes、3 个普通文件、0 个 symlink。
- 清理评估本身没有删除、移动、回滚或远端分支写入；后续 16077 测试发布是独立受确认操作。旧无效生产备份先保留审计，直到修复后的生产流程生成并验证一份有效替代备份。

## 5. 性能基线

环境：Windows x64、Node `v22.22.1`、i9-12900H、约 34 GB 内存。机器结果保存在忽略目录 `.release/phase20-performance-baseline.json`。

| 样本 | ZIP 字节 | 校验项目 | 打包并首次校验 | 再次校验 ZIP | 进程 RSS 结束值增量 |
|---:|---:|---:|---:|---:|---:|
| 1 MB | 1,049,361 | 4.45 ms | 73.71 ms | 4.34 ms | 10.8 MB |
| 20 MB | 20,978,384 | 2.58 ms | 931.58 ms | 40.42 ms | 87.3 MB |
| 80 MB | 83,912,146 | 2.70 ms | 4,917.87 ms | 261.61 ms | 217.3 MB |

同步操作无法用区间采样得到可靠峰值，因此 RSS 数字只是操作前后差值，不冒充峰值。MCP 首次接入、更新下载/切换、原型首次生成质量，以及上传/解压/版本写入/回读/预览的多次 p50/p95 数据明确保留给阶段 24，不把单次发布耗时冒充性能结论。

## 6. 16077 发布与命名验收

发布证据：

- release：`20260830-092500-adf7ea7f`；platform commit `adf7ea7f8d0bf729eba446a66ec732409b9052ee`；Skill commit `20d9d69c92e4b3a39f18a25b87598a420ba51742`。
- SHA-256：`4e794d79e83184dee30786689bdba3f39fc739c8123ae50ffbc7af192fa777f3`；profile `test-lightweight`。
- 测试备份：`20260830-092543-pre-test-20260830-092500-adf7ea7f`；deployment status `complete`。
- current/project 指针均落到该 release；PM2 `fuxi-backend-test` online，internal health、Nginx health、首页均为 `200`，未授权 prototypes/projects/bootstrap 均为 `401`。

认证业务与分发证据：

- 登录后原型读取、项目读取、管理员使用统计和 agent bootstrap 均通过；浏览器列表报告原型总数 24，项目 API/页面返回 3 个项目，抽样响应与页面一致。
- Skill ZIP 为 79,363 bytes、47 entries，包含 `fuxi-prototype/SKILL.md`。
- MCP ZIP 为 24,693 bytes、6 entries，包含 launcher、server 和 `package.json`。
- 两个 ZIP 的 `.git`、`node_modules`、tests、凭据、`.npmrc` 和日志等禁止项计数为 0。

真实浏览器证据：

- 原型列表：24 项，顶部导航、侧栏、筛选和创建入口正常。
- 项目页：3 个项目，搜索、刷新、创建和进入项目入口正常。
- 系统管理：23 名用户，管理导航、搜索、新增和编辑入口正常。
- 原型详情：`mt9zipie8az91w` 的标题、README、版本与操作入口正常。
- 独立预览：`/preview/mt9zipie8az91w/index.html` 渲染事件表格、查询、分页和关联方法区域；报告未记录短期访问 token。
- 上述页面 console error/warn 均为 0。

## 7. 回归矩阵

| 范围 | 结果 |
|---|---|
| 后端 | `49/49 PASS` |
| 前端 | 生产构建通过；本地与 16077 原型、项目、管理、详情和预览页面回归通过 |
| MCP | 语法检查通过；远程更新 `3/3 PASS`；隔离集成最终连续 `3/3 PASS` |
| MCP 异常说明 | 首次全量运行曾出现一次 Windows 临时目录 `EPERM`；隔离目录无共享，随后连续三次完整通过，暂不修改生产逻辑，后续复发再统计与修复 |
| 配套 Skill | 单元测试 `50/50 PASS`；能力缓存 `CACHE_VALID`；行为用例 `8/8 PASS` |
| 双仓边界 | 本轮未改变 MCP schema、ZIP、runtime profile、Skill 入口或安装契约，Skill 仓库保持 `main@20d9d69` 且工作区干净，无需修改 |
| 16077 测试 release | `20260830-092500-adf7ea7f`，manifest/commit/包摘要/PM2/Nginx/API/浏览器证据通过 |
| 生产只读探针 | 当前 release `20260828-185117-c1edcab0`；PM2 有运行 PID；health `200`；bootstrap 未授权 `401`；持久化目录存在 |

生产探针证明既有 release 的运行状态，不证明本轮阶段 20 已上线。

## 8. 本地提交绑定

| commit | 范围 |
|---|---|
| `a6238cd` | BL-004 非 Windows 跳过注册表代理探测及测试 |
| `f7860d9` | BL-003 路由、Element Plus 和 vendor chunk 拆分 |
| `53c0638` | BL-006 只读清理预览、symlink 备份修复及夹具 |
| `26f809d` | MCP 1/20/80 MB 打包性能基线 |
| `a521570` | 修正 README 测试发布入口并支持 detached worktree manifest |
| `adf7ea7` | 正确处理 PowerShell native command 空分支输出；本次 16077 release 来源 |

上述提交已快进到本地 `main`；16077 使用 `adf7ea7`，GitLab/GitHub 尚未推送，16088 未进入本轮发布。

## 9. 阶段结论与后续门禁

阶段 20 计划中的实现、测试、清理预览、性能基线和 16077 验收条件已经满足，状态为 `done`。以下事项不阻塞阶段 20，但仍需用户分别决定：

1. 是否推送 `zoesoftgitlab/main`；任何推送仍需当前会话明确确认。未跟踪的 `linux-server-ops-behavior-report.md` 未进入提交。
2. BL-006 的保留期限和具体删除对象；当前预览不构成删除授权。
3. 是否进入阶段 21 仓库治理。
4. 是否部署 16088；生产发布必须重新执行完整构建、MCP 集成、生产基线、真实备份和 live verification 门禁。
