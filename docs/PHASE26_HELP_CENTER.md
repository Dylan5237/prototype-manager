# 阶段 26：帮助中心与手册维护

> 状态：`in-progress`
>
> 目标验收：帮助中心成功部署到 16077 测试环境；16088 生产环境不在本轮范围。
>
> 日期：2026-09-03

## 1. 背景与边界

接入成功后给用户展示的快速入门目前写死在接入提示词里，管理员无法独立维护，内容更新也不能被普通用户直接复用。本阶段先建立一个稳定的帮助内容源和 Web 阅读/维护入口。

产品边界保持不变：伏羲是轻量 Web 原型查看、发布和分享平台，不增加独立客户端，也不增加伏羲 AI 对话功能。

本阶段明确不做：

- 不把帮助正文注入 `mcp.onboarding` 或其他现有提示词；
- 不新增 MCP `get_help` / `search_help` 工具；
- 不修改 `prototype-manager-skills` 的入口、工作流、能力缓存、ZIP 或 MCP 契约；
- 不部署 16088，不推送 GitLab/GitHub。

## 2. 用户故事

### 普通用户

登录后从顶部「帮助」进入帮助中心，按目录搜索并阅读已发布手册，能够理解 MCP 接入、AI 创建/修改原型、版本发布和常见故障处理。

### 管理员

从「系统管理 → 帮助中心 → 使用手册」维护内置手册：编辑 Markdown 草稿、查看安全预览、保存草稿、发布新版本。编辑草稿期间，普通用户继续读取上一份已发布内容。

## 3. 交互设计

设计稿：[help-module-prototype](design/help-module-prototype/README.md)

### 阅读态 `/help`

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 帮助中心 / 使用手册                 搜索手册  维护手册  刷新            │
├───────────────┬──────────────────────────────────┬───────────────────┤
│ 目录           │ 版本 / 更新时间                   │ AI 助手上下文      │
│ • 快速入门     │ 标题                             │ 当前阅读建议      │
│ • MCP 接入     │ 摘要                             │ MCP 动态读取预留  │
│ • 创建原型     │ Markdown 渲染正文                │                   │
│ • 修改原型     │                                  │                   │
│ • 常见问题     │                                  │                   │
└───────────────┴──────────────────────────────────┴───────────────────┘
```

### 维护态 `/admin/help`

沿用同一套视觉语言，左侧选择手册，中间编辑标题、摘要、版本和 Markdown 正文，右侧显示发布状态和预览；底部固定保存草稿/发布操作，不依赖整页下拉。

## 4. 技术设计

### 4.1 内容模型

`help_documents` 使用稳定 `slug` 作为文档身份，草稿字段和已发布快照分离：

| 字段组 | 作用 |
|---|---|
| `slug` / `sort_order` | 稳定引用标识和目录排序 |
| `title` / `summary` / `content_markdown` / `version` | 当前管理员草稿 |
| `status` / `updated_by` / `updated_at` | 草稿、已发布、已归档和审计信息 |
| `published_*` / `published_at` | 普通用户可读的最后一次发布快照 |

初始化内置 5 篇手册：`quick-start`、`mcp-onboarding`、`create-prototype`、`modify-prototype`、`faq`。仅在 slug 不存在时初始化，不覆盖管理员已经维护的内容。

### 4.2 API

- 普通用户：`GET /api/help-documents`、`GET /api/help-documents/:slug`，只读取未归档的 published 快照。
- 管理员：增加 `includeDrafts=true` 列表、草稿预览、保存、发布和归档操作。
- 服务端统一 Markdown 安全渲染，移除 `<script>`、`<style>`、事件属性和 `javascript:` 协议。
- 后续提示词和 MCP 只依赖服务层的 published 读取函数，不直接读 SQLite，不复制造成分叉。

### 4.3 后续扩展

帮助中心验收后按以下顺序实施：

1. `mcp.onboarding` 增加 `{{quickStartGuide}}`、`{{helpVersion}}`，平台生成提示词时读取 `quick-start` published 快照并渲染为受控纯文本。
2. 平台 MCP 增加 `get_help({ slug })`、`search_help({ query })` 只读工具，返回 `slug/title/version/content/updatedAt`。
3. 同步 Skill 工作流和能力缓存，增加新会话展示最新手册及读取失败 fallback 的真实 AI 验收。

这三步需要再次评估 FuxiPlatform 与 `D:\_projects\skills\prototype-manager-skills` 的跨仓契约；本阶段 Skill 仓库保持不变。

## 5. 验收门禁

### 本地

- 后端帮助中心专项测试通过：初始化、发布快照隔离、Markdown 安全预览、归档可恢复读取；
- 既有提示词模板专项测试通过，确认本阶段未改变提示词模板链路；
- 后端全量测试、前端 `npm run build`、`git diff --check` 通过。

### 16077 测试环境

- release 使用轻量部署流程，健康检查 `200`，Nginx 入口 `200`，未登录 API 仍按权限返回 `401`；
- 登录用户访问 `/help`，能读取 5 篇已发布手册；
- 管理员访问 `/admin/help`，能读取草稿维护入口；
- 预览接口能返回安全 HTML，普通用户不能读取草稿；
- 验证结果记录 platform commit、release ID、备份 ID 和实际接口回读结果。

阶段只有在上述 16077 条件满足后，才标记 `completed`。手册引入提示词是下一阶段，不用本阶段结果代替。
