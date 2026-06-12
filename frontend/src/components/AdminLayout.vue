<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <el-icon :size="20"><Setting /></el-icon>
        <span class="sidebar-title">系统管理</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="sidebar-menu"
        background-color="transparent"
        text-color="#4a5568"
        active-text-color="#1a202c"
      >
        <el-menu-item index="/admin/users">
          <el-icon><User /></el-icon>
          <span class="menu-text">用户管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/distribution">
          <el-icon><Promotion /></el-icon>
          <span class="menu-text">原型分发</span>
        </el-menu-item>
        <el-menu-item index="/admin/categories">
          <el-icon><Collection /></el-icon>
          <span class="menu-text">类别管理</span>
        </el-menu-item>
      </el-menu>
    </aside>
    <main class="admin-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Setting, User, Promotion, Collection } from '@element-plus/icons-vue'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: calc(100vh - 56px);
}

/* ========================================
   侧边栏 - 简约风格
   ======================================== */
.admin-sidebar {
  width: 200px;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
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
.admin-content {
  flex: 1;
  padding: 24px 28px;
  min-width: 0;
}

.admin-content .content-wrapper {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* ========================================
   响应式
   ======================================== */
@media (max-width: 768px) {
  .admin-layout {
    flex-direction: column;
  }

  .admin-sidebar {
    width: 100%;
    flex-direction: row;
    align-items: center;
    border-right: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
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

  .admin-content {
    padding: 16px;
  }
}
</style>
