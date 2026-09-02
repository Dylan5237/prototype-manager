<template>
  <aside class="project-context" aria-label="项目上下文">
    <div class="context-tabs" role="tablist" aria-label="项目上下文视图">
      <button
        type="button"
        class="context-tab"
        :class="{ active: mode === 'attention' }"
        role="tab"
        :aria-selected="mode === 'attention'"
        @click="mode = 'attention'"
      >
        待处理 <span v-if="pendingChanges.length" class="tab-count">{{ pendingChanges.length }}</span>
      </button>
      <button
        type="button"
        class="context-tab"
        :class="{ active: mode === 'activity' }"
        role="tab"
        :aria-selected="mode === 'activity'"
        @click="mode = 'activity'"
      >最近活动</button>
    </div>

    <template v-if="mode === 'attention'">
      <div class="attention-card">
        <div>
          <strong>需要你的决定</strong>
          <span>正式版本不会被候选自动覆盖</span>
        </div>
        <span class="attention-count">{{ pendingChanges.length }}</span>
      </div>

      <section class="context-section">
        <div class="context-section-head">
          <strong>待确认候选</strong>
          <button type="button" @click="$emit('open-changes')">查看全部</button>
        </div>
        <article v-for="change in pendingChanges.slice(0, 3)" :key="change.id" class="candidate-card">
          <div class="candidate-head">
            <div class="candidate-title">{{ change.title }}</div>
            <span class="candidate-status">待确认</span>
          </div>
          <div class="candidate-meta">
            {{ change.creator_name || change.creator_username || '协作者' }} · 基于 v{{ change.base_version_number }} · 预览状态{{ change.preview_path ? '可用' : '待整理' }}
          </div>
          <div class="candidate-actions">
            <button type="button" class="context-button" @click="$emit('open-change', change)">查看效果</button>
            <button type="button" class="context-button context-button--primary" @click="$emit('open-change', change)">采用</button>
          </div>
        </article>
        <p v-if="!pendingChanges.length" class="context-empty">暂无待确认候选</p>
      </section>

      <section class="context-section">
        <div class="context-section-head">
          <strong>项目状态</strong>
          <button type="button" @click="$emit('open-snapshots')">查看快照</button>
        </div>
        <div class="summary-row"><span>绑定原型</span><strong>{{ project.prototype_count ?? project.prototypes?.length ?? 0 }} 个</strong></div>
        <div class="summary-row"><span>活跃签出</span><strong>{{ checkoutCount }} 个</strong></div>
        <div class="summary-row"><span>当前工作区</span><strong>{{ activePathLabel || '未选择' }}</strong></div>
      </section>
    </template>

    <template v-else>
      <section class="context-section context-section--first">
        <div class="context-section-head">
          <strong>最近活动</strong>
          <span class="context-muted">项目数据</span>
        </div>
        <div v-if="activityItems.length" class="activity-list">
          <div v-for="item in activityItems" :key="item.key" class="activity-item">
            <i class="activity-dot" :class="item.tone"></i>
            <div class="activity-copy"><strong>{{ item.title }}</strong><span>{{ item.detail }}</span></div>
          </div>
        </div>
        <p v-else class="context-empty">暂无可展示的活动记录</p>
      </section>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  project: { type: Object, default: () => ({}) },
  changes: { type: Array, default: () => [] },
  activePathLabel: { type: String, default: '' },
  currentBinding: { type: Object, default: null }
})

defineEmits(['open-changes', 'open-change', 'open-snapshots'])

const mode = ref('attention')
const pendingChanges = computed(() => props.changes.filter(change => change.status === 'ready'))
const checkoutCount = computed(() => (props.project.prototypes || []).filter(item => item.checkout).length)
const activityItems = computed(() => {
  const items = props.changes.slice(0, 4).map(change => ({
    key: `change-${change.id}`,
    title: change.title || '项目任务更新',
    detail: `${change.creator_name || change.creator_username || '协作者'} · ${changeStatusLabel(change.status)}`,
    tone: change.status === 'ready' ? 'orange' : change.status === 'adopted' ? 'green' : ''
  }))
  if (props.currentBinding?.prototype_name) {
    items.unshift({
      key: 'current-binding',
      title: '当前工作区已加载',
      detail: `${props.currentBinding.prototype_name} · v${props.currentBinding.version_label || props.currentBinding.version_number}`,
      tone: 'green'
    })
  }
  return items.slice(0, 5)
})

function changeStatusLabel(status) {
  const labels = { editing: '进行中', preview_pending: '交付状态整理中', ready: '待确认', adopted: '已采用', rejected: '已退回', stale: '已过期', invalid: '预览失败' }
  return labels[status] || status || '状态未知'
}
</script>

<style scoped>
.project-context { min-width: 0; overflow: auto; border-left: 1px solid #e7ebf2; padding: 20px 17px; background: #fff; }
.context-tabs { display: flex; align-items: center; gap: 14px; border-bottom: 1px solid #e7ebf2; margin-bottom: 16px; }
.context-tab { position: relative; padding: 0 0 10px; border: 0; color: #72809a; background: transparent; cursor: pointer; font-size: 12px; }
.context-tab.active { color: #1a2438; font-weight: 750; }
.context-tab.active::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: #3c6ff2; content: ''; }
.tab-count { color: #c47a16; }
.attention-card { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid #f5dfb8; border-radius: 10px; padding: 12px; background: #fff8ea; }
.attention-card strong, .attention-card span { display: block; }
.attention-card strong { color: #8f5d1a; font-size: 12px; }
.attention-card span { margin-top: 3px; color: #bd8a47; font-size: 10px; }
.attention-card .attention-count { min-width: 29px; border-radius: 99px; padding: 5px 7px; color: #fff; background: #d7902e; font-size: 12px; text-align: center; }
.context-section { margin-top: 19px; }
.context-section--first { margin-top: 0; }
.context-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.context-section-head strong { color: #1a2438; font-size: 12px; }
.context-section-head button { border: 0; color: #3c6ff2; background: transparent; cursor: pointer; font-size: 10px; }
.context-muted { color: #9ba7bb; font-size: 10px; }
.candidate-card { border-bottom: 1px solid #e7ebf2; padding: 10px 0 12px; }
.candidate-card:last-child { border-bottom: 0; }
.candidate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; }
.candidate-title { overflow: hidden; color: #34415b; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.candidate-status { border-radius: 99px; padding: 3px 6px; color: #c47a16; background: #fff6e5; font-size: 9px; white-space: nowrap; }
.candidate-meta { margin-top: 4px; color: #9ba7bb; font-size: 10px; line-height: 1.5; }
.candidate-actions { display: flex; gap: 6px; margin-top: 9px; }
.context-button { min-height: 26px; border: 1px solid #d7deeb; border-radius: 6px; padding: 0 8px; color: #5e6c85; background: #fff; cursor: pointer; font-size: 10px; }
.context-button--primary { border-color: #3c6ff2; color: #fff; background: #3c6ff2; }
.summary-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e7ebf2; padding: 8px 0; color: #72809a; font-size: 10px; }
.summary-row:last-child { border-bottom: 0; }
.summary-row strong { max-width: 175px; overflow: hidden; color: #1a2438; font-weight: 650; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.context-empty { color: #9ba7bb; font-size: 11px; }
.activity-list { display: grid; gap: 14px; }
.activity-item { display: grid; grid-template-columns: 9px minmax(0, 1fr); gap: 8px; }
.activity-dot { width: 7px; height: 7px; margin-top: 4px; border-radius: 50%; background: #b7c3d9; }
.activity-dot.green { background: #11966c; box-shadow: 0 0 0 4px #eaf8f2; }
.activity-dot.orange { background: #c47a16; box-shadow: 0 0 0 4px #fff6e5; }
.activity-copy strong, .activity-copy span { display: block; }
.activity-copy strong { color: #34415b; font-size: 11px; }
.activity-copy span { margin-top: 3px; color: #9ba7bb; font-size: 10px; line-height: 1.55; }
@media (max-width: 1040px) { .project-context { display: none; } }
</style>
