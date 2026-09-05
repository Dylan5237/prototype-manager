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

目标：让当前 AI 工具发现 fuxi-prototype Skill，并能够调用伏羲 MCP。

执行边界：
- MCP 尚未接入前，只能使用你自己的终端、文件读写、HTTP 下载和 Node.js 能力；此时不能调用伏羲 MCP。
- MCP 接入后，才调用伏羲 MCP 工具；不要猜测工具名或参数。
- 当前客户端必须支持 MCP stdio、本地 Node.js >= 18、用户目录读写和本地 Skill/Rules。任一条件不满足，立即报告对应原因并停止。

接入参数：
- API: {{baseUrl}}
- Skill: {{skillName}}
- Skill 安装包: {{skillUrl}}
- MCP 安装包: {{mcpUrl}}
- 安装 token 过期时间: {{tokenExpiresLocal}}（Asia/Shanghai）
- 一次性连接码过期时间: {{codeExpiresLocal}}（Asia/Shanghai）
- Bootstrap manifest（只写入临时目录，安装程序会在结束时清理）：
{{bootstrapManifestJson}}

请严格执行以下步骤；任何一步失败立即停止，不要声称接入成功：
0. 只读识别当前 AI 工具名称、版本和操作系统，完成“识别当前 AI 客户端”。如果当前工具是 WorkBuddy，不要自行推断、覆盖或传入 MCP 配置路径和 Skill 目标路径，bootstrap 会使用内置确定性路径：<用户目录>/.workbuddy/mcp.json 与 <用户目录>/.workbuddy/skills/fuxi-prototype；未知客户端才识别其绝对路径。如果无法确认客户端，报告 CLIENT_CONFIG_REQUIRED。
1. 创建用户级持久化目录和临时目录。必须在实际执行 bootstrap.js install 的同一个 shell/terminal execution context、同一权限上下文中创建 manifest，并在创建后立即执行 install；不要用 File/Write 工具写 manifest 后再交给另一个 shell 或提权上下文。把 manifest 写入临时绝对路径 <manifestPath>，不要写入业务仓库；不要输出其中的 token、连接码或其他凭据。
2. 仅为取得 bootstrap.js，使用你的 HTTP 能力按 mcpUrl 下载一次 MCP ZIP 到临时目录，并解压到临时目录；不要下载或解压 Skill ZIP，不要检查无关文件。确认存在 <MCP包解压目录>/fuxi-platform-mcp/src/bootstrap.js。
3. 运行唯一安装入口（不要再单独运行 preflight 或重复执行子步骤）：
   如果当前工具是 WorkBuddy，严格使用：node <MCP包解压目录>/fuxi-platform-mcp/src/bootstrap.js install --manifest <manifestPath> --client workbuddy --mcp-zip <MCP ZIP绝对路径> --cleanup-manifest；不得传 --mcp-config 或 --skill-target。对于未知客户端，仅在 bootstrap 无法确定路径时，才按识别结果补充这两个参数。
   该程序会校验已下载的 MCP ZIP，同时自行下载并校验 Skill ZIP，完成备份、安装、配置合并和首次 MCP 自检；不要手工下载 Skill ZIP，不要重复下载 MCP ZIP。
4. 只解析安装程序输出的最终 JSON：必须是 status=COMPLETE 且 mcpConnected=true、skillReady=true；reason=ALREADY_COMPLETE 也视为幂等成功。出现 BOOTSTRAP_LOCKED、AUTHENTICATION_FAILED 或其他失败时，报告 step/code/message 后停止。
5. 如果 reloadRequired=true，让当前 AI 工具重载 MCP 配置；无法自动重载时只报告 RELOAD_REQUIRED，不要轮询、不要重复安装。重载完成后，调用伏羲 MCP 工具 check_connection({}) 一次，必须得到 ok=true 且 authentication=verified。
6. 仅在上一步验证成功后，调用一次 tools/list，确认至少存在 check_connection、validate_project、pack_project、validate_zip、deliver_project；同时检查最终 <Skill绝对目录>/SKILL.md 是否存在，并报告当前 AI 工具是否发现 Skill。没有发现证据时不得声称完成。
7. 只报告：AI 工具、操作系统、安装状态、MCP 连接、Skill 发现、是否需要重启、新会话是否可用、MCP/Skill 版本和各阶段耗时。禁止回显 token、access token、refresh token、连接码、密码或凭据文件内容。

MCP stdio 配置由安装程序写入，入口为 <持久化MCP目录>/fuxi-platform-mcp/src/launcher.js，环境变量包括：
  FUXI_API_URL: "{{baseUrl}}"
  FUXI_CREDENTIALS_FILE: "<实际绝对路径>/.fuxi/mcp-credentials.json"
  FUXI_MCP_TARGET: "<持久化MCP目录>/fuxi-platform-mcp/src/server.js"
  FUXI_INSTALL_ROOT: "<实际绝对路径>/.fuxi/agent-runtime"
  FUXI_SKILL_TARGET: "<当前客户端实际Skill目录>/fuxi-prototype"
首次自检使用 FUXI_CONNECT_CODE；连接码只用于首次自检，不得写入长期配置，安装成功后由程序移除。

错误处理：下载、校验、安装、连接或 Skill 发现失败时，保留旧安装、报告结构化失败结果并停止；权限不足报告 AUTHORIZATION_REQUIRED，认证失败或连接码失效报告 AUTHENTICATION_FAILED；不要调用业务工具。首次接入完成后，后续 MCP 和 Skill 更新由稳定 launcher 在 AI 客户端下次启动时处理，不要重复执行完整接入流程。

接入成功后引导我使用伏羲平台（帮助手册 v{{helpVersion}}）：
{{quickStartGuide}}`;

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
