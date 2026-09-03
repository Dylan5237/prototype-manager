# 阶段 27：操作手册补全与帮助分类

> 状态：`completed`
>
> 目标验收：帮助中心与分类配置成功部署到 16077 测试环境；16088 生产环境不在本轮范围。
>
> 日期：2026-09-03

## 1. 需求与边界

阶段 26 已建立帮助中心的阅读、草稿、预览和发布能力。本阶段在其上补齐两项用户价值：

1. 用代码当前真实行为为依据，补全伏羲平台操作手册，使首次用户能从注册、MCP/Skill 接入一路完成原型创建、修改、项目协作、发布和分享。
2. 在系统管理的帮助中心下增加可配置的分层分类；一个手册可以归属多个分类，普通用户可按分类阅读。

本阶段仍不新增伏羲客户端、不增加伏羲 AI 对话、不把手册注入现有提示词，也不修改 `prototype-manager-skills`、MCP 工具契约或 Skill 安装包。

## 2. 初始内容与分类

### 2.1 内置手册

初始内置 11 篇已发布手册：

`quick-start`、`mcp-onboarding`、`platform-basics`、`create-prototype`、`modify-prototype`、`prototype-delivery`、`faq`、`project-collaboration`、`spec-and-quality`、`prompt-recipes`、`troubleshooting`。

`OPERATION_MANUAL.md` 是仓库级完整操作手册；数据库种子内容与帮助中心内置手册保持同一套用户故事，但普通用户以后以帮助中心已发布快照为准。

### 2.2 初始分类树

```text
基础入门
├── 平台操作
│   ├── 账号与导航
│   ├── MCP 与 Skill 接入
│   └── 发布与分享
└── AI 原型设计
    └── 创建第一个原型

进阶使用
├── 平台操作
│   ├── 项目协作
│   └── 版本与安全
└── AI 原型设计
    ├── 质量校验与交付
    └── 规范与运行时选择
```

分类使用 `help_categories` + `help_document_categories` 多对多模型。根分类和叶子分类都可配置类型 `general`、`platform`、`ai_prototype`；分类归档不删除手册正文，归档分类不会出现在普通用户目录。

## 3. 页面与 API

- 普通用户：`/help` 顶部按分类筛选，分类选择包含层级路径；仍只读取已发布帮助内容。
- 管理员：`系统管理 → 帮助中心 → 使用手册` 维护正文和手册归属分类。
- 管理员：`系统管理 → 帮助中心 → 手册分类` 新建一级/子分类、编辑名称/标识/类型/父级/排序/说明、归档/恢复，并配置当前分类的手册集合。
- `GET /api/help-categories`：读取活动分类树。
- 管理员 `GET /api/help-categories?includeArchived=true&includeDocuments=true`：读取完整分类和手册分发信息。
- `POST/PUT /api/help-categories`：创建和更新分类。
- `POST /api/help-categories/:id/archive|restore`：归档/恢复分类，禁止归档仍有活动子分类的父分类。
- `PUT /api/help-categories/:id/documents`：更新当前分类的手册集合，保留手册的其他分类关系。
- `PUT /api/help-documents/:slug/categories`：从手册维护页直接更新多分类归属。
- `GET /api/help-documents?categoryId=`：支持服务端分类过滤；阅读页同时按树的后代分类展示内容。

后端只允许 `admin` / `platform_admin` 修改分类和分发；分类 ID、slug、父级环和手册存在性均在服务层校验，写入使用事务。

## 4. 跨仓库影响判断

- FuxiPlatform：需要修改数据库迁移、帮助服务/API、帮助阅读页、管理员维护页、路由、菜单、种子手册和测试。
- `D:\_projects\skills\prototype-manager-skills`：不修改。原因是本阶段不改变 Skill 入口、工作流、能力缓存、runtime/profile、ZIP、安装流程或 MCP schema；已执行 `node fuxi-prototype/scripts/build-capability-cache.cjs check fuxi-prototype`，结果为 `CACHE_VALID`。

## 5. 本地验收条件

- [x] 后端帮助文档、提示词模板和分类专项测试通过。
- [x] 后端全量测试通过。
- [x] 前端构建通过。
- [x] `git diff --check` 通过。
- [x] 分类树、11 篇手册、多分类分发和权限边界具备真实 API 回读证据。

## 6. 16077 测试环境验收条件

- [x] health 和 Nginx 入口返回 `200`，未登录帮助 API 返回 `401`。
- [x] 登录用户 `/help` 能读取 11 篇已发布手册，并按“基础入门 / 进阶使用”及其子分类筛选。
- [x] 管理员 `/admin/help` 能读取手册维护数据，支持正文与多分类归属入口。
- [x] 管理员 `/admin/help-categories` 能读取分类树、分类分发数据和维护入口。
- [x] 页面资源 `/help`、`/admin/help`、`/admin/help-categories` 均可达，帮助页面 JS/CSS 资源返回 `200`。
- [x] 记录 platform commit、release ID、远端备份 ID；不触碰 16088。

## 7. 提交与发布计划

1. `feat(帮助中心): 增加分层分类与手册分发`：数据库、服务/API、前端分类筛选和管理页、专项测试。
2. `docs(操作手册): 补全平台与Skill用户故事`：仓库操作手册、阶段设计和相关计划/Backlog。
3. 测试环境部署完成后，补一笔只记录真实 16077 回读结果的验收文档 commit。

手册引入 `mcp.onboarding` 的 `{{quickStartGuide}}` / `{{helpVersion}}`，以及 MCP `get_help` / `search_help` 仍属于后续阶段；本阶段不以其完成作为验收条件。

## 8. 16077 实际验收证据

- release：`20260903-174757-464ee5d9`；platform commit：`464ee5d9281ac1c0cb9d1e43764686fe9c1054c2`；Skill commit：`686d0e3bf618d3af063051b7ff939de102ba4641`。
- 备份：`20260903-174838-pre-test-20260903-174757-464ee5d9`；部署结果：`deployment_status=complete`。
- 基础状态：health `200`、Nginx `200`、未登录 `/api/help-documents` `401`、未登录 `/api/help-categories` `401`。
- 真实登录回读：用户 `wushengzhi` 读取 11 篇 published 手册，首篇 `quick-start`；读取 14 个活动分类，根分类为「基础入门」「进阶使用」。
- 分类筛选回读：`beginner-ai` 返回 `quick-start`、`create-prototype`、`modify-prototype`、`prompt-recipes`；管理员 `includeDrafts=true` 读取 11 篇手册，14 个分类均有分发信息。
- 页面与资源：`/help`、`/admin/help`、`/admin/help-categories` 均为 `200`；HelpCenter 和 AdminHelpCategories 的 JS/CSS 资源均为 `200`。
- 本轮没有推送远端，没有部署 16088；`prototype-manager-skills` 未修改，缓存兼容性检查为 `CACHE_VALID`。
