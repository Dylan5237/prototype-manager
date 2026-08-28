<template>
  <div class="prototype-layout">
    <aside class="prototype-sidebar">
      <div class="sidebar-header">
        <el-icon :size="20"><Files /></el-icon>
        <span class="sidebar-title">原型管理</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
        background-color="transparent"
        text-color="#4a5568"
        active-text-color="#1a202c"
      >
        <el-menu-item index="/" @click.prevent="navigateTo('all')">
          <el-icon><Document /></el-icon>
          <span class="menu-text">全部原型</span>
        </el-menu-item>
        <el-menu-item index="/?tab=mine" @click.prevent="navigateTo('mine')">
          <el-icon><User /></el-icon>
          <span class="menu-text">我的原型</span>
        </el-menu-item>
        <el-menu-item index="/?tab=shared" @click.prevent="navigateTo('shared')">
          <el-icon><Share /></el-icon>
          <span class="menu-text">分享给我</span>
        </el-menu-item>
        <el-menu-item v-if="authStore.isAdmin" index="/recycle-bin">
          <el-icon><Delete /></el-icon>
          <span class="menu-text">回收站</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="prototype-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Files, Document, User, Share, Delete } from '@element-plus/icons-vue'

import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => {
  if (route.path === '/recycle-bin') return '/recycle-bin'
  const tab = route.query.tab
  if (tab === 'mine') return '/?tab=mine'
  if (tab === 'shared') return '/?tab=shared'
  return '/'
})

function navigateTo(tab) {
  if (tab === 'all') {
    router.push('/')
  } else {
    router.push(`/?tab=${tab}`)
  }
}
</script>

<style scoped>
.prototype-layout {
  display: flex;
  min-height: calc(100vh - 56px);
}

/* ========================================
   侧边栏 - 简约风格
   ======================================== */
.prototype-sidebar {
  width: 200px;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: sticky;
  top: 56px;
  height: calc(100vh - 56px);
  max-height: calc(100vh - 56px);
  overflow-x: hidden;
  overflow-y: auto;
  align-self: flex-start;
  z-index: 10;
}

.sidebar-header {
  padding: 20px 18px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.sidebar-header .el-icon {
  color: #4a5568;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a202c;
  letter-spacing: 0.5px;
}

/* 侧边栏菜单 */
.sidebar-menu {
  border-right: none !important;
  padding: 8px 0;
  flex: 1;
  min-height: 0;
}

.sidebar-menu .el-menu-item {
  margin: 4px 10px;
  border-radius: 8px;
  height: 42px;
  line-height: 42px;
  font-size: 14px;
  transition: all 0.2s ease;
}

.sidebar-menu .el-menu-item:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

.sidebar-menu .el-menu-item.is-active {
  background: rgba(0, 0, 0, 0.06) !important;
  font-weight: 600;
}

.menu-text {
  margin-left: 4px;
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

  .prototype-sidebar {
    width: 100%;
    flex-direction: row;
    align-items: center;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    position: static;
    height: auto;
    max-height: none;
    overflow: visible;
    align-self: auto;
    z-index: auto;
  }

  .sidebar-header {
    border-bottom: none;
    border-right: 1px solid rgba(0, 0, 0, 0.06);
    padding: 12px 14px;
  }

  .sidebar-menu {
    display: flex;
    padding: 0 6px;
  }

  .sidebar-menu .el-menu-item {
    margin: 4px;
  }

  .prototype-content {
    padding: 16px;
  }
}
</style>
