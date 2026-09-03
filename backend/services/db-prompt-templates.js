const { query, queryOne, run } = require('../database/db');
const { PROMPT_TEMPLATE_MAP } = require('./prompt-template-defaults');

const TOKEN_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g;
const MAX_TEMPLATE_LENGTH = 60000;

class PromptTemplateError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'PromptTemplateError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function parseJson(value, fallback) {
  try {
    return value == null ? fallback : JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function collectTokens(template) {
  const tokens = [];
  const seen = new Set();
  TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = TOKEN_PATTERN.exec(template)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      tokens.push(match[1]);
    }
  }
  return tokens;
}

function validateTemplate(key, template) {
  if (typeof template !== 'string' || !template.trim()) {
    throw new PromptTemplateError('PROMPT_TEMPLATE_EMPTY', '提示词模板不能为空');
  }
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new PromptTemplateError('PROMPT_TEMPLATE_TOO_LARGE', `提示词模板不能超过 ${MAX_TEMPLATE_LENGTH} 个字符`);
  }

  const definition = PROMPT_TEMPLATE_MAP[key];
  if (!definition) {
    throw new PromptTemplateError('PROMPT_TEMPLATE_NOT_FOUND', '提示词模板不存在', 404);
  }
  const allowed = new Set(definition.variables);
  const tokens = collectTokens(template);
  const unknownTokens = tokens.filter(token => !allowed.has(token));
  if (unknownTokens.length) {
    throw new PromptTemplateError(
      'PROMPT_TEMPLATE_INVALID',
      `模板包含未定义变量：${unknownTokens.join('、')}`,
      400,
      { unknownTokens, allowedTokens: definition.variables }
    );
  }
  return tokens;
}

function decorate(row) {
  if (!row) return null;
  const variables = parseJson(row.variables_json, []);
  const mockData = parseJson(row.mock_data_json, {});
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    template: row.template,
    variables,
    mockData,
    isCustomized: row.template !== row.default_template,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by == null ? null : Number(row.updated_by)
  };
}

function getPromptTemplate(key) {
  return decorate(queryOne('SELECT * FROM prompt_templates WHERE key = ?', [key]));
}

function listPromptTemplates() {
  return query('SELECT * FROM prompt_templates ORDER BY rowid ASC').map(decorate);
}

function assertTemplateExists(key) {
  const template = getPromptTemplate(key);
  if (!template) {
    throw new PromptTemplateError('PROMPT_TEMPLATE_NOT_FOUND', '提示词模板不存在', 404);
  }
  return template;
}

function updatePromptTemplate(key, template, updatedBy) {
  const current = assertTemplateExists(key);
  validateTemplate(key, template);
  run(`
    UPDATE prompt_templates
    SET template = ?, updated_by = ?, updated_at = ?
    WHERE key = ?
  `, [template, updatedBy || null, new Date().toISOString(), key]);
  return getPromptTemplate(current.key);
}

function resetPromptTemplate(key, updatedBy) {
  const current = assertTemplateExists(key);
  run(`
    UPDATE prompt_templates
    SET template = default_template, updated_by = ?, updated_at = ?
    WHERE key = ?
  `, [updatedBy || null, new Date().toISOString(), key]);
  return getPromptTemplate(current.key);
}

function resolveValue(source, token) {
  return token.split('.').reduce((value, segment) => {
    if (value == null) return undefined;
    return value[segment];
  }, source);
}

function renderText(template, variables) {
  TOKEN_PATTERN.lastIndex = 0;
  return template.replace(TOKEN_PATTERN, (match, token) => {
    const value = resolveValue(variables, token);
    if (value === undefined) {
      throw new PromptTemplateError('PROMPT_TEMPLATE_VARIABLE_MISSING', `缺少模板变量：${token}`, 400, { token });
    }
    if (value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

function renderPromptTemplate(key, variables = {}, options = {}) {
  const current = assertTemplateExists(key);
  const template = options.templateOverride == null ? current.template : options.templateOverride;
  validateTemplate(key, template);
  return renderText(template, variables);
}

function previewPromptTemplate(key, templateOverride) {
  const current = assertTemplateExists(key);
  return renderPromptTemplate(key, current.mockData, { templateOverride });
}

module.exports = {
  PromptTemplateError,
  collectTokens,
  validateTemplate,
  getPromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
  resetPromptTemplate,
  renderPromptTemplate,
  previewPromptTemplate
};
