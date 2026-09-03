const { query, queryOne, run, runInTransaction } = require('../database/db');

const HELP_CATEGORY_TYPES = ['general', 'platform', 'ai_prototype'];
const HELP_CATEGORY_STATUSES = ['active', 'archived'];
const MAX_NAME_LENGTH = 80;
const MAX_SLUG_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;

class HelpCategoryError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'HelpCategoryError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function cleanText(value, maxLength, label, { required = false } = {}) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new HelpCategoryError('HELP_CATEGORY_INVALID', `${label}不能为空`);
  if (text.length > maxLength) throw new HelpCategoryError('HELP_CATEGORY_TOO_LARGE', `${label}不能超过 ${maxLength} 个字符`);
  return text;
}

function normalizeType(value) {
  if (!HELP_CATEGORY_TYPES.includes(value)) {
    throw new HelpCategoryError('HELP_CATEGORY_INVALID', '分类类型不合法', 400, { allowedTypes: HELP_CATEGORY_TYPES });
  }
  return value;
}

function normalizeSortOrder(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99999) {
    throw new HelpCategoryError('HELP_CATEGORY_INVALID', '排序值必须是 0 到 99999 的整数');
  }
  return number;
}

function mapCategory(row, options = {}) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    categoryType: row.category_type || 'general',
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    parentSlug: row.parent_slug || null,
    parentName: row.parent_name || null,
    path: row.path || row.name,
    sortOrder: Number(row.sort_order || 0),
    status: row.status || 'active',
    documentCount: Number(row.document_count || 0),
    documents: options.documents || []
  };
}

function categoryRows({ includeArchived = false, includeDocuments = false } = {}) {
  const statusClause = includeArchived ? '' : "WHERE c.status = 'active'";
  const rows = query(`
    SELECT c.*, p.slug AS parent_slug, p.name AS parent_name
    FROM help_categories c
    LEFT JOIN help_categories p ON p.id = c.parent_id
    ${statusClause}
    ORDER BY c.sort_order ASC, c.slug ASC
  `);

  const mapped = rows.map(row => {
    const documentCount = queryOne(`
      SELECT COUNT(*) AS count
      FROM help_document_categories hdc
      INNER JOIN help_documents d ON d.slug = hdc.document_slug
      WHERE hdc.category_id = ?
        ${includeArchived ? '' : "AND d.status <> 'archived' AND d.published_content_markdown IS NOT NULL"}
    `, [row.id]);
    const documents = includeDocuments
      ? query(`
          SELECT d.slug, d.title, d.status, d.version
          FROM help_document_categories hdc
          INNER JOIN help_documents d ON d.slug = hdc.document_slug
          WHERE hdc.category_id = ?
          ORDER BY d.sort_order ASC, d.slug ASC
        `, [row.id]).map(document => ({
        slug: document.slug,
        title: document.title,
        status: document.status,
        version: document.version
      }))
      : [];
    return mapCategory({ ...row, document_count: documentCount?.count || 0 }, { documents });
  });

  const childrenByParent = new Map();
  mapped.forEach(category => {
    const list = childrenByParent.get(category.parentId) || [];
    list.push(category);
    childrenByParent.set(category.parentId, list);
  });
  const roots = childrenByParent.get(null) || [];
  const visited = new Set();
  function decorate(category, parentPath = '') {
    if (visited.has(category.id)) return category;
    visited.add(category.id);
    category.path = parentPath ? `${parentPath} / ${category.name}` : category.name;
    category.children = (childrenByParent.get(category.id) || []).map(child => decorate(child, category.path));
    return category;
  }
  const tree = roots.map(root => decorate(root));
  // 历史异常数据不能阻塞管理员查看，孤立节点作为根节点返回并保留其 parentId 事实。
  mapped.filter(category => !visited.has(category.id)).forEach(category => tree.push(decorate(category)));
  return { items: mapped, tree };
}

function listHelpCategories(options = {}) {
  return categoryRows(options);
}

function getHelpCategory(id, options = {}) {
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) return null;
  const result = categoryRows(options);
  return result.items.find(category => category.id === categoryId) || null;
}

function assertCategory(id) {
  const category = queryOne('SELECT * FROM help_categories WHERE id = ?', [Number(id)]);
  if (!category) throw new HelpCategoryError('HELP_CATEGORY_NOT_FOUND', '帮助分类不存在', 404);
  return category;
}

function assertParent(parentId, currentId = null) {
  if (parentId === null || parentId === undefined || parentId === '') return null;
  const normalized = Number(parentId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new HelpCategoryError('HELP_CATEGORY_INVALID', '父级分类不合法');
  }
  const parent = assertCategory(normalized);
  if (currentId != null && normalized === Number(currentId)) {
    throw new HelpCategoryError('HELP_CATEGORY_CYCLE', '分类不能把自己设置为父级');
  }
  if (currentId != null) {
    let cursor = parent.parent_id == null ? null : Number(parent.parent_id);
    while (cursor != null) {
      if (cursor === Number(currentId)) throw new HelpCategoryError('HELP_CATEGORY_CYCLE', '分类不能移动到自己的子级下');
      const row = queryOne('SELECT parent_id FROM help_categories WHERE id = ?', [cursor]);
      cursor = row && row.parent_id != null ? Number(row.parent_id) : null;
    }
  }
  return normalized;
}

function validateSlug(slug) {
  const value = cleanText(slug, MAX_SLUG_LENGTH, '分类标识', { required: true }).toLowerCase();
  if (!/^[a-z][a-z0-9._-]*$/.test(value)) {
    throw new HelpCategoryError('HELP_CATEGORY_INVALID', '分类标识只能使用小写字母、数字、点、下划线和短横线，且需以字母开头');
  }
  return value;
}

function createHelpCategory(fields = {}, createdBy) {
  const slug = validateSlug(fields.slug);
  const name = cleanText(fields.name, MAX_NAME_LENGTH, '分类名称', { required: true });
  const description = cleanText(fields.description, MAX_DESCRIPTION_LENGTH, '分类说明');
  const categoryType = normalizeType(fields.categoryType || 'general');
  const parentId = assertParent(fields.parentId);
  const sortOrder = normalizeSortOrder(fields.sortOrder, 0);
  if (queryOne('SELECT id FROM help_categories WHERE slug = ?', [slug])) {
    throw new HelpCategoryError('HELP_CATEGORY_CONFLICT', '分类标识已存在', 409);
  }
  const now = new Date().toISOString();
  run(`
    INSERT INTO help_categories
      (slug, name, description, category_type, parent_id, sort_order, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, [slug, name, description, categoryType, parentId, sortOrder, now, now]);
  return getHelpCategory(queryOne('SELECT id FROM help_categories WHERE slug = ?', [slug]).id, { includeArchived: true });
}

function updateHelpCategory(id, fields = {}) {
  const current = assertCategory(id);
  const name = cleanText(fields.name === undefined ? current.name : fields.name, MAX_NAME_LENGTH, '分类名称', { required: true });
  const description = cleanText(fields.description === undefined ? current.description : fields.description, MAX_DESCRIPTION_LENGTH, '分类说明');
  const categoryType = normalizeType(fields.categoryType === undefined ? current.category_type : fields.categoryType);
  const parentId = assertParent(fields.parentId === undefined ? current.parent_id : fields.parentId, current.id);
  const sortOrder = normalizeSortOrder(fields.sortOrder, Number(current.sort_order || 0));
  const now = new Date().toISOString();
  run(`
    UPDATE help_categories
       SET name = ?, description = ?, category_type = ?, parent_id = ?, sort_order = ?, updated_at = ?
     WHERE id = ?
  `, [name, description, categoryType, parentId, sortOrder, now, current.id]);
  return getHelpCategory(current.id, { includeArchived: true });
}

function archiveHelpCategory(id) {
  const current = assertCategory(id);
  if (queryOne("SELECT id FROM help_categories WHERE parent_id = ? AND status = 'active' LIMIT 1", [current.id])) {
    throw new HelpCategoryError('HELP_CATEGORY_HAS_CHILDREN', '请先归档子分类，再归档当前分类');
  }
  run("UPDATE help_categories SET status = 'archived', updated_at = ? WHERE id = ?", [new Date().toISOString(), current.id]);
  return getHelpCategory(current.id, { includeArchived: true });
}

function restoreHelpCategory(id) {
  const current = assertCategory(id);
  if (current.parent_id != null) {
    const parent = queryOne('SELECT status FROM help_categories WHERE id = ?', [current.parent_id]);
    if (!parent || parent.status !== 'active') throw new HelpCategoryError('HELP_CATEGORY_PARENT_ARCHIVED', '请先恢复父级分类');
  }
  run("UPDATE help_categories SET status = 'active', updated_at = ? WHERE id = ?", [new Date().toISOString(), current.id]);
  return getHelpCategory(current.id, { includeArchived: true });
}

function getDocumentCategoryIds(documentSlug) {
  return query(`
    SELECT category_id FROM help_document_categories hdc
    INNER JOIN help_categories c ON c.id = hdc.category_id
    WHERE hdc.document_slug = ? AND c.status = 'active'
    ORDER BY c.sort_order ASC, c.id ASC
  `, [documentSlug]).map(row => Number(row.category_id));
}

function setDocumentCategories(documentSlug, categoryIds, updatedBy) {
  const document = queryOne('SELECT slug FROM help_documents WHERE slug = ?', [documentSlug]);
  if (!document) throw new HelpCategoryError('HELP_DOCUMENT_NOT_FOUND', '帮助文档不存在', 404);
  if (!Array.isArray(categoryIds)) throw new HelpCategoryError('HELP_CATEGORY_INVALID', '分类必须是 ID 数组');
  const uniqueIds = [...new Set(categoryIds.map(value => Number(value)))];
  if (uniqueIds.some(id => !Number.isInteger(id) || id <= 0) || uniqueIds.length > 30) {
    throw new HelpCategoryError('HELP_CATEGORY_INVALID', '分类 ID 数组不合法');
  }
  uniqueIds.forEach(id => {
    const category = queryOne("SELECT id FROM help_categories WHERE id = ? AND status = 'active'", [id]);
    if (!category) throw new HelpCategoryError('HELP_CATEGORY_NOT_FOUND', `分类 ${id} 不存在或已归档`, 404);
  });
  const now = new Date().toISOString();
  runInTransaction(() => {
    run('DELETE FROM help_document_categories WHERE document_slug = ?', [documentSlug]);
    uniqueIds.forEach(categoryId => run(`
      INSERT INTO help_document_categories (document_slug, category_id, created_at)
      VALUES (?, ?, ?)
    `, [documentSlug, categoryId, now]));
    // updatedBy 保留在调用方审计上下文，当前关联表只记录时间，避免把用户信息重复建模。
    void updatedBy;
  });
  return getDocumentCategoryIds(documentSlug);
}

module.exports = {
  HELP_CATEGORY_TYPES,
  HELP_CATEGORY_STATUSES,
  HelpCategoryError,
  listHelpCategories,
  getHelpCategory,
  createHelpCategory,
  updateHelpCategory,
  archiveHelpCategory,
  restoreHelpCategory,
  getDocumentCategoryIds,
  setDocumentCategories
};
