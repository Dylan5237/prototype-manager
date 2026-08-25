const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const database = require('../database/db');
const {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  archiveAnnouncement,
  markAnnouncementRead
} = require('../services/db-announcements');

let tempRoot;
const timestamp = '2026-08-24T00:00:00.000Z';

function seed() {
  database.run(
    'INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [1, 'admin', 'hash', '管理员', '["admin"]', timestamp]
  );
  database.run(
    'INSERT INTO users (id, username, password_hash, nickname, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [2, 'editor', 'hash', '编辑者', '["uploader"]', timestamp]
  );
}

test.beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuxi-announcements-'));
  await database.initDatabase({ path: path.join(tempRoot, 'announcements.db'), persist: false });
  seed();
});

test.afterEach(() => {
  database.closeDatabase();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('published announcements are visible and read state is per user', () => {
  const published = createAnnouncement({
    title: '平台 v1.8.0 更新',
    summary: '新增项目关联能力',
    body: '更新了什么\n新增项目关联能力',
    type: 'feature',
    version: 'v1.8.0',
    status: 'published',
    createdBy: 1
  });
  const draft = createAnnouncement({
    title: '待发布公告',
    body: '仅管理员可见',
    status: 'draft',
    createdBy: 1
  });

  assert.equal(listAnnouncements({ userId: 2 }).length, 1);
  assert.equal(listAnnouncements({ userId: 2 })[0].is_read, false);
  assert.equal(listAnnouncements({ userId: 1, includeDrafts: true }).length, 2);
  assert.equal(getAnnouncement(draft.id, { userId: 2 }), null);

  const read = markAnnouncementRead(published.id, 2);
  assert.equal(read.is_read, true);
  assert.equal(listAnnouncements({ userId: 2, filter: 'unread' }).length, 0);
  assert.equal(listAnnouncements({ userId: 2, filter: 'read' }).length, 1);
  assert.equal(listAnnouncements({ userId: 1, filter: 'unread' }).length, 1);
});

test('admin can publish and archive without deleting announcement history', () => {
  const draft = createAnnouncement({
    title: '维护通知',
    body: '维护窗口说明',
    type: 'maintenance',
    status: 'draft',
    createdBy: 1
  });
  const published = updateAnnouncement(draft.id, { status: 'published' });
  assert.equal(published.status, 'published');
  assert.ok(published.published_at);

  const archived = archiveAnnouncement(draft.id);
  assert.equal(archived.status, 'archived');
  assert.equal(getAnnouncement(draft.id, { includeDrafts: true }).status, 'archived');
});

test('announcement stores auto popup preference and renders markdown safely', () => {
  const draft = createAnnouncement({
    title: 'Markdown 公告',
    body: '# 更新内容\n\n**重点**\n\n<script>alert(1)</script>',
    status: 'draft',
    autoPopup: false,
    createdBy: 1
  });
  assert.equal(draft.auto_popup, false);
  assert.match(draft.body_html, /<h1>更新内容<\/h1>/);
  assert.match(draft.body_html, /<strong>重点<\/strong>/);
  assert.doesNotMatch(draft.body_html, /<script/i);

  const published = updateAnnouncement(draft.id, { status: 'published', autoPopup: true });
  assert.equal(published.auto_popup, true);
});
