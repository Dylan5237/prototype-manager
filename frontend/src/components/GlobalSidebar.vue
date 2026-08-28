<template>
  <aside class="global-sidebar" :aria-label="title">
    <div class="sidebar-header">
      <el-icon :size="20"><component :is="icon" /></el-icon>
      <span class="sidebar-title">{{ title }}</span>
    </div>

    <el-menu
      :default-active="currentMenu"
      router
      class="sidebar-menu"
      background-color="transparent"
      text-color="#4a5568"
      active-text-color="#1a202c"
      :aria-label="`${title}导航`"
    >
      <template v-for="section in sections" :key="section.label || section.items[0]?.index">
        <div v-if="section.label" class="menu-section-label">{{ section.label }}</div>
        <el-menu-item v-for="item in section.items" :key="item.index" :index="item.index">
          <el-icon><component :is="item.icon" /></el-icon>
          <span class="menu-text">{{ item.label }}</span>
        </el-menu-item>
      </template>
    </el-menu>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  icon: {
    type: [Object, Function],
    required: true
  },
  sections: {
    type: Array,
    default: () => []
  },
  activeMenu: {
    type: String,
    default: ''
  }
})

const route = useRoute()
const currentMenu = computed(() => props.activeMenu || route.fullPath)
</script>

<style scoped>
.global-sidebar {
  width: 208px;
  background: rgba(255, 255, 255, 0.76);
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
  height: 62px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
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

.sidebar-menu {
  border-right: none !important;
  padding: 0 0 16px;
  flex: 1;
  min-height: 0;
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

@media (max-width: 768px) {
  .global-sidebar {
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
    overflow-x: auto;
  }

  .menu-section-label {
    display: none;
  }

  .sidebar-menu .el-menu-item {
    margin: 4px;
  }
}
</style>
