# 项目工作台 Canvas-first 改版交接包

> 状态：设计方向已由用户确认，可进入前端实现  
> 目标仓库：`Dylan5237/prototype-manager`  
> 目标分支：`design/project-workbench-canvas-first`  
> 范围：项目门户与原型预览工作区的前端信息架构和交互改版

## 一句话结论

保留“项目菜单”作为真实产品信息架构、责任边界和原型绑定入口，但把“看项目”和“做原型”拆成两个模式：项目浏览态允许菜单常驻；进入原型工作台后以原型画布为主，项目菜单与待处理协作改为互斥的覆盖式抽屉，不再同时挤压画布。

## 给本地 Codex 的最短入口

切换到本分支后，把下面这句话交给 Codex：

> 请完整阅读 `docs/prototypes/project-workbench-canvas-first/CODEX_HANDOFF_PROMPT.md`，并严格按其中的目标、范围、设计约束和验收标准完成实现。先核对仓库现状与文档中的实现映射，再直接修改前端、运行构建并汇报结果；不要改后端、部署或自行扩大范围。

完整、可直接复制的任务书见 [`CODEX_HANDOFF_PROMPT.md`](CODEX_HANDOFF_PROMPT.md)。

## 交付物索引

| 文件 | 用途 | 是否为实现依据 |
|---|---|---|
| [`FULL_DESIGN.md`](FULL_DESIGN.md) | 背景、领域模型、问题诊断、方案、交互原则与验收标准 | 是，产品与设计事实源 |
| [`CODEX_HANDOFF_PROMPT.md`](CODEX_HANDOFF_PROMPT.md) | 给本地 Codex 的完整执行提示词 | 是，执行入口 |
| [`design-contract.json`](design-contract.json) | 可机器读取的范围与硬性验收条件 | 是，约束事实源 |
| [`reference-site/`](reference-site/) | 已获用户认可的交互参考源码与源码包 | 是，但只参考行为与布局，不照搬技术栈 |
| [`assets/`](assets/) | 原始页面和被否决迭代的历史视觉资料 | 否，仅供用户与 ChatGPT 复盘 |

## 与当前仓库的对应关系

当前前端为 Vue 3 + Vite + Element Plus。最相关的已有实现是：

- `frontend/src/views/ProjectView.vue`：当前项目门户、项目菜单、绑定原型、候选任务与审核入口。
- `frontend/src/views/ProjectPreview.vue`：当前全屏项目预览，仍是“固定左菜单 + 右侧 iframe”。
- `frontend/src/router/index.js`：已有 `/project/:id` 与 `/project/:id/preview` 路由。
- `frontend/src/api/projects` 相关接口：继续复用现有项目、菜单、绑定、候选和权限数据，不在本任务发明新数据模型。

## 重要边界

- 本包是设计交接，不是一个新的产品实现或新技术栈。
- 参考站使用 React/Vinext 只是为了快速表达交互；落地必须使用仓库现有 Vue 3、Element Plus 与既有组件。
- 本任务不改后端、数据库、MCP、权限规则、候选状态机或发布脚本。
- 本任务不部署到 16077/16088，不创建生产 release，不合并主分支。
- GitHub 不是仓库文档所述的生产来源；本分支仅用于本次设计交接与本地实现。

## 原型访问说明

先前在线参考地址可能要求 ChatGPT Work 身份，不能作为本地 Codex 的可靠输入。本分支已包含参考源码和压缩源码包，因此本地 Codex 不需要访问私有在线页面，也不需要读取截图来理解任务。

