<template>
  <el-dialog v-model="dialogVisible" title="提交测试" width="720px" align-center destroy-on-close>
    <el-form :model="form" label-width="100px" class="release-form">
      <el-form-item label="分支:">
        <el-select v-model="form.branch" style="width: 160px">
          <el-option label="main" value="main" />
          <el-option label="bugfix" value="bugfix" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>业务域</span>
        </template>
        <el-input v-model="form.domain" disabled />
      </el-form-item>

      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>版本号</span>
        </template>
        <el-input v-model="form.version" disabled />
      </el-form-item>

      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>版本描述</span>
        </template>
        <div class="desc-row">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="输入版本变更信息" />
        </div>
      </el-form-item>

      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>选择需求</span>
        </template>
        <div class="requirement-list">
          <div v-for="item in requirementList" :key="item.id" class="requirement-item">
            <el-checkbox v-model="item.checked" />
            <span class="req-name">{{ item.name }}</span>
            <el-tag :type="item.statusType" size="small" effect="plain">{{ item.status }}</el-tag>
            <div class="req-actions">
              <el-button link type="primary" size="small" @click="openChangeDetail(item)">查看变更</el-button>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary">提交测试</el-button>
      </div>
    </template>
  </el-dialog>

  <!-- 需求变更详情弹窗 -->
  <el-dialog v-model="changeDetailVisible" title="需求变更详情" width="560px" align-center append-to-body>
    <div v-if="selectedRequirement" class="change-detail-body">
      <div class="detail-header">
        <div class="detail-title">{{ selectedRequirement.name }}</div>
        <el-tag :type="selectedRequirement.statusType" size="small" effect="plain">{{ selectedRequirement.status }}</el-tag>
      </div>
      <div class="detail-section">
        <div class="section-title">关联的数据对象变更记录</div>
        <div class="change-records">
          <div v-for="(record, index) in selectedRequirement.changeRecords" :key="index" class="change-record-row">
            <div class="record-meta">
              <el-tag :type="record.type === '新增' ? 'success' : record.type === '删除' ? 'danger' : 'warning'" size="small">
                {{ record.type }}
              </el-tag>
              <span class="record-object">{{ record.object }}</span>
            </div>
            <div class="record-detail">{{ record.detail }}</div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="changeDetailVisible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

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

const form = ref({
  branch: 'main',
  domain: '业务活动层-医嘱域',
  version: '',
  description: '',
});

// 模拟已发布版本库（实际应由父组件传入或接口获取）
const existingVersions = [
  'main-v2.2.0',
  'main-v2.1.0',
  'main-v1.0.3',
  'bugfix-v2.1.2',
  'bugfix-v2.0.5',
  'bugfix-v1.0.1',
];

function getNextVersion(branch: string) {
  const branchVersions = existingVersions
    .filter((v) => v.startsWith(`${branch}-v`))
    .map((v) => {
      const match = v.match(new RegExp(`^${branch}-v(\\d+)\\.(\\d+)\\.(\\d+)$`));
      if (match) {
        return {
          major: parseInt(match[1], 10),
          minor: parseInt(match[2], 10),
          patch: parseInt(match[3], 10),
        };
      }
      return null;
    })
    .filter(Boolean) as { major: number; minor: number; patch: number }[];

  if (!branchVersions.length) {
    return `${branch}-v1.0.0`;
  }

  branchVersions.sort((a, b) => {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  });

  const max = branchVersions[branchVersions.length - 1];
  return `${branch}-v${max.major}.${max.minor}.${max.patch + 1}`;
}

watch(
  () => form.value.branch,
  (branch) => {
    form.value.version = getNextVersion(branch);
  },
  { immediate: true }
);

interface ChangeRecord {
  type: string;
  object: string;
  detail: string;
}

interface Requirement {
  id: string;
  name: string;
  status: string;
  statusType: 'success' | 'warning' | 'info';
  checked: boolean;
  changeRecords: ChangeRecord[];
}

const requirementList = ref<Requirement[]>([
  {
    id: 'req-001',
    name: 'REQ-2026-0312-001 新增草药医嘱记录实体',
    status: '已完成',
    statusType: 'success',
    checked: true,
    changeRecords: [
      { type: '新增', object: '门诊草药医嘱记录实体', detail: '新增门诊草药医嘱记录实体及 herbalAssistFlag 字段' },
      { type: '新增', object: '门诊草药辅料记录实体', detail: '新增门诊草药辅料记录实体' },
    ],
  },
  {
    id: 'req-002',
    name: 'REQ-2026-0310-002 皮试校验方法入参扩展',
    status: '已完成',
    statusType: 'success',
    checked: true,
    changeRecords: [
      { type: '修改', object: '校验患者皮试信息方法', detail: '新增入参 skinTestResult 皮试结果代码' },
    ],
  },
  {
    id: 'req-003',
    name: 'REQ-2026-0308-003 医嘱发送状态接口兼容就诊域',
    status: '已完成',
    statusType: 'success',
    checked: false,
    changeRecords: [
      { type: '修改', object: '门诊医嘱发送状态接口', detail: 'status 字段类型由整数调整为中文本，兼容就诊域' },
    ],
  },
  {
    id: 'req-004',
    name: 'REQ-2026-0220-004 药品医嘱列表出参扩展',
    status: '测试中',
    statusType: 'warning',
    checked: false,
    changeRecords: [
      { type: '修改', object: '获取门诊药品医嘱列表方法', detail: '出参新增 drugBatchNo 药品批次号' },
    ],
  },
]);

const changeDetailVisible = ref(false);
const selectedRequirement = ref<Requirement | null>(null);

function openChangeDetail(item: Requirement) {
  selectedRequirement.value = item;
  changeDetailVisible.value = true;
}
</script>

<style scoped>
.required-label .star {
  color: #f56c6c;
  margin-right: 2px;
}
.release-form :deep(.el-form-item__content) {
  align-items: flex-start;
}
.desc-row {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.desc-row .el-textarea {
  flex: 1;
}
.requirement-list {
  width: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  min-height: 120px;
  max-height: 260px;
  overflow-y: auto;
}
.requirement-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.requirement-item:last-child {
  border-bottom: none;
}
.req-name {
  flex: 1;
  color: #303133;
  font-size: 13px;
}
.req-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* 变更详情弹窗 */
.change-detail-body {
  padding: 4px 0;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e8e8e8;
}
.detail-title {
  font-size: 15px;
  font-weight: 500;
  color: #262626;
}
.detail-section .section-title {
  font-size: 13px;
  font-weight: 500;
  color: #595959;
  margin-bottom: 10px;
}
.change-records {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.change-record-row {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  padding: 10px 12px;
}
.record-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.record-object {
  font-size: 13px;
  font-weight: 500;
  color: #262626;
}
.record-detail {
  font-size: 12px;
  color: #8c8c8c;
}
</style>
