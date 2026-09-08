import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCandidateTimeline,
  candidateStatusMeta,
  formatValidationMessage,
  taskStatusMeta
} from '../src/utils/candidate-review.js'
import {
  canCancelProjectTask,
  canReviewProjectCandidate
} from '../src/utils/project-permissions.js'

test('task and candidate status labels cover the v2 review states', () => {
  assert.equal(taskStatusMeta('awaiting_review').label, '待审核')
  assert.equal(candidateStatusMeta('ready').label, '待确认')
  assert.equal(candidateStatusMeta('returned').label, '已退回')
  assert.equal(candidateStatusMeta('stale').label, '已过期')
})

test('review and cancel actions follow owner/admin vs initiator rules', () => {
  const ready = { status: 'ready' }
  assert.equal(canReviewProjectCandidate({ role: 'owner', candidate: ready }), true)
  assert.equal(canReviewProjectCandidate({ role: 'admin', candidate: ready }), true)
  assert.equal(canReviewProjectCandidate({ role: 'editor', candidate: ready }), false)
  assert.equal(canReviewProjectCandidate({ role: 'viewer', candidate: ready }), false)
  assert.equal(canReviewProjectCandidate({ role: 'owner', candidate: { status: 'returned' } }), false)

  const openTask = { status: 'in_progress', requested_by: 8, pending_candidate_count: 0 }
  assert.equal(canCancelProjectTask({ role: 'editor', userId: 8, task: openTask }), true)
  assert.equal(canCancelProjectTask({ role: 'editor', userId: 2, task: openTask }), false)
  assert.equal(canCancelProjectTask({ role: 'owner', userId: 1, task: openTask }), true)
  assert.equal(canCancelProjectTask({
    role: 'owner',
    userId: 1,
    task: { ...openTask, pending_candidate_count: 1 }
  }), false)
})

test('candidate timeline keeps submit, append-only validations and review decisions', () => {
  const events = buildCandidateTimeline({
    id: 'cand_1',
    submission_no: 2,
    status: 'returned',
    submitter_name: '编辑者',
    submitter_username: 'editor',
    base_version_number: 3,
    created_at: '2026-09-08T10:00:00.000Z',
    updated_at: '2026-09-08T10:20:00.000Z',
    validations: [
      {
        id: 'cval_1',
        attempt_no: 1,
        mode: 'static',
        source: 'server',
        status: 'passed',
        errors: [],
        created_at: '2026-09-08T10:00:01.000Z'
      },
      {
        id: 'cval_2',
        attempt_no: 2,
        mode: 'browser',
        source: 'client',
        status: 'failed',
        errors: [{ code: 'RUNTIME', message: '预览脚本报错' }],
        created_at: '2026-09-08T10:05:00.000Z'
      }
    ],
    decision: {
      id: 'rdec_1',
      result: 'returned',
      reviewer_name: '负责人',
      comment: '再改一版',
      created_at: '2026-09-08T10:20:00.000Z'
    }
  })

  assert.deepEqual(events.map(item => item.title), ['提交 #2', '校验 #1', '校验 #2', '退回'])
  assert.match(events[2].detail, /预览脚本报错/)
  assert.equal(events[3].detail, '负责人 · 再改一版')
  assert.equal(formatValidationMessage({ code: 'ENTRY_FILE_MISSING', message: '未找到入口' }), '未找到入口')
})

test('stale candidates without a decision still show an expiry event', () => {
  const events = buildCandidateTimeline({
    id: 'cand_stale',
    submission_no: 1,
    status: 'stale',
    created_at: '2026-09-08T09:00:00.000Z',
    updated_at: '2026-09-08T11:00:00.000Z',
    base_version_number: 1,
    validations: []
  })
  assert.equal(events.at(-1).title, '已过期')
})
