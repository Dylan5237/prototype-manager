const ONBOARDING_HOSTS = Object.freeze([
  Object.freeze({
    id: 'workbuddy',
    label: 'WorkBuddy',
    mode: 'install',
    support: 'stable',
    recommended: true,
    description: '稳定支持，使用 WorkBuddy 内置 MCP 与 Skill 目录。',
    client: 'workbuddy',
    promptFragment: `- 当前 Host 已由用户明确选择为 WorkBuddy；不得扫描 .workbuddy、.cursor 或推断当前 Host。
- 不得切换为自动推断模式、追加任何配置/安装路径覆盖参数或修改平台提供的入口命令。
- Bootstrap COMPLETE 只代表本地安装和自检完成；重载或重启 WorkBuddy 后，才能执行 Host E2E。
- 如果 WorkBuddy 要求信任自定义 fuxi-platform MCP 且无法代替用户操作 UI，返回 USER_ACTION_REQUIRED，并提示用户前往“连接器 → 自定义连接器”完成信任。`
  }),
  Object.freeze({
    id: 'cursor',
    label: 'Cursor',
    mode: 'install',
    support: 'compatible',
    recommended: false,
    description: '兼容支持，沿用当前已实现的 Cursor MCP 与 Skill 路径。',
    client: 'cursor',
    promptFragment: `- 当前 Host 已由用户明确选择为 Cursor；不得扫描其他 AI 工具目录或切换为自动推断模式。
- 不得追加任何配置/安装路径覆盖参数，也不得修改平台提供的入口命令。
- Bootstrap COMPLETE 后重载或重启 Cursor，再在新会话中执行连接验证；无法自动重载时返回 RELOAD_REQUIRED。`
  }),
  Object.freeze({
    id: 'codex',
    label: 'Codex',
    mode: 'unsupported',
    support: 'planned',
    recommended: false,
    description: '尚未建立经过验证的确定性安装 profile，本版本不会猜测配置路径。',
    client: null,
    promptFragment: ''
  }),
  Object.freeze({
    id: 'other',
    label: '其它工具',
    mode: 'discovery',
    support: 'experimental',
    recommended: false,
    description: '实验性发现模式，只收集兼容性事实，不执行安装。',
    client: null,
    promptFragment: ''
  })
]);

const HOST_MAP = new Map(ONBOARDING_HOSTS.map(host => [host.id, host]));

function publicHost(host) {
  return {
    id: host.id,
    label: host.label,
    mode: host.mode,
    support: host.support,
    recommended: host.recommended,
    description: host.description
  };
}

function listOnboardingHosts() {
  return ONBOARDING_HOSTS.map(publicHost);
}

function getOnboardingHost(value) {
  return HOST_MAP.get(String(value || '').trim().toLowerCase()) || null;
}

function renderSafeStopPrompt(host) {
  if (host.mode === 'discovery') {
    return `请执行“伏羲平台 MCP 兼容性发现任务”。当前选择为“其它工具”，本次只收集事实，不执行安装。

请只读确认并报告：
1. AI Host 的准确名称和版本；
2. 操作系统与 Node.js 版本；
3. 是否支持 MCP stdio；
4. 官方 MCP 配置文件路径及其配置格式；
5. 官方 Skill、Rules 或等价能力目录。

严格禁止：编写或执行安装命令、猜测并写入配置、下载或解压 MCP/Skill、拼接 Bootstrap 参数、转入 WorkBuddy/Cursor 安装流程。

完成事实收集后返回 status=DISCOVERY_COMPLETE，并等待平台后续提供确定性 profile；没有官方证据的字段标记为 UNVERIFIED。`;
  }
  return `当前选择的 AI 工具是 ${host.label}，但伏羲平台尚未提供经过验证的确定性 MCP/Skill 安装 profile。

请返回 status=UNSUPPORTED_HOST、host=${host.id}，不要扫描目录、猜测路径、修改配置、下载制品或尝试套用其他 Host 的接入命令。`;
}

module.exports = {
  ONBOARDING_HOSTS,
  listOnboardingHosts,
  getOnboardingHost,
  renderSafeStopPrompt
};
