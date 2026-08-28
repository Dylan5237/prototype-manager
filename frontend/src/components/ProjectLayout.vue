<template>
  <div class="project-layout">
    <GlobalSidebar
      title="项目管理"
      :icon="FolderOpened"
      :sections="sections"
      active-menu="/projects"
    />
    <main class="project-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { FolderOpened, List } from '@element-plus/icons-vue'
import GlobalSidebar from './GlobalSidebar.vue'

const sections = [
  {
    items: [
      { index: '/projects', label: '项目列表', icon: List }
    ]
  }
]
</script>

<style scoped>
.project-layout {
  display: flex;
  min-height: calc(100vh - 56px);
}

.project-content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .project-layout {
    flex-direction: column;
  }
}
</style>
