<template>
  <div class="business-node-card" :class="changeClass">
    <template v-if="nodeType === 'entity'">
      <div class="node-header">
        <el-icon size="18"><OfficeBuilding /></el-icon>
        <span class="node-title">{{ value.name }}</span>
        <span class="node-code">({{ value.code }})</span>
      </div>
      <div class="node-meta">
        <el-tag size="small" type="info">实体</el-tag>
        <span class="meta-text">字段数: {{ value.fields?.length || 0 }}</span>
      </div>
    </template>

    <template v-else-if="nodeType === 'field'">
      <div class="node-header">
        <el-icon size="16"><Document /></el-icon>
        <span class="node-title">{{ value.name }}</span>
        <span class="node-code">({{ value.code }})</span>
      </div>
      <div class="node-meta">
        <el-tag size="small" type="info">{{ value.type }}</el-tag>
        <el-tag v-if="value.required" size="small" type="danger">必填</el-tag>
        <el-tag v-if="value.dictRef" size="small" type="success">字典: {{ value.dictRef }}</el-tag>
      </div>
    </template>

    <template v-else-if="nodeType === 'process'">
      <div class="node-header">
        <el-icon size="18"><Switch /></el-icon>
        <span class="node-title">{{ value.name }}</span>
        <span class="node-code">({{ value.code }})</span>
      </div>
      <div class="node-meta">
        <el-tag size="small" type="warning">流程</el-tag>
        <span class="meta-text">{{ value.nodes?.join(' → ') }}</span>
      </div>
    </template>

    <template v-else-if="nodeType === 'method'">
      <div class="node-header">
        <el-icon size="18"><VideoPlay /></el-icon>
        <span class="node-title">{{ value.name }}</span>
        <span class="node-code">({{ value.code }})</span>
      </div>
      <div class="node-meta">
        <el-tag size="small" type="success">{{ value.bizType }}</el-tag>
        <el-tag size="small" type="info">{{ value.techType }}</el-tag>
        <span class="meta-text">入参 {{ value.params?.length || 0 }} 个</span>
      </div>
    </template>

    <template v-else-if="nodeType === 'param'">
      <div class="node-header">
        <el-icon size="14"><EditPen /></el-icon>
        <span class="node-title">{{ value.name }}</span>
        <span class="node-code">({{ value.code }})</span>
      </div>
      <div class="node-meta">
        <el-tag size="small" type="info">{{ value.dataType }}</el-tag>
        <el-tag v-if="value.isArray" size="small" type="warning">数组</el-tag>
        <el-tag size="small" type="success">{{ value.source }}</el-tag>
      </div>
    </template>

    <template v-else-if="isPrimitive">
      <div class="primitive-value">{{ displayValue }}</div>
    </template>

    <template v-else>
      <pre class="json-preview">{{ JSON.stringify(value, null, 2) }}</pre>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OfficeBuilding, Document, Switch, VideoPlay, EditPen } from '@element-plus/icons-vue';
import type { ChangeType } from '../types';

const props = defineProps<{
  value: any;
  changeType?: ChangeType;
}>();

const nodeType = computed(() => {
  const v = props.value;
  if (v === null || v === undefined) return 'primitive';
  if (typeof v !== 'object') return 'primitive';
  if ('fields' in v && 'code' in v) return 'entity';
  if ('type' in v && 'code' in v && !('fields' in v) && !('dataType' in v)) return 'field';
  if ('nodes' in v && 'code' in v) return 'process';
  if ('params' in v && 'code' in v) return 'method';
  if ('dataType' in v && 'code' in v) return 'param';
  return 'object';
});

const isPrimitive = computed(() => nodeType.value === 'primitive');

const displayValue = computed(() => {
  if (props.value === null) return 'null';
  if (props.value === undefined) return '(无)';
  return String(props.value);
});

const changeClass = computed(() => {
  switch (props.changeType) {
    case 'added': return 'change-added';
    case 'removed': return 'change-removed';
    case 'modified': return 'change-modified';
    default: return '';
  }
});
</script>

<style scoped>
.business-node-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  background: #fff;
  transition: all 0.2s;
}
.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.node-title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}
.node-code {
  font-size: 13px;
  color: #909399;
}
.node-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-text {
  font-size: 13px;
  color: #606266;
}
.primitive-value {
  font-size: 14px;
  color: #303133;
  word-break: break-all;
  min-height: 24px;
  display: flex;
  align-items: center;
}
.json-preview {
  margin: 0;
  font-size: 12px;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  max-height: 200px;
  overflow: auto;
}

.change-added {
  border-color: #67c23a;
  background: #f0f9eb;
}
.change-removed {
  border-color: #f56c6c;
  background: #fef0f0;
  opacity: 0.8;
}
.change-modified {
  border-color: #e6a23c;
  background: #fdf6ec;
}
</style>
