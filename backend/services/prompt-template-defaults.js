const CREATE_ALIGNMENT_TEMPLATE = `请使用已安装的伏羲原型交付能力创建一个新的前端原型。

【固定模式】
- operation mode: create；必须创建新原型，不得复用、覆盖或更新已有原型。
- outputMode: {{outputModeLabel}}。
- runtime profile: 根据需求、选定 prototype spec 和已有项目证据选择；SkyUI 不是默认依赖，不得隐式安装或选择。
- 只能使用下方需求和附件作为业务来源，不得自行创造业务对象、指标、权限或流程。
{{attachmentInstruction}}

【需求】
{{requirementBlock}}

【实现要求】
1. 先读取并确认需求，列出页面、角色、关键交互和可验收结果；不确定项采用最小实现并在完成说明中标注。
2. 使用 Vue 3、Vite 和平台可用组件实现；保持资源路径相对化，禁止写死服务端地址、凭据或长期 token。
3. 覆盖正常、空、加载、禁用、校验失败、错误和成功状态；失败反馈必须说明原因和恢复动作。
{{validationInstruction}}
5. 严格执行 validate_project → pack_project → validate_zip → deliver_project(create)；只能在所有校验通过后创建正式原型。
6. 完成后返回需求摘要、实现页面、交互清单、验证结果、入口文件、版本、预览地址和剩余风险；未知项写 unverified，不得猜测。`;

const CREATE_PROOF_TEMPLATE = CREATE_ALIGNMENT_TEMPLATE.replace(
  '{{validationInstruction}}',
  '4. 编码前核对真实组件文档，输出组件审计表；构建、类型检查、ZIP 内容和预览 Smoke 任一失败都必须停止交付。'
);

const STANDALONE_CHANGE_TEMPLATE = `你是伏羲原型修改 Agent。请严格完成一次独立原型修改，不要创建项目任务，也不要调用通用 upload_zip 直接覆盖正式版本。

【任务上下文】
- 原型：{{prototypeName}}（{{prototypeId}}）
- 修改 ID：{{changeId}}
- 基线版本：v{{baseVersion}}（领取后锁定）
- 任务码：{{handoffCode}}
- 任务码有效期：{{expiresAt}}
- 版本策略：{{versionStrategy}}

【必须执行】
1. 第一调用 redeem_prototype_change_handoff，参数 handoffCode 使用上面的任务码。
2. 领取成功后，使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。
3. 在源码基础上实现修改要求，先执行项目自己的构建或静态检查。
4. 调用 validate_project 检查交付目录，再调用 pack_project 生成完整 ZIP。
5. 调用 submit_prototype_change 上传 ZIP；参数必须使用本任务的 prototypeId、changeId，versionType 只能是 major、minor、patch。
6. 上传后调用 get_prototype_change_status 确认最终状态为 completed；平台已完成 ZIP、入口和资源引用静态校验并直接形成正式版本。

【交付约束】
- 这是独立原型修改，平台会在静态校验和基线版本 CAS 通过后直接形成正式版本；如果正式预览打不开，请回到伏羲平台让 AI 排查并重新上传。
- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，所有引用必须使用相对路径。
- ZIP 不得包含 .git、versions、node_modules、绝对路径、凭证、密码或长期 token。
- 保持未涉及页面和交互不变；遇到歧义先保留现有行为并在完成说明中指出。

【修改要求】
{{requirement}}

【完成说明】
请返回：已领取任务、修改摘要、构建与校验结果、ZIP 路径、versionType 和最终状态。未收到 completed 前不要宣称已上线。`;

const PROJECT_CHANGE_TEMPLATE = `你是伏羲原型修改 Agent。请严格按下面的任务完成一次“候选版本”交付。

【任务上下文】
- 项目：{{projectName}}（{{projectId}}）
- 原型：{{prototypeName}}（{{prototypeId}}）
- 菜单路径：{{menuPath}}
- 任务 ID：{{changeId}}
- 基础版本：v{{baseVersion}}
- 版本策略：{{versionStrategy}}
- 任务码：{{handoffCode}}
- 任务码有效期：{{expiresAt}}

【必须执行的步骤】
1. 调用 redeem_change_handoff，参数 handoffCode 使用上面的任务码。
2. 领取成功后，使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。
3. 在源码基础上实现“修改要求”，先本地检查入口、相对路径和主要交互。
4. 将完整候选产物打成 ZIP，调用 submit_change_candidate 上传；参数必须使用本任务的 projectId、changeId，并传入 ZIP 的本地路径。AI 决定版本策略时必须额外传入 versionType=major、minor 或 patch。
5. 上传成功后调用 get_change_status 确认状态为 ready；平台已完成 ZIP、入口和资源引用静态校验，负责人可在伏羲候选页面查看预览并决定是否采纳。

【交付约束】
- 这是候选版本，绝对不要直接覆盖正式版本，也不要调用正式版本上传接口。
- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，路径使用相对路径。
- ZIP 不得包含 .git、versions、node_modules 或绝对路径；不要把凭证、密码、长期 token 写入产物。
- 保持未涉及页面和交互不变；如果需求存在歧义，优先保留现有行为并在完成说明中指出。

【修改要求】
{{requirement}}

【完成说明】
上传候选后，请返回：已领取任务、修改摘要、验证结果、ZIP 路径和候选状态。不要自行宣称已上线；最终是否采用由项目负责人决定。`;

const MCP_ONBOARDING_TEMPLATE = `请执行“伏羲平台 MCP 接入任务”。不要让我手工编辑配置文件。

目标：让当前 AI 工具在新会话中发现 fuxi-prototype Skill，并能够调用伏羲 MCP。

你必须区分两类工具：
- MCP 尚未接入前，只能使用你自己的终端、文件读写、HTTP 下载和 Node.js 执行能力；此时不能调用伏羲 MCP。
- MCP 接入后，调用伏羲 MCP 工具 check_connection({}) 完成连接验证；不要猜测工具名或参数。

本次接入只适用于同时满足以下条件的 AI 工具：
- 支持 MCP stdio；
- 可以启动本地 Node.js 进程，且 Node.js >= 18；
- 允许 AI 在用户目录读写配置文件；
- 支持加载本地 Skill、Rules 或等价的 AI 指令目录。
如果当前客户端不满足任一条件，立即停止并明确报告不满足的条件，不要声称接入成功。

接入参数：
- API: {{baseUrl}}
- Skill: {{skillName}}
- Skill 安装包: {{skillUrl}}
- MCP 安装包: {{mcpUrl}}
- 安装 token: {{token}}
- 安装 token 过期时间: {{tokenExpiresLocal}}（Asia/Shanghai）
- 一次性连接码: {{connectCode}}
- 连接码过期时间: {{codeExpiresLocal}}（Asia/Shanghai）
- Bootstrap manifest（只写入临时目录，完成后删除）：
{{bootstrapManifestJson}}

请严格按以下顺序执行；任何一步失败立即停止，不要声称接入成功：
0. 识别当前 AI 工具名称、版本、操作系统、MCP 配置文件路径和 Skill/Rules 目录（完成“识别当前 AI 客户端”）。使用只读文件/系统检查，不假定 Cursor、Claude、Cline 或固定路径。如果无法识别，报告 CLIENT_CONFIG_REQUIRED。
1. 创建用户级、持久化、非业务仓库路径；只在临时 staging 目录下载和解压。把上面的 Bootstrap manifest 写入临时绝对路径 <manifestPath>，完成后删除。
2. 使用你的 HTTP 下载能力，执行：
   - 使用安装 token 下载 Skill ZIP 和 MCP ZIP；
   - 按 manifest.artifacts.mcp.url（{{mcpUrl}}）下载 MCP ZIP，请求头 Authorization: Bearer <安装 token>；
   - 按 manifest.artifacts.skill.url（{{skillUrl}}）下载 Skill ZIP，请求头 Authorization: Bearer <安装 token>；
   - 确认 HTTP 状态为 2xx、ZIP 可读取、MCP 包包含 fuxi-platform-mcp/src/bootstrap.js、launcher.js、server.js 和 package.json、Skill 包包含 fuxi-prototype/SKILL.md。
   - 保存 ZIP 到临时目录；解压 MCP ZIP 到 <MCP解压目录>，不得把 token、连接码或 refresh token 写入日志、业务仓库或 Skill 文件。
3. 运行 MCP 包中的确定性预检程序（把尖括号替换为实际绝对路径）：
   node <MCP解压目录>/fuxi-platform-mcp/src/bootstrap.js preflight --manifest <manifestPath> --client <clientName> --mcp-config <MCP配置绝对路径> --skill-target <Skill绝对目录>
   必须确认输出 JSON 的 ok=true、writable=true、configFormat=json。否则停止并报告预检 JSON。
4. 运行确定性安装程序：
   node <MCP解压目录>/fuxi-platform-mcp/src/bootstrap.js install --manifest <manifestPath> --client <clientName> --mcp-config <MCP配置绝对路径> --skill-target <Skill绝对目录> --mcp-zip <MCP ZIP绝对路径> --skill-zip <Skill ZIP绝对路径>
   传入已下载的 ZIP 后，程序不会重复下载；它会再次校验文件、备份、原子安装、更新 MCP 配置并执行首次 MCP 自检。它只允许更新 fuxi-platform 条目，不得删除其他 MCP。
5. 首次自检由 bootstrap 程序调用伏羲 MCP 工具 check_connection({}) 完成。安装完成后优先调用 check_connection({})；只有输出 ok=true 且 authentication=verified 才算 MCP 连接成功。
6. 让当前 AI 工具重新加载 MCP 配置（必要时“重启或刷新 AI 客户端”）；如果只能通过重启实现，报告 RELOAD_REQUIRED，不要无限等待。重新加载后，再调用伏羲 MCP 工具 check_connection({}) 一次。
7. 让 MCP Host 完成 tools/list，并确认至少存在以下工具：
   check_connection、validate_project、pack_project、validate_zip、deliver_project。
   使用本地文件检查 <Skill绝对目录>/SKILL.md，并报告 Skill 是否被当前 AI 工具发现。这里的 <Skill绝对目录> 必须是最终的 fuxi-prototype 目录，不是其父目录。没有 Skill 发现证据时，不得声称接入完成。
8. 只报告以下结果：AI 工具、操作系统、MCP 连接、Skill 发现、是否需要重启、新会话是否可用、MCP/Skill 版本。禁止回显安装 token、access token、refresh token、完整连接码、用户密码或凭据文件内容。

Bootstrap 程序和配置应使用以下 stdio 入口；尖括号路径必须替换为实际绝对路径：
     command: node
     args: [<持久化MCP目录>/fuxi-platform-mcp/src/launcher.js]
     env: {
       FUXI_API_URL: "{{baseUrl}}",
       FUXI_CONNECT_CODE: "{{connectCode}}",
       FUXI_CREDENTIALS_FILE: "<实际绝对路径>/.fuxi/mcp-credentials.json",
       FUXI_MCP_TARGET: "<持久化MCP目录>/fuxi-platform-mcp/src/server.js",
       FUXI_INSTALL_ROOT: "<实际绝对路径>/.fuxi/agent-runtime",
       FUXI_SKILL_TARGET: "<当前客户端实际Skill目录>/fuxi-prototype"
     }
   FUXI_CONNECT_CODE 仅用于首次自检；成功后必须从持久化配置中删除。

错误处理：
- 连接码过期：报告 AUTHENTICATION_FAILED，停止，不重复调用业务工具；
- 权限不足：报告 AUTHORIZATION_REQUIRED；
- MCP/Skill 下载、校验或安装失败：恢复备份并报告失败步骤；
- bootstrap 成功不等于客户端已重新加载；必须区分 reloadRequired 和 postReloadVerified。

接入成功后引导我使用伏羲平台（帮助手册 v{{helpVersion}}）：
{{quickStartGuide}}

恢复规则：需要客户端授权时只请求最小原生授权；refresh token 失效时保留旧安装并报告 AUTHENTICATION_FAILED；Skill 或 MCP 替换失败时恢复备份；任一步失败都不得声称接入成功。首次接入完成后，后续 MCP 和 Skill 更新由稳定 launcher 在 AI 客户端下次启动时处理，不要让我重复执行完整接入流程。`;

const PROMPT_TEMPLATE_DEFAULTS = [
  {
    key: 'prototype.create.alignment',
    name: '创建原型 · 快速验证',
    description: '让 AI 创建一个新原型，优先验证需求、布局和关键交互。',
    template: CREATE_ALIGNMENT_TEMPLATE,
    variables: ['outputModeLabel', 'attachmentInstruction', 'requirementBlock', 'validationInstruction'],
    mockData: {
      outputModeLabel: 'alignment（快速验证）',
      attachmentInstruction: '- 附件文件名：需求.docx；先完整读取，再与文字需求合并；冲突时以文字需求为准。',
      requirementBlock: '为运营人员设计一个客户管理原型，包含客户列表、详情和跟进记录；重点验证筛选、空状态和保存反馈。\n需求附件：需求.docx\n需求附件本地路径：C:\\Users\\demo\\Documents\\需求.docx',
      validationInstruction: '4. 优先实现需求主路径和关键交互，保持范围最小；构建和预览失败必须停止交付。'
    }
  },
  {
    key: 'prototype.create.implementation-proof',
    name: '创建原型 · 按组件规范',
    description: '让 AI 按选定 runtime 的组件规范实现并完成严格交付校验。',
    template: CREATE_PROOF_TEMPLATE,
    variables: ['outputModeLabel', 'attachmentInstruction', 'requirementBlock', 'validationInstruction'],
    mockData: {
      outputModeLabel: 'implementation-proof（按组件规范）',
      attachmentInstruction: '',
      requirementBlock: '为项目管理员设计一个权限管理页面，要求使用当前项目选定的 UI 组件并提供可验证的表单状态。',
      validationInstruction: '4. 编码前核对真实组件文档，输出组件审计表；构建、类型检查、ZIP 内容和预览 Smoke 任一失败都必须停止交付。'
    }
  },
  {
    key: 'prototype.modify.standalone',
    name: '修改原型 · 独立原型',
    description: '让 AI 基于正式版本源码提交一次独立原型修改。',
    template: STANDALONE_CHANGE_TEMPLATE,
    variables: ['prototypeName', 'prototypeId', 'changeId', 'baseVersion', 'handoffCode', 'expiresAt', 'versionStrategy', 'requirement'],
    mockData: {
      prototypeName: '客户管理台',
      prototypeId: 'proto_demo_001',
      changeId: 'direct_chg_demo001',
      baseVersion: '1',
      handoffCode: 'FX-MOCK-STANDALONE',
      expiresAt: '2026-09-03T12:00:00.000Z',
      versionStrategy: '由你根据实际改动选择 major、minor 或 patch，并在上传时传入 versionType',
      requirement: '在客户列表增加最近跟进时间和跟进状态筛选，并保持现有详情页行为不变。'
    }
  },
  {
    key: 'prototype.modify.project',
    name: '修改原型 · 项目候选',
    description: '让 AI 为项目内原型创建可预览、待负责人采用的候选版本。',
    template: PROJECT_CHANGE_TEMPLATE,
    variables: ['projectName', 'projectId', 'prototypeName', 'prototypeId', 'menuPath', 'changeId', 'baseVersion', 'versionStrategy', 'handoffCode', 'expiresAt', 'requirement'],
    mockData: {
      projectName: '销售运营平台',
      projectId: 'project_demo_001',
      prototypeName: '客户管理台',
      prototypeId: 'proto_demo_001',
      menuPath: '客户管理 / 客户列表',
      changeId: 'chg_demo001',
      baseVersion: '3',
      versionStrategy: '由 AI 选择 major、minor 或 patch，平台根据当前版本计算最终版本号',
      handoffCode: 'FX-MOCK-PROJECT',
      expiresAt: '2026-09-03T12:00:00.000Z',
      requirement: '增加按客户等级筛选，并在无结果时显示清晰的空状态和恢复动作。'
    }
  },
  {
    key: 'mcp.onboarding',
    name: '接入平台 MCP',
    description: '引导 AI 工具识别本地配置、安装 MCP 与 Skill，并完成连接验证。',
    template: MCP_ONBOARDING_TEMPLATE,
    variables: ['baseUrl', 'skillName', 'skillUrl', 'mcpUrl', 'token', 'tokenExpiresLocal', 'connectCode', 'codeExpiresLocal', 'bootstrapManifestJson', 'quickStartGuide', 'helpVersion'],
    mockData: {
      baseUrl: 'http://fuxi.example.test',
      skillName: 'fuxi-prototype',
      skillUrl: 'http://fuxi.example.test/api/integrations/skill-package',
      mcpUrl: 'http://fuxi.example.test/api/integrations/mcp-package',
      token: 'mock-install-token',
      tokenExpiresLocal: '2026-09-03 13:00:00',
      connectCode: 'FX-MOCK-CONNECT',
      codeExpiresLocal: '2026-09-03 12:20:00',
      helpVersion: '1.0',
      quickStartGuide: '【伏羲平台快速入门】\n\n1. 打开「原型列表」生成创建提示词并发送给已接入的 AI。\n2. 修改原型时先判断是否已绑定项目。\n3. 完成预览、版本和权限确认后再发布或分享。',
      bootstrapManifestJson: JSON.stringify({
        schema: 'fuxi-bootstrap/2',
        bootstrapId: 'mock-bootstrap-001',
        apiUrl: 'http://fuxi.example.test',
        installToken: 'mock-install-token',
        connectCode: 'FX-MOCK-CONNECT',
        artifacts: {
          mcp: { url: 'http://fuxi.example.test/api/integrations/mcp-package', sha256: null, size: null },
          skill: { url: 'http://fuxi.example.test/api/integrations/skill-package', sha256: null, size: null }
        },
        client: { name: 'auto' }
      }, null, 2)
    }
  }
];

const PROMPT_TEMPLATE_MAP = Object.fromEntries(PROMPT_TEMPLATE_DEFAULTS.map(item => [item.key, item]));

module.exports = { PROMPT_TEMPLATE_DEFAULTS, PROMPT_TEMPLATE_MAP };
