import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canEditProjectTask,
  getProjectPermissions,
  getProjectRoleLabel
} from '../src/utils/project-permissions.js'

test('project role display permissions match the backend role matrix', () => {
  assert.deepEqual(getProjectPermissions('owner'), { canManage: true, canEdit: true })
  assert.deepEqual(getProjectPermissions('admin'), { canManage: true, canEdit: true })
  assert.deepEqual(getProjectPermissions('editor'), { canManage: false, canEdit: true })
  assert.deepEqual(getProjectPermissions('viewer'), { canManage: false, canEdit: false })
  assert.deepEqual(getProjectPermissions('unknown'), { canManage: false, canEdit: false })

  assert.equal(getProjectRoleLabel('owner'), '创建者')
  assert.equal(getProjectRoleLabel('admin'), '管理员')
  assert.equal(getProjectRoleLabel('editor'), '编辑者')
  assert.equal(getProjectRoleLabel('viewer'), '查看者')
  assert.equal(getProjectRoleLabel('unknown'), '')
})

test('task edit actions are shown only when the backend would allow them', () => {
  const ownTask = { status: 'editing', handoff_status: 'created', created_by: 2 }
  const otherTask = { ...ownTask, created_by: 9 }

  assert.equal(canEditProjectTask({ role: 'owner', userId: 1, change: otherTask }), true)
  assert.equal(canEditProjectTask({ role: 'admin', isPlatformAdmin: true, userId: 8, change: otherTask }), true)
  assert.equal(canEditProjectTask({ role: 'admin', userId: 2, change: ownTask }), true)
  assert.equal(canEditProjectTask({ role: 'admin', userId: 2, change: otherTask }), false)
  assert.equal(canEditProjectTask({ role: 'editor', userId: 2, change: ownTask }), true)
  assert.equal(canEditProjectTask({ role: 'editor', userId: 2, change: otherTask }), false)
  assert.equal(canEditProjectTask({ role: 'viewer', userId: 2, change: ownTask }), false)
})

test('redeemed or completed tasks never expose edit actions', () => {
  assert.equal(canEditProjectTask({
    role: 'owner',
    userId: 1,
    change: { status: 'editing', handoff_status: 'redeemed', created_by: 1 }
  }), false)
  assert.equal(canEditProjectTask({
    role: 'owner',
    userId: 1,
    change: { status: 'ready', handoff_status: 'redeemed', created_by: 1 }
  }), false)
})
