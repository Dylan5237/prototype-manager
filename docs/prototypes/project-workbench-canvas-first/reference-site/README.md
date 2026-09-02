# 已确认交互参考站

此目录保存本次对话中用户认为“效果还可以”的交互原型源码。它用于传递页面模式、空间分配、菜单/审核抽屉和关键状态，不是产品代码模板。

## 内容

- `app/page.tsx`：项目浏览态、原型工作台态、左右互斥抽屉及演示数据。
- `app/globals.css`：参考站布局和视觉样式。
- `app/layout.tsx`：参考站根布局。
- `package.json`：原参考站依赖与脚本，仅供还原环境。
- `fuxi-project-workbench-reference-source.zip`：可独立解压的完整参考源码包，排除了 `node_modules`、构建产物、数据库和部署状态。

## 如何使用

本地 Codex应先读 `../FULL_DESIGN.md`，再把本目录当作行为参考：

- 项目浏览态允许真实产品菜单常驻。
- “进入原型工作台”后默认只保留紧凑上下文、工具栏和大画布。
- 项目菜单从左覆盖打开。
- 待处理/模块协作从右覆盖打开。
- 两个抽屉互斥，不缩窄画布。
- 正式版/候选版、让 AI 修改和专注模式处于画布附近。

不要把此项目直接复制进产品仓库。产品前端是 Vue 3 + Element Plus，本参考站是 React/Vinext + Shadcn；技术实现必须重写为现有栈并复用真实 API、权限和候选流程。

## 在线地址的限制

在线参考地址 `https://fuxi-project-workbench.aqua-panda-3983.chatgpt.site` 可能要求原 ChatGPT Work 所有者身份，因此不是交接事实源。本目录的设计文档与源码才是本地 Codex可依赖的输入。

