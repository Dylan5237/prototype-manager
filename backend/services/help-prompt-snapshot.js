const { getHelpDocument } = require('./db-help-documents');

const QUICK_START_SLUG = 'quick-start';
const MAX_PROMPT_GUIDE_LENGTH = 12000;
const FALLBACK_GUIDE = `快速入门手册当前不可读取。
请在完成 MCP 连接验证后，引导用户打开伏羲平台「帮助」阅读最新手册；不要猜测平台操作、版本或权限。`;

function normalizePromptGuide(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, MAX_PROMPT_GUIDE_LENGTH);
}

function getQuickStartPromptVariables() {
  const document = getHelpDocument(QUICK_START_SLUG);
  if (!document) {
    return { quickStartGuide: FALLBACK_GUIDE, helpVersion: 'unavailable' };
  }

  const guide = normalizePromptGuide([
    `【${document.title}】`,
    `版本：v${document.version}`,
    document.summary,
    document.contentMarkdown
  ].filter(Boolean).join('\n\n'));

  return {
    quickStartGuide: guide || FALLBACK_GUIDE,
    helpVersion: document.version || 'unknown'
  };
}

module.exports = {
  QUICK_START_SLUG,
  MAX_PROMPT_GUIDE_LENGTH,
  getQuickStartPromptVariables
};
