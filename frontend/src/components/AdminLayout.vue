<template>
  <div class="admin-layout">
    <GlobalSidebar title="系统管理" :icon="Setting" :sections="sections" />
    <main class="admin-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import GlobalSidebar from './GlobalSidebar.vue'
import { Setting, User, UserFilled, Promotion, Collection, Bell, DataAnalysis, MagicStick, Document } from '@element-plus/icons-vue'

const sections = [
  {
    label: '数据分析',
    items: [{ index: '/admin/usage', label: '使用总览', icon: DataAnalysis }]
  },
  {
    label: '用户与组织',
    items: [
      { index: '/admin/users', label: '用户列表', icon: User },
      { index: '/admin/groups', label: '用户组管理', icon: UserFilled }
    ]
  },
  {
    label: '原型配置',
    items: [
      { index: '/admin/distribution', label: '原型分发', icon: Promotion },
      { index: '/admin/categories', label: '类别管理', icon: Collection },
      { index: '/admin/announcements', label: '平台更新公告', icon: Bell }
    ]
  },
  {
    label: 'AI 配置',
    items: [{ index: '/admin/prompt-templates', label: '提示词模板', icon: MagicStick }]
  },
  {
    label: '帮助中心',
    items: [{ index: '/admin/help', label: '使用手册', icon: Document }]
  }
]
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: calc(100vh - 56px);
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

  .admin-content {
    padding: 16px;
  }
}
</style>
