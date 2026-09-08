<template>
  <section class="candidate-history" v-loading="loading">
    <div class="history-heading">
      <strong>候选历史</strong>
      <span>{{ candidates.length ? `共 ${candidates.length} 次提交` : '尚未提交候选' }}</span>
    </div>

    <div v-if="candidates.length" class="candidate-list">
      <button
        v-for="candidate in candidates"
        :key="candidate.id"
        type="button"
        :class="['candidate-row', { active: selectedCandidate?.id === candidate.id }]"
        @click="emit('select', candidate)"
      >
        <span class="candidate-row-main">
          <strong>#{{ candidate.submission_no }}</strong>
          <small>
            {{ displayPersonName(candidate.submitter_name, candidate.submitter_username, '提交人') }}
            · 基于 v{{ candidate.base_version_number }}
            · {{ formatDateTime(candidate.created_at) }}
          </small>
        </span>
        <el-tag :type="candidateStatusMeta(candidate.status).type" size="small" effect="light">
          {{ candidateStatusMeta(candidate.status).label }}
        </el-tag>
      </button>
    </div>
    <el-empty v-else-if="!loading" description="该任务还没有候选提交" :image-size="72" />

    <template v-if="selectedCandidate">
      <div class="history-actions">
        <el-button v-if="selectedCandidate.preview_path" text type="primary" size="small" @click="emit('preview', selectedCandidate)">预览该候选</el-button>
        <template v-if="canReviewProjectCandidate({ role, candidate: selectedCandidate })">
          <el-button type="danger" plain size="small" @click="emit('return', selectedCandidate)">退回</el-button>
          <el-button type="primary" size="small" :loading="reviewing" @click="emit('adopt', selectedCandidate)">采用候选</el-button>
        </template>
      </div>

      <div class="validation-block">
        <div class="history-heading">
          <strong>校验记录</strong>
          <span>按 attempt_no 追加，失败记录会保留</span>
        </div>
        <el-table :data="selectedCandidate.validations || []" size="small" empty-text="暂无校验记录">
          <el-table-column prop="attempt_no" label="#" width="48" />
          <el-table-column label="模式" width="88">
            <template #default="{ row }">{{ validationModeLabel(row.mode) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="72">
            <template #default="{ row }">
              <el-tag :type="row.status === 'passed' ? 'success' : 'danger'" size="small" effect="light">
                {{ row.status === 'passed' ? '通过' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="80">
            <template #default="{ row }">{{ row.source === 'client' ? '客户端' : row.source === 'server' ? '服务端' : (row.source || '—') }}</template>
          </el-table-column>
          <el-table-column label="时间" min-width="140">
            <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
          </el-table-column>
        </el-table>
        <ul v-if="selectedErrors.length" class="validation-errors">
          <li v-for="error in selectedErrors" :key="error">{{ error }}</li>
        </ul>
      </div>

      <div class="timeline-block">
        <div class="history-heading">
          <strong>审核时间线</strong>
          <span>提交、校验、退回/采用/过期</span>
        </div>
        <ol v-if="timeline.length" class="review-timeline">
          <li v-for="event in timeline" :key="event.key" :class="['timeline-item', `tone-${event.tone}`]">
            <span class="timeline-dot"></span>
            <div>
              <strong>{{ event.title }}</strong>
              <small>{{ formatDateTime(event.at) }}</small>
              <p>{{ event.detail }}</p>
            </div>
          </li>
        </ol>
        <el-empty v-else description="暂无审核事件" :image-size="56" />
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { canReviewProjectCandidate } from '../../utils/project-permissions'
import {
  buildCandidateTimeline,
  candidateStatusMeta,
  displayPersonName,
  formatDateTime,
  formatValidationMessage
} from '../../utils/candidate-review'

const props = defineProps({
  candidates: { type: Array, default: () => [] },
  selectedCandidate: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  reviewing: { type: Boolean, default: false },
  role: { type: String, default: '' }
})

const emit = defineEmits(['select', 'preview', 'adopt', 'return'])

const timeline = computed(() => buildCandidateTimeline(props.selectedCandidate))
const selectedErrors = computed(() => {
  const latestFailed = [...(props.selectedCandidate?.validations || [])].reverse().find(item => item.status === 'failed')
  return (latestFailed?.errors || []).map(formatValidationMessage).filter(Boolean)
})

function validationModeLabel(mode) {
  if (mode === 'static') return '静态'
  if (mode === 'browser') return '浏览器'
  if (mode === 'legacy_snapshot') return '历史快照'
  return mode || '—'
}
</script>

<style scoped>
.candidate-history { display: flex; flex-direction: column; gap: 14px; }
.history-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.history-heading strong { color: #25344a; font-size: 13px; }
.history-heading span { color: #8794a8; font-size: 11px; }
.candidate-list { display: flex; flex-direction: column; gap: 8px; }
.candidate-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}
.candidate-row:hover { border-color: #b9d0fb; }
.candidate-row.active { border-color: #6b9cf0; background: #f3f7ff; box-shadow: 0 0 0 2px #eaf2ff; }
.candidate-row-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.candidate-row-main strong { color: #334155; font-size: 13px; }
.candidate-row-main small { margin-top: 4px; color: #8794a8; font-size: 11px; }
.history-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.validation-errors { margin: 8px 0 0; padding-left: 18px; color: #c45656; font-size: 12px; line-height: 1.6; }
.review-timeline { margin: 0; padding: 0; list-style: none; }
.timeline-item { display: flex; gap: 10px; padding: 0 0 14px 2px; }
.timeline-item:last-child { padding-bottom: 0; }
.timeline-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #94a3b8;
  box-shadow: 0 0 0 4px #eef2f7;
}
.tone-success .timeline-dot { background: #22c55e; }
.tone-danger .timeline-dot { background: #ef4444; }
.tone-warning .timeline-dot { background: #f59e0b; }
.tone-info .timeline-dot { background: #3b82f6; }
.timeline-item strong { display: block; color: #27364f; font-size: 13px; }
.timeline-item small { color: #8794a8; font-size: 11px; }
.timeline-item p { margin: 4px 0 0; color: #5b6b82; font-size: 12px; line-height: 1.6; }
</style>
