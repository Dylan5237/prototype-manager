const express = require('express');
const multer = require('multer');
const fs = require('fs');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createProject, getProjects, getProjectById, updateProject, softDeleteProject,
  bindPrototype, getProjectPrototypes, getProjectPrototypeById, updateProjectPrototype, removeProjectPrototype,
  PrototypeProjectConflictError,
  addProjectMember, getProjectMember, getProjectMembers, removeProjectMember,
  checkoutPrototype, checkinPrototype, forceReleaseCheckout, getActiveCheckout, getProjectCheckouts,
  createSnapshot, getProjectSnapshots, getSnapshotById, restoreSnapshot, deleteSnapshot
} = require('../services/db-projects');
const { getPrototypeById } = require('../services/db-prototypes');
const { AuthorizationError, AuthorizationService } = require('../services/authorization');
const { GitProviderError } = require('../services/git-provider');
const { GitLabProvider } = require('../services/gitlab-provider');
const {
  RepositoryProvisioningError,
  RepositoryProvisioningService
} = require('../services/repository-provisioning');
const { UPLOADS_DIR } = require('../services/storage');
const {
  LightweightCollaborationError,
  LightweightCollaborationService
} = require('../services/lightweight-collaboration');

const candidateUpload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip')) callback(null, true);
    else callback(new LightweightCollaborationError('CANDIDATE_INVALID', '候选只支持 ZIP 文件'));
  }
});

function sendLightweightError(res, error) {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, code: 'CANDIDATE_TOO_LARGE', message: '候选 ZIP 不能超过 100 MB' });
  }
  if (error instanceof LightweightCollaborationError || error instanceof AuthorizationError) {
    return res.status(error.status || (error instanceof AuthorizationError ? 403 : 400)).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details || undefined
    });
  }
  return res.status(500).json({ success: false, code: 'LIGHTWEIGHT_COLLABORATION_FAILED', message: '轻协作操作失败' });
}

// 辅助函数
function isAdmin(req) {
  return req.user.roles && req.user.roles.includes('admin');
}

function isProjectOwner(req, project) {
  return project && project.created_by === req.user.id;
}

function getUserProjectRole(req, projectId) {
  const project = getProjectById(projectId);
  if (!project) return { project: null, role: null };
  if (isAdmin(req)) return { project, role: 'admin' };
  if (isProjectOwner(req, project)) return { project, role: 'owner' };
  const member = getProjectMember(projectId, req.user.id);
  if (member) return { project, role: member.role };
  return { project, role: null };
}

function requireProjectRole(...roles) {
  return (req, res, next) => {
    const { project, role } = getUserProjectRole(req, req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' });
    }
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ success: false, message: '无权操作该项目' });
    }
    req.projectRole = role;
    req.project = project;
    next();
  };
}

function requireProjectAccess(req, res, next) {
  const { project, role } = getUserProjectRole(req, req.params.id);
  if (!project) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }
  if (!role) {
    return res.status(403).json({ success: false, message: '无权访问该项目' });
  }
  req.projectRole = role;
  req.project = project;
  next();
}

function formatMenuConfig(menuConfig) {
  if (typeof menuConfig === 'string') {
    try {
      return JSON.parse(menuConfig);
    } catch (e) {
      return { items: [] };
    }
  }
  return menuConfig || { items: [] };
}

// =================== 轻协作 MVP API ===================

router.post('/handoffs/redeem', requireAuth, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const result = service.redeemHandoff({ actor: req.user, handoffCode: req.body.handoffCode });
    res.json({ success: true, data: result });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.get('/:id/changes', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const changes = service.listChanges({
      actor: req.user,
      projectId: req.params.id,
      prototypeId: req.query.prototypeId,
      status: req.query.status
    });
    res.json({ success: true, data: changes });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.post('/:id/prototypes/:prototypeId/changes', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const result = service.createChange({
      actor: req.user,
      projectId: req.params.id,
      prototypeId: req.params.prototypeId,
      title: req.body.title,
      requirement: req.body.requirement,
      versionStrategy: req.body.versionStrategy || {
        type: req.body.versionStrategyType,
        value: req.body.versionStrategyValue
      }
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.get('/:id/changes/:changeId', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const change = service.getChange({ actor: req.user, projectId: req.params.id, changeId: req.params.changeId });
    res.json({ success: true, data: change });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.post('/:id/changes/:changeId/preview-validation', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const change = service.recordPreviewValidation({
      actor: req.user,
      projectId: req.params.id,
      changeId: req.params.changeId,
      status: req.body.status,
      errors: req.body.errors,
      warnings: req.body.warnings,
      durationMs: req.body.durationMs
    });
    res.json({ success: true, data: change });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.patch('/:id/changes/:changeId', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const result = service.updateChange({
      actor: req.user,
      projectId: req.params.id,
      changeId: req.params.changeId,
      title: req.body.title,
      requirement: req.body.requirement,
      versionStrategy: req.body.versionStrategy
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.delete('/:id/changes/:changeId', requireAuth, requireProjectAccess, (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const change = service.cancelChange({
      actor: req.user,
      projectId: req.params.id,
      changeId: req.params.changeId
    });
    res.json({ success: true, data: change });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.post(
  '/:id/changes/:changeId/candidate',
  requireAuth,
  requireProjectAccess,
  (req, res, next) => candidateUpload.single('file')(req, res, error => {
    if (error) sendLightweightError(res, error);
    else next();
  }),
  (req, res) => {
    try {
      if (!req.file) throw new LightweightCollaborationError('CANDIDATE_FILE_MISSING', '没有上传候选 ZIP');
      const service = new LightweightCollaborationService();
      const change = service.submitCandidate({
        actor: req.user,
        projectId: req.params.id,
        changeId: req.params.changeId,
        zipPath: req.file.path,
        versionType: req.body.versionType
      });
      res.json({ success: true, data: change });
    } catch (error) {
      sendLightweightError(res, error);
    } finally {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    }
  }
);

router.post('/:id/changes/:changeId/adopt', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const result = service.adoptChange({ actor: req.user, projectId: req.params.id, changeId: req.params.changeId });
    res.json({ success: true, data: result });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

router.post('/:id/changes/:changeId/reject', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  try {
    const service = new LightweightCollaborationService();
    const change = service.rejectChange({
      actor: req.user,
      projectId: req.params.id,
      changeId: req.params.changeId,
      note: req.body.note
    });
    res.json({ success: true, data: change });
  } catch (error) {
    sendLightweightError(res, error);
  }
});

// =================== 项目基础 API ===================

// 项目列表（自己创建或参与的 + admin 看全部）
router.get('/', requireAuth, (req, res) => {
  const keyword = req.query.keyword || '';
  let projects = getProjects({ keyword });
  if (!isAdmin(req)) {
    const memberRows = require('../database/db').query(`
      SELECT project_id FROM project_members WHERE user_id = ?
    `, [req.user.id]);
    const memberProjectIds = new Set(memberRows.map(r => r.project_id));
    projects = projects.filter(p => p.created_by === req.user.id || memberProjectIds.has(p.id));
  }
  res.json({ success: true, data: projects });
});

// 创建项目
router.post('/', requireAuth, (req, res) => {
  const { name, description, menuConfig } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '项目名称不能为空' });
  }
  try {
    const project = createProject({
      name: name.trim(),
      description: description || '',
      menuConfig: formatMenuConfig(menuConfig),
      createdBy: req.user.id
    });
    // 创建者自动作为 owner，无需写入 project_members
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 公开门户预览数据（只读，隐藏成员/权限等敏感信息）
router.get('/:id/portal', requireAuth, (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project || project.deleted_at) {
    return res.status(404).json({ success: false, message: '项目不存在' });
  }
  const prototypes = getProjectPrototypes(project.id).map(pp => ({
    prototype_id: pp.prototype_id,
    prototype_name: pp.prototype_name,
    menu_path: pp.menu_path,
    entry_file: pp.entry_file,
    version_label: pp.version_label,
    version_number: pp.version_number
  }));
  res.json({
    success: true,
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      menu_config: project.menu_config,
      prototypes
    }
  });
});

// 项目详情
router.get('/:id', requireAuth, requireProjectAccess, (req, res) => {
  const project = req.project;
  const prototypes = getProjectPrototypes(project.id);
  const checkouts = getProjectCheckouts(project.id);
  const checkoutMap = new Map();
  checkouts.forEach(c => checkoutMap.set(c.project_prototype_id, c));
  const members = getProjectMembers(project.id);
  const withStatus = prototypes.map(pp => ({
    ...pp,
    checkout: checkoutMap.get(pp.id) || null
  }));
  res.json({
    success: true,
    data: {
      ...project,
      prototypes: withStatus,
      members,
      role: req.projectRole
    }
  });
});

// 更新项目
router.put('/:id', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const { name, description, menuConfig } = req.body;
  try {
    const project = updateProject(req.params.id, {
      name: name !== undefined ? name.trim() : undefined,
      description,
      menuConfig: menuConfig !== undefined ? formatMenuConfig(menuConfig) : undefined
    });
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除项目
router.delete('/:id', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  softDeleteProject(req.params.id);
  res.json({ success: true });
});

// =================== 项目-原型绑定 API ===================

// 绑定原型到菜单项
router.post('/:id/prototypes', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const { prototypeId, menuPath, sortOrder } = req.body;
  if (!prototypeId || !menuPath) {
    return res.status(400).json({ success: false, message: 'prototypeId 和 menuPath 不能为空' });
  }
  const prototype = getPrototypeById(prototypeId);
  if (!prototype) {
    return res.status(404).json({ success: false, message: '原型不存在' });
  }
  try {
    const binding = bindPrototype({
      projectId: req.params.id,
      prototypeId,
      menuPath,
      sortOrder: sortOrder || 0
    });
    res.json({ success: true, data: binding });
  } catch (err) {
    if (err instanceof PrototypeProjectConflictError) {
      return res.status(409).json({ success: false, code: err.code, message: err.message, details: err.details });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新绑定
router.put('/:id/prototypes/:ppId', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const { menuPath, sortOrder } = req.body;
  try {
    const ppId = parseInt(req.params.ppId, 10);
    const existing = getProjectPrototypeById(ppId);
    if (!existing || existing.project_id !== req.params.id) {
      return res.status(404).json({ success: false, message: '绑定不存在' });
    }
    const binding = updateProjectPrototype(ppId, { menuPath, sortOrder });
    if (!binding) {
      return res.status(404).json({ success: false, message: '绑定不存在' });
    }
    res.json({ success: true, data: binding });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 解绑
router.delete('/:id/prototypes/:ppId', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const ppId = parseInt(req.params.ppId, 10);
  const existing = getProjectPrototypeById(ppId);
  if (!existing || existing.project_id !== req.params.id) {
    return res.status(404).json({ success: false, message: '绑定不存在' });
  }
  removeProjectPrototype(ppId);
  res.json({ success: true });
});

// 为原型供应平台托管的私有协作仓库；GitLab 凭据只从服务端环境读取。
router.post('/:id/prototypes/:prototypeId/repository', requireAuth, async (req, res) => {
  try {
    const authorization = new AuthorizationService();
    const provider = GitLabProvider.fromEnvironment();
    const service = new RepositoryProvisioningService({ provider, authorization });
    const result = await service.provision({
      actor: req.user,
      projectId: req.params.id,
      prototypeId: req.params.prototypeId,
      name: req.body.name,
      description: req.body.description || ''
    });
    res.json({ success: true, data: result });
  } catch (error) {
    let status = 500;
    if (error instanceof AuthorizationError) status = 403;
    else if (error.code === 'PROTOTYPE_NOT_FOUND') status = 404;
    else if (error.code === 'PROTOTYPE_PROJECT_CONFLICT') status = 409;
    else if (error.code === 'GIT_PROVIDER_NOT_CONFIGURED') status = 503;
    else if (error instanceof GitProviderError || error instanceof RepositoryProvisioningError) status = 502;
    res.status(status).json({
      success: false,
      code: error.code || 'GIT_REPOSITORY_PROVISION_FAILED',
      message: error.message || '协作仓库供应失败'
    });
  }
});

// =================== 项目成员 API ===================

// 成员列表
router.get('/:id/members', requireAuth, requireProjectAccess, (req, res) => {
  res.json({ success: true, data: getProjectMembers(req.params.id) });
});

// 添加成员
router.post('/:id/members', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const { userId, role = 'editor' } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId 不能为空' });
  }
  if (!['editor', 'viewer'].includes(role)) {
    return res.status(400).json({ success: false, message: 'role 只能是 editor 或 viewer' });
  }
  try {
    const member = addProjectMember({ projectId: req.params.id, userId, role });
    res.json({ success: true, data: member });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 移除成员
router.delete('/:id/members/:userId', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  removeProjectMember(req.params.id, parseInt(req.params.userId, 10));
  res.json({ success: true });
});

// =================== 签出 / 签入 API ===================

// 签出
router.post('/:id/prototypes/:ppId/checkout', requireAuth, requireProjectAccess, (req, res) => {
  if (req.projectRole === 'viewer') {
    return res.status(403).json({ success: false, message: '查看者不能签出' });
  }
  const ppId = parseInt(req.params.ppId, 10);
  const binding = getProjectPrototypeById(ppId);
  if (!binding || binding.project_id !== req.params.id) {
    return res.status(404).json({ success: false, message: '绑定不存在' });
  }
  try {
    const checkout = checkoutPrototype({
      projectId: req.params.id,
      projectPrototypeId: ppId,
      userId: req.user.id,
      note: req.body.note || '',
      durationHours: req.body.durationHours || 24
    });
    res.json({ success: true, data: checkout });
  } catch (err) {
    res.status(409).json({ success: false, message: err.message });
  }
});

// 签入
router.post('/:id/prototypes/:ppId/checkin', requireAuth, requireProjectAccess, (req, res) => {
  const ppId = parseInt(req.params.ppId, 10);
  try {
    const checkout = checkinPrototype({ projectPrototypeId: ppId, userId: req.user.id });
    if (!checkout) {
      return res.status(400).json({ success: false, message: '该模块未签出或不是你签出' });
    }
    res.json({ success: true, data: checkout });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 强制释放（owner/admin）
router.post('/:id/prototypes/:ppId/release', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const ppId = parseInt(req.params.ppId, 10);
  const active = getActiveCheckout(ppId);
  if (!active) {
    return res.status(400).json({ success: false, message: '该模块未被签出' });
  }
  const checkout = forceReleaseCheckout({ checkoutId: active.id, byAdmin: true });
  res.json({ success: true, data: checkout });
});

// 签出列表
router.get('/:id/checkouts', requireAuth, requireProjectAccess, (req, res) => {
  res.json({ success: true, data: getProjectCheckouts(req.params.id) });
});

// =================== 快照 API ===================

// 快照列表
router.get('/:id/snapshots', requireAuth, requireProjectAccess, (req, res) => {
  res.json({ success: true, data: getProjectSnapshots(req.params.id) });
});

// 创建快照
router.post('/:id/snapshots', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  const { name, versionLabel } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '快照名称不能为空' });
  }
  try {
    const snapshot = createSnapshot({
      projectId: req.params.id,
      name: name.trim(),
      versionLabel: versionLabel || '',
      createdBy: req.user.id
    });
    res.json({ success: true, data: snapshot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 恢复快照
router.post('/:id/snapshots/:snapshotId/restore', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  try {
    const result = restoreSnapshot(parseInt(req.params.snapshotId, 10), { restoredBy: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除快照
router.delete('/:id/snapshots/:snapshotId', requireAuth, requireProjectRole('owner', 'admin'), (req, res) => {
  deleteSnapshot(parseInt(req.params.snapshotId, 10));
  res.json({ success: true });
});

module.exports = router;
