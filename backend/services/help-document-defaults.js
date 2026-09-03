const HELP_DOCUMENT_DEFAULTS = [
  {
    slug: 'quick-start',
    title: '伏羲平台快速入门',
    summary: '从接入 AI 工具到发布和分享第一个原型的最短路径。',
    version: '1.0',
    sortOrder: 10,
    categorySlugs: ['beginner', 'beginner-platform', 'beginner-ai', 'beginner-platform-account', 'beginner-ai-create', 'beginner-platform-publish'],
    contentMarkdown: `## 先完成一次接入

1. 在伏羲平台点击「接入平台 MCP」，把生成的提示词交给你正在使用的 AI 工具。
2. 等待 AI 工具完成本地配置、MCP 启动和连接验证。
3. 当 AI 明确报告连接已验证后，打开 AI 工具的新会话。

## 让 AI 创建原型

1. 在伏羲平台「原型列表」点击「让 AI 创建原型」。
2. 把完整提示词发送给 AI，并补充业务需求或需求文件的本地路径。
3. 让 AI 先确认需求、页面、角色和关键交互，再开始实现。
4. 生成完成后，在伏羲平台查看原型预览、设计文档和版本历史。

## 让 AI 修改原型

- 独立原型：从「原型列表」打开未归档原型，点击「让 AI 修改」。
- 项目原型：进入对应项目，选择目标原型后点击「让 AI 修改」。
- 修改前先说明目标页面、用户角色、验收结果和不希望改变的范围。

## 发布与分享

确认预览、交互和版本信息后，再从原型详情执行发布。发布后的原型可以通过分享链接交给同事评审；分享链接只开放被分享的内容，不等同于管理权限。

## 遇到问题时

优先把 AI 返回的完整错误、执行步骤和当前原型版本保留下来，再从「接入平台 MCP」或「常见问题」手册排查。不要在未确认目标的情况下反复执行覆盖、删除或回滚操作。`
  },
  {
    slug: 'mcp-onboarding',
    title: '接入平台 MCP',
    summary: '了解接入前置条件、连接验证结果和失败时的处理方式。',
    version: '1.0',
    sortOrder: 20,
    categorySlugs: ['beginner', 'beginner-platform', 'beginner-platform-mcp'],
    contentMarkdown: `## 接入前准备

- 确认当前 AI 工具能够使用终端、文件和网络请求。
- 确认本机已安装 Node.js 18 或更高版本。
- 允许 AI 工具写入它自己的 MCP 配置目录和 Skill 目录。

## AI 应该完成的步骤

1. 识别当前客户端、操作系统和实际 MCP/Skill 配置目录。
2. 下载并校验 MCP 与 Skill，校验失败立即停止。
3. 备份本地 MCP 配置，再以原子方式写入伏羲配置。
4. 启动 launcher，并调用 \`check_connection({})\` 完成连接码兑换。
5. 检查 \`tools/list\`，确认伏羲工具可见；然后重启客户端并在新会话复核。

## 成功的判断标准

成功不等同于文件下载完成。AI 需要同时报告：连接验证为 verified、伏羲 MCP 工具可见、Skill 文件存在，以及是否需要重启客户端。

## 失败处理

下载摘要不一致、配置路径不明、权限不足、连接码过期或 MCP 工具不可见时，应停止后续业务操作，保留错误码和下一步建议。不要重复执行完整安装，也不要把“进程启动”当作“连接成功”。`
  },
  {
    slug: 'create-prototype',
    title: '让 AI 创建原型',
    summary: '用需求、组件规范和验证目标，让 AI 生成可交付的前端原型。',
    version: '1.0',
    sortOrder: 30,
    categorySlugs: ['beginner', 'beginner-ai', 'beginner-ai-create'],
    contentMarkdown: `## 推荐工作方式

先告诉 AI 原型名称、目标用户、核心任务和验收结果。若有需求文档，提供文件名和完整本地路径，让 AI 先读取并归纳，不要只粘贴片段。

## 创建过程中关注

- 先确认页面结构、角色权限、空状态、加载态和错误态。
- 选择明确的 runtime/profile，不要为了实现方便临时安装未知依赖。
- 使用伏羲平台已提供的组件能力，保持资源路径相对化。
- 生成后执行构建、预览和交付校验，报告失败原因和修复结果。

## 交付前检查

至少检查首页、关键交互、刷新后状态、浏览器控制台错误和最终压缩包内容。只有平台回读成功并能打开预览，才算完成创建。`
  },
  {
    slug: 'platform-basics',
    title: '平台操作总览',
    summary: '认识原型列表、原型详情、项目、帮助中心和系统管理的职责边界。',
    version: '1.0',
    sortOrder: 25,
    categorySlugs: ['beginner', 'beginner-platform', 'beginner-platform-account', 'beginner-platform-publish'],
    contentMarkdown: `## 顶部导航

- **原型列表**：查看、搜索和进入自己有权限访问的原型。
- **项目**：进入项目工作台，管理菜单、成员、绑定原型和协作任务。
- **系统管理**：管理员维护用户、分类、公告、提示词模板和帮助手册。
- **帮助**：阅读已发布手册；管理员可进入手册维护和分类配置。

## 原型详情

原型详情用于查看当前版本、README、文件信息、预览和分享。需要修改时，根据原型是否已绑定项目选择「让 AI 修改」或进入项目后发起项目修改。

## 发布和分享的边界

预览通过不代表已经发布。确认版本和内容后再发布；分享链接面向评审或演示，不等同于管理权限。`
  },
  {
    slug: 'prototype-delivery',
    title: '构建、校验、发布与分享',
    summary: '把 AI 生成的代码变成平台可回读、可预览、可分享的正式原型。',
    version: '1.0',
    sortOrder: 45,
    categorySlugs: ['beginner-platform-publish', 'advanced-ai', 'advanced-ai-quality', 'advanced-platform-safety'],
    contentMarkdown: `## AI 交付的固定顺序

1. 在本地完成构建和必要的类型/资源检查。
2. 调用 \`validate_project\` 检查目录是否符合伏羲交付约束。
3. 调用 \`pack_project\` 生成伏羲 ZIP。
4. 调用 \`validate_zip\` 检查最终 ZIP，而不是只检查源目录。
5. 通过 \`deliver_project\` 创建或更新原型。
6. 读取返回结果，确认状态为 \`COMPLETE\`，再检查版本、README、入口文件、预览和分享链接。

## 预览验收清单

- 首屏和关键页面能打开；
- 主要按钮、表单、筛选和返回路径可操作；
- 空状态、加载态、错误态和刷新后的状态合理；
- 资源路径不依赖开发服务器、本机绝对路径或私有 CDN；
- 浏览器控制台没有阻断性错误；
- 平台回读的入口文件、README 和版本与本次交付一致。

## 失败时

保留构建日志、校验错误和候选状态。不要为了让页面看起来成功而跳过校验，也不要在没有确认目标的情况下删除或回滚。`
  },
  {
    slug: 'project-collaboration',
    title: '项目协作：菜单、成员与候选审核',
    summary: '通过项目绑定、签出签入和候选采用，让多人并行修改而不覆盖正式版本。',
    version: '1.0',
    sortOrder: 55,
    categorySlugs: ['advanced', 'advanced-platform', 'advanced-platform-project', 'advanced-platform-safety'],
    contentMarkdown: `## Owner/Admin 配置项目

1. 在「项目」中创建项目。
2. 进入项目后配置一级、二级菜单。
3. 在菜单节点绑定已有原型；同一原型可以在同一项目的多个菜单位置展示。
4. 在「成员」中添加编辑者或查看者，并按项目范围分配职责。

## 编辑者修改项目原型

1. 打开项目菜单节点，确认绑定的原型和当前版本。
2. 点击「签出原型」，获得该菜单节点的编辑锁。
3. 在本地让 AI 按项目上下文生成修改候选。
4. 使用项目修改提示词和 \`project-bound-update\` 流程上传候选。
5. 预览无误后点击「签入」，释放编辑锁。

## 候选审核

项目修改候选上传后不会自动改变正式版本。Owner/Admin 在任务管理器中预览候选，确认后点击「采用候选」；退回只关闭候选，不改变正式原型。

## 快照

重大调整前创建项目快照，快照记录菜单结构、绑定关系和版本。恢复快照属于高风险操作，需要确认影响范围后再执行。`
  },
  {
    slug: 'spec-and-quality',
    title: '规范、运行时与输出模式',
    summary: '让 AI 先选对 prototype spec、runtime profile 和输出模式，再开始写代码。',
    version: '1.0',
    sortOrder: 65,
    categorySlugs: ['advanced', 'advanced-ai', 'advanced-ai-profile', 'advanced-ai-quality'],
    contentMarkdown: `## 选择 prototype spec

根据需求选择一个原型规范，一次运行只使用一个规范。不要把不同规范的组件和规则混在同一个原型里。

## 选择 runtime profile

- 新原型：使用所选规范的默认 profile；Tiangong 当前优先 \`vue3-element-plus\`。
- 已有原型：从 README、依赖和源码证据识别现有 profile，并保持一致。
- 证据冲突或无法判断：停止并报告 \`RUNTIME_PROFILE_REQUIRED\`，不要自行安装或切换 SkyUI。

## 两种输出模式

- **alignment**：默认模式，重点证明需求、布局、关键交互和状态，允许轻量自定义控件，但要诚实说明限制。
- **implementation-proof**：严格按所选 profile 的组件文档实现；找不到等价能力时报告 \`COMPONENT_PROFILE_GAP\`，不能用仿制控件冒充。

## 质量闭环

生成后必须完成构建、目录校验、打包、ZIP 校验和平台回读。质量门禁发现问题后，修复并重新构建和预览，不用静态检查通过替代真实页面证据。`
  },
  {
    slug: 'prompt-recipes',
    title: 'AI 提示词最佳实践',
    summary: '用清晰的范围、结果和停止条件，降低 AI 助手理解偏差和返工次数。',
    version: '1.0',
    sortOrder: 75,
    categorySlugs: ['beginner-ai', 'advanced-ai', 'advanced-ai-profile', 'advanced-ai-quality'],
    contentMarkdown: `## 创建原型

\`\`\`text
使用 fuxi-prototype 创建一个“客户管理”原型。
目标用户：销售人员；核心任务：查看客户、筛选跟进状态、打开客户详情。
请先读取需求文件 <完整本地路径>，先确认页面、角色、关键交互和验收结果，再开始实现。
使用 prototype spec <规范名> 和 runtime profile <profile>，输出模式使用 alignment。
完成后按 build -> validate_project -> pack_project -> validate_zip -> deliver_project 顺序交付，返回版本、README、预览和失败阶段。
\`\`\`

## 修改独立原型

\`\`\`text
使用 fuxi-prototype 修改 prototypeId=<明确 ID> 的原型，当前版本 v<版本>。
修改范围：<页面/交互/数据>；不改变：<明确保留内容>；验收：<可观察结果>。
请先读取当前原型 README 和版本事实，保持原 runtime profile，完成构建、校验、打包、回读和预览。
\`\`\`

## 修改项目原型

\`\`\`text
在 projectId=<项目 ID> 的 projectPrototypeId=<绑定 ID>、菜单路径 <路径> 上修改原型。
我已在平台完成签出。请使用项目上下文生成候选，不要直接覆盖正式版本；上传后等待负责人预览和采用。
\`\`\`

## 提示词写法

明确目标对象、当前版本、修改边界、验收结果和停止条件。不要只说“做得更好看”，也不要让 AI 猜测项目 ID、profile、版本或权限。`
  },
  {
    slug: 'troubleshooting',
    title: '故障排查与安全边界',
    summary: '按阶段定位接入、生成、上传、预览和协作失败，不用破坏性操作掩盖问题。',
    version: '1.0',
    sortOrder: 85,
    categorySlugs: ['beginner-platform-mcp', 'beginner-platform-publish', 'advanced-platform', 'advanced-platform-safety', 'advanced-ai-quality'],
    contentMarkdown: `## MCP/Skill 接入失败

按“客户端识别 → 配置路径 → 下载校验 → 备份写入 → launcher 启动 → \`check_connection\` → \`tools/list\` → 新会话复核”定位。文件存在不等于客户端已加载；连接成功必须看到 \`authentication=verified\`。

## 版本冲突

更新必须使用明确的 prototypeId 和 expectedVersion。若返回版本冲突或候选过期，重新读取当前版本后再发起一次新的修改任务，不要强行覆盖。

## 预览失败

先检查平台回读的入口文件、README、构建输出、资源路径和浏览器控制台。保留失败候选，修复后重新校验和上传。

## 权限不足

平台、项目和菜单的权限是分开的。查看、编辑、上传、采用、发布、分享、删除、恢复和释放签出锁不是同一个权限；只申请当前需要的操作。

## 高风险工具

\`delete_prototype\`、\`rollback_version\`、\`restore_snapshot\`、\`force_release_checkout\` 需要明确的 \`confirm: true\`，并按当前环境的备份门禁执行。普通创建或修改任务不得调用这些工具。`
  },
  {
    slug: 'modify-prototype',
    title: '让 AI 修改原型',
    summary: '在保留版本边界和现有能力的前提下，安全完成独立原型或项目原型修改。',
    version: '1.0',
    sortOrder: 40,
    categorySlugs: ['beginner-ai', 'advanced-ai', 'advanced-ai-quality'],
    contentMarkdown: `## 修改前先确认

说明目标原型、目标版本、修改范围、验收标准和明确不改的部分。需要读取需求附件时，先确认附件是否存在，并以文档内容和本次明确要求为准。

## 两种修改路径

- 独立原型修改：基于正式版本源码生成新的版本候选，完成构建和静态交付检查。
- 项目原型修改：先明确项目和目标原型，再在项目上下文中生成候选，交由负责人预览和采用。

## 版本安全

修改只能产生高于当前版本的新版本，平台负责计算准确版本号。预览无法加载时先检查上传结果、入口文件和构建日志，不要直接删除历史版本或覆盖正式版本。`
  },
  {
    slug: 'faq',
    title: '常见问题',
    summary: '集中处理接入、预览、版本和权限相关的常见疑问。',
    version: '1.0',
    sortOrder: 50,
    categorySlugs: ['beginner-platform', 'advanced-platform', 'advanced-platform-safety'],
    contentMarkdown: `## 为什么接入后还要打开新会话？

多数 AI 工具只在新会话初始化时重新加载 MCP 工具和 Skill。接入脚本完成后，重启客户端或打开新会话，再检查伏羲工具是否出现在工具列表中。

## 文件存在但 AI 仍然不能使用怎么办？

文件存在只能证明安装写入完成，不能证明客户端已经加载。先关闭旧会话，重启客户端；仍不可用时检查实际配置目录、MCP 启动日志和工具列表。

## 预览打不开怎么办？

先确认平台回读是否成功，再检查入口文件、构建输出和浏览器控制台。保留失败版本和日志，避免用删除操作掩盖问题。

## 我没有权限怎么办？

查看、编辑、发布、分享和删除是不同权限。联系项目负责人或平台管理员申请目标操作权限，不要借用他人账号或 token。`
  }
];

module.exports = { HELP_DOCUMENT_DEFAULTS };
