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
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title-block h1 {
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
}
.title-block .sub {
  font-size: 12px;
  color: #718096;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
