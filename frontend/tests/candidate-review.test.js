import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCandidateTimeline,
  candidateStatusMeta,
  formatValidationMessage,
  historyAttemptStatusMeta,
  officialVersionLabel,
  partitionReviewSubmissions,
  pickPendingRevision,
  revisionNote,
  reviewStatusMeta,
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

  assert.deepEqual(events.map(item => item.title), ['提交修订', '校验 1', '校验 2', '退回'])
  assert.match(events[2].detail, /预览脚本报错/)
  assert.equal(events[3].detail, '负责人 · 再改一版')
  assert.equal(formatValidationMessage({ code: 'ENTRY_FILE_MISSING', message: '未找到入口' }), '未找到入口')
})

test('review IA picks the latest ready submission as the only pending revision', () => {
  const olderReady = { id: 'a', status: 'ready', submission_no: 1, created_at: '2026-09-08T09:00:00.000Z' }
  const latestReady = { id: 'b', status: 'ready', submission_no: 2, created_at: '2026-09-08T10:00:00.000Z' }
  const returned = { id: 'c', status: 'returned', submission_no: 3, created_at: '2026-09-08T08:00:00.000Z' }
  const failed = { id: 'd', status: 'validation_failed', submission_no: 4, created_at: '2026-09-08T07:00:00.000Z' }
  const stale = { id: 'e', status: 'stale', submission_no: 5, created_at: '2026-09-08T06:00:00.000Z' }
  const partitioned = partitionReviewSubmissions([olderReady, failed, latestReady, returned, stale])

  assert.equal(pickPendingRevision([olderReady, latestReady, returned]).id, 'b')
  assert.equal(partitioned.pendingRevision.id, 'b')
  assert.equal(partitioned.pendingRevision.status, 'ready')
  assert.equal(partitioned.historyAttempts.filter(item => item.status === 'ready').length, 1)
  assert.deepEqual(partitioned.historyAttempts.map(item => item.id), ['e', 'd', 'c', 'a'])
  assert.equal(historyAttemptStatusMeta('ready').label, '已被替代')
  assert.equal(reviewStatusMeta({ status: 'awaiting_review' }, latestReady).label, '待审')
  assert.equal(reviewStatusMeta({ status: 'awaiting_review' }, null).label, '待审核')
})

test('revision note falls back to task requirement or title without inventing fields', () => {
  assert.equal(revisionNote({ summary: '补充实体字段校验提示' }, { title: '实体建模' }), '补充实体字段校验提示')
  assert.equal(revisionNote({}, { requirement: '补齐列表校验', title: '实体建模' }), '补齐列表校验')
  assert.equal(revisionNote({ task_title: '实体建模' }, {}), '实体建模')
  assert.equal(revisionNote({}, {}), '')
  assert.equal(officialVersionLabel({ version_label: '0' }, { base_version_number: 2 }), '正式版 v0')
  assert.equal(officialVersionLabel(null, { base_version_number: 1 }), '正式版 v1')
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
