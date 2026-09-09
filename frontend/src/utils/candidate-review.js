export const TASK_STATUS_META = Object.freeze({
  assigned: { label: '待接受', type: 'info' },
  in_progress: { label: '进行中', type: 'info' },
  awaiting_review: { label: '待审核', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'info' }
})

export const CANDIDATE_STATUS_META = Object.freeze({
  submitted: { label: '已提交', type: 'info' },
  validation_failed: { label: '校验失败', type: 'danger' },
  ready: { label: '待确认', type: 'warning' },
  returned: { label: '已退回', type: 'danger' },
  adopted: { label: '已采用', type: 'success' },
  stale: { label: '已过期', type: 'warning' }
})

export function taskStatusMeta(status) {
  return TASK_STATUS_META[status] || { label: status || '未知', type: 'info' }
}

export function candidateStatusMeta(status) {
  return CANDIDATE_STATUS_META[status] || { label: status || '未知', type: 'info' }
}

export const HISTORY_ATTEMPT_STATUSES = Object.freeze([
  'ready',
  'submitted',
  'validation_failed',
  'returned',
  'stale',
  'adopted'
])

export const HISTORY_ATTEMPT_STATUS_META = Object.freeze({
  ready: { label: '已被替代', type: 'info' },
  submitted: { label: '校验中', type: 'info' },
  validation_failed: { label: '校验失败', type: 'danger' },
  returned: { label: '已退回', type: 'danger' },
  stale: { label: '已过期', type: 'warning' },
  adopted: { label: '已采用', type: 'success' }
})

export function historyAttemptStatusMeta(status) {
  return HISTORY_ATTEMPT_STATUS_META[status] || { label: status || '未知', type: 'info' }
}

export function compareSubmissionRecency(left, right) {
  const byNumber = Number(right?.submission_no || 0) - Number(left?.submission_no || 0)
  if (byNumber !== 0) return byNumber
  return String(right?.created_at || '').localeCompare(String(left?.created_at || ''))
}

export function pickPendingRevision(candidates = []) {
  return [...candidates]
    .filter(item => item?.status === 'ready')
    .sort(compareSubmissionRecency)[0] || null
}

export function partitionReviewSubmissions(candidates = []) {
  const pendingRevision = pickPendingRevision(candidates)
  const historyAttempts = [...candidates]
    .filter(item => item && (!pendingRevision || item.id !== pendingRevision.id))
    .filter(item => HISTORY_ATTEMPT_STATUSES.includes(item.status))
    .sort(compareSubmissionRecency)
  return { pendingRevision, historyAttempts }
}

export function revisionNote(submission, task) {
  const fromSubmission = [
    submission?.summary,
    submission?.revision_note,
    submission?.note,
    submission?.comment
  ].find(value => typeof value === 'string' && value.trim())
  if (fromSubmission) return fromSubmission.trim()
  const fromTask = [task?.requirement, task?.title, submission?.task_title]
    .find(value => typeof value === 'string' && value.trim())
  return fromTask ? fromTask.trim() : ''
}

export function officialVersionLabel(binding, task) {
  const version = binding?.version_label ?? binding?.version_number ?? task?.base_version_number
  if (version == null || version === '') return '正式版'
  return `正式版 v${version}`
}

export function reviewStatusMeta(task, pendingRevision) {
  if (pendingRevision) return { label: '待审', type: 'warning' }
  return taskStatusMeta(task?.status)
}

export function displayPersonName(name, username, fallback = '未知用户') {
  return name || username || fallback
}

export function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function formatValidationMessage(item) {
  if (item == null) return ''
  if (typeof item === 'string') return item
  return item.message || item.code || String(item)
}

function validationModeLabel(mode) {
  if (mode === 'static') return '静态'
  if (mode === 'browser') return '浏览器'
  if (mode === 'legacy_snapshot') return '历史快照'
  return mode || '校验'
}

export function buildCandidateTimeline(candidate) {
  if (!candidate) return []
  const events = [{
    key: `${candidate.id}-submitted`,
    at: candidate.created_at,
    title: '提交修订',
    detail: `${displayPersonName(candidate.submitter_name, candidate.submitter_username, '提交人')} · 基于 v${candidate.base_version_number}`,
    tone: 'info'
  }]

  for (const item of candidate.validations || []) {
    const errors = (item.errors || []).map(formatValidationMessage).filter(Boolean)
    const warnings = (item.warnings || []).map(formatValidationMessage).filter(Boolean)
    const parts = [
      `${validationModeLabel(item.mode)} · ${item.source === 'client' ? '客户端' : item.source === 'server' ? '服务端' : (item.source || '记录')}`,
      item.status === 'passed' ? '通过' : '失败'
    ]
    if (errors.length) parts.push(errors.slice(0, 3).join('；'))
    else if (warnings.length) parts.push(warnings.slice(0, 3).join('；'))
    events.push({
      key: item.id || `${candidate.id}-val-${item.attempt_no}`,
      at: item.created_at,
      title: `校验 ${item.attempt_no}`,
      detail: parts.join(' · '),
      tone: item.status === 'passed' ? 'success' : 'danger'
    })
  }

  if (candidate.decision) {
    const reviewer = displayPersonName(candidate.decision.reviewer_name, candidate.decision.reviewer_username, '审核人')
    const adopted = candidate.decision.result === 'adopted'
    events.push({
      key: candidate.decision.id || `${candidate.id}-decision`,
      at: candidate.decision.created_at,
      title: adopted ? '采用' : '退回',
      detail: [reviewer, candidate.decision.comment].filter(Boolean).join(' · '),
      tone: adopted ? 'success' : 'danger'
    })
  } else if (candidate.status === 'stale') {
    events.push({
      key: `${candidate.id}-stale`,
      at: candidate.updated_at,
      title: '已过期',
      detail: '正式版本已变化，该修订不能再采用',
      tone: 'warning'
    })
  }

  return events.sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')))
}
