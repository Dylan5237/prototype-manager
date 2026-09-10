# 伏羲平台操作手册

> 面向第一次使用伏羲平台的产品、设计和研发同学。本文以当前代码、Web 页面、MCP 工具和 `fuxi-prototype` Skill 的实际行为为准；按钮名称或权限不确定时，以当前页面和 AI 返回的结构化结果为准。

## 先记住一条最短路径

```text
注册/登录
  → 接入平台 MCP
  → 把平台生成的完整提示词交给 AI 助手
  → AI 完成本地 MCP/Skill 安装并验证
  → 打开 AI 工具新会话
  → 让 AI 创建原型
  → 回伏羲查看预览和版本
  → 需要时发布、分享或进入项目协作
```

伏羲平台是轻量 Web 原型查看、发布和分享平台，不需要另装伏羲客户端，也不提供独立的 AI 对话窗口。AI 对话仍发生在用户选择的 AI 工具中，伏羲负责原型、版本、项目和交付结果。

---

## 一、第一次使用：从注册到接入

### 1.1 注册并登录

打开伏羲平台网页，按页面完成注册和登录。登录后可以看到：

| 入口 | 用途 |
|---|---|
| 原型列表 | 查看、筛选、创建和进入原型详情 |
| 项目 | 管理项目菜单、成员、绑定原型和协作候选 |
| 系统管理 | 仅管理员可见，用于平台配置和运营维护 |
| 帮助 | 阅读已发布的使用手册 |

如果没有看到某个按钮，先确认登录账号和当前角色，不要借用他人账号或 token。

### 1.2 接入平台 MCP

在页面中点击「接入平台 MCP」时，先显式选择当前使用的 AI Host，再复制或使用页面生成的完整提示词，发送给该 AI 助手。提示词不是业务聊天指令，而是触发唯一 onboarding 程序的任务入口。

当前 Host 策略为：

- **WorkBuddy**：推荐并稳定支持；
- **Cursor**：兼容支持；
- **Codex**：当前不提供确定性自动安装配置；
- **其他 Host**：仅进行能力发现，不自动猜测配置路径或伪造安装。

Known Host 的标准配置路径、下载、校验、安装、认证和验证均由 onboarding 程序决定。正常路径不要求 AI 解码 launcher、扫描 `.workbuddy/.cursor`、自行做 Node 预检查或二次确认配置。

接入程序会同时校验 MCP 与 Skill artifact SHA-256。只有两者都与当前平台发布版本一致时，才允许判定为 `ALREADY_COMPLETE`；任一摘要不一致都必须执行真实升级。

完成安装或升级后：

1. 按客户端要求完成终端执行授权；
2. 如 WorkBuddy 提示信任自定义连接器，在「连接器 → 自定义连接器」中信任 `fuxi-platform`；
3. 重新加载客户端或新开会话；
4. 调用 `check_connection({})`，并完成工具发现验证，确认伏羲 MCP 工具已正常加载。

只有 MCP/Skill 摘要匹配、`check_connection` 返回 `ok=true` 且 `authentication=verified`、工具已发现，并完成 reload/new session 后的验证，才算接入成功。文件下载成功、launcher 启动或配置文件写入都不等于接入成功。连接码、安装 token、refresh token、密码和完整凭据文件内容不应出现在聊天回复、日志、业务仓库或 Skill 文件中。

### 1.3 接入失败怎么处理

按阶段查看 AI 的报告：

| 阶段 | 常见现象 | 正确处理 |
|---|---|---|
| Host 选择 | 已支持 Host 或 other Host | 已支持 Host 按程序内置 profile 执行；不支持/other Host 只做 capability discovery，不能伪造自动安装 |
| 下载校验 | HTTP 非 2xx、ZIP 损坏、摘要不一致 | 不安装；摘要不匹配时执行升级而不是返回 `ALREADY_COMPLETE` |
| 本地安装 | 权限不足、配置不是 JSON、目录不可写 | 使用客户端原生授权；失败时恢复备份 |
| 首次连接 | 连接码过期、认证失败 | 报告 `AUTHENTICATION_FAILED`，重新从平台生成一次接入提示词 |
| 工具加载 | MCP 已安装但工具列表没有伏羲工具 | 按 Host 要求 reload 或重启，再验证；不要直接声称成功 |
| UI 信任 | WorkBuddy 要求信任自定义连接器 | 提示用户在「连接器 → 自定义连接器」信任 `fuxi-platform` 后再验证 |

接入完成后，后续 MCP/Skill 更新由稳定 launcher 在 AI 工具下次启动时处理。一般不需要用户重复执行完整接入流程。

---

## 二、让 AI 创建第一个原型

### 2.1 在平台生成创建提示词

1. 进入「原型列表」。
2. 点击「让 AI 创建原型」。
3. 写清使用者、当前问题、期望结果、关键页面、核心交互和验收方式。
4. 如有需求文件，粘贴完整本地路径；不要只给一个模糊文件名。
5. 选择创建模式：
   - **快速验证**：先验证需求、布局和关键交互，范围最小；
   - **按组件规范**：按选定 runtime 的组件规范实现，并执行更严格的组件、构建和交付检查。
6. 点击「生成完整提示词」，复制后发送给已接入伏羲的 AI 助手。

### 2.2 推荐提示词

```text
使用已接入伏羲的 fuxi-prototype 创建一个“客户管理”原型。
目标用户：销售人员。
核心任务：查看客户、按跟进状态筛选、打开客户详情并记录跟进结果。
请先读取需求文件 C:\Users\me\Documents\客户管理需求.docx，确认页面、角色、关键交互和验收结果后再实现。
使用 prototype spec <规范名> 和 runtime profile <profile>，创建模式使用 alignment。
完成后按 build → validate_project → pack_project → validate_zip → deliver_project(create) 顺序交付，返回版本、README、入口文件、预览地址和未验证风险。
```

### 2.3 AI 的实际交付顺序

创建模式的核心门禁是：

```text
读取需求
  → 确认页面/角色/交互/验收结果
  → 选择 spec 与 runtime profile
  → 实现正常、空、加载、禁用、校验失败、错误、成功状态
  → build
  → validate_project
  → pack_project
  → validate_zip
  → deliver_project(mode=create)
  → 回读版本、README、入口、预览
```

AI 不应把业务对象、权限、指标或流程凭空补出来，也不能把静态检查通过当成真实预览通过。完成后回到伏羲平台检查：

- 原型是否出现在「原型列表」；
- 预览是否能打开；
- 首页、主要按钮、表单、筛选和返回路径是否可操作；
- README、入口文件、版本与本次交付是否一致；
- 浏览器控制台是否存在阻断性错误。

---

## 三、让 AI 修改原型

### 3.1 修改前先判断原型归属

打开原型详情，看是否出现“已归属项目”提示：

- **未归属项目**：使用独立原型修改流程，完成后直接形成新的正式版本；
- **已绑定项目**：必须进入项目内修改，形成候选版本，由项目负责人预览并采用。

已绑定项目的原型不能绕过项目流程直接覆盖正式版本。

### 3.2 修改独立原型

1. 在「原型列表」打开目标原型详情。
2. 点击「让 AI 修改」。
3. 写清要修改的页面、交互、数据、保留范围和验收结果。
4. 选择版本策略：让 AI 选择 `major` / `minor` / `patch`，或填写一个高于当前版本的 SemVer。
5. 复制完整提示词发送给 AI。

AI 必须按以下工具顺序执行：

```text
redeem_prototype_change_handoff
  → 使用 sourceDownloadUrl 下载当前正式源码
  → 在原源码基础上修改并构建
  → validate_project
  → pack_project
  → submit_prototype_change
  → get_prototype_change_status
```

任务码有效期为 10 分钟，AI 领取后任务上下文和基线版本会锁定。只有最终状态为 `completed`，并且平台正式预览可用，才算修改完成。

### 3.3 修改项目内原型

1. 进入顶部「项目」，打开目标项目。
2. 在项目菜单中选择目标原型，确认项目 ID、绑定 ID、菜单路径和当前版本。
3. 点击「让 AI 修改」创建或生成项目任务。
4. 把平台生成的完整提示词发送给 AI。

Task v2 主流程为：

```text
create_project_task
  → accept_project_task
  → AI 在任务上下文修改
  → submit_task_candidate
  → 审核：return_task_candidate / adopt_task_candidate
  → list_task_candidates / get_project_task 回读状态与历史
```

用户侧的完整流程是：

1. 进入项目目标节点；
2. 点击「让 AI 修改」创建/生成任务；
3. 把平台生成的完整提示词发送给 AI；
4. AI 接受任务并提交修订；
5. 负责人在“正式版 vs 唯一待审修订”中审核；
6. 可退回，AI 再提交；
7. 采用后才形成新的正式版本；
8. 历史尝试保留。

同一任务只保留一个当前 `ready` 待审修订，再次提交会把旧待审候选转入历史。项目绑定原型禁止旧 `changeId` 写入；legacy project write 返回 `LEGACY_CHANGEID_FORBIDDEN`。独立原型仍使用 `directChangeId` 流程。

---

## 四、项目协作、发布与分享

### 4.1 项目负责人配置项目

项目 Owner 或平台管理员可以：

1. 在「项目」中创建项目并填写名称、描述。
2. 配置一级、二级菜单。
3. 把已有原型绑定到具体菜单路径；同一个原型可以在同一项目多个菜单位置展示。
4. 在「成员」中添加项目成员，角色为：
   - **编辑者**：参与签出、修改和上传候选；
   - **查看者**：查看项目和预览，不可签出。
5. 在重大评审点创建命名快照，记录菜单结构、绑定关系和版本。

### 4.2 项目任务与兼容编辑锁

Task v2 项目修改主流程不依赖 checkout/checkin。项目任务通过 `taskId + candidateId` 追踪，AI 提交修订后由负责人退回或采用；不要在新 Task v2 使用说明中要求用户先签出再提交候选。

现有签出/签入工具仅作为兼容/存量场景能力保留：

- 签出是菜单绑定级别的编辑锁，不同成员可以同时修改不同菜单节点；
- 只能签入自己签出的模块；
- 不再修改时尽快签入；
- Owner/Admin 可在确认影响后强制释放他人的签出锁；
- 强制释放只处理编辑锁，不等同于恢复本地未上传文件。

### 4.3 预览、发布、分享

预览、发布和分享是三个不同动作：

1. **预览**：检查当前版本是否能打开、交互是否可用；
2. **发布**：确认版本和内容后，将可交付版本作为正式结果；
3. **分享**：生成给评审或演示使用的链接，不等同于管理权限。

分享前确认页面不包含密码、token、内部地址或不应公开的数据。项目门户的免登录预览只暴露适合展示的内容，不应当被当成管理入口。

### 4.4 快照和高风险操作

重大菜单调整或批量版本变更前先创建快照。以下操作具有破坏性或高影响，必须明确目标和确认范围：

- `delete_prototype`：移入回收站；
- `rollback_version`：回滚原型版本；
- `restore_snapshot`：恢复项目快照；
- `force_release_checkout`：强制释放签出锁。

这些工具要求明确传入 `confirm: true`；普通创建、修改和预览任务不应调用它们。

---

## 五、AI 原型质量最佳实践

### 5.1 需求描述模板

```text
原型名称：
目标用户：
用户要完成的核心任务：
必须包含的页面：
关键字段和操作：
必须验证的状态：正常 / 空 / 加载 / 禁用 / 校验失败 / 错误 / 成功
不在本次范围内：
验收结果：打开哪些页面、点击什么、应看到什么
需求文件完整本地路径（可选）：
```

### 5.2 选择 spec、runtime 和输出模式

- 新原型使用需求指定的 prototype spec 和默认 runtime profile；
- 已有原型先从 README、依赖和源码识别现有 profile，保持原技术栈；
- 无法判断时停止并报告 `RUNTIME_PROFILE_REQUIRED`，不要自行安装或切换 SkyUI；
- `alignment` 用于快速验证需求、布局和交互；
- `implementation-proof` 用于严格证明所选组件规范已被真实使用，找不到等价组件时报告 `COMPONENT_PROFILE_GAP`；
- 不把“看起来像”组件当成组件规范实现，不为了通过检查临时引入未知依赖。

### 5.3 交付检查清单

```text
[ ] 需求已读取并确认
[ ] 页面、角色、关键交互和验收结果已列出
[ ] runtime profile 与已有证据一致
[ ] 正常/空/加载/禁用/错误/成功状态覆盖
[ ] 本地 build 通过
[ ] validate_project 通过
[ ] pack_project 生成完整 ZIP
[ ] validate_zip 检查最终 ZIP
[ ] deliver 或 submit 返回成功状态
[ ] 平台回读版本、README、入口文件和预览
[ ] 未写入凭据、密码、长期 token、绝对路径和 node_modules
```

---

## 六、伏羲 MCP 工具速查

接入成功后，AI 助手通过本地 stdio MCP 使用以下工具。AI 应优先使用平台生成的任务提示词提供的 ID、版本和一次性任务码，不要猜测参数。

| 场景 | 工具 |
|---|---|
| 连接验证 | `check_connection` |
| 浏览原型 | `list_prototypes`、`get_prototype`、`get_readme`、`get_preview_url` |
| 创建/直接上传 | `create_prototype`、`upload_zip`、`upload_project`、`deliver_project` |
| 独立修改 | `create_prototype_change`、`redeem_prototype_change_handoff`、`get_prototype_change_status`、`submit_prototype_change` |
| 项目协作任务 | `list_project_nodes`、`list_project_tasks`、`get_project_task`、`create_project_task`、`accept_project_task`、`submit_task_candidate`、`list_task_candidates`、`adopt_task_candidate`、`return_task_candidate` |
| Legacy 项目写入（禁止用于 Task v2） | `create_change_handoff`、`redeem_change_handoff`、`submit_change_candidate`；新流程写入应 fail-closed，`get_change_status` 仅兼容读取 |
| 项目绑定与编辑锁 | `bind_prototype_to_project`、`checkout_prototype`、`checkin_prototype` |
| 版本安全 | `create_snapshot`、`restore_snapshot`、`rollback_version`、`force_release_checkout`、`delete_prototype` |
| 本地交付检查 | `validate_project`、`pack_project`、`validate_zip` |

工具的关键参数通常包括 `prototypeId`、`projectId`、`projectPrototypeId`、`taskId`、`candidateId`、`directChangeId`、`zipPath`、`versionNote` 和 `expectedVersion`。项目 Task v2 以 `taskId + candidateId` 为权威主键；独立原型继续以 `directChangeId` 为权威 ID。

---

## 七、权限与安全边界

平台权限、项目权限、菜单编辑锁和候选采用权是分开的：

- 平台管理员可以管理平台配置，但不因“管理员”身份自动替代所有项目动作的业务确认；
- 项目 Owner/Admin 可管理菜单、成员、快照和候选采用；
- 编辑者按项目范围参与修改，但不能采用候选；
- 查看者可以查看和预览，不可签出或上传；
- 查看、编辑、上传、采用、发布、分享、删除、恢复和释放锁不是同一种权限。

任何 AI 回复都必须区分“已生成”“已上传”“候选已就绪”“已采用”“正式版本已更新”和“预览已验证”。未拿到平台回读证据，不要使用“已上线”“已发布”或“已成功接入”。

---

## 八、帮助中心与手册维护（管理员）

帮助中心是普通用户的阅读入口，手册维护和分类配置位于系统管理：

- `系统管理 → 帮助中心 → 使用手册`：编辑标题、摘要、版本和 Markdown 正文，预览、保存草稿和发布；
- `系统管理 → 帮助中心 → 手册分类`：配置分层分类，并把一份手册分发到多个分类；
- 普通用户只读取已发布快照；管理员编辑草稿不会影响用户当前正在阅读的版本；
- 归档手册或分类不会物理删除，恢复前先确认公开范围。

当前内置分类分为两级主线：

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

手册与分类是多对多关系：同一份内容可以同时出现在“基础入门 / MCP 与 Skill 接入”和“进阶使用 / 版本与安全”等目录中。分类只是阅读和分发视图，不会复制正文。

---

## 九、常见问题

### 为什么接入后还要打开新会话？

多数 AI 工具只在会话初始化时加载 MCP 工具和 Skill。接入脚本完成后，旧会话可能仍持有旧工具列表，所以要刷新客户端或打开新会话，再调用 `check_connection` 和 `tools/list` 验证。

### 文件存在但 AI 还是不能用怎么办？

文件存在只能说明安装写入完成，不能证明客户端已经加载。检查 MCP 配置路径是否是当前客户端实际路径、stdio 的 `command/args/env` 是否正确、客户端是否已重启，以及新会话的工具列表是否出现伏羲工具。

### 预览打不开怎么办？

保留当前候选和日志，检查入口 HTML、构建输出、相对资源路径、ZIP 内容和浏览器控制台。修复后重新执行 `validate_project → pack_project → validate_zip`，不要通过删除正式版本掩盖问题。

### 项目候选上传了，为什么正式版本没变？

这是项目协作的设计：AI 提交的是待审修订，只有项目 Owner/Admin 执行「采用为正式版」后才会生成正式版本；退回后允许再次提交，同一任务只有一个当前待审修订，旧候选会进入历史尝试。

### 可以直接回滚或删除吗？

可以，但这是高风险操作。先确认原型 ID、目标版本、项目快照和影响范围，再由有权限的人明确确认；普通 AI 创建/修改任务不应自行触发这些动作。

---

## 十、快速操作对照表

| 目标 | 操作路径 |
|---|---|
| 首次接入 | 登录 → 接入平台 MCP → 复制提示词给 AI → 新会话验证 |
| 创建原型 | 原型列表 → 让 AI 创建原型 → 填需求 → 选模式 → 复制提示词 |
| 修改独立原型 | 原型详情 → 让 AI 修改 → 复制提示词 → 等待正式版本完成 |
| 修改项目原型 | 项目 → 目标节点 → 让 AI 修改 → AI 接受任务/提交修订 → 负责人退回或采用 → 查看历史尝试 |
| 查看版本 | 原型详情 → 版本历史 |
| 查看设计文档 | 原型详情 → 设计文档 |
| 生成分享 | 原型详情 → 免登录链接或协作入口 |
| 配置手册 | 系统管理 → 帮助中心 → 使用手册 |
| 配置分类 | 系统管理 → 帮助中心 → 手册分类 |

遇到无法判断的情况，优先保留当前版本、完整错误和任务 ID，再进入帮助中心查找对应分类；不要反复执行覆盖、删除、回滚或强制释放。
