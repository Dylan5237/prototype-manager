# 阶段 22：项目模块增量验收证据

> 日期：2026-09-01
> 范围：固定默认入口、项目列表筛选/分页、绑定原型服务端搜索分页、MCP 签出门禁、预览运行时容错
> 环境：本地回归 + 16077 测试环境；未操作 16088

## 1. 交付绑定

| 项目 | 值 |
|---|---|
| Platform release source | `3d81476abcc0c1460f9fe45be70049c65447d89b` |
| MCP 行为修复 | `d2c368f`（项目绑定更新先校验签出） |
| 项目列表分页/筛选 | `b4d5d0f` |
| 绑定选择器服务端搜索 | `5b52785`、`80ac1f9` |
| Skill HEAD | `677200b4f4c721dccae9d14233d859591ca52cce`（质量门禁已纳入） |
| 16077 历史验收 release | `20260901-182503-da787bef` |
| 16077 当前 release | `20260901-190258-3d81476a` |
| 当前 release SHA-256 | `81e67cbb3c12d5586b9c977e2caf74bac741fb3bf5ad202680ab25e74e102f6b` |
| 16077 备份 | `20260901-190409-pre-test-20260901-190258-3d81476a` |

## 2. 本地自动化门禁

- 前端 `npm run build`：通过；最大第三方 JS `408.98 kB`，未调高告警阈值。
- 后端 `npm test`：当前全量 `54/54` 通过；此前一次出现既有临时目录/SQLite 相关间歇失败，复跑通过，已记录观察项。
- 后端项目绑定/列表测试：`3/3` 通过。
- MCP `npm run check`：通过；`npm run test:integration`：通过，项目绑定无签出返回 `CHECKOUT_REQUIRED`。
- Skill：单测 `55/55`、行为回归 `8/8`、能力缓存 `CACHE_VALID`。

## 3. 16077 远端回读

认证回读脚本通过凭据包装器执行，未输出凭据值：

- `health=200`、首页/Nginx `200`、未授权 bootstrap `401`。
- 认证用户 ID `14`，项目列表返回 `3` 条；`prototype_count`、`member_count`、`pending_candidate_count`、`last_activity_at` 均存在。
- 项目列表 `total/page/pageSize` 存在；原型列表 `scope=all&page=1&pageSize=20` 返回分页总数字段。
- 项目详情均为 `200`；含菜单配置路径的项目计算出的第一个已绑定路径为 `group_1782383481579/item_1782383489815`。
- 两个历史项目的原始 API `menu_config` 为空但存在 `menu_path=acceptance/lightweight` 绑定；前端内存兼容层会合成只读菜单项，不回写项目数据。
- 工作台头部、左侧菜单和主内容区已拆为 `ProjectHeader`/`ProjectNavigation`/`ProjectWorkspace`，菜单支持键盘焦点、Enter/Space 选择；任务、成员、快照状态仍由父页面维护，未宣称全部职责拆完。

## 4. 本轮真实浏览器验收与修复

- 已登录管理员在 16077 项目列表输入“建模”并按 Enter，结果收敛为单个“建模开发平台”项目；项目卡片摘要显示原型数、成员数和待确认数。
- 进入项目后刷新无深链接，左侧菜单实际激活“提示语管理”；点击“业务域建模-实体”后显示“该菜单项尚未绑定原型”，说明当前激活项是菜单顺序中第一个已绑定项。
- 原型 iframe 能显示业务页面，但旧 release 的预览容错脚本把 Chromium 良性 `ResizeObserver loop completed with undelivered notifications` 误判为致命错误并遮罩页面。
- 平台提交 `250d1bd6` 已仅过滤两类已知良性 ResizeObserver 诊断，保留其他错误提示，并通过后端 `54/54` 回归。
- 当前 release 部署后再次打开同一项目，iframe 有真实业务内容，错误行集合为空（无“原型暂时无法加载”、无 `ResizeObserver loop`），截图复核通过。
- 在同一工作台切换到未绑定菜单，管理员打开绑定选择器并输入“权限”，服务端搜索返回 3 条匹配原型，列表分页控件可见；本次未点击“绑定”，测试数据未改动。

## 5. 尚未宣称完成的门

- 四角色完整页面路径、全流程写入动作及阶段 22–24 的完整验收门仍按计划保留。
- owner/admin/editor/viewer 四角色完整页面路径、项目组件拆分、端到端生成/上传性能 10 次样本：仍按阶段计划保留，不以本次 API 回读替代。
- 16088 生产发布、GitLab/GitHub 推送、BL-006 实际清理：均未执行。
