<template>
  <section class="revision-review" v-loading="loading">
    <header class="review-hero">
      <div>
        <h2>{{ reviewTitle }}</h2>
        <p>对照两侧内容，决定是否将右侧修订采用为正式版。</p>
      </div>
      <div class="review-meta">
        <span>状态 <el-tag :type="statusMeta.type" size="small" effect="light">{{ statusMeta.label }}</el-tag></span>
        <span>负责人 {{ ownerName }}</span>
        <span>基线 {{ baselineLabel }}</span>
      </div>
    </header>

    <div v-if="pendingRevision || officialPreviewUrl" class="compare-stage">
      <article class="compare-panel official-panel">
        <div class="panel-heading">
          <strong>{{ baselineLabel }}</strong>
          <el-tag type="info" size="small" effect="plain">线上</el-tag>
        </div>
        <div class="panel-preview">
          <iframe
            v-if="officialPreviewUrl"
            :key="officialPreviewUrl"
            :src="officialPreviewUrl"
            class="panel-frame"
            frameborder="0"
            title="正式版预览"
          />
          <el-empty v-else description="当前没有可预览的正式版" :image-size="64" />
        </div>
      </article>

      <div class="compare-divider" aria-hidden="true">
        <span>对比</span>
      </div>

      <article class="compare-panel pending-panel">
        <div class="panel-heading">
          <strong>待审修订</strong>
          <el-tag v-if="pendingRevision" type="warning" size="small" effect="light">待你确认</el-tag>
        </div>
        <p v-if="pendingRevision" class="revision-note">修订说明：{{ pendingNote || '暂无修订说明' }}</p>
        <div class="panel-preview">
          <iframe
            v-if="pendingPreviewUrl"
            :key="pendingPreviewUrl"
            :src="pendingPreviewUrl"
            class="panel-frame"
            frameborder="0"
            title="待审修订预览"
          />
          <el-empty v-else-if="pendingRevision" description="这次修订还没有可预览的入口" :image-size="64" />
          <el-empty v-else description="当前没有待审修订" :image-size="64" />
        </div>
      </article>
    </div>
    <el-empty v-else-if="!loading" description="该任务还没有可审核的修订" :image-size="72" />

    <div v-if="canReviewPending" class="review-actions">
      <el-button size="large" @click="emit('return', pendingRevision)">退回</el-button>
      <el-button type="primary" size="large" :loading="reviewing" @click="emit('adopt', pendingRevision)">采用为正式版</el-button>
    </div>

    <details class="history-details">
      <summary class="history-summary">
        <div class="history-title">
          <strong>历史尝试 ({{ historyAttempts.length }})</strong>
          <span>校验失败 / 已退回 / 被替代的旧提议</span>
        </div>
      </summary>
      <ul v-if="historyAttempts.length" class="history-list">
        <li v-for="attempt in historyAttempts" :key="attempt.id" class="history-item">
          <div class="history-item-main">
            <strong>{{ historyAttemptStatusMeta(attempt.status).label }}</strong>
            <small>
              {{ displayPersonName(attempt.submitter_name, attempt.submitter_username, '提交人') }}
              · {{ formatDateTime(attempt.created_at) }}
            </small>
            <p v-if="revisionNote(attempt, task)">{{ revisionNote(attempt, task) }}</p>
          </div>
          <el-tag :type="historyAttemptStatusMeta(attempt.status).type" size="small" effect="light">
            {{ historyAttemptStatusMeta(attempt.status).label }}
          </el-tag>
        </li>
      </ul>
      <el-empty v-else description="暂无历史尝试" :image-size="56" />
    </details>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import { canReviewProjectCandidate } from '../../utils/project-permissions'
import {
  displayPersonName,
  formatDateTime,
  historyAttemptStatusMeta,
  officialVersionLabel,
  partitionReviewSubmissions,
  revisionNote,
  reviewStatusMeta
} from '../../utils/candidate-review'

const props = defineProps({
  candidates: { type: Array, default: () => [] },
  selectedCandidate: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  reviewing: { type: Boolean, default: false },
  role: { type: String, default: '' },
  task: { type: Object, default: null },
  moduleLabel: { type: String, default: '' },
  ownerName: { type: String, default: '未接受' },
  officialPreviewUrl: { type: String, default: '' },
  officialBinding: { type: Object, default: null },
  previewToken: { type: String, default: '' }
})

const emit = defineEmits(['select', 'preview', 'adopt', 'return'])

const partitioned = computed(() => partitionReviewSubmissions(props.candidates))
const pendingRevision = computed(() => partitioned.value.pendingRevision)
const historyAttempts = computed(() => partitioned.value.historyAttempts)
const baselineLabel = computed(() => officialVersionLabel(props.officialBinding, props.task))
const statusMeta = computed(() => reviewStatusMeta(props.task, pendingRevision.value))
const pendingNote = computed(() => revisionNote(pendingRevision.value, props.task))
const reviewTitle = computed(() => {
  const moduleName = props.moduleLabel || props.task?.node_label || props.task?.title || '任务'
  return `${moduleName} · 待审修订`
})
const canReviewPending = computed(() => canReviewProjectCandidate({ role: props.role, candidate: pendingRevision.value }))
const pendingPreviewUrl = computed(() => {
  if (!pendingRevision.value?.preview_path) return ''
  const token = props.previewToken || ''
  const joiner = pendingRevision.value.preview_path.includes('?') ? '&' : '?'
  return `${pendingRevision.value.preview_path}${joiner}token=${encodeURIComponent(token)}`
})

watch(pendingRevision, (next) => {
  if (next?.id !== props.selectedCandidate?.id) emit('select', next)
}, { immediate: true })
</script>

<style scoped>
.revision-review { display: flex; flex-direction: column; gap: 16px; }
.review-hero h2 { margin: 0; color: #172033; font-size: 20px; line-height: 1.3; }
.review-hero p { margin: 6px 0 0; color: #718096; font-size: 13px; line-height: 1.6; }
.review-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 12px;
  color: #5b6b82;
  font-size: 12px;
}
.review-meta .el-tag { margin-left: 6px; }
.compare-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: stretch;
  gap: 10px;
}
.compare-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.pending-panel { border-color: #f3d2a4; box-shadow: 0 0 0 1px #fff7ed; }
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 10px;
}
.panel-heading strong { color: #25344a; font-size: 14px; }
.revision-note {
  margin: 0;
  padding: 0 14px 10px;
  color: #9a6509;
  font-size: 13px;
  line-height: 1.6;
}
.panel-preview {
  min-height: 320px;
  flex: 1;
  border-top: 1px solid #eef2f7;
  background: #f8fafc;
}
.panel-frame { display: block; width: 100%; height: 42vh; min-height: 320px; background: #fff; }
.compare-divider {
  display: flex;
  align-items: center;
  justify-content: center;
}
.compare-divider span {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7e3f7;
  border-radius: 50%;
  background: #fff;
  color: #3b6fd4;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 6px 16px rgb(37 99 235 / 10%);
}
.review-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.history-details {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 4px 14px 4px;
}
.history-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  list-style: none;
  cursor: pointer;
}
.history-summary::-webkit-details-marker { display: none; }
.history-summary::after {
  content: '';
  width: 8px;
  height: 8px;
  flex: none;
  border-right: 1.5px solid #8794a8;
  border-bottom: 1.5px solid #8794a8;
  transform: rotate(45deg);
}
.history-details[open] .history-summary::after { transform: rotate(-135deg); margin-top: 6px; }
.history-title { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.history-title strong { color: #25344a; font-size: 13px; }
.history-title span { color: #8794a8; font-size: 11px; font-weight: 400; }
.history-list { margin: 0; padding: 0; list-style: none; }
.history-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #eef2f7;
}
.history-item:first-child { border-top: 0; padding-top: 0; }
.history-item-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.history-item-main strong { color: #334155; font-size: 13px; }
.history-item-main small { margin-top: 4px; color: #8794a8; font-size: 11px; }
.history-item-main p { margin: 6px 0 0; color: #5b6b82; font-size: 12px; line-height: 1.6; }
@media (max-width: 900px) {
  .compare-stage { grid-template-columns: 1fr; }
  .compare-divider { padding: 2px 0; }
  .panel-frame { height: 36vh; }
}
</style>
