const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const { listHelpDocuments, getHelpDocument } = require('../services/db-help-documents');
const {
  listHelpCategories,
  getHelpCategory,
  createHelpCategory,
  updateHelpCategory,
  archiveHelpCategory,
  restoreHelpCategory,
  setDocumentCategories
} = require('../services/db-help-categories');

let tempRoot;

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-help-categories-'));
  await database.initDatabase({ path: path.join(tempRoot, 'help-categories.db'), persist: false });
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('seeds a two-level category tree and assigns manuals to multiple categories', () => {
  const result = listHelpCategories({ includeArchived: true, includeDocuments: true });
  assert.deepEqual(result.tree.map(category => category.name), ['基础入门', '进阶使用']);
  assert.equal(result.tree[0].children.map(category => category.name).join('/'), '平台操作/AI 原型设计');
  assert.ok(result.tree[0].children[0].children.length > 0);

  const quickStart = getHelpDocument('quick-start', { includeDrafts: true });
  assert.ok(quickStart.categories.some(category => category.slug === 'beginner-platform'));
  assert.ok(quickStart.categories.some(category => category.slug === 'beginner-ai'));
  assert.ok(listHelpDocuments({ categoryId: result.items.find(category => category.slug === 'beginner-ai').id }).some(document => document.slug === 'quick-start'));
});

test('admin can create, move, archive, restore, and distribute manuals', () => {
  const created = createHelpCategory({
    slug: 'custom-onboarding',
    name: '团队自定义入门',
    description: '管理员维护的分类',
    categoryType: 'general',
    parentId: getHelpCategory(1, { includeArchived: true })?.id || null,
    sortOrder: 99
  }, 1);
  assert.equal(created.slug, 'custom-onboarding');

  const updated = updateHelpCategory(created.id, { name: '团队入门', parentId: null, categoryType: 'general' });
  assert.equal(updated.name, '团队入门');
  setDocumentCategories('faq', [created.id], 1);
  assert.ok(getHelpDocument('faq', { includeDrafts: true }).categories.some(category => category.id === created.id));

  const archived = archiveHelpCategory(created.id);
  assert.equal(archived.status, 'archived');
  assert.equal(getHelpDocument('faq', { includeDrafts: true }).categories.find(category => category.id === created.id).status, 'archived');
  assert.equal(restoreHelpCategory(created.id).status, 'active');
});

test('cannot archive a category with active children or assign archived categories', () => {
  const beginner = listHelpCategories({ includeArchived: true }).items.find(category => category.slug === 'beginner');
  assert.throws(() => archiveHelpCategory(beginner.id), error => error.code === 'HELP_CATEGORY_HAS_CHILDREN');

  const child = listHelpCategories({ includeArchived: true }).items.find(category => category.slug === 'beginner-platform-account');
  archiveHelpCategory(child.id);
  assert.throws(() => setDocumentCategories('faq', [child.id], 1), error => error.code === 'HELP_CATEGORY_NOT_FOUND');
});
