<template>
  <el-alert
    v-if="visible && current"
    class="platform-announcement-banner"
    type="info"
    show-icon
    :closable="true"
    @close="visible = false"
  >
    <template #title>
      <div class="banner-title">
        <span>{{ current.title }}</span>
        <el-tag size="small" effect="plain">{{ current.version || typeLabel(current.type) }}</el-tag>
      </div>
    </template>
    <div class="banner-content">
      <span>{{ current.summary || '平台有新的更新公告，点击查看详情。' }}</span>
      <el-button type="primary" link @click="openDetail">查看更新</el-button>
    </div>
  </el-alert>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAnnouncementStore } from '../stores/announcements'

const store = useAnnouncementStore()
const visible = ref(true)
const current = computed(() => store.unread.find(item => item.auto_popup) || null)

function typeLabel(type) {
  return ({ feature: '功能更新', maintenance: '维护通知', notice: '平台通知' }[type] || '平台公告')
}

function openDetail() {
  if (current.value) store.requestOpen(current.value.id)
}

onMounted(() => { store.load().catch(() => {}) })
</script>

<style scoped>
.platform-announcement-banner { margin-bottom: 16px; }
.banner-title { display: flex; align-items: center; gap: 8px; font-weight: 650; }
.banner-content { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
@media (max-width: 640px) { .banner-content { align-items: flex-start; flex-direction: column; gap: 4px; } }
</style>
