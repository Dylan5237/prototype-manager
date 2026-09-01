# 阶段 22：项目模块增量验收证据

> 日期：2026-09-01
> 范围：固定默认入口、项目列表筛选/分页、绑定原型服务端搜索分页、MCP 签出门禁、预览运行时容错
> 环境：本地回归 + 16077 测试环境；未操作 16088

## 1. 交付绑定

| 项目 | 值 |
|---|---|
| Platform release source | `250d1bd67aff913866fe2d8dc908322f4b0b5f96`（待部署） |
| MCP 行为修复 | `d2c368f`（项目绑定更新先校验签出） |
| 项目列表分页/筛选 | `b4d5d0f` |
| 绑定选择器服务端搜索 | `5b52785`、`80ac1f9` |
| Skill HEAD | `677200b4f4c721dccae9d14233d859591ca52cce`（质量门禁已纳入） |
| 16077 已验收 release | `20260901-182503-da787bef` |
| 待部署 release | `20260901-190011-250d1bd6` |
| 待部署 release SHA-256 | `23534e2a83d2a004eb3a3cf5b08298e9938269c65ade74e77935e0db077f47e9` |
| 待部署 16077 备份 | 部署确认后生成 |

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
- 工作台头部和左侧菜单已拆为 `ProjectHeader`/`ProjectNavigation`，菜单支持键盘焦点、Enter/Space 选择。

## 4. 本轮真实浏览器验收与修复

- 已登录管理员在 16077 项目列表输入“建模”并按 Enter，结果收敛为单个“建模开发平台”项目；项目卡片摘要显示原型数、成员数和待确认数。
- 进入项目后刷新无深链接，左侧菜单实际激活“提示语管理”；点击“业务域建模-实体”后显示“该菜单项尚未绑定原型”，说明当前激活项是菜单顺序中第一个已绑定项。
- 原型 iframe 能显示业务页面，但旧 release 的预览容错脚本把 Chromium 良性 `ResizeObserver loop completed with undelivered notifications` 误判为致命错误并遮罩页面。
- 平台提交 `250d1bd6` 已仅过滤两类已知良性 ResizeObserver 诊断，保留其他错误提示，并通过后端 `54/54` 回归；待部署到 16077 后复测 iframe 不再出现误报遮罩。

## 5. 尚未宣称完成的门

- 16077 的预览误报修复尚未部署，iframe 修复后的复测仍待执行；远程绑定搜索尚未在页面上完成。
- owner/admin/editor/viewer 四角色完整页面路径、项目组件拆分、端到端生成/上传性能 10 次样本：仍按阶段计划保留，不以本次 API 回读替代。
- 16088 生产发布、GitLab/GitHub 推送、BL-006 实际清理：均未执行。
