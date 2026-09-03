const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  listHelpDocuments,
  getHelpDocument,
  updateHelpDocument,
  publishHelpDocument,
  archiveHelpDocument,
  previewHelpDocument
} = require('../services/db-help-documents');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-help-documents-'));
  await database.initDatabase({ path: path.join(tempRoot, 'help-documents.db'), persist: false });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('seeds published manuals and returns only published content to readers', () => {
  const documents = listHelpDocuments();
  assert.deepEqual(documents.map(document => document.slug), [
    'quick-start',
    'mcp-onboarding',
    'create-prototype',
    'modify-prototype',
    'faq'
  ]);
  assert.equal(documents.every(document => document.status === 'published'), true);
  assert.match(getHelpDocument('quick-start').contentHtml, /接入平台 MCP|创建原型/);
});

test('editing keeps the old published snapshot available until publish', () => {
  const original = getHelpDocument('quick-start');
  const saved = updateHelpDocument('quick-start', {
    title: '伏羲平台快速入门（草稿）',
    summary: '新的摘要',
    contentMarkdown: '# 草稿内容\n\n<script>alert(1)</script>',
    version: '1.1',
    sortOrder: 12
  }, 7);

  assert.equal(saved.status, 'draft');
  assert.equal(listHelpDocuments().find(item => item.slug === 'quick-start').title, original.title);
  assert.equal(listHelpDocuments({ includeDrafts: true }).find(item => item.slug === 'quick-start').title, '伏羲平台快速入门（草稿）');

  const preview = previewHelpDocument('quick-start', {
    title: '预览标题',
    summary: '预览摘要',
    contentMarkdown: '# 安全预览\n\n<script>alert(1)</script>\n\n**重点**',
    version: '1.1'
  });
  assert.match(preview.contentHtml, /<h1>安全预览<\/h1>/);
  assert.match(preview.contentHtml, /<strong>重点<\/strong>/);
  assert.doesNotMatch(preview.contentHtml, /<script/i);

  const published = publishHelpDocument('quick-start', 7);
  assert.equal(published.status, 'published');
  assert.equal(getHelpDocument('quick-start').title, '伏羲平台快速入门（草稿）');
  assert.equal(getHelpDocument('quick-start').version, '1.1');
  assert.ok(published.publishedAt);
});

test('archiving removes a manual from the reader catalog without deleting it', () => {
  const archived = archiveHelpDocument('faq', 7);
  assert.equal(archived.status, 'archived');
  assert.equal(getHelpDocument('faq'), null);
  assert.equal(getHelpDocument('faq', { includeDrafts: true }).status, 'archived');
});
