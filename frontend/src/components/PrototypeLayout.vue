<template>
  <div class="prototype-layout">
    <GlobalSidebar
      title="原型管理"
      :icon="Files"
      :sections="sections"
      :active-menu="activeMenu"
    />
    <main class="prototype-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Files, Document, User, Share, Delete } from '@element-plus/icons-vue'
import GlobalSidebar from './GlobalSidebar.vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()

const activeMenu = computed(() => {
  if (route.path === '/recycle-bin') return '/recycle-bin'
  const tab = route.query.tab
  if (tab === 'mine') return '/?tab=mine'
  if (tab === 'shared') return '/?tab=shared'
  return '/'
})

const sections = computed(() => [{
  items: [
    { index: '/', label: '全部原型', icon: Document },
    { index: '/?tab=mine', label: '我的原型', icon: User },
    { index: '/?tab=shared', label: '分享给我', icon: Share },
    ...(authStore.isAdmin ? [{ index: '/recycle-bin', label: '回收站', icon: Delete }] : [])
  ]
}])
</script>

<style scoped>
.prototype-layout {
  display: flex;
  min-height: calc(100vh - 56px);
}

/* ========================================
   右侧内容区
   ======================================== */
.prototype-content {
  flex: 1;
  padding: 24px 28px;
  min-width: 0;
}

/* ========================================
   响应式
   ======================================== */
@media (max-width: 768px) {
  .prototype-layout {
    flex-direction: column;
  }

  .prototype-content {
    padding: 16px;
  }
}
</style>
