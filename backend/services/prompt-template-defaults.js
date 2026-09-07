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

const MCP_ONBOARDING_TEMPLATE = `请执行“伏羲平台 MCP 接入任务”。你的职责是识别当前 AI 工具和 Node.js 能力，然后执行平台生成的一条标准命令；不要让我手工编辑配置文件。

目标：让当前 AI 工具发现 {{skillName}} Skill，并能够调用伏羲 MCP。

【执行边界】
- 接入完成前，不要调用伏羲 MCP 工具；只使用你自己的终端执行能力。
- 只允许执行下面这条平台生成命令。不要改写、拆分、重排或替换其中的参数，不要自行生成安装命令。
- 当前会话必须支持本地终端、Node.js >= 18、用户目录读写和 MCP stdio；任一条件不满足，报告原因并停止。
- Bootstrap 会在内部完成会话获取、制品下载、SHA-256 校验、安装、备份、配置、首次连接自检和必要重试；不要介入这些内部步骤。

【接入凭据】
- 标准命令中的 Bootstrap 会话至 {{bootstrapSessionExpiresLocal}}（Asia/Shanghai）有效；不要回显、复制到其他消息或写入文件。

【唯一标准命令】
{{canonicalBootstrapCommand}}

【严格步骤】
1. 只读识别当前 AI 客户端（Host）名称、版本和操作系统，并确认 Node.js 主版本 >= 18。识别结果只用于最终报告，不要修改上面的命令。
2. 在当前同一 shell、同一权限上下文中，原样执行上面的唯一标准命令，并等待它退出；不要另起沙箱、提权终端或并行执行第二次。
3. 只解析该命令输出的最终 JSON。只有 status=COMPLETE 且 mcpConnected=true、skillReady=true，或 reason=ALREADY_COMPLETE，才可进入下一步；否则报告 error.code、step、message 并停止。
4. 若结果包含 reloadRequired=true，让当前 AI 工具重载 MCP 配置；无法自动重载时报告 RELOAD_REQUIRED，并停止，不要轮询或再次安装。
5. 重载完成后，只调用一次伏羲 MCP 工具 check_connection({})，必须得到 ok=true 且 authentication=verified。失败时报告真实结果，不要声称接入成功。
6. 仅在连接验证成功后执行一次 tools/list，确认至少存在 check_connection、validate_project、pack_project、validate_zip、deliver_project；同时确认 {{skillName}} Skill 已被当前 AI 工具发现。没有证据就报告未验证。
7. 最终只报告：AI 工具、操作系统、Node.js 版本、标准命令退出码、安装状态、MCP 连接、Skill 发现、是否需要重启、新会话是否可用、MCP/Skill 版本和阶段耗时。禁止回显任何 session、token、连接码、密码或凭据文件内容。

【失败处理】
- 权限、客户端不支持、配置无效、制品校验失败或认证失败：原样报告结构化 code/step/message 并停止，不要重试命令。
- 网络超时或临时网络错误：标准命令会在内部有限重试；命令退出后仍失败则报告真实错误。
- 首次接入完成后，打开 AI 工具的新会话，再调用 check_connection({}) 确认可用；不要重新执行首次接入命令。

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
    description: '引导 AI 工具识别 Node.js 与 Host，并执行平台生成的单条接入命令。',
    template: MCP_ONBOARDING_TEMPLATE,
    variables: ['baseUrl', 'skillName', 'canonicalBootstrapCommand', 'bootstrapSessionExpiresLocal', 'quickStartGuide', 'helpVersion'],
    mockData: {
      baseUrl: 'http://fuxi.example.test',
      skillName: 'fuxi-prototype',
      bootstrapSessionExpiresLocal: '2026-09-03 12:15:00',
      canonicalBootstrapCommand: 'node -e "eval(Buffer.from(\'BASE64_LOADER\',\'base64\').toString())" -- "http://fuxi.example.test/api/integrations/bootstrap-package" "sha256" "http://fuxi.example.test/api/integrations/bootstrap-session" "opaque-session" "auto"',
      helpVersion: '1.0',
      quickStartGuide: '【伏羲平台快速入门】\n\n1. 打开「原型列表」生成创建提示词并发送给已接入的 AI。\n2. 修改原型时先判断是否已绑定项目。\n3. 完成预览、版本和权限确认后再发布或分享。',
    }
  }
];

const PROMPT_TEMPLATE_MAP = Object.fromEntries(PROMPT_TEMPLATE_DEFAULTS.map(item => [item.key, item]));

module.exports = { PROMPT_TEMPLATE_DEFAULTS, PROMPT_TEMPLATE_MAP };
