const crypto = require('crypto');
const { marked } = require('marked');
const { query, queryOne, run } = require('../database/db');

const ANNOUNCEMENT_TYPES = ['feature', 'maintenance', 'notice'];
const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'];

function newId() {
  return `ann-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeType(type) {
  return ANNOUNCEMENT_TYPES.includes(type) ? type : 'feature';
}

function normalizeStatus(status) {
  return ANNOUNCEMENT_STATUSES.includes(status) ? status : 'draft';
}

function renderMarkdown(body) {
  const html = marked.parse(String(body || ''), { gfm: true, breaks: true });
  // 公告由管理员维护，但仍不允许原始脚本、事件属性和 javascript 协议进入用户页面。
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*(\2)/gi, '$1=$2#$3');
}

function mapAnnouncement(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    body: row.body || '',
    body_html: renderMarkdown(row.body || ''),
    type: row.type,
    version: row.version || '',
    status: row.status,
    auto_popup: row.auto_popup == null ? true : Boolean(Number(row.auto_popup)),
    published_at: row.published_at || null,
    created_by: row.created_by,
    creator_name: row.creator_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    read_at: row.read_at || null,
    is_read: Boolean(row.read_at)
  };
}

function announcementSelect({ includeRead = true } = {}) {
  return `
    SELECT a.*, u.nickname AS creator_name
      ${includeRead ? ', r.read_at' : ''}
    FROM platform_announcements a
    LEFT JOIN users u ON u.id = a.created_by
    ${includeRead ? 'LEFT JOIN platform_announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?' : ''}
  `;
}

function listAnnouncements({ userId, includeDrafts = false, filter = 'all', limit = 50 } = {}) {
  const clauses = [];
  const params = [];
  if (!includeDrafts) {
    clauses.push("a.status = 'published'");
  } else if (filter === 'draft') {
    clauses.push("a.status = 'draft'");
  } else if (filter === 'archived') {
    clauses.push("a.status = 'archived'");
  } else if (filter === 'published') {
    clauses.push("a.status = 'published'");
  }
  if (filter === 'unread') clauses.push('r.read_at IS NULL');
  if (filter === 'read') clauses.push('r.read_at IS NOT NULL');
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `${announcementSelect()} ${where} ORDER BY COALESCE(a.published_at, a.updated_at) DESC LIMIT ?`;
  params.unshift(userId || null);
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  return query(sql, params).map(mapAnnouncement);
}

function getAnnouncement(id, { userId, includeDrafts = false } = {}) {
  const clauses = ['a.id = ?'];
  const params = [userId || null, id];
  if (!includeDrafts) clauses.push("a.status = 'published'");
  const row = queryOne(`${announcementSelect()} WHERE ${clauses.join(' AND ')}`, params);
  return mapAnnouncement(row);
}

function createAnnouncement({ title, summary, body, type, version, status, autoPopup = true, publishedAt, createdBy }) {
  const cleanTitle = String(title || '').trim();
  const cleanBody = String(body || '').trim();
  if (!cleanTitle) throw new Error('公告标题不能为空');
  if (!cleanBody) throw new Error('公告正文不能为空');
  const now = new Date().toISOString();
  const cleanStatus = normalizeStatus(status);
  const published = cleanStatus === 'published' ? (publishedAt || now) : null;
  const id = newId();
  run(`
    INSERT INTO platform_announcements
      (id, title, summary, body, type, version, status, auto_popup, published_at, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, cleanTitle, String(summary || '').trim(), cleanBody, normalizeType(type), String(version || '').trim(), cleanStatus, autoPopup === false ? 0 : 1, published, createdBy || null, now, now]);
  return getAnnouncement(id, { userId: createdBy, includeDrafts: true });
}

function updateAnnouncement(id, fields = {}) {
  const current = queryOne('SELECT * FROM platform_announcements WHERE id = ?', [id]);
  if (!current) return null;
  const nextTitle = fields.title === undefined ? current.title : String(fields.title || '').trim();
  const nextBody = fields.body === undefined ? current.body : String(fields.body || '').trim();
  if (!nextTitle) throw new Error('公告标题不能为空');
  if (!nextBody) throw new Error('公告正文不能为空');
  const nextStatus = fields.status === undefined ? current.status : normalizeStatus(fields.status);
  const now = new Date().toISOString();
  const publishedAt = nextStatus === 'published'
    ? (current.published_at || fields.publishedAt || now)
    : null;
  const autoPopup = fields.autoPopup === undefined
    ? (current.auto_popup == null ? 1 : Number(current.auto_popup))
    : (fields.autoPopup === false ? 0 : 1);
  run(`
    UPDATE platform_announcements
       SET title = ?, summary = ?, body = ?, type = ?, version = ?, status = ?, auto_popup = ?, published_at = ?, updated_at = ?
     WHERE id = ?
  `, [
    nextTitle,
    fields.summary === undefined ? current.summary : String(fields.summary || '').trim(),
    nextBody,
    fields.type === undefined ? current.type : normalizeType(fields.type),
    fields.version === undefined ? current.version : String(fields.version || '').trim(),
    nextStatus,
    autoPopup,
    publishedAt,
    now,
    id
  ]);
  return getAnnouncement(id, { includeDrafts: true });
}

function archiveAnnouncement(id) {
  const current = queryOne('SELECT id FROM platform_announcements WHERE id = ?', [id]);
  if (!current) return null;
  run("UPDATE platform_announcements SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
  return getAnnouncement(id, { includeDrafts: true });
}

function markAnnouncementRead(id, userId) {
  const announcement = queryOne("SELECT id FROM platform_announcements WHERE id = ? AND status = 'published'", [id]);
  if (!announcement) return null;
  const now = new Date().toISOString();
  run(`
    INSERT INTO platform_announcement_reads (announcement_id, user_id, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(announcement_id, user_id) DO UPDATE SET read_at = excluded.read_at
  `, [id, userId, now]);
  return getAnnouncement(id, { userId });
}

module.exports = {
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_STATUSES,
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  archiveAnnouncement,
  markAnnouncementRead
};
