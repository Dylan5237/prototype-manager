<template>
  <div class="method-editor">
    <!-- 方法基本信息 -->
    <div class="method-header">
      <div class="form-row">
        <div class="form-item" :class="highlightClass('name')">
          <label class="form-label required">名称</label>
          <div class="form-value">{{ method.name || '-' }}</div>
        </div>
        <div class="form-item" :class="highlightClass('bizType')">
          <label class="form-label required">业务分类</label>
          <div class="form-value">{{ method.bizType || '-' }}</div>
        </div>
        <div class="form-item" :class="highlightClass('techType')">
          <label class="form-label required">技术类别</label>
          <div class="form-value">{{ method.techType || '-' }}</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-item">
          <el-checkbox :model-value="method.external" disabled>对外标识</el-checkbox>
        </div>
        <div class="form-item wide" :class="highlightClass('remark')">
          <label class="form-label">备注</label>
          <div class="form-value">{{ method.remark || '-' }}</div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="method-tabs">
      <el-tabs v-model="activeTab" type="border-card" class="compact-tabs">
        <el-tab-pane label="入参配置" name="params">
          <el-table :data="method.params || []" size="small" stripe border class="compact-table">
            <el-table-column type="index" label="序号" width="45" align="center" />
            <el-table-column prop="code" label="参数名" min-width="90" show-overflow-tooltip>
              <template #default="{ row }">
                <span :class="paramCellClass(row, 'code')" @click.stop="emit('selectParam', { rowId: row.id, prop: 'code' })">{{ row.code }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="中文名" min-width="80" show-overflow-tooltip>
              <template #default="{ row }">
                <span :class="paramCellClass(row, 'name')" @click.stop="emit('selectParam', { rowId: row.id, prop: 'name' })">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="dataType" label="数据类型" width="70" align="center">
              <template #default="{ row }">
                <span :class="paramCellClass(row, 'dataType')" @click.stop="emit('selectParam', { rowId: row.id, prop: 'dataType' })">{{ row.dataType }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="isArray" label="是否数组" width="60" align="center">
              <template #default="{ row }">
                <span :class="paramCellClass(row, 'isArray')" @click.stop="emit('selectParam', { rowId: row.id, prop: 'isArray' })">{{ row.isArray ? '是' : '否' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="source" label="来源" min-width="70" show-overflow-tooltip>
              <template #default="{ row }">
                <span :class="paramCellClass(row, 'source')" @click.stop="emit('selectParam', { rowId: row.id, prop: 'source' })">{{ row.source }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="50" align="center">
              <template #default="{ row }">
                <el-button
                  v-if="hasParamChange(row)"
                  link
                  type="primary"
                  size="small"
                  @click="emit('selectParam', { rowId: row.id })"
                >选</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-pagination">
            <span class="pagination-total">共 {{ (method.params || []).length }} 条</span>
          </div>
        </el-tab-pane>
        <el-tab-pane label="成功出参" name="success">
          <el-empty description="暂无数据" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane label="异常出参" name="error">
          <el-empty description="暂无数据" :image-size="60" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  method: any;
  highlightMap?: Record<string, 'added' | 'removed' | 'modified' | 'conflict'>;
}>();

const emit = defineEmits<{
  (e: 'selectParam', payload: { rowId: string; prop?: string }): void;
}>();

const activeTab = ref('params');

function highlightClass(key: string) {
  const type = props.highlightMap?.[key];
  return type ? `hl-${type}` : '';
}

function paramCellClass(row: any, key: string) {
  const type = props.highlightMap?.[`${row.id}.${key}`] || props.highlightMap?.[row.id];
  return type ? `hl-cell hl-${type}` : '';
}

function hasParamChange(row: any) {
  const keys = Object.keys(props.highlightMap || {});
  return keys.some(k => k === row.id || k.startsWith(`${row.id}.`));
}
</script>

<style scoped>
.method-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
.method-header {
  padding: 10px;
  background: #fafafa;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.form-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.form-row:last-child {
  margin-bottom: 0;
}
.form-item {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 120px;
  padding: 2px 4px;
  border-radius: 4px;
}
.form-item.wide {
  flex: 2;
  min-width: 180px;
}
.form-label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  flex-shrink: 0;
}
.form-label.required::before {
  content: '*';
  color: #f56c6c;
  margin-right: 2px;
}
.form-value {
  font-size: 12px;
  color: #303133;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 3px 6px;
  flex: 1;
  min-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.method-tabs {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.compact-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.compact-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 8px;
}
.compact-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.compact-table {
  font-size: 12px;
  height: calc(96vh - 480px);
  min-height: 140px;
}
.compact-table :deep(.el-table__cell) {
  padding: 4px 0;
}
.table-pagination {
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
}
.hl-added {
  background: #f0f9eb !important;
  border: 1px solid #67c23a;
}
.hl-modified,
.hl-conflict {
  background: #fdf6ec !important;
  border: 1px solid #e6a23c;
}
.hl-removed {
  background: #fef0f0 !important;
  border: 1px solid #f56c6c;
  text-decoration: line-through;
  opacity: 0.8;
}
.hl-cell {
  display: inline-block;
  width: 100%;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
}
.hl-cell:hover {
  filter: brightness(0.96);
}
.hl-cell.hl-added {
  background: #d9f7be;
}
.hl-cell.hl-modified,
.hl-cell.hl-conflict {
  background: #ffe58f;
}
.hl-cell.hl-removed {
  background: #ffccc7;
  text-decoration: line-through;
}
</style>
