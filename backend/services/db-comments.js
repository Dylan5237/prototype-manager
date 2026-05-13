const { run, query, queryOne } = require('../database/db');
const fs = require('fs');
const path = require('path');

const COMMENT_IMAGES_DIR = path.join(__dirname, '../uploads/comment-images');

function ensureDir() {
  if (!fs.existsSync(COMMENT_IMAGES_DIR)) {
    fs.mkdirSync(COMMENT_IMAGES_DIR, { recursive: true });
  }
}

function createComment({ prototypeId, userId, content, images, parentId }) {
  const now = new Date().toISOString();
  run(
    `INSERT INTO comments (prototype_id, user_id, content, images, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [prototypeId, userId, content, images || '[]', parentId || null, now, now]
  );
  // sql.js 的 run 不返回 lastID，直接查询最后插入的记录
  const comment = queryOne(`SELECT * FROM comments WHERE prototype_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1`, [prototypeId, userId]);
  if (comment) {
    comment.images = JSON.parse(comment.images || '[]');
  }
  return comment;
}

function findCommentById(id) {
  return queryOne(`
    SELECT c.*, u.username, u.nickname
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `, [id]);
}

function getComments(prototypeId) {
  const comments = query(`
    SELECT c.*, u.username, u.nickname
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.prototype_id = ?
    ORDER BY c.created_at DESC
  `, [prototypeId]);

  // 加载图片
  comments.forEach(c => {
    c.images = JSON.parse(c.images || '[]');
  });
  return comments;
}

function deleteComment(id) {
  const comment = findCommentById(id);
  if (!comment) return false;

  // 删除关联图片文件
  const images = JSON.parse(comment.images || '[]');
  images.forEach(img => {
    const filePath = path.join(COMMENT_IMAGES_DIR, img.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  run(`DELETE FROM comments WHERE id = ?`, [id]);
  return true;
}

function saveCommentImage(commentId, filename, originalName) {
  const now = new Date().toISOString();
  run(
    `INSERT INTO comment_images (comment_id, filename, original_name, created_at) VALUES (?, ?, ?, ?)`,
    [commentId, filename, originalName, now]
  );
}

function getCommentImagePath(filename) {
  return path.join(COMMENT_IMAGES_DIR, filename);
}

module.exports = {
  createComment,
  findCommentById,
  getComments,
  deleteComment,
  saveCommentImage,
  getCommentImagePath,
  COMMENT_IMAGES_DIR
};
