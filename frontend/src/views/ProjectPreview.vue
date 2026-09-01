<template>
  <div class="project-preview-fullscreen">
    <!-- 顶部项目信息栏 -->
    <div class="preview-header">
      <div class="header-left">
        <div class="project-brand">
          <img src="/favicon.svg" class="brand-logo" alt="logo" />
          <div class="brand-text">
            <span class="brand-name">{{ project.name }}</span>
            <span class="brand-desc">{{ project.description || '项目预览' }}</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <span class="powered-by">Powered by 伏羲平台</span>
      </div>
    </div>

    <!-- 主体：左侧菜单 + 右侧页面 -->
    <div class="preview-body">
      <div class="preview-menu">
        <div v-for="group in project.menu_config?.items" :key="group.key" class="menu-group">
          <div class="group-label">{{ group.label }}</div>
          <div
            v-for="item in group.children"
            :key="item.key"
            :class="['menu-item', { active: isActive(group, item) }]"
            @click="selectMenu(group, item)"
          >
            {{ item.label }}
          </div>
        </div>
        <el-empty v-if="!hasMenu" description="暂无菜单" />
      </div>

      <div class="preview-page">
        <iframe v-if="previewUrl" :src="previewUrl" class="page-frame" frameborder="0"></iframe>
        <div v-else-if="activeItem && !currentBinding" class="empty-page">
          <el-empty description="该菜单项尚未绑定原型" />
        </div>
        <div v-else class="empty-page">
          <el-empty description="请从左侧选择菜单项" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { useAuthStore } from '../stores/auth'
import { getProjectPortal } from '../api/projects'
import { findFirstBoundMenu } from '../utils/project-menu'

const route = useRoute()
const authStore = useAuthStore()

const project = ref({ menu_config: { items: [] }, prototypes: [] })
const loading = ref(false)
const activeGroup = ref(null)
const activeItem = ref(null)

onMounted(() => {
  loadProject()
})

async function loadProject() {
  loading.value = true
  try {
    const res = await getProjectPortal(route.params.id)
    project.value = res.data.data
    // 默认固定选中菜单顺序中的第一个已绑定菜单，避免打开即落到空白菜单。
    const firstBound = findFirstBoundMenu(project.value.menu_config, project.value.prototypes)
    if (firstBound) selectMenu(firstBound.group, firstBound.item)
  } catch (err) {
    ElMessage.error('加载项目失败')
  } finally {
    loading.value = false
  }
}

const hasMenu = computed(() => {
  return project.value.menu_config?.items?.some(g => g.children?.length > 0)
})

function menuPath(group, item) {
  return `${group.key}/${item.key}`
}

function isActive(group, item) {
  return activeGroup.value?.key === group.key && activeItem.value?.key === item.key
}

const currentBinding = computed(() => {
  if (!activeGroup.value || !activeItem.value) return null
  const path = menuPath(activeGroup.value, activeItem.value)
  return project.value.prototypes?.find(pp => pp.menu_path === path) || null
})

const previewUrl = computed(() => {
  const pp = currentBinding.value
  if (!pp || !pp.entry_file) return null
  const token = authStore.token || ''
  return `/preview/${pp.prototype_id}/${pp.entry_file}?token=${token}`
})

function selectMenu(group, item) {
  activeGroup.value = group
  activeItem.value = item
}
</script>

<style scoped>
.project-preview-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
}

/* 顶部项目信息栏 */
.preview-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
}
.project-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-logo {
  width: 28px;
  height: 28px;
}
.brand-text {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.brand-name {
  font-size: 18px;
  font-weight: 700;
  color: #1a202c;
}
.brand-desc {
  font-size: 13px;
  color: #718096;
}
.powered-by {
  font-size: 12px;
  color: #a0aec0;
}

/* 主体 */
.preview-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 左侧菜单 */
.preview-menu {
  width: 220px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  padding: 12px 0;
  flex-shrink: 0;
}
.menu-group {
  margin-bottom: 8px;
}
.group-label {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
}
.menu-item {
  padding: 10px 16px 10px 28px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.menu-item:hover {
  background: #f5f7fa;
}
.menu-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

/* 右侧页面区 */
.preview-page {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.page-frame {
  width: 100%;
  height: 100%;
  border: none;
}
.empty-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
