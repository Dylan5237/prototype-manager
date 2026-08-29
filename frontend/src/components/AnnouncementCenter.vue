<template>
  <div class="announcement-center">
    <el-badge :value="store.unreadCount" :hidden="store.unreadCount === 0" :max="99" class="announcement-badge">
      <el-button text class="announcement-trigger" title="平台更新公告" aria-label="打开平台更新公告" @click="openCenter">
        <el-icon :size="19"><Bell /></el-icon>
      </el-button>
    </el-badge>

    <el-drawer v-model="centerVisible" title="平台更新公告" size="420px" append-to-body>
      <template #header>
        <div class="drawer-header"><div><strong>平台更新公告</strong><span>{{ store.unreadCount }} 条未读</span></div></div>
      </template>
      <el-tabs v-model="filter" @tab-change="loadFiltered">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="未读" name="unread" />
        <el-tab-pane label="已读" name="read" />
      </el-tabs>
      <div v-loading="store.loading" class="announcement-list">
        <button
          v-for="item in visibleAnnouncements"
          :key="item.id"
          :class="['announcement-item', { unread: !item.is_read }]"
          type="button"
          @click="openDetail(item)"
        >
          <span class="type-icon">{{ typeLabel(item.type) }}</span>
          <span class="announcement-copy">
            <strong>{{ item.title }}</strong>
            <span>{{ item.summary || '平台更新公告' }}</span>
            <small>{{ formatDate(item.published_at || item.updated_at) }}<template v-if="item.is_read"> · 已读</template></small>
          </span>
          <el-tag size="small" effect="plain" :type="item.type === 'maintenance' ? 'warning' : 'primary'">{{ typeLabel(item.type, true) }}</el-tag>
        </button>
        <el-empty v-if="!store.loading && visibleAnnouncements.length === 0" description="当前没有公告" />
      </div>
    </el-drawer>

    <el-dialog v-model="detailVisible" :title="selected?.title || '平台更新公告'" width="720px" append-to-body>
      <div v-if="selected" class="announcement-detail">
        <div class="detail-meta"><el-tag type="primary" effect="plain">{{ selected.version || typeLabel(selected.type, true) }}</el-tag><span>{{ formatDate(selected.published_at || selected.updated_at) }}</span><span>平台公告</span></div>
        <p class="detail-lead">{{ selected.summary }}</p>
        <div class="detail-body" v-html="selected.body_html || selected.body"></div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">稍后阅读</el-button>
        <el-button v-if="!selected?.is_read" type="primary" :loading="marking" @click="handleMarkRead">我知道了</el-button>
        <el-button v-else type="primary" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { Bell } from '@element-plus/icons-vue'
import { useAnnouncementStore } from '../stores/announcements'
import { useAuthStore } from '../stores/auth'

const store = useAnnouncementStore()
const authStore = useAuthStore()
const centerVisible = ref(false)
const detailVisible = ref(false)
const selected = ref(null)
const marking = ref(false)
const filter = ref('all')

const visibleAnnouncements = computed(() => {
  if (filter.value === 'unread') return store.announcements.filter(item => !item.is_read)
  if (filter.value === 'read') return store.announcements.filter(item => item.is_read)
  return store.announcements
})

watch(() => store.openAnnouncementId, async id => {
  if (!id) return
  if (!store.loaded) await store.load()
  const item = store.announcements.find(row => row.id === id)
  if (item) openDetail(item)
  store.clearOpenRequest()
})

watch(() => authStore.user?.id, (id, previousId) => {
  if (id === previousId) return
  store.reset()
  if (id) store.load().catch(() => {})
})

function typeLabel(type, long = false) {
  if (long) return ({ feature: '功能更新', maintenance: '维护通知', notice: '平台通知' }[type] || '平台通知')
  return ({ feature: '新', maintenance: '维', notice: '告' }[type] || '告')
}

function formatDate(value) {
  if (!value) return '未发布'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

async function openCenter() {
  centerVisible.value = true
  try { await store.load() } catch (error) { ElMessage.error('加载更新公告失败') }
}

async function loadFiltered() {
  // 列表已在一次请求中载入，切换只改变用户侧筛选，不触发额外写入。
  if (!store.loaded) await openCenter()
}

function openDetail(item) {
  selected.value = item
  detailVisible.value = true
}

async function handleMarkRead() {
  marking.value = true
  try {
    await store.markRead(selected.value)
    detailVisible.value = false
    ElMessage.success('已标记为已读')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '标记已读失败')
  } finally {
    marking.value = false
  }
}

onMounted(() => { store.load().catch(() => {}) })
</script>

<style scoped>
.announcement-center { display: flex; align-items: center; }
.announcement-badge :deep(.el-badge__content) { top: 4px; right: 4px; border: 2px solid #fff; }
.announcement-trigger { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #526075; transition: color .2s ease, background-color .2s ease; }
.announcement-trigger:hover { background: rgba(15, 23, 42, .05); color: #1e293b; }
.announcement-trigger:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.drawer-header { display: flex; flex-direction: column; gap: 4px; }
.drawer-header strong { display: block; font-size: 18px; }
.drawer-header span { display: block; color: #64748b; font-size: 12px; font-weight: 400; }
.announcement-list { min-height: 180px; }
.announcement-item { position: relative; width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 10px; padding: 14px 4px; border: 0; border-bottom: 1px solid #edf2f7; background: #fff; text-align: left; }
.announcement-item:hover { background: #f8fbff; }
.announcement-item.unread::before { content: ''; position: absolute; left: -7px; top: 24px; width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; }
.type-icon { width: 32px; height: 32px; display: grid; place-items: center; color: #1d4ed8; border-radius: 8px; background: #eff6ff; font-weight: 700; }
.announcement-copy { min-width: 0; }
.announcement-copy strong, .announcement-copy span, .announcement-copy small { display: block; }
.announcement-copy span { margin-top: 3px; overflow: hidden; color: #64748b; text-overflow: ellipsis; white-space: nowrap; }
.announcement-copy small { margin-top: 4px; color: #94a3b8; font-size: 12px; }
.announcement-detail { color: #334155; }
.detail-meta { display: flex; align-items: center; gap: 10px; color: #64748b; font-size: 12px; }
.detail-lead { margin: 17px 0 14px; padding: 13px 14px; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; background: #f8fafc; }
.detail-body { min-height: 160px; color: #475569; line-height: 1.8; }
.detail-body :deep(h1), .detail-body :deep(h2), .detail-body :deep(h3) { margin: 18px 0 8px; color: #1e293b; line-height: 1.35; }
.detail-body :deep(h1) { font-size: 22px; }
.detail-body :deep(h2) { font-size: 18px; }
.detail-body :deep(h3) { font-size: 16px; }
.detail-body :deep(p) { margin: 8px 0; }
.detail-body :deep(ul), .detail-body :deep(ol) { margin: 8px 0; padding-left: 24px; }
.detail-body :deep(blockquote) { margin: 12px 0; padding: 8px 12px; border-left: 3px solid #93c5fd; background: #f8fafc; color: #64748b; }
.detail-body :deep(code) { padding: 2px 5px; border-radius: 4px; background: #f1f5f9; font-size: .92em; }
.detail-body :deep(pre) { overflow: auto; margin: 12px 0; padding: 12px; border-radius: 8px; background: #0f172a; color: #e2e8f0; }
.detail-body :deep(pre code) { padding: 0; background: transparent; color: inherit; }
.detail-body :deep(a) { color: #2563eb; }
</style>
