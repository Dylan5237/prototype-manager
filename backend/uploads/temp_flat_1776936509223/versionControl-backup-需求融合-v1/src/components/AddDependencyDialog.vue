<template>
  <el-dialog v-model="dialogVisible" title="新建依赖" width="720px" align-center destroy-on-close>
    <div class="section-title">当前业务域信息</div>
    <el-form :model="baseInfo" label-width="100px" class="base-form">
      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>业务域</span>
        </template>
        <el-input v-model="baseInfo.domain" disabled />
      </el-form-item>
      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>版本号</span>
        </template>
        <el-select v-model="baseInfo.version" disabled style="width: 200px">
          <el-option label="main v1.3.3" value="main v1.3.3" />
        </el-select>
      </el-form-item>
    </el-form>

    <div class="add-row">
      <el-link type="primary" :icon="Plus" @click="addRow">新建一行+</el-link>
    </div>

    <div class="rows-wrap">
      <div v-for="(row, index) in rows" :key="index" class="dep-row">
        <el-form-item class="inline-item domain-item">
          <template #label>
            <span class="required-label"><span class="star">*</span>依赖域</span>
          </template>
          <el-select v-model="row.domain" placeholder="请选择" style="width: 140px" @change="onChange(row)">
            <el-option label="预约域" value="预约域" />
            <el-option label="就诊域" value="就诊域" />
            <el-option label="系统基础域" value="系统基础域" />
            <el-option label="配置域" value="配置域" />
          </el-select>
        </el-form-item>

        <el-form-item class="inline-item">
          <template #label>
            <span>最小版本</span>
          </template>
          <el-select v-model="row.minVersion" clearable placeholder="请选择" style="width: 140px" @change="onChange(row)">
            <el-option v-for="v in versionOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>

        <el-form-item class="inline-item">
          <template #label>
            <span>最大版本</span>
          </template>
          <el-select v-model="row.maxVersion" clearable placeholder="请选择" style="width: 140px" @change="onChange(row)">
            <el-option v-for="v in versionOptions" :key="v" :label="v" :value="v" />
          </el-select>
        </el-form-item>

        <div class="status-badge">
          <el-icon v-if="row.status === '可用'" color="#67C23A" size="18"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="row.status === '发布后可用'" color="#E6A23C" size="18"><WarningFilled /></el-icon>
          <el-icon v-else-if="row.status" color="#F56C6C" size="18"><CircleCloseFilled /></el-icon>
          <span v-if="row.status" :style="{ color: statusColor(row.status) }">{{ row.status }}</span>
          <span v-if="row.status === '不可用，请检查'" class="sub-tip">不可用，请检查</span>
        </div>

        <el-button link type="danger" :icon="Delete" @click="removeRow(index)">删除</el-button>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Plus, Delete, CircleCheckFilled, WarningFilled, CircleCloseFilled } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: boolean;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const baseInfo = ref({
  domain: '业务活动层-医嘱域',
  version: 'main v1.3.3',
});

interface DepRow {
  domain: string;
  minVersion: string;
  maxVersion: string;
  status: string;
}

const versionOptions = [
  'main v1.3.3',
  'main v1.2.1',
  'bugfix v1.3.4',
  'main v1.0.0',
];

const rows = ref<DepRow[]>([
  { domain: '预约域', minVersion: 'main v1.2.1', maxVersion: '', status: '可用' },
  { domain: '就诊域', minVersion: '', maxVersion: 'main v1.2.1', status: '发布后可用' },
  { domain: '系统基础域', minVersion: 'main v1.0.0', maxVersion: 'main v1.3.3', status: '可用' },
]);

function addRow() {
  rows.value.push({ domain: '', minVersion: '', maxVersion: '', status: '' });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

function onChange(row: DepRow) {
  recalcStatus(row);
}

function recalcStatus(row: DepRow) {
  if (!row.domain) {
    row.status = '';
    return;
  }
  if (!row.minVersion && !row.maxVersion) {
    row.status = '请选择版本';
    return;
  }

  // 简单模拟：若存在 bugfix 则视为不可用；其他按 domain 模拟
  const hasBugfix = row.minVersion.startsWith('bugfix') || row.maxVersion.startsWith('bugfix');
  if (hasBugfix) {
    row.status = '不可用，请检查';
    return;
  }

  if (row.domain === '预约域') row.status = '可用';
  else if (row.domain === '就诊域') row.status = '发布后可用';
  else if (row.domain === '系统基础域') row.status = '可用';
  else if (row.domain === '配置域') row.status = '可用';
  else row.status = '可用';
}

function statusColor(status: string) {
  if (status === '可用') return '#67C23A';
  if (status === '发布后可用') return '#E6A23C';
  return '#F56C6C';
}
</script>

<style scoped>
.required-label .star {
  color: #f56c6c;
  margin-right: 2px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  padding-left: 12px;
  border-left: 3px solid #409eff;
}
.base-form :deep(.el-form-item) {
  margin-bottom: 12px;
}
.add-row {
  margin: 12px 0;
}
.rows-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dep-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  flex-wrap: wrap;
}
.inline-item {
  margin-bottom: 0 !important;
}
.inline-item :deep(.el-form-item__label) {
  width: auto !important;
  padding-right: 6px;
  justify-content: flex-end;
}
.inline-item :deep(.el-form-item__content) {
  margin-left: 0 !important;
}
.domain-item :deep(.el-form-item__label) {
  min-width: 56px;
}
.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  min-width: 110px;
}
.sub-tip {
  color: #F56C6C;
  font-size: 12px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
