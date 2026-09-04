# 阶段 28：接入提示词引用已发布快速入门

> 状态：`in-progress`
>
> 目标验收：接入提示词能读取帮助中心已发布的 `quick-start` 快照并安全展示；16077 测试环境验收，16088 生产环境不在本轮范围。
>
> 日期：2026-09-04

## 1. 目标与边界

帮助中心已在阶段 27 完成验收。现在把原来写死在 `mcp.onboarding` 中的接入成功引导，改为引用帮助中心的已发布快速入门手册。

本阶段只改 FuxiPlatform 的提示词模板和接入提示词生成链路：

- 不增加 MCP `get_help/search_help` 工具；
- 不修改 `prototype-manager-skills`、Skill 入口、能力缓存、runtime/profile 或 ZIP；
- 不改变 MCP 接入、连接码兑换和客户端重载步骤；
- 不把草稿、归档手册或凭据写入提示词。

## 2. 技术实现

### 2.1 受控变量

`mcp.onboarding` 新增：

- `{{quickStartGuide}}`：请求生成时读取 `quick-start` 的 published 快照，拼接标题、版本、摘要和 Markdown 正文，去除 HTML 标签并限制最大长度为 12000 字符；
- `{{helpVersion}}`：注入本次提示词使用的手册版本。

生成入口仍为 `GET /api/integrations/agent-bootstrap`，只在模板渲染前增加帮助快照变量，不改变 token、连接码、manifest 或下载地址的生成规则。

### 2.2 失败兜底

当 `quick-start` 不存在、未发布或已归档时：

- `helpVersion=unavailable`；
- `quickStartGuide` 使用最小兜底文本，引导用户打开伏羲「帮助」阅读最新手册；
- 接入任务本身继续按原有连接验证流程执行，不因帮助内容不可用而伪造成功。

### 2.3 旧数据库升级

数据库启动时对已有 `prompt_templates` 做安全升级：

- 内置默认模板自动替换为带新变量的版本；
- 默认 Mock 自动补齐手册版本和内容；
- 管理员已经自定义的模板正文不覆盖，只更新默认模板、允许变量和缺失的 Mock 字段；
- 管理员可以继续在系统管理的提示词模板页面调整模板。

## 3. 本地验收

- [x] prompt 模板专项测试通过：默认 Mock 可渲染，新变量无未替换占位符。
- [x] published 快照读取和归档后兜底测试通过。
- [x] 旧默认模板升级测试通过，自定义模板覆盖边界保留。
- [ ] 后端全量测试、前端构建和 `git diff --check` 通过。

## 4. 16077 验收

- [ ] 登录管理员调用 `GET /api/integrations/agent-bootstrap`，生成提示词包含 `helpVersion` 对应版本和快速入门正文。
- [ ] 生成结果不包含 `{{quickStartGuide}}` / `{{helpVersion}}` 未替换占位符，不回显 token、连接码或凭据文件内容。
- [ ] 帮助中心更新并发布新版本后，下一次生成的接入提示词读取新版本；草稿不提前生效。
- [ ] 手册不可读时生成最小兜底，接入任务仍保持原有行为。
- [ ] 现有接入入口页面、MCP/Skill 下载链路和其他提示词场景不回归。
- [ ] 记录 platform commit、release ID、备份 ID；不触碰 16088。

## 5. 跨仓库判断

本阶段只修改 FuxiPlatform。`D:\_projects\skills\prototype-manager-skills` 不需要修改，因为新增的是平台在生成接入提示词时的服务端变量，不是 MCP 工具、Skill 指令或安装契约。待下一阶段增加 `get_help/search_help` 时，再按跨仓库变更处理。
