const { marked } = require('marked');
const { query, queryOne, run } = require('../database/db');

const HELP_DOCUMENT_STATUSES = ['draft', 'published', 'archived'];
const MAX_TITLE_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 240;
const MAX_CONTENT_LENGTH = 60000;
const MAX_VERSION_LENGTH = 40;

class HelpDocumentError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'HelpDocumentError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function renderMarkdown(body) {
  const html = marked.parse(String(body || ''), { gfm: true, breaks: true });
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*(\2)/gi, '$1=$2#$3');
}

function cleanText(value, maxLength, label, { required = false } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new HelpDocumentError('HELP_DOCUMENT_INVALID', `${label}不能为空`);
  if (text.length > maxLength) throw new HelpDocumentError('HELP_DOCUMENT_TOO_LARGE', `${label}不能超过 ${maxLength} 个字符`);
  return text;
}

function normalizeStatus(status) {
  return HELP_DOCUMENT_STATUSES.includes(status) ? status : 'draft';
}

function normalizeSortOrder(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99999) {
    throw new HelpDocumentError('HELP_DOCUMENT_INVALID', '排序值必须是 0 到 99999 的整数');
  }
  return number;
}

function getDocumentCategories(slug, { includeArchived = false } = {}) {
  return query(`
    SELECT c.id, c.slug, c.name, c.category_type, c.parent_id, c.status
    FROM help_document_categories hdc
    INNER JOIN help_categories c ON c.id = hdc.category_id
    WHERE hdc.document_slug = ? ${includeArchived ? '' : "AND c.status = 'active'"}
    ORDER BY c.sort_order ASC, c.id ASC
  `, [slug]).map(category => ({
    id: Number(category.id),
    slug: category.slug,
    name: category.name,
    categoryType: category.category_type,
    parentId: category.parent_id == null ? null : Number(category.parent_id),
    status: category.status
  }));
}

function mapDocument(row, { published = false } = {}) {
  if (!row) return null;
  const usePublished = published && row.published_content_markdown != null;
  const title = usePublished ? row.published_title : row.title;
  const summary = usePublished ? row.published_summary : row.summary;
  const contentMarkdown = usePublished ? row.published_content_markdown : row.content_markdown;
  const version = usePublished ? row.published_version : row.version;
  return {
    slug: row.slug,
    title: title || row.title,
    summary: summary || '',
    contentMarkdown: contentMarkdown || '',
    contentHtml: renderMarkdown(contentMarkdown || ''),
    version: version || '',
    status: usePublished ? 'published' : normalizeStatus(row.status),
    sortOrder: Number(row.sort_order || 0),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    createdAt: row.created_at,
    updatedAt: usePublished ? (row.published_at || row.updated_at) : row.updated_at,
    publishedAt: row.published_at || null,
    categories: getDocumentCategories(row.slug, { includeArchived: !published })
  };
}

function getDraftRow(slug) {
  return queryOne('SELECT * FROM help_documents WHERE slug = ?', [slug]);
}

function getHelpDocument(slug, { includeDrafts = false } = {}) {
  const row = getDraftRow(slug);
  if (!row) return null;
  if (includeDrafts) return mapDocument(row);
  if (row.status === 'archived' || row.published_content_markdown == null) return null;
  return mapDocument(row, { published: true });
}

function listHelpDocuments({ includeDrafts = false, queryText = '', categoryId } = {}) {
  const normalizedQuery = String(queryText || '').trim().toLowerCase();
  const normalizedCategoryId = categoryId == null || categoryId === '' ? null : Number(categoryId);
  if (normalizedCategoryId != null && (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0)) {
    throw new HelpDocumentError('HELP_CATEGORY_INVALID', '分类 ID 不合法');
  }
  const rows = query(
    includeDrafts
      ? 'SELECT * FROM help_documents ORDER BY sort_order ASC, slug ASC'
      : `SELECT * FROM help_documents
           WHERE status <> 'archived' AND published_content_markdown IS NOT NULL
           ORDER BY sort_order ASC, slug ASC`
  );
  return rows
    .map(row => mapDocument(row, { published: !includeDrafts }))
    .filter(document => {
      if (normalizedCategoryId != null && !document.categories.some(category => category.id === normalizedCategoryId)) return false;
      if (!normalizedQuery) return true;
      return [document.slug, document.title, document.summary, document.contentMarkdown]
        .some(value => String(value || '').toLowerCase().includes(normalizedQuery));
    });
}

function assertDocument(slug) {
  const current = getDraftRow(slug);
  if (!current) throw new HelpDocumentError('HELP_DOCUMENT_NOT_FOUND', '帮助文档不存在', 404);
  return current;
}

function validateFields(current, fields = {}) {
  const title = cleanText(fields.title === undefined ? current.title : fields.title, MAX_TITLE_LENGTH, '文档标题', { required: true });
  const summary = cleanText(fields.summary === undefined ? current.summary : fields.summary, MAX_SUMMARY_LENGTH, '文档摘要');
  const contentMarkdown = cleanText(
    fields.contentMarkdown === undefined ? current.content_markdown : fields.contentMarkdown,
    MAX_CONTENT_LENGTH,
    '文档正文',
    { required: true }
  );
  const version = cleanText(fields.version === undefined ? current.version : fields.version, MAX_VERSION_LENGTH, '文档版本', { required: true });
  const sortOrder = normalizeSortOrder(fields.sortOrder, Number(current.sort_order || 0));
  return { title, summary, contentMarkdown, version, sortOrder };
}

function updateHelpDocument(slug, fields, updatedBy) {
  const current = assertDocument(slug);
  const next = validateFields(current, fields);
  const now = new Date().toISOString();
  run(`
    UPDATE help_documents
       SET title = ?, summary = ?, content_markdown = ?, version = ?,
           status = CASE WHEN published_content_markdown IS NULL THEN 'published' ELSE 'draft' END,
           sort_order = ?, updated_by = ?, updated_at = ?
     WHERE slug = ?
  `, [next.title, next.summary, next.contentMarkdown, next.version, next.sortOrder, updatedBy || null, now, slug]);
  return getHelpDocument(slug, { includeDrafts: true });
}

function publishHelpDocument(slug, updatedBy) {
  const current = assertDocument(slug);
  const next = validateFields(current, current);
  const now = new Date().toISOString();
  run(`
    UPDATE help_documents
       SET title = ?, summary = ?, content_markdown = ?, version = ?, sort_order = ?,
           status = 'published', updated_by = ?, updated_at = ?, published_at = ?,
           published_title = ?, published_summary = ?, published_content_markdown = ?, published_version = ?
     WHERE slug = ?
  `, [
    next.title, next.summary, next.contentMarkdown, next.version, next.sortOrder,
    updatedBy || null, now, now, next.title, next.summary, next.contentMarkdown, next.version, slug
  ]);
  return getHelpDocument(slug, { includeDrafts: true });
}

function archiveHelpDocument(slug, updatedBy) {
  const current = assertDocument(slug);
  const now = new Date().toISOString();
  run(`UPDATE help_documents SET status = 'archived', updated_by = ?, updated_at = ? WHERE slug = ?`, [updatedBy || null, now, slug]);
  return getHelpDocument(slug, { includeDrafts: true });
}

function previewHelpDocument(slug, fields = {}) {
  const current = assertDocument(slug);
  const next = validateFields(current, fields);
  return {
    slug,
    title: next.title,
    summary: next.summary,
    contentMarkdown: next.contentMarkdown,
    contentHtml: renderMarkdown(next.contentMarkdown),
    version: next.version,
    sortOrder: next.sortOrder
  };
}

module.exports = {
  HELP_DOCUMENT_STATUSES,
  HelpDocumentError,
  renderMarkdown,
  listHelpDocuments,
  getHelpDocument,
  updateHelpDocument,
  publishHelpDocument,
  archiveHelpDocument,
  previewHelpDocument,
  getDocumentCategories
};
