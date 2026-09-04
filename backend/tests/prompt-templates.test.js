const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  listPromptTemplates,
  getPromptTemplate,
  updatePromptTemplate,
  resetPromptTemplate,
  previewPromptTemplate
} = require('../services/db-prompt-templates');
const { getQuickStartPromptVariables } = require('../services/help-prompt-snapshot');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-prompt-templates-'));
  await database.initDatabase({ path: path.join(tempRoot, 'prompt-templates.db'), persist: false });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('seeds all product prompt scenarios and renders built-in Mock data', () => {
  const templates = listPromptTemplates();
  assert.deepEqual(templates.map(item => item.key), [
    'prototype.create.alignment',
    'prototype.create.implementation-proof',
    'prototype.modify.standalone',
    'prototype.modify.project',
    'mcp.onboarding'
  ]);
  assert.equal(templates.every(item => item.isCustomized === false), true);

  const template = getPromptTemplate('mcp.onboarding');
  const preview = previewPromptTemplate('mcp.onboarding');
  assert.ok(template.mockData.bootstrapManifestJson);
  assert.match(preview, /check_connection/);
  assert.match(preview, /mock-install-token/);
  assert.match(preview, /quickStartGuide|帮助手册/);
  assert.doesNotMatch(preview, /{{\s*[A-Za-z]/);
});

test('onboarding prompt reads the published quick-start snapshot and fails back safely', () => {
  const variables = getQuickStartPromptVariables();
  assert.equal(variables.helpVersion, '1.0');
  assert.match(variables.quickStartGuide, /伏羲平台快速入门|创建原型/);

  const { archiveHelpDocument } = require('../services/db-help-documents');
  archiveHelpDocument('quick-start', 7);
  const fallback = getQuickStartPromptVariables();
  assert.equal(fallback.helpVersion, 'unavailable');
  assert.match(fallback.quickStartGuide, /不可读取/);
});

test('upgrades the default onboarding template without overwriting the current template contract', async () => {
  const current = getPromptTemplate('mcp.onboarding');
  const legacyTemplate = '旧版接入提示词：{{baseUrl}}';
  const legacyMock = { baseUrl: 'http://legacy.example.test' };
  database.run(`
    UPDATE prompt_templates
       SET template = ?, variables_json = ?, mock_data_json = ?,
           default_template = ?, default_mock_data_json = ?
     WHERE key = 'mcp.onboarding'
  `, [legacyTemplate, JSON.stringify(['baseUrl']), JSON.stringify(legacyMock), legacyTemplate, JSON.stringify(legacyMock)]);
  const dbPath = database.getDatabasePath();
  database.closeDatabase();
  await database.initDatabase({ path: dbPath });

  const upgraded = getPromptTemplate('mcp.onboarding');
  assert.equal(upgraded.template, current.template);
  assert.ok(upgraded.variables.includes('quickStartGuide'));
  assert.ok(upgraded.variables.includes('helpVersion'));
  assert.equal(upgraded.mockData.quickStartGuide, current.mockData.quickStartGuide);
});

test('only declared variables can be saved and missing values fail closed', () => {
  const current = getPromptTemplate('prototype.create.alignment');
  const custom = '需求：{{requirementBlock}}\n模式：{{outputModeLabel}}';
  const saved = updatePromptTemplate('prototype.create.alignment', {
    template: custom,
    mockData: {
      outputModeLabel: '测试模式',
      attachmentInstruction: '',
      requirementBlock: '可配置 Mock 需求',
      validationInstruction: '测试校验'
    }
  }, 7);
  assert.equal(saved.template, custom);
  assert.equal(saved.isCustomized, true);
  assert.equal(previewPromptTemplate('prototype.create.alignment'), '需求：可配置 Mock 需求\n模式：测试模式');

  assert.throws(
    () => updatePromptTemplate('prototype.create.alignment', { template: '{{unknown}}', mockData: {} }, 7),
    error => error.code === 'PROMPT_TEMPLATE_INVALID'
  );
  assert.throws(
    () => updatePromptTemplate('prototype.create.alignment', {
      template: '需求：{{requirementBlock}}\n模式：{{outputModeLabel}}',
      mockData: { requirementBlock: '仅需求' }
    }, 7),
    error => error.code === 'PROMPT_TEMPLATE_VARIABLE_MISSING'
  );

  const restored = resetPromptTemplate('prototype.create.alignment', 7);
  assert.equal(restored.template, current.template);
  assert.equal(restored.isCustomized, false);
});
