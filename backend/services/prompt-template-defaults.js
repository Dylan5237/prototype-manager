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
- 权威 ID：directChangeId={{directChangeId}}（兼容别名 changeId 同值）
- 基线版本：v{{baseVersion}}（领取后锁定）
- 任务码：{{handoffCode}}
- 任务码有效期：{{expiresAt}}
- 版本策略：{{versionStrategy}}

【必须执行】
1. 第一调用 redeem_prototype_change_handoff，参数 handoffCode 使用上面的任务码。
2. 领取成功后，使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。
3. 在源码基础上实现修改要求，先执行项目自己的构建或静态检查。
4. 调用 validate_project 检查交付目录，再调用 pack_project 生成完整 ZIP。
5. 调用 submit_prototype_change 上传 ZIP；参数必须使用本任务的 prototypeId、directChangeId（或兼容字段 changeId），versionType 只能是 major、minor、patch。
6. 上传后调用 get_prototype_change_status 确认最终状态为 completed；平台已完成 ZIP、入口和资源引用静态校验并直接形成正式版本。

【交付约束】
- 这是独立原型修改，平台会在静态校验和基线版本 CAS 通过后直接形成正式版本；如果正式预览打不开，请回到伏羲平台让 AI 排查并重新上传。
- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，所有引用必须使用相对路径。
- ZIP 不得包含 .git、versions、node_modules、绝对路径、凭证、密码或长期 token。
- 保持未涉及页面和交互不变；遇到歧义先保留现有行为并在完成说明中标注。

【修改要求】
{{requirement}}

【完成说明】
请返回：已领取任务、修改摘要、构建与校验结果、ZIP 路径、versionType 和最终状态。未收到 completed 前不要宣称已上线。`;

const PROJECT_CHANGE_TEMPLATE = `你是伏羲原型修改 Agent。请严格按 Task v2 完成一次“候选版本”交付。项目绑定路径的权威账本是 taskId + candidateId，不要再使用 prototype_changes / 裸 changeId 写入。

【任务上下文】
- 项目：{{projectName}}（{{projectId}}）
- 原型：{{prototypeName}}（{{prototypeId}}）
- 菜单路径：{{menuPath}}
- 权威任务 ID：taskId={{taskId}}
- 节点：nodeId={{nodeId}}
- 绑定：bindingId={{bindingId}}
- 基础版本：v{{baseVersion}}
- 版本策略：{{versionStrategy}}
- 任务码：{{handoffCode}}
- 任务码有效期：{{expiresAt}}

【必须执行的步骤】
1. 若任务尚未接受，调用 accept_project_task，参数使用 projectId 与 taskId。
2. 使用返回的 sourceDownloadUrl 下载当前正式版本源码；不要凭空重建原型。不要调用 checkout_prototype / checkin_prototype / force_release_checkout，它们不是项目绑定主路径。
3. 在源码基础上实现“修改要求”，先本地检查入口、相对路径和主要交互。
4. 将完整候选产物打成 ZIP，调用 submit_task_candidate 上传；参数必须使用本任务的 projectId、taskId 和 ZIP 本地路径。AI 决定版本策略时必须额外传入 versionType=major、minor 或 patch。
5. 上传成功后调用 list_task_candidates 或 get_project_task 确认存在唯一待审候选（candidateId，status=ready）。是否采用由项目负责人在平台或通过 adopt_task_candidate 决定。

【交付约束】
- 这是候选版本，绝对不要直接覆盖正式版本，也不要调用正式版本上传接口。
- 同一 taskId 最多一个待审 ready 候选；再次成功提交会替换先前待审候选。
- ZIP 必须包含可预览入口 index.html 或系统识别的 HTML 入口，路径使用相对路径。
- ZIP 不得包含 .git、versions、node_modules 或绝对路径；不要把凭证、密码、长期 token 写入产物。
- 保持未涉及页面和交互不变；如果需求存在歧义，优先保留现有行为并在完成说明中指出。
- create_change_handoff / redeem_change_handoff / submit_change_candidate 已写入禁止；get_change_status 仅只读兼容。

【修改要求】
{{requirement}}

【完成说明】
上传候选后，请返回：taskId、candidateId、修改摘要、验证结果、ZIP 路径和候选状态。不要自行宣称已上线；最终是否采用由项目负责人决定。本提示词不代表生产已完成切流。`;

const MCP_ONBOARDING_TEMPLATE = `请执行“伏羲平台 MCP 接入任务”。用户已在平台明确选择 {{hostLabel}}，该选择是当前 Host 的唯一事实源。

目标：让 {{hostLabel}} 发现 {{skillName}} Skill，并能够调用伏羲 MCP。

【Host 约束】
{{hostInstructions}}

【执行边界】
- 接入完成前不要调用伏羲 MCP；只使用当前会话的终端执行能力。
- 不要识别、扫描或猜测当前 Host、MCP 配置路径、Skill 目录，也不要执行 bootstrap 前侦察。
- 只允许原样执行下面的平台入口；不要改写、拆分、重排参数，不要自行选择下载器、文件名、SHA、retry 或安装路径。
- 当前会话必须具备本地终端和 Node.js >= 18；不满足时报告 NODE_VERSION_UNSUPPORTED 并停止。
- 短期 onboarding 脚本与 Bootstrap 会在程序内部完成会话获取、制品下载、完整性校验、preflight、备份、安装、配置、认证、自检和有限重试；不要介入内部步骤。

【有效期】
- 本次短期接入入口至 {{bootstrapSessionExpiresLocal}}（Asia/Shanghai）有效；禁止回显 session、token、连接码、密码或凭据文件内容。

【唯一接入入口】
{{canonicalOnboardingCommand}}

【严格步骤】
1. 在当前同一 shell、同一权限上下文中原样执行唯一入口并等待退出；不要另起沙箱、提权终端或并行执行第二次。
2. 只解析该入口最终输出。只有 status=COMPLETE 且 mcpConnected=true、skillReady=true，或 reason=ALREADY_COMPLETE，才可进入下一步。
3. 失败时原样报告最内层 step、error.code、error.message 并停止；不要自行插桩、curl、下载、解压、写 manifest、修改配置或重试整条入口。
4. 若 reloadRequired=true，按 {{hostLabel}} 的方式重载 MCP；无法自动完成则报告 RELOAD_REQUIRED 或 Host 片段要求的 USER_ACTION_REQUIRED，并停止。
5. 重载完成后，在新会话中只调用一次 check_connection({})；必须得到 ok=true 且 authentication=verified。Bootstrap self-test 不等同于 Host READY。
6. 连接验证成功后执行一次 tools/list，确认至少存在 check_connection、validate_project、pack_project、validate_zip、deliver_project，并确认 {{skillName}} Skill 已被发现；没有证据就报告未验证。
7. 最终只报告：选择的 Host、Node.js 版本、入口退出码、安装状态、MCP 连接、Skill 发现、重载/用户操作状态、MCP/Skill 版本和阶段耗时。

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
    variables: ['prototypeName', 'prototypeId', 'directChangeId', 'changeId', 'baseVersion', 'handoffCode', 'expiresAt', 'versionStrategy', 'requirement'],
    mockData: {
      prototypeName: '客户管理台',
      prototypeId: 'proto_demo_001',
      directChangeId: 'direct_chg_demo001',
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
    variables: ['projectName', 'projectId', 'prototypeName', 'prototypeId', 'menuPath', 'taskId', 'nodeId', 'bindingId', 'baseVersion', 'versionStrategy', 'handoffCode', 'expiresAt', 'requirement'],
    mockData: {
      projectName: '销售运营平台',
      projectId: 'project_demo_001',
      prototypeName: '客户管理台',
      prototypeId: 'proto_demo_001',
      menuPath: '客户管理 / 客户列表',
      taskId: 'task_demo001',
      nodeId: 'node_demo001',
      bindingId: '12',
      baseVersion: '3',
      versionStrategy: '由 AI 选择 major、minor 或 patch，平台根据当前版本计算最终版本号',
      handoffCode: 'FXT-MOCK-PROJECT',
      expiresAt: '2026-09-03T12:00:00.000Z',
      requirement: '增加按客户等级筛选，并在无结果时显示清晰的空状态和恢复动作。'
    }
  },
  {
    key: 'mcp.onboarding',
    name: '接入平台 MCP',
    description: '按用户选择的 Host 生成唯一短期接入入口，程序化完成 MCP 与 Skill 安装。',
    template: MCP_ONBOARDING_TEMPLATE,
    variables: ['baseUrl', 'skillName', 'hostLabel', 'hostInstructions', 'canonicalOnboardingCommand', 'canonicalBootstrapCommand', 'bootstrapSessionExpiresLocal', 'quickStartGuide', 'helpVersion'],
    mockData: {
      baseUrl: 'http://fuxi.example.test',
      skillName: 'fuxi-prototype',
      hostLabel: 'WorkBuddy',
      hostInstructions: '- 当前 Host 已由用户明确选择为 WorkBuddy；不得扫描或推断其他 Host。\n- COMPLETE 后重载 WorkBuddy；如需 UI 信任则返回 USER_ACTION_REQUIRED。',
      bootstrapSessionExpiresLocal: '2026-09-03 12:15:00',
      canonicalOnboardingCommand: 'node -e "eval(Buffer.from(\'THIN_LAUNCHER\',\'base64\').toString())" -- "http://fuxi.example.test/api/integrations/onboarding-package?bootstrapId=mock" "sha256"',
      canonicalBootstrapCommand: 'node -e "eval(Buffer.from(\'THIN_LAUNCHER\',\'base64\').toString())" -- "http://fuxi.example.test/api/integrations/onboarding-package?bootstrapId=mock" "sha256"',
      helpVersion: '1.0',
      quickStartGuide: '【伏羲平台快速入门】\n\n1. 打开「原型列表」生成创建提示词并发送给已接入的 AI。\n2. 修改原型时先判断是否已绑定项目。\n3. 完成预览、版本和权限确认后再发布或分享。',
    }
  }
];

const PROMPT_TEMPLATE_MAP = Object.fromEntries(PROMPT_TEMPLATE_DEFAULTS.map(item => [item.key, item]));

module.exports = { PROMPT_TEMPLATE_DEFAULTS, PROMPT_TEMPLATE_MAP };
