<template>
  <div class="portal-content">
    <div v-if="!activeItem" class="empty-content">
      <el-empty description="请从左侧选择一个菜单项" />
    </div>
    <div v-else class="workspace">
      <div class="workspace-toolbar">
        <div class="workspace-heading-block">
          <div class="workspace-kicker"><span class="live-dot"></span><span>{{ currentBinding ? '正式版本 · 入口可用' : '尚未绑定原型' }}</span></div>
          <h2 class="workspace-heading">{{ currentBinding?.prototype_name || activeItem?.label }}</h2>
          <span class="workspace-meta">{{ activePathLabel }}</span>
        </div>
        <div class="toolbar-actions" v-if="currentBinding">
          <el-button text size="small" @click="emit('go-prototype', currentBinding.prototype_id)">
            <el-icon><Link /></el-icon>
            原型详情
          </el-button>
          <el-button v-if="canEdit" type="primary" size="small" @click="emit('open-change-request')">让 AI 修改</el-button>
        </div>
      </div>

      <div v-if="!currentBinding" class="unbound-panel">
        <div class="unbound-panel-inner">
          <div class="unbound-icon">○</div>
          <h3>该菜单项尚未绑定原型</h3>
          <p>将一个有效原型绑定到「{{ activePathLabel }}」，成员就能从项目门户直接进入。</p>
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
              <el-option v-for="prototype in availablePrototypes" :key="prototype.id" :label="prototype.name" :value="prototype.id" />
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
      </div>

      <div v-else class="preview-card">
        <div class="preview-card-head">
          <div class="preview-version">
            <strong>{{ currentBinding.prototype_name }}</strong>
            <span class="version-chip">v{{ currentBinding.version_label || currentBinding.version_number }}</span>
          </div>
          <div class="preview-head-actions">
            <el-button v-if="canManage && pendingReadyCount" type="warning" size="small" @click="emit('open-changes')">待确认 {{ pendingReadyCount }}</el-button>
            <el-button v-if="canEdit" text size="small" @click="emit('open-changes')">任务管理器</el-button>
          </div>
        </div>
        <div class="preview-boundary">
          <div class="preview-boundary-bar">
            <div class="preview-boundary-brand"><span class="fuxi-chip">伏羲平台</span><span>项目门户</span></div>
            <span class="preview-boundary-note">以下区域为原型内容 · 当前正式版本 v{{ currentBinding.version_label || currentBinding.version_number }}</span>
          </div>
          <div class="preview-frame-wrapper">
            <iframe v-if="previewUrl" :key="previewUrl" :src="previewUrl" class="preview-frame" frameborder="0" />
            <el-empty v-else description="原型没有可预览的入口文件" />
          </div>
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

/* 阶段 22.1 高保真工作区 */
.workspace {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 22px 24px 30px;
  background: #f6f8fc;
}
.workspace-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.workspace-heading-block { min-width: 0; }
.workspace-kicker { display: flex; align-items: center; gap: 7px; color: #72809a; font-size: 11px; }
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: #11966c; box-shadow: 0 0 0 4px #eaf8f2; }
.workspace-heading { overflow: hidden; margin: 4px 0 0; color: #1a2438; font-size: 19px; letter-spacing: -.03em; text-overflow: ellipsis; white-space: nowrap; }
.workspace-meta { display: block; overflow: hidden; margin-top: 3px; color: #72809a; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.toolbar-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.toolbar-actions :deep(.el-button) { min-height: 30px; border-radius: 8px; }
.toolbar-actions :deep(.el-button--primary) { border-color: #3c6ff2; background: #3c6ff2; }
.preview-card { overflow: hidden; border: 1px solid #d7deeb; border-radius: 13px; background: #fff; box-shadow: 0 18px 50px rgba(24, 40, 75, .08); }
.preview-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 15px; border-bottom: 1px solid #e7ebf2; }
.preview-version { display: flex; align-items: center; gap: 9px; min-width: 0; }
.preview-version strong { overflow: hidden; color: #1a2438; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.version-chip { border-radius: 99px; padding: 3px 7px; color: #11966c; background: #eaf8f2; font-size: 10px; font-weight: 700; white-space: nowrap; }
.preview-head-actions { display: flex; align-items: center; gap: 5px; }
.preview-head-actions :deep(.el-button) { min-height: 28px; border-radius: 7px; }
.unbound-panel { display: grid; min-height: 480px; place-items: center; border: 1px dashed #d7deeb; border-radius: 13px; background: #fff; text-align: center; }
.unbound-panel-inner { max-width: 430px; padding: 30px; }
.unbound-icon { display: grid; place-items: center; width: 42px; height: 42px; margin: 0 auto 13px; border-radius: 13px; color: #6e84bd; background: #edf2ff; font-size: 24px; }
.unbound-panel h3 { margin: 0; color: #1a2438; font-size: 16px; }
.unbound-panel p { margin: 7px 0 0; color: #72809a; font-size: 12px; line-height: 1.65; }
.unbound-panel .bind-form { justify-content: center; margin-top: 17px; }
.unbound-panel .prototype-pagination { justify-content: center; }
.preview-boundary { min-height: 0; display: flex; flex-direction: column; background: #eef2f8; }
.preview-boundary-bar { min-height: 34px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #52606d; font-size: 12px; background: #e2e8f0; border-bottom: 1px solid #cbd5e0; }
.preview-boundary-brand { display: flex; align-items: center; gap: 8px; color: #243b53; font-weight: 600; }
.fuxi-chip { display: inline-flex; align-items: center; padding: 3px 7px; color: #fff; background: #2563eb; border-radius: 4px; font-size: 11px; font-weight: 700; }
.preview-boundary-note { overflow: hidden; color: #72809a; text-overflow: ellipsis; white-space: nowrap; }
.preview-frame-wrapper { min-height: 0; padding: 14px; background: #eef2f8; }
.preview-frame { width: 100%; min-height: 560px; display: block; border: 1px solid #cbd5e0; border-radius: 9px; background: #fff; box-shadow: 0 11px 28px rgba(26,39,69,.11); }

@media (max-width: 900px) {
  .workspace { padding: 18px 15px; }
  .workspace-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; }
}
</style>
