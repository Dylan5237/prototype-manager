# 提示词变量引用使用手册：可行技术路径

## 结论

可行，但“变量引用”必须由伏羲平台后端在生成提示词时解析，或者由接入后的 MCP 工具动态读取。AI 助手不会因为看到 {{quickStartGuide}} 就自动知道如何访问伏羲平台。

推荐采用“两阶段”方案：

1. 接入前：后端把已发布的快速入门手册渲染为 quickStartGuide 的内容快照，嵌入接入提示词，确保首次接入完成后即可展示。
2. 接入后：MCP 增加 get_help / search_help 工具，新会话按 slug 读取最新已发布手册，AI 将工具返回内容展示给用户。

## 1. 手册维护

新增 help_documents：

- slug：稳定标识，例如 quick-start、mcp-onboarding；
- title、summary、content_markdown；
- status：draft / published / archived；
- version、updated_by、updated_at、published_at、sort_order。

管理端提供：编辑草稿 → Mock/预览 → 发布新版本。普通用户和 MCP 只能读取 published 版本。

## 2. 接入提示词中的变量

mcp.onboarding 模板可增加：

~~~text
接入成功后，请展示下面的伏羲平台快速入门手册：
{{quickStartGuide}}
手册版本：{{helpVersion}}
~~~

后端生成 /api/integrations/agent-bootstrap 时：

1. 读取 quick-start 的最新 published 版本；
2. 将 Markdown 转为受控纯文本或安全 HTML；
3. 传入 quickStartGuide、helpVersion；
4. 服务端完成变量渲染后，才把提示词返回给前端复制。

这条路径最容易落地，但携带的是生成时快照：管理员之后发布新版本，不会改变已经复制出去的提示词。

## 3. 接入后的动态读取

MCP Server 增加两个只读工具：

~~~text
get_help({ slug: "quick-start" })
search_help({ query: "如何修改原型" })
~~~

工具返回结构：

~~~json
{
  "slug": "quick-start",
  "title": "伏羲平台快速入门",
  "version": "1.1",
  "content": "...",
  "updatedAt": "2026-09-03T12:00:00.000Z"
}
~~~

模板中不直接塞入全部正文，而是使用受控指令：

~~~text
MCP 接入并验证成功后：
1. 调用 get_help({ slug: "quick-start" })；
2. 仅依据工具返回的 content 向用户展示快速入门；
3. 同时返回手册 version 和 updatedAt；
4. 工具失败时报告帮助读取失败，不要自行编造手册内容。
~~~

这样 AI 助手展示的是最新发布内容，且不需要前端页面参与。

## 4. 鉴权与稳定性

- Help API 和 MCP 工具只返回 published 内容；
- MCP 工具复用现有用户会话 token，不在手册内容中写 token、密码或连接码；
- 使用 ETag / updatedAt 做缓存，发布新版本时按 slug 失效；
- 手册读取失败时保留提示词内嵌快照作为 fallback；
- get_help 返回 version 和 updatedAt，便于确认 AI 展示的内容版本；
- Markdown 渲染必须做 HTML 白名单过滤，避免帮助正文注入脚本。

## 推荐实施顺序

1. 帮助中心阅读页、管理员编辑/发布、published API；
2. 在 mcp.onboarding 增加 quickStartGuide / helpVersion 快照变量；
3. MCP 增加 get_help，同步 Skill 工具说明和分发包；
4. 增加真实 AI 会话验收：接入成功展示、刷新后读取新版本、读取失败 fallback。
