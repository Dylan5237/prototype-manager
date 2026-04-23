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
          <el-select v-model="row.domain" placeholder="请选择" style="width: 130px" @change="onChange(row)">
            <el-option label="就诊域" value="就诊域" />
            <el-option label="药剂域" value="药剂域" />
            <el-option label="收费域" value="收费域" />
            <el-option label="配置域" value="配置域" />
            <el-option label="诊断域" value="诊断域" />
            <el-option label="病历域" value="病历域" />
          </el-select>
        </el-form-item>

        <el-form-item class="inline-item">
          <template #label>
            <span class="required-label"><span class="star">*</span>对象类型</span>
          </template>
          <el-select v-model="row.type" placeholder="请选择" style="width: 100px" @change="onChange(row)">
            <el-option label="接口" value="接口" />
            <el-option label="实体" value="实体" />
            <el-option label="方法" value="方法" />
          </el-select>
        </el-form-item>

        <el-form-item class="inline-item" style="flex:1;min-width:160px">
          <template #label>
            <span class="required-label"><span class="star">*</span>依赖对象</span>
          </template>
          <el-select v-model="row.object" filterable clearable placeholder="请选择或输入" style="width: 100%" @change="onChange(row)">
            <el-option-group label="就诊域">
              <el-option label="就诊状态查询接口" value="就诊状态查询接口" />
              <el-option label="患者信息实体" value="患者信息实体" />
              <el-option label="挂号记录实体" value="挂号记录实体" />
            </el-option-group>
            <el-option-group label="药剂域">
              <el-option label="药品库存查询接口" value="药品库存查询接口" />
              <el-option label="药品字典实体" value="药品字典实体" />
            </el-option-group>
            <el-option-group label="收费域">
              <el-option label="费用计算服务" value="费用计算服务" />
              <el-option label="收费项目字典" value="收费项目字典" />
            </el-option-group>
            <el-option-group label="配置域">
              <el-option label="科室字典" value="科室字典" />
              <el-option label="人员字典" value="人员字典" />
            </el-option-group>
          </el-select>
        </el-form-item>

        <div class="status-badge">
          <el-icon v-if="row.status === '正常'" color="#67C23A" size="18"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="row.status === '待确认'" color="#E6A23C" size="18"><WarningFilled /></el-icon>
          <el-icon v-else-if="row.status" color="#F56C6C" size="18"><CircleCloseFilled /></el-icon>
          <span v-if="row.status" :style="{ color: statusColor(row.status) }">{{ row.status }}</span>
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
});

interface DepRow {
  domain: string;
  type: string;
  object: string;
  status: string;
}

const rows = ref<DepRow[]>([
  { domain: '就诊域', type: '接口', object: '就诊状态查询接口', status: '正常' },
  { domain: '收费域', type: '方法', object: '费用计算服务', status: '正常' },
]);

function addRow() {
  rows.value.push({ domain: '', type: '', object: '', status: '' });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}

function onChange(row: DepRow) {
  recalcStatus(row);
}

function recalcStatus(row: DepRow) {
  if (!row.domain || !row.type || !row.object) {
    row.status = '';
    return;
  }
  // 简单模拟校验
  const validObjects: Record<string, string[]> = {
    '就诊域': ['就诊状态查询接口', '患者信息实体', '挂号记录实体'],
    '药剂域': ['药品库存查询接口', '药品字典实体'],
    '收费域': ['费用计算服务', '收费项目字典'],
    '配置域': ['科室字典', '人员字典'],
    '诊断域': ['诊断编码查询接口', '诊断字典'],
    '病历域': ['病历模板实体', '病历段落接口'],
  };
  const list = validObjects[row.domain] || [];
  if (list.includes(row.object)) {
    row.status = '正常';
  } else {
    row.status = '待确认';
  }
}

function statusColor(status: string) {
  if (status === '正常') return '#67C23A';
  if (status === '待确认') return '#E6A23C';
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
  min-width: 80px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
