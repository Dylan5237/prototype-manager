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
  assert.doesNotMatch(preview, /{{\s*[A-Za-z]/);
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
