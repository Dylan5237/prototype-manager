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
        <div class="menu-section-label">数据分析</div>
        <el-menu-item index="/admin/usage">
          <el-icon><DataAnalysis /></el-icon>
          <span class="menu-text">使用总览</span>
        </el-menu-item>
        <div class="menu-section-label">用户与组织</div>
        <el-menu-item index="/admin/users" class="section-menu-item">
          <el-icon><User /></el-icon>
          <span class="menu-text">用户列表</span>
        </el-menu-item>
        <el-menu-item index="/admin/groups" class="section-menu-item">
          <el-icon><UserFilled /></el-icon>
          <span class="menu-text">用户组管理</span>
        </el-menu-item>
        <div class="menu-section-label">原型配置</div>
        <el-menu-item index="/admin/distribution">
          <el-icon><Promotion /></el-icon>
          <span class="menu-text">原型分发</span>
        </el-menu-item>
        <el-menu-item index="/admin/categories">
          <el-icon><Collection /></el-icon>
          <span class="menu-text">类别管理</span>
        </el-menu-item>
        <el-menu-item index="/admin/announcements">
          <el-icon><Bell /></el-icon>
          <span class="menu-text">平台更新公告</span>
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
import { Setting, User, UserFilled, Promotion, Collection, Bell, DataAnalysis } from '@element-plus/icons-vue'

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
  width: 208px;
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  height: 62px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
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
  padding: 0 0 16px;
  flex: 1;
}

.sidebar-menu .el-menu-item {
  margin: 3px 10px;
  border-radius: 8px;
  height: 40px;
  line-height: 40px;
  font-size: 14px;
  padding-left: 12px !important;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.sidebar-menu .el-menu-item:hover {
  background: #eef2f7 !important;
}

.sidebar-menu .el-menu-item.is-active {
  color: #1e293b !important;
  background: #e7edf5 !important;
  font-weight: 700;
}

.menu-text {
  margin-left: 4px;
}

.menu-section-label {
  padding: 14px 21px 5px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.sidebar-menu .section-menu-item {
  padding-left: 28px !important;
}

/* ========================================
   右侧内容区
   ======================================== */
.admin-content {
  flex: 1;
  padding: 26px 30px 54px;
  min-width: 0;
}

.admin-content .content-wrapper {
  max-width: 1370px;
  margin: 0 auto;
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
    overflow-x: auto;
  }

  .menu-section-label {
    display: none;
  }

  .sidebar-menu .section-menu-item {
    padding-left: 12px !important;
  }

  .sidebar-menu .el-menu-item {
    margin: 4px;
  }

  .admin-content {
    padding: 16px;
  }
}
</style>
