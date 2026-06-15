const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getGroups, getGroupById, createGroup, updateGroup, deleteGroup
} = require('../services/db-groups');

const router = express.Router();

// 所有用户组接口仅 admin 可访问

// 获取用户组列表
router.get('/', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const groups = getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取用户组详情
router.get('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const group = getGroupById(groupId);
  if (!group) {
    return res.status(404).json({ success: false, message: '用户组不存在' });
  }
  res.json({ success: true, data: group });
});

// 创建用户组
router.post('/', requireAuth, requireRole(['admin']), (req, res) => {
  const { name, description, memberIds } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '组名称不能为空' });
  }
  try {
    const group = createGroup({
      name: name.trim(),
      description: description || '',
      createdBy: req.user.id,
      memberIds: Array.isArray(memberIds) ? memberIds : []
    });
    res.json({ success: true, data: group });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '用户组名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新用户组
router.put('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const { name, description, memberIds } = req.body;
  const group = getGroupById(groupId);
  if (!group) {
    return res.status(404).json({ success: false, message: '用户组不存在' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '组名称不能为空' });
  }
  try {
    const updated = updateGroup(groupId, {
      name: name.trim(),
      description: description || '',
      memberIds: Array.isArray(memberIds) ? memberIds : undefined
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, message: '用户组名称已存在' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除用户组
router.delete('/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const group = getGroupById(groupId);
  if (!group) {
    return res.status(404).json({ success: false, message: '用户组不存在' });
  }
  deleteGroup(groupId);
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
