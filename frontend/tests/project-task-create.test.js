import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCreateProjectTaskBody,
  buildProjectTaskAgentPrompt,
  startBoundProjectTask
} from '../src/utils/project-task-create.js'

const binding = {
  id: 12,
  node_id: 'node_entity',
  prototype_id: 'proto_1',
  prototype_name: '实体列表',
  menu_path: '建模 / 实体建模'
}

test('bound create payload uses Task v2 nodeId and bindingId, not prototype changeId', () => {
  const body = buildCreateProjectTaskBody({
    binding,
    title: '补充校验提示',
    requirement: '列表字段增加校验提示',
    responsibleUserId: 8,
    versionStrategy: { type: 'auto', value: null }
  })
  assert.deepEqual(body, {
    nodeId: 'node_entity',
    bindingId: 12,
    title: '补充校验提示',
    requirement: '列表字段增加校验提示',
    responsibleUserId: 8,
    versionStrategy: { type: 'auto', value: null }
  })
  assert.equal('changeId' in body, false)
  assert.equal('prototypeId' in body, false)
})

test('agent prompt names taskId and Task v2 tools instead of legacy /changes writes', () => {
  const prompt = buildProjectTaskAgentPrompt({
    projectName: '建模开发平台',
    projectId: 'proj_1',
    prototypeName: '实体列表',
    prototypeId: 'proto_1',
    menuPath: '建模 / 实体建模',
    task: {
      id: 'task_abc',
      taskId: 'task_abc',
      node_id: 'node_entity',
      binding_id: 12,
      base_version_number: 0,
      version_strategy_type: 'auto',
      requirement: '补充实体字段校验提示'
    },
    handoffCode: 'FXT-TEST',
    expiresAt: '2026-09-09T00:00:00.000Z'
  })
  assert.match(prompt, /taskId=task_abc/)
  assert.match(prompt, /accept_project_task/)
  assert.match(prompt, /submit_task_candidate/)
  assert.doesNotMatch(prompt, /redeem_change_handoff/)
  assert.doesNotMatch(prompt, /submit_change_candidate/)
  assert.doesNotMatch(prompt, /create_change_handoff/)
})

test('startBoundProjectTask creates via POST /tasks then accepts to issue handoff', async () => {
  const calls = []
  const createdTask = {
    id: 'task_abc',
    taskId: 'task_abc',
    node_id: 'node_entity',
    binding_id: 12,
    base_version_number: 0,
    version_strategy_type: 'auto',
    requirement: '补充校验',
    responsible: { user_id: 8 }
  }
  const result = await startBoundProjectTask({
    projectId: 'proj_1',
    projectName: '建模开发平台',
    binding,
    menuPath: '建模 / 实体建模',
    title: '补充校验',
    requirement: '补充校验',
    versionStrategy: { type: 'auto', value: null },
    responsibleUserId: 8,
    createProjectTask: async (projectId, body) => {
      calls.push(['create', projectId, body])
      return { data: { data: createdTask } }
    },
    acceptProjectTask: async (projectId, taskId) => {
      calls.push(['accept', projectId, taskId])
      return {
        data: {
          data: {
            task: { ...createdTask, status: 'in_progress' },
            handoffCode: 'FXT-LIVE',
            expiresAt: '2026-09-09T00:00:00.000Z'
          }
        }
      }
    }
  })

  assert.equal(calls[0][0], 'create')
  assert.equal(calls[0][1], 'proj_1')
  assert.equal(calls[0][2].bindingId, 12)
  assert.equal(calls[1][0], 'accept')
  assert.equal(calls[1][2], 'task_abc')
  assert.equal(result.taskId, 'task_abc')
  assert.equal(result.handoffCode, 'FXT-LIVE')
  assert.match(result.prompt, /taskId=task_abc/)
  assert.match(result.prompt, /FXT-LIVE/)
})
