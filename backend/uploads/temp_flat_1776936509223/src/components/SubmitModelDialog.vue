<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`${domainName} - 提交模型`"
    width="780px"
    align-center
    destroy-on-close
  >
    <el-form :model="form" label-width="100px" class="model-form">
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
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="输入模型变更描述" />
      </el-form-item>

      <!-- 模型范围 -->
      <el-form-item>
        <template #label>
          <span class="required-label"><span class="star">*</span>模型范围</span>
        </template>
        <div class="scope-section">
          <el-radio-group v-model="scopeTab" size="small" class="scope-tabs">
            <el-radio-button label="all">全部对象</el-radio-button>
            <el-radio-button label="entity">实体建模</el-radio-button>
            <el-radio-button label="method">方法建模</el-radio-button>
            <el-radio-button label="interface">接口建模</el-radio-button>
          </el-radio-group>
          <div class="scope-table-wrap">
            <el-table
              :data="scopeList"
              size="small"
              border
              max-height="220"
              @selection-change="handleScopeChange"
            >
              <el-table-column type="selection" width="45" align="center" />
              <el-table-column prop="name" label="对象名称" min-width="160" show-overflow-tooltip />
              <el-table-column prop="subType" label="子类型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.subType === '主实体' || row.subType === '主方法' ? 'primary' : 'info'">{{ row.subType }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="80" />
              <el-table-column prop="creator" label="创建人" width="80" />
            </el-table>
          </div>
          <div class="scope-summary">
            已选择 <el-tag size="small" type="primary">{{ selectedScopeCount }}</el-tag> 个对象
          </div>
        </div>
      </el-form-item>

      <!-- 关联需求 -->
      <el-form-item label="关联需求">
        <div class="requirement-section">
          <div v-if="filteredDemands.length" class="requirement-list">
            <div v-for="item in filteredDemands" :key="item.id" class="requirement-item">
              <el-checkbox v-model="item.checked" />
              <span class="req-name">{{ item.id }} {{ item.title }}</span>
              <el-tag
                :type="item.status === '已完成' ? 'success' : item.status === '开发中' ? 'warning' : 'info'"
                size="small"
                effect="plain"
              >
                {{ item.status }}
              </el-tag>
              <el-tag v-if="item.scope === '跨组'" size="small" type="danger" effect="plain" style="margin-left: 4px">跨组</el-tag>
            </div>
          </div>
          <el-empty v-else description="暂无本域待办需求" :image-size="60" />
          <div v-if="filteredDemands.length" class="req-summary">
            已关联 <el-tag size="small" type="success">{{ selectedDemandCount }}</el-tag> 个需求
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">提交模型</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { demandList } from '../utils/mockData';
import type { DemandItem } from '../utils/mockData';

interface ScopeItem {
  name: string;
  subType: string;
  status: string;
  creator: string;
  checked?: boolean;
}

interface DemandWithCheck extends DemandItem {
  checked: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  domainName: string;
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
  domain: props.domainName,
  version: '',
  description: '',
});

// 模型范围 Tab
const scopeTab = ref<'all' | 'entity' | 'method' | 'interface'>('all');
const selectedScopeKeys = ref<Set<string>>(new Set());

// 实体数据
const entityScopeMap: Record<string, ScopeItem[]> = {
  '医嘱域': [
    { name: '门诊医嘱记录', subType: '主实体', status: '启用', creator: '陈xx' },
    { name: '门诊草药医嘱记录', subType: '子实体', status: '启用', creator: '张xx' },
    { name: '门诊西成药医嘱记录', subType: '子实体', status: '启用', creator: '陈xx' },
    { name: '门诊检查医嘱明细记录', subType: '子实体', status: '启用', creator: '刘xx' },
    { name: '门诊检验医嘱明细记录', subType: '子实体', status: '未启用', creator: '王xx' },
    { name: '门诊材料医嘱明细记录', subType: '子实体', status: '启用', creator: '陈xx' },
    { name: '门诊医嘱医保记录', subType: '子实体', status: '启用', creator: '刘xx' },
    { name: '门诊草药辅料记录', subType: '子实体', status: '启用', creator: '张xx' },
    { name: '门诊皮试记录', subType: '子实体', status: '未启用', creator: '李xx' },
  ],
  '就诊域': [
    { name: '门诊就诊记录', subType: '主实体', status: '启用', creator: '郑xx' },
    { name: '挂号记录', subType: '子实体', status: '启用', creator: '陈xx' },
    { name: '排队叫号记录', subType: '子实体', status: '启用', creator: '王xx' },
    { name: '分诊记录', subType: '子实体', status: '未启用', creator: '李xx' },
    { name: '就诊轨迹记录', subType: '子实体', status: '启用', creator: '郑xx' },
  ],
  '门诊收费域': [
    { name: '门诊收费记录', subType: '主实体', status: '启用', creator: '陈xx' },
    { name: '门诊退费记录', subType: '子实体', status: '启用', creator: '吴xx' },
    { name: '发票记录', subType: '子实体', status: '启用', creator: '陈xx' },
    { name: '结算记录', subType: '子实体', status: '启用', creator: '陈xx' },
    { name: '收费项目明细', subType: '子实体', status: '未启用', creator: '许xx' },
  ],
};

const methodScopeMap: Record<string, ScopeItem[]> = {
  '医嘱域': [
    { name: '校验门诊医嘱开单信息', subType: '主方法', status: '启用', creator: '陈xx' },
    { name: '校验患者皮试信息', subType: '主方法', status: '启用', creator: '李xx' },
    { name: '获取门诊历史医嘱明细', subType: '主方法', status: '启用', creator: '刘xx' },
    { name: '获取门诊医嘱模板明细', subType: '主方法', status: '启用', creator: '刘xx' },
    { name: '更新门诊医嘱发送状态', subType: '主方法', status: '启用', creator: '李xx' },
    { name: '获取门诊药品医嘱列表', subType: '数据集', status: '启用', creator: '陈xx' },
    { name: '获取门诊草药医嘱列表', subType: '数据集', status: '启用', creator: '张xx' },
    { name: '门诊医嘱批量保存', subType: '主方法', status: '未启用', creator: '陈xx' },
  ],
  '就诊域': [
    { name: '患者挂号登记', subType: '主方法', status: '启用', creator: '郑xx' },
    { name: '获取就诊队列', subType: '主方法', status: '启用', creator: '陈xx' },
    { name: '分诊叫号', subType: '主方法', status: '启用', creator: '王xx' },
    { name: '查询就诊轨迹', subType: '数据集', status: '启用', creator: '郑xx' },
    { name: '退号处理', subType: '主方法', status: '未启用', creator: '李xx' },
  ],
  '门诊收费域': [
    { name: '门诊费用计算', subType: '主方法', status: '启用', creator: '陈xx' },
    { name: '收费结算', subType: '主方法', status: '启用', creator: '陈xx' },
    { name: '退费处理', subType: '主方法', status: '启用', creator: '吴xx' },
    { name: '发票打印', subType: '主方法', status: '启用', creator: '陈xx' },
    { name: '费用明细查询', subType: '数据集', status: '未启用', creator: '许xx' },
    { name: '冲销结算', subType: '主方法', status: '启用', creator: '陈xx' },
  ],
};

const interfaceScopeMap: Record<string, ScopeItem[]> = {
  '医嘱域': [
    { name: '门诊医嘱发送状态接口', subType: '接口', status: '启用', creator: '李xx' },
    { name: '门诊草药处方打印接口', subType: '接口', status: '启用', creator: '张xx' },
    { name: '皮试结果查询接口', subType: '接口', status: '未启用', creator: '李xx' },
  ],
  '就诊域': [
    { name: '就诊状态查询接口', subType: '接口', status: '启用', creator: '郑xx' },
    { name: '患者信息查询接口', subType: '接口', status: '启用', creator: '陈xx' },
  ],
  '门诊收费域': [
    { name: '收费结算接口', subType: '接口', status: '启用', creator: '陈xx' },
    { name: '退费申请接口', subType: '接口', status: '启用', creator: '吴xx' },
    { name: '发票打印接口', subType: '接口', status: '启用', creator: '陈xx' },
  ],
};

const scopeList = computed(() => {
  const domain = props.domainName;
  if (scopeTab.value === 'entity') {
    return entityScopeMap[domain] || entityScopeMap['医嘱域'];
  }
  if (scopeTab.value === 'method') {
    return methodScopeMap[domain] || methodScopeMap['医嘱域'];
  }
  if (scopeTab.value === 'interface') {
    return interfaceScopeMap[domain] || interfaceScopeMap['医嘱域'];
  }
  // all
  return [
    ...(entityScopeMap[domain] || entityScopeMap['医嘱域']),
    ...(methodScopeMap[domain] || methodScopeMap['医嘱域']),
    ...(interfaceScopeMap[domain] || interfaceScopeMap['医嘱域']),
  ];
});

const selectedScopeCount = computed(() => selectedScopeKeys.value.size);

function handleScopeChange(val: ScopeItem[]) {
  selectedScopeKeys.value = new Set(val.map((v) => v.name));
}

// 关联需求：过滤当前域 + 待办/已完成状态
const filteredDemands = computed<DemandWithCheck[]>(() => {
  const domain = props.domainName;
  const list = demandList
    .filter((d) => {
      const domains = d.bizDomains.split(/[+、,]/).map((s) => s.trim());
      return domains.includes(domain);
    })
    .filter((d) => ['提出', '已设计', '开发中', '已完成'].includes(d.status));
  return list.map((d) => ({ ...d, checked: false }));
});

const selectedDemandCount = computed(() => filteredDemands.value.filter((d) => d.checked).length);

// 版本号自动计算
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

watch(
  () => props.domainName,
  (domain) => {
    form.value.domain = domain;
  },
  { immediate: true }
);

function handleSubmit() {
  if (!form.value.description.trim()) {
    ElMessage.warning('请填写版本描述');
    return;
  }
  if (selectedScopeCount.value === 0) {
    ElMessage.warning('请至少选择一个模型对象');
    return;
  }
  const selectedDemands = filteredDemands.value.filter((d) => d.checked).map((d) => d.id);
  ElMessage.success(
    `模型提交成功！\n业务域：${form.value.domain}\n版本：${form.value.version}\n对象数：${selectedScopeCount.value}\n关联需求：${selectedDemands.length}个`
  );
  dialogVisible.value = false;
}
</script>

<style scoped>
.required-label .star {
  color: #f56c6c;
  margin-right: 2px;
}
.model-form :deep(.el-form-item__content) {
  align-items: flex-start;
}
.scope-section {
  width: 100%;
}
.scope-tabs {
  margin-bottom: 8px;
}
.scope-table-wrap {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  overflow: hidden;
}
.scope-summary {
  margin-top: 8px;
  font-size: 13px;
  color: #595959;
  text-align: right;
}
.requirement-section {
  width: 100%;
}
.requirement-list {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 8px 12px;
  min-height: 80px;
  max-height: 220px;
  overflow-y: auto;
}
.requirement-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid #f0f0f0;
}
.requirement-item:last-child {
  border-bottom: none;
}
.req-name {
  flex: 1;
  color: #303133;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.req-summary {
  margin-top: 8px;
  font-size: 13px;
  color: #595959;
  text-align: right;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
