const { query, queryOne, run } = require('../database/db');
const { PROMPT_TEMPLATE_MAP } = require('./prompt-template-defaults');

const TOKEN_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*}}/g;
const MAX_TEMPLATE_LENGTH = 60000;
const MAX_MOCK_DATA_LENGTH = 120000;

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

function validateMockData(key, mockData, template) {
  if (!mockData || typeof mockData !== 'object' || Array.isArray(mockData)) {
    throw new PromptTemplateError('PROMPT_MOCK_DATA_INVALID', 'Mock 数据必须是 JSON 对象');
  }
  const definition = PROMPT_TEMPLATE_MAP[key];
  const allowed = new Set(definition.variables);
  const unknownKeys = Object.keys(mockData).filter(keyName => !allowed.has(keyName));
  if (unknownKeys.length) {
    throw new PromptTemplateError(
      'PROMPT_MOCK_DATA_INVALID',
      `Mock 数据包含未定义变量：${unknownKeys.join('、')}`,
      400,
      { unknownKeys, allowedKeys: definition.variables }
    );
  }
  const serialized = JSON.stringify(mockData);
  if (serialized.length > MAX_MOCK_DATA_LENGTH) {
    throw new PromptTemplateError('PROMPT_MOCK_DATA_TOO_LARGE', `Mock 数据不能超过 ${MAX_MOCK_DATA_LENGTH} 个字符`);
  }
  // 预览时提前校验，避免保存了无法渲染的模板和 Mock 组合。
  if (template) renderText(template, mockData);
  return mockData;
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
    isCustomized: row.template !== row.default_template || row.mock_data_json !== row.default_mock_data_json,
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

function updatePromptTemplate(key, options, updatedBy) {
  const current = assertTemplateExists(key);
  const template = typeof options === 'string' ? options : options && options.template;
  const mockData = typeof options === 'string' || !options || options.mockData === undefined
    ? current.mockData
    : options.mockData;
  validateTemplate(key, template);
  validateMockData(key, mockData, template);
  run(`
    UPDATE prompt_templates
    SET template = ?, mock_data_json = ?, updated_by = ?, updated_at = ?
    WHERE key = ?
  `, [template, JSON.stringify(mockData), updatedBy || null, new Date().toISOString(), key]);
  return getPromptTemplate(current.key);
}

function resetPromptTemplate(key, updatedBy) {
  const current = assertTemplateExists(key);
  run(`
    UPDATE prompt_templates
    SET template = default_template, mock_data_json = default_mock_data_json,
        updated_by = ?, updated_at = ?
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

function previewPromptTemplate(key, templateOverride, mockDataOverride) {
  const current = assertTemplateExists(key);
  const template = templateOverride == null ? current.template : templateOverride;
  const mockData = mockDataOverride === undefined ? current.mockData : mockDataOverride;
  validateTemplate(key, template);
  validateMockData(key, mockData, template);
  return renderText(template, mockData);
}

module.exports = {
  PromptTemplateError,
  collectTokens,
  validateTemplate,
  validateMockData,
  getPromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
  resetPromptTemplate,
  renderPromptTemplate,
  previewPromptTemplate
};
