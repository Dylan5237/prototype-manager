<template>
  <div class="portal-content">
    <div v-if="!activeItem" class="empty-content">
      <el-empty description="请从左侧选择一个菜单项" />
    </div>
    <div v-else-if="!currentBinding" class="bind-panel">
      <el-empty description="该菜单项尚未绑定原型">
        <template #description>
          <p>该菜单项尚未绑定原型</p>
          <p v-if="canManage" class="bind-tip">选择一个原型绑定到「{{ activePathLabel }}」</p>
        </template>
      </el-empty>
      <div v-if="canManage" class="bind-form">
        <el-select
          :model-value="selectedPrototypeId"
          filterable
          remote
          reserve-keyword
          placeholder="选择原型"
          style="width: 320px"
          :remote-method="keyword => emit('prototype-search', keyword)"
          :loading="prototypesLoading"
          @update:model-value="value => emit('update:selectedPrototypeId', value)"
        >
          <el-option
            v-for="prototype in availablePrototypes"
            :key="prototype.id"
            :label="prototype.name"
            :value="prototype.id"
          />
        </el-select>
        <el-button type="primary" :loading="binding" @click="emit('bind')">绑定</el-button>
      </div>
      <el-pagination
        v-if="prototypesTotal > prototypesPageSize"
        class="prototype-pagination"
        small
        layout="prev, pager, next"
        :current-page="prototypesPage"
        :page-size="prototypesPageSize"
        :total="prototypesTotal"
        @current-change="page => emit('prototype-page-change', page)"
      />
    </div>
    <div v-else class="preview-panel">
      <div class="preview-toolbar">
        <div class="preview-info">
          <span class="prototype-name">{{ currentBinding.prototype_name }}</span>
          <span class="version">v{{ currentBinding.version_label || currentBinding.version_number }}</span>
        </div>
        <div class="preview-actions">
          <el-button
            v-if="canManage && pendingReadyCount"
            type="warning"
            size="small"
            @click="emit('open-changes')"
          >
            待确认 {{ pendingReadyCount }}
          </el-button>
          <el-button v-if="canEdit" text size="small" @click="emit('open-changes')">
            任务管理器
          </el-button>
          <el-button v-if="canEdit" type="primary" size="small" @click="emit('open-change-request')">
            让 AI 修改
          </el-button>
          <el-button text size="small" @click="emit('go-prototype', currentBinding.prototype_id)">
            <el-icon><Link /></el-icon>
            原型详情
          </el-button>
        </div>
      </div>
      <div class="preview-boundary">
        <div class="preview-boundary-bar">
          <div class="preview-boundary-brand">
            <span class="fuxi-chip">伏羲平台</span>
            <span>项目门户</span>
          </div>
          <span class="preview-boundary-note">以下区域为原型内容 · 当前正式版本 v{{ currentBinding.version_label || currentBinding.version_number }}</span>
        </div>
        <div class="preview-frame-wrapper">
          <iframe
            v-if="previewUrl"
            :key="previewUrl"
            :src="previewUrl"
            class="preview-frame"
            frameborder="0"
          />
          <el-empty v-else description="原型没有可预览的入口文件" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Link } from '@element-plus/icons-vue'

defineProps({
  activeItem: { type: Object, default: null },
  currentBinding: { type: Object, default: null },
  canManage: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  activePathLabel: { type: String, default: '' },
  selectedPrototypeId: { type: [String, Number], default: '' },
  availablePrototypes: { type: Array, default: () => [] },
  prototypesLoading: { type: Boolean, default: false },
  prototypesTotal: { type: Number, default: 0 },
  prototypesPage: { type: Number, default: 1 },
  prototypesPageSize: { type: Number, default: 20 },
  binding: { type: Boolean, default: false },
  pendingReadyCount: { type: Number, default: 0 },
  previewUrl: { type: String, default: '' }
})

const emit = defineEmits([
  'update:selectedPrototypeId',
  'prototype-search',
  'prototype-page-change',
  'bind',
  'open-changes',
  'open-change-request',
  'go-prototype'
])
</script>

<style scoped>
.portal-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.empty-content,
.bind-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.bind-tip {
  color: #909399;
  font-size: 13px;
  margin-top: 8px;
}
.bind-form {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.prototype-pagination {
  margin-top: 14px;
}
.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.preview-toolbar {
  height: 48px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.preview-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.prototype-name {
  font-weight: 600;
  color: #1a202c;
}
.version {
  color: #909399;
  font-size: 12px;
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-frame-wrapper {
  flex: 1;
  position: relative;
  padding: 10px;
  background: #edf2f7;
}
.preview-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: block;
  background: #fff;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 8%);
}
.preview-boundary {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #edf2f7;
}
.preview-boundary-bar {
  min-height: 34px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #52606d;
  font-size: 12px;
  background: #e2e8f0;
  border-bottom: 1px solid #cbd5e0;
}
.preview-boundary-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #243b53;
  font-weight: 600;
}
.fuxi-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  color: #fff;
  background: #2563eb;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.preview-boundary-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
