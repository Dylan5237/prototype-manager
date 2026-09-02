<template>
  <header class="portal-header">
    <div class="header-left">
      <el-button text aria-label="返回项目列表" @click="$emit('back')">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <div class="title-block">
        <h1>{{ project.name }}</h1>
        <p class="sub">{{ project.description || '暂无描述' }}</p>
      </div>
    </div>
    <div class="header-actions">
      <el-tag v-if="roleLabel" size="small" effect="plain" type="info">{{ roleLabel }}</el-tag>
      <el-button v-if="canManage" text @click="$emit('manage-menu')">
        <el-icon><Edit /></el-icon>
        管理菜单
      </el-button>
      <el-button v-if="canManage" text @click="$emit('snapshots')">
        <el-icon><Camera /></el-icon>
        快照
      </el-button>
      <el-button v-if="canManage" text @click="$emit('members')">
        <el-icon><User /></el-icon>
        成员
      </el-button>
      <el-button type="success" @click="$emit('full-preview')">
        <el-icon><FullScreen /></el-icon>
        全屏预览
      </el-button>
    </div>
  </header>
</template>

<script setup>
import { ArrowLeft, Edit, Camera, User, FullScreen } from '@element-plus/icons-vue'

defineProps({
  project: { type: Object, required: true },
  roleLabel: { type: String, default: '' },
  canManage: { type: Boolean, default: false }
})

defineEmits(['back', 'manage-menu', 'snapshots', 'members', 'full-preview'])
</script>

<style scoped>
.portal-header {
  min-height: 78px;
  background: #fff;
  border-bottom: 1px solid #e7ebf2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 30px 16px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.title-block { min-width: 0; }
.title-block h1 { margin: 0; overflow: hidden; color: #1a2438; font-size: 23px; font-weight: 750; letter-spacing: -.04em; text-overflow: ellipsis; white-space: nowrap; }
.title-block .sub { margin-top: 5px; overflow: hidden; color: #72809a; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.header-actions :deep(.el-button) { min-height: 30px; border-radius: 8px; color: #72809a; }
.header-actions :deep(.el-button:hover) { color: #2958d5; background: #edf2ff; }
.header-actions :deep(.el-button--success) { border-color: #68b94e; color: #fff; background: #6dbd4e; }
.header-actions :deep(.el-button--success:hover) { color: #fff; background: #5ca63e; }
.header-actions :deep(.el-tag) { border-color: #cfdcff; border-radius: 99px; color: #2958d5; background: #edf2ff; }

@media (max-width: 900px) {
  .portal-header { align-items: flex-start; flex-direction: column; padding: 18px; }
  .header-actions { width: 100%; justify-content: flex-start; }
}
</style>
