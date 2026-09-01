# 阶段 22：项目模块增量验收证据

> 日期：2026-09-01
> 范围：固定默认入口、项目列表筛选/分页、绑定原型服务端搜索分页、MCP 签出门禁
> 环境：本地回归 + 16077 测试环境；未操作 16088

## 1. 交付绑定

| 项目 | 值 |
|---|---|
| Platform HEAD | `8515dc0fb17d8f88511d7799e40b094ab5fee5f9` |
| MCP 行为修复 | `d2c368f`（项目绑定更新先校验签出） |
| 项目列表分页/筛选 | `b4d5d0f` |
| 绑定选择器服务端搜索 | `5b52785`、`80ac1f9` |
| Skill HEAD | `20973174e0c05fbd6ee6ffada808c80a0f5ccfa4`（本阶段未修改） |
| 16077 release | `20260901-173423-8515dc0f` |
| release SHA-256 | `4cde2a280f54557fa9fabf74fb0324026b9b1b0bcc676b23316138a1de1e789e` |
| 16077 备份 | `20260901-173607-pre-test-20260901-173423-8515dc0f` |

## 2. 本地自动化门禁

- 前端 `npm run build`：通过；最大第三方 JS `408.98 kB`，未调高告警阈值。
- 后端 `npm test`：第三次全量 `54/54` 通过；此前两次各有一个既有临时目录/SQLite 相关间歇失败，隔离测试通过，已记录观察项。
- 后端项目绑定/列表测试：`3/3` 通过。
- MCP `npm run check`：通过；`npm run test:integration`：通过，项目绑定无签出返回 `CHECKOUT_REQUIRED`。
- Skill：单测 `50/50`、行为回归 `8/8`、能力缓存 `CACHE_VALID`。

## 3. 16077 远端回读

认证回读脚本通过凭据包装器执行，未输出凭据值：

- `health=200`、首页/Nginx `200`、未授权 bootstrap `401`。
- 认证用户 ID `14`，项目列表返回 `3` 条；`prototype_count`、`member_count`、`pending_candidate_count`、`last_activity_at` 均存在。
- 项目列表 `total/page/pageSize` 存在；原型列表 `scope=all&page=1&pageSize=20` 返回分页总数字段。
- 项目详情均为 `200`；含菜单配置路径的项目计算出的第一个已绑定路径为 `group_1782383481579/item_1782383489815`。
- 两个历史项目的原始 API `menu_config` 为空但存在 `menu_path=acceptance/lightweight` 绑定；前端内存兼容层会合成只读菜单项，不回写项目数据。

## 4. 尚未宣称完成的门

- 新浏览器会话下的 16077 页面筛选、远程绑定搜索、默认入口真实点击验收：本轮未执行；旧 tab 已失效（`Unknown tab: 1`）。
- owner/admin/editor/viewer 四角色完整页面路径、项目组件拆分、端到端生成/上传性能 10 次样本：仍按阶段计划保留，不以本次 API 回读替代。
- 16088 生产发布、GitLab/GitHub 推送、BL-006 实际清理：均未执行。

