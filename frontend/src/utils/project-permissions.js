const PROJECT_ROLE_LABELS = Object.freeze({
  owner: '创建者',
  admin: '管理员',
  editor: '编辑者',
  viewer: '查看者'
})

export function getProjectPermissions(role) {
  const canManage = role === 'owner' || role === 'admin'
  return {
    canManage,
    canEdit: canManage || role === 'editor'
  }
}

export function getProjectRoleLabel(role) {
  return PROJECT_ROLE_LABELS[role] || ''
}

export function canEditProjectTask({ role, isPlatformAdmin = false, userId, change }) {
  if (!change || change.status !== 'editing' || change.handoff_status === 'redeemed') return false
  if (!getProjectPermissions(role).canEdit) return false
  if (role === 'owner' || isPlatformAdmin) return true
  return String(change.created_by) === String(userId)
}

export function canReviewProjectCandidate({ role, candidate }) {
  if (!candidate || candidate.status !== 'ready') return false
  return getProjectPermissions(role).canManage
}

export function canCancelProjectTask({ role, isPlatformAdmin = false, userId, task }) {
  if (!task || ['completed', 'cancelled'].includes(task.status)) return false
  if (Number(task.pending_candidate_count || 0) > 0) return false
  if (isPlatformAdmin || role === 'owner') return true
  return String(task.requested_by) === String(userId)
}
