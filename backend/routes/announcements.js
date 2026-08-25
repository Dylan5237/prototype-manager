const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  listAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  archiveAnnouncement
} = require('../services/db-announcements');
const { markAnnouncementRead } = require('../services/db-announcements');

function isAdmin(req) {
  return (req.user?.roles || []).includes('admin');
}

// 已发布公告供所有登录用户查看；管理员可通过 includeDrafts 查看草稿和归档。
router.get('/', requireAuth, (req, res) => {
  const includeDrafts = isAdmin(req) && String(req.query.includeDrafts) === 'true';
  const filter = String(req.query.filter || 'all');
  const announcements = listAnnouncements({
    userId: req.user.id,
    includeDrafts,
    filter,
    limit: req.query.limit
  });
  res.json({ success: true, data: announcements });
});

router.get('/:id', requireAuth, (req, res) => {
  const announcement = getAnnouncement(req.params.id, {
    userId: req.user.id,
    includeDrafts: isAdmin(req)
  });
  if (!announcement) return res.status(404).json({ success: false, message: '公告不存在' });
  res.json({ success: true, data: announcement });
});

router.post('/:id/read', requireAuth, (req, res) => {
  const announcement = markAnnouncementRead(req.params.id, req.user.id);
  if (!announcement) return res.status(404).json({ success: false, message: '公告不存在或尚未发布' });
  res.json({ success: true, data: announcement });
});

router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const announcement = createAnnouncement({ ...req.body, createdBy: req.user.id });
    res.status(201).json({ success: true, data: announcement });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || '创建公告失败' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const announcement = updateAnnouncement(req.params.id, req.body);
    if (!announcement) return res.status(404).json({ success: false, message: '公告不存在' });
    res.json({ success: true, data: announcement });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || '更新公告失败' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const announcement = archiveAnnouncement(req.params.id);
  if (!announcement) return res.status(404).json({ success: false, message: '公告不存在' });
  res.json({ success: true, data: announcement });
});

module.exports = router;
