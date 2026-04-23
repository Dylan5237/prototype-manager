<template>
  <div class="domain-design">
    <!-- Domain Info Bar -->
    <div class="domain-info-bar">
      <div class="domain-info-left">
        <span class="domain-version-title">{{ props.domainName }} {{ selectedVersion }}</span>
        <span class="domain-meta-item">创建时间：2026-03-13 15:00:09</span>
      </div>
      <div class="domain-info-right">
        <span class="branch-label">分支：</span>
        <el-select v-model="designBranch" style="width: 120px" size="small">
          <el-option label="main" value="main" />
          <el-option label="bugfix" value="bugfix" />
        </el-select>
        <el-badge :value="domainDemandCount" :hidden="domainDemandCount === 0" type="danger" class="demand-badge">
          <el-link type="primary" class="manage-version" @click="showDomainDemands = true">本域待办需求</el-link>
        </el-badge>
        <el-link type="primary" class="manage-version" @click="emit('switchToVersion')">管理版本</el-link>
      </div>
    </div>

    <!-- Model Tabs (业务模型切换) -->
    <div class="model-tabs-bar">
      <div class="model-tabs">
        <div
          v-for="model in modelTabs"
          :key="model.key"
          class="model-tab"
          :class="{ active: activeModel === model.key }"
          @click="activeModel = model.key"
        >
          <span class="model-tab-icon"><el-icon><Document /></el-icon></span>
          <span class="model-tab-label">{{ model.label }}</span>
          <el-icon class="model-tab-close" @click.stop="closeModelTab(model.key)"><Close /></el-icon>
        </div>
      </div>
      <div class="model-tabs-extra">
        <el-icon class="add-model-icon" title="新增业务模型"><Plus /></el-icon>
      </div>
    </div>

    <!-- Sub tabs -->
    <div class="sub-tabs-bar">
      <div class="sub-tabs">
        <div
          v-for="tab in subTabs"
          :key="tab.key"
          class="sub-tab"
          :class="{ active: activeSubTab === tab.key }"
          @click="activeSubTab = tab.key"
        >
          {{ tab.label }}
        </div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <div class="filter-item">
        <span class="filter-label">名 称:</span>
        <el-input v-model="filterName" placeholder="输入关键字检索" clearable :prefix-icon="Search" style="width: 240px" size="small" />
      </div>
      <div class="filter-item">
        <span class="filter-label">状 态:</span>
        <el-select v-model="filterStatus" placeholder="请选择" clearable style="width: 120px" size="small">
          <el-option label="启用" value="启用" />
          <el-option label="未启用" value="未启用" />
          <el-option label="作废" value="作废" />
        </el-select>
      </div>
      <div v-if="activeSubTab === 'method'" class="filter-item">
        <span class="filter-label">技术类别:</span>
        <el-select v-model="filterTechCategory" placeholder="请选择" clearable style="width: 140px" size="small">
          <el-option label="批量保存" value="批量保存" />
          <el-option label="条件查询（返回单条）" value="条件查询（返回单条）" />
          <el-option label="全量查询（返回多条）" value="全量查询（返回多条）" />
          <el-option label="数据集" value="数据集" />
        </el-select>
      </div>
      <el-button type="primary" size="small">查询</el-button>
      <el-button size="small">重置</el-button>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <el-table
        v-if="activeSubTab === 'entity'"
        :data="entityList"
        border
        style="width: 100%"
        size="small"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column prop="name" label="实体名称" min-width="160" />
        <el-table-column prop="inherit" label="继承实体" width="120" />
        <el-table-column prop="type" label="实体类型" width="90" />
        <el-table-column prop="status" label="状态" width="80" />
        <el-table-column prop="creator" label="创建人" width="80" />
        <el-table-column prop="createTime" label="创建时间" width="140" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" size="small">编辑</el-button>
              <el-button v-if="row.name !== '门诊医嘱记录'" link type="danger" size="small">删除</el-button>
              <el-button link type="primary" size="small">血缘</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-table
        v-if="activeSubTab === 'method'"
        :data="methodList"
        border
        style="width: 100%"
        size="small"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="方法名称" min-width="180" />
        <el-table-column prop="enName" label="方法英文名称" min-width="200" />
        <el-table-column prop="bizCategory" label="业务分类" width="90" />
        <el-table-column prop="techCategory" label="技术类别" min-width="160" />
        <el-table-column prop="overridable" label="可覆写" width="70" align="center" />
        <el-table-column prop="creator" label="创建人" width="80" />
        <el-table-column prop="createTime" label="创建时间" width="140" />
        <el-table-column prop="status" label="状态" width="80" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" size="small">编辑</el-button>
              <el-button v-if="row.showGenApi" link type="primary" size="small">生成接口</el-button>
              <el-button link type="primary" size="small">血缘</el-button>
              <el-button link type="primary" size="small">服务编排</el-button>
              <el-button link type="danger" size="small">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- Placeholders for other tabs -->
      <el-table
        v-if="['interface','physical','event'].includes(activeSubTab)"
        :data="[]"
        border
        style="width: 100%"
        size="small"
      >
        <el-table-column label="暂无数据" min-width="200" />
      </el-table>
    </div>

    <!-- Pagination -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 30, 50]"
        layout="total, prev, pager, next, sizes"
        :total="activeSubTab === 'entity' ? 16 : 16"
        size="small"
      />
    </div>

    <!-- Bottom actions -->
    <div class="bottom-actions">
      <el-button type="primary" @click="submitModelVisible = true">提交模型</el-button>
      <el-button type="primary">新增</el-button>
      <el-button type="danger">批量删除</el-button>
    </div>

    <SubmitModelDialog v-model="submitModelVisible" :domain-name="props.domainName" />

    <!-- 本域待办需求弹窗 -->
    <el-dialog v-model="showDomainDemands" :title="props.domainName + ' - 待办需求'" width="800px" align-center>
      <el-table :data="domainDemandList" border size="small" style="width: 100%" max-height="400">
        <el-table-column prop="id" label="编号" width="120" />
        <el-table-column prop="type" label="类型" width="60">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === '新增' ? 'success' : 'warning'">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="需求标题" min-width="160" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="row.priority === 'P0' || row.priority === '高' ? 'danger' : 'warning'">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80" />
        <el-table-column prop="scope" label="范围" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="row.scope === '跨组' ? 'danger' : 'info'">{{ row.scope }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="planTime" label="计划完成" width="105" />
      </el-table>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showDomainDemands = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Close, Search, Plus, Document } from '@element-plus/icons-vue';
import { demandList } from '../utils/mockData';
import SubmitModelDialog from './SubmitModelDialog.vue';

const props = defineProps<{
  domainName: string;
}>();
const emit = defineEmits<{
  (e: 'switchToVersion'): void;
}>();

const modelTabs = ref([
  { key: 'order-info', label: '医嘱信息' },
  { key: 'herbal-rx', label: '草药处方' },
  { key: 'skin-test', label: '皮试记录' },
  { key: 'exam-apply', label: '检查申请' },
  { key: 'lab-apply', label: '检验申请' },
]);
const activeModel = ref('order-info');

function closeModelTab(key: string) {
  const idx = modelTabs.value.findIndex(m => m.key === key);
  if (idx === -1) return;
  modelTabs.value.splice(idx, 1);
  if (activeModel.value === key && modelTabs.value.length) {
    activeModel.value = modelTabs.value[Math.max(0, idx - 1)].key;
  }
}

const subTabs = [
  { key: 'entity', label: '实体建模' },
  { key: 'method', label: '方法建模' },
  { key: 'interface', label: '接口建模' },
  { key: 'physical', label: '物理建模' },
  { key: 'event', label: '事件建模' },
];

const activeSubTab = ref('entity');
const designBranch = ref('main');
const selectedVersion = ref('main-V1.3.7');
const filterName = ref('');
const filterStatus = ref('');
const filterTechCategory = ref('');
const pageNum = ref(1);
const pageSize = ref(30);
const showDomainDemands = ref(false);
const submitModelVisible = ref(false);
const domainDemandList = computed(() => demandList.filter(d => {
  const domains = d.bizDomains.split(/[+、,]/).map(s => s.trim());
  return domains.includes(props.domainName) || d.page.includes(props.domainName.replace('域', ''));
}));
const domainDemandCount = computed(() => domainDemandList.value.filter(d => ['提出', '已设计', '开发中'].includes(d.status)).length);

const entityMap: Record<string, any[]> = {
  '医嘱域': [
    { name: '门诊医嘱记录', inherit: '标准记录实体', type: '主实体', status: '启用', creator: '陈xx', createTime: '2025-08-28 11:27:50' },
    { name: '门诊草药医嘱记录', inherit: '门诊医嘱记录', type: '子实体', status: '启用', creator: '张xx', createTime: '2026-03-12 14:30:00' },
    { name: '门诊西成药医嘱记录', inherit: '门诊医嘱记录', type: '子实体', status: '启用', creator: '陈xx', createTime: '2025-12-08 16:13:02' },
    { name: '门诊检查医嘱明细记录', inherit: '门诊医嘱记录', type: '子实体', status: '启用', creator: '刘xx', createTime: '2025-08-28 10:49:07' },
    { name: '门诊检验医嘱明细记录', inherit: '门诊医嘱记录', type: '子实体', status: '未启用', creator: '王xx', createTime: '2026-01-15 09:20:00' },
    { name: '门诊材料医嘱明细记录', inherit: '门诊医嘱记录', type: '子实体', status: '启用', creator: '陈xx', createTime: '2026-02-15 08:55:12' },
    { name: '门诊医嘱医保记录', inherit: '门诊医嘱记录', type: '子实体', status: '启用', creator: '刘xx', createTime: '2025-11-04 11:23:23' },
    { name: '门诊草药辅料记录', inherit: '标准记录实体', type: '子实体', status: '启用', creator: '张xx', createTime: '2026-03-10 10:15:00' },
    { name: '门诊皮试记录', inherit: '标准记录实体', type: '子实体', status: '未启用', creator: '李xx', createTime: '2026-03-08 09:10:00' },
    { name: '门诊医嘱发送日志', inherit: '-', type: '子实体', status: '作废', creator: '赵xx', createTime: '2025-06-20 16:40:00' },
  ],
  '就诊域': [
    { name: '门诊就诊记录', inherit: '标准记录实体', type: '主实体', status: '启用', creator: '郑xx', createTime: '2025-09-10 09:30:00' },
    { name: '挂号记录', inherit: '门诊就诊记录', type: '子实体', status: '启用', creator: '陈xx', createTime: '2025-10-15 14:20:00' },
    { name: '排队叫号记录', inherit: '标准记录实体', type: '子实体', status: '启用', creator: '王xx', createTime: '2026-01-20 10:00:00' },
    { name: '分诊记录', inherit: '门诊就诊记录', type: '子实体', status: '未启用', creator: '李xx', createTime: '2026-02-10 11:30:00' },
    { name: '就诊轨迹记录', inherit: '标准记录实体', type: '子实体', status: '启用', creator: '郑xx', createTime: '2026-03-05 16:00:00' },
  ],
  '门诊收费域': [
    { name: '门诊收费记录', inherit: '标准记录实体', type: '主实体', status: '启用', creator: '陈xx', createTime: '2025-08-15 10:00:00' },
    { name: '门诊退费记录', inherit: '门诊收费记录', type: '子实体', status: '启用', creator: '吴xx', createTime: '2026-01-10 09:00:00' },
    { name: '发票记录', inherit: '标准记录实体', type: '子实体', status: '启用', creator: '陈xx', createTime: '2025-11-20 14:30:00' },
    { name: '结算记录', inherit: '门诊收费记录', type: '子实体', status: '启用', creator: '陈xx', createTime: '2025-12-25 11:00:00' },
    { name: '收费项目明细', inherit: '门诊收费记录', type: '子实体', status: '未启用', creator: '许xx', createTime: '2026-02-28 15:00:00' },
  ],
};

const methodMap: Record<string, any[]> = {
  '医嘱域': [
    { name: '校验门诊医嘱开单信息', enName: 'validateOutpOrderIssueInfo', bizCategory: '业务类', techCategory: '批量保存', overridable: '是', creator: '陈xx', createTime: '2025-08-28 11:27:50', status: '启用', showGenApi: true },
    { name: '校验患者皮试信息', enName: 'validatePatientSkinTestInfo', bizCategory: '业务类', techCategory: '条件查询（返回单条）', overridable: '是', creator: '李xx', createTime: '2026-03-10 09:20:15', status: '启用', showGenApi: false },
    { name: '获取门诊历史医嘱明细', enName: 'getOutpHistOrderDetail', bizCategory: '业务类', techCategory: '全量查询（返回多条）', overridable: '否', creator: '刘xx', createTime: '2025-08-28 10:49:07', status: '启用', showGenApi: true },
    { name: '获取门诊医嘱模板明细', enName: 'getOutpOrderTmplDetail', bizCategory: '业务类', techCategory: '条件查询（返回单条）', overridable: '否', creator: '刘xx', createTime: '2025-12-08 16:13:02', status: '启用', showGenApi: true },
    { name: '更新门诊医嘱发送状态', enName: 'updateOutpOrderSendState', bizCategory: '业务类', techCategory: '批量保存', overridable: '是', creator: '李xx', createTime: '2026-03-08 10:15:22', status: '启用', showGenApi: false },
    { name: '获取门诊药品医嘱列表', enName: 'getOutpDrugOrderList', bizCategory: '数据集', techCategory: '数据集', overridable: '否', creator: '陈xx', createTime: '2026-02-20 16:40:08', status: '启用', showGenApi: true },
    { name: '获取门诊草药医嘱列表', enName: 'getOutpHerbOrderList', bizCategory: '数据集', techCategory: '数据集', overridable: '否', creator: '张xx', createTime: '2026-03-12 14:30:00', status: '启用', showGenApi: true },
    { name: '门诊医嘱批量保存', enName: 'batchSaveOutpOrder', bizCategory: '业务类', techCategory: '批量保存', overridable: '是', creator: '陈xx', createTime: '2025-11-04 11:23:23', status: '未启用', showGenApi: false },
    { name: '撤销门诊医嘱', enName: 'cancelOutpOrder', bizCategory: '业务类', techCategory: '单条保存', overridable: '否', creator: '王xx', createTime: '2026-01-10 08:30:00', status: '作废', showGenApi: false },
  ],
  '就诊域': [
    { name: '患者挂号登记', enName: 'registerPatient', bizCategory: '业务类', techCategory: '单条保存', overridable: '否', creator: '郑xx', createTime: '2025-09-10 10:00:00', status: '启用', showGenApi: true },
    { name: '获取就诊队列', enName: 'getVisitQueue', bizCategory: '业务类', techCategory: '全量查询（返回多条）', overridable: '否', creator: '陈xx', createTime: '2025-10-20 14:00:00', status: '启用', showGenApi: false },
    { name: '分诊叫号', enName: 'triageCallNumber', bizCategory: '业务类', techCategory: '单条保存', overridable: '是', creator: '王xx', createTime: '2026-01-25 09:30:00', status: '启用', showGenApi: true },
    { name: '查询就诊轨迹', enName: 'queryVisitTrace', bizCategory: '数据集', techCategory: '数据集', overridable: '否', creator: '郑xx', createTime: '2026-03-10 11:00:00', status: '启用', showGenApi: true },
    { name: '退号处理', enName: 'refundRegistration', bizCategory: '业务类', techCategory: '批量保存', overridable: '否', creator: '李xx', createTime: '2026-02-15 16:00:00', status: '未启用', showGenApi: false },
  ],
  '门诊收费域': [
    { name: '门诊费用计算', enName: 'calcOutpatientFee', bizCategory: '业务类', techCategory: '单条保存', overridable: '否', creator: '陈xx', createTime: '2025-08-20 10:00:00', status: '启用', showGenApi: true },
    { name: '收费结算', enName: 'chargeSettlement', bizCategory: '业务类', techCategory: '批量保存', overridable: '否', creator: '陈xx', createTime: '2025-09-30 14:30:00', status: '启用', showGenApi: true },
    { name: '退费处理', enName: 'refundProcess', bizCategory: '业务类', techCategory: '批量保存', overridable: '是', creator: '吴xx', createTime: '2026-01-15 09:00:00', status: '启用', showGenApi: false },
    { name: '发票打印', enName: 'printInvoice', bizCategory: '业务类', techCategory: '单条保存', overridable: '否', creator: '陈xx', createTime: '2025-11-25 11:00:00', status: '启用', showGenApi: true },
    { name: '费用明细查询', enName: 'queryFeeDetail', bizCategory: '数据集', techCategory: '数据集', overridable: '否', creator: '许xx', createTime: '2026-02-20 15:00:00', status: '未启用', showGenApi: true },
    { name: '冲销结算', enName: 'reverseSettlement', bizCategory: '业务类', techCategory: '批量保存', overridable: '是', creator: '陈xx', createTime: '2026-03-01 10:00:00', status: '启用', showGenApi: false },
  ],
};

const entityList = computed(() => entityMap[props.domainName] || entityMap['医嘱域']);
const methodList = computed(() => methodMap[props.domainName] || methodMap['医嘱域']);

function handleSelectionChange(_val: any[]) {
  // placeholder
}
</script>

<style scoped>
.domain-design {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.domain-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f6f7fb;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.domain-info-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.domain-version-title {
  font-size: 16px;
  font-weight: 600;
  color: #262626;
}
.domain-meta-item {
  font-size: 12px;
  color: #8c8c8c;
}
.domain-info-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.branch-label {
  font-size: 13px;
  color: #595959;
}

.model-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
}
.model-tabs {
  display: flex;
  gap: 4px;
}
.model-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: #595959;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  margin-bottom: -1px;
  border-radius: 4px 4px 0 0;
}
.model-tab:hover {
  color: #2b5ffa;
  background: #f5f7fa;
}
.model-tab.active {
  color: #2b5ffa;
  border-bottom-color: #2b5ffa;
  background: #f0f5ff;
  font-weight: 500;
}
.model-tab-icon {
  font-size: 14px;
  color: #8c8c8c;
}
.model-tab.active .model-tab-icon {
  color: #2b5ffa;
}
.model-tab-close {
  font-size: 12px;
  color: #bfbfbf;
  margin-left: 2px;
  padding: 2px;
  border-radius: 50%;
  transition: all 0.2s;
}
.model-tab-close:hover {
  color: #f56c6c;
  background: #fff0f0;
}
.model-tabs-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-model-icon {
  font-size: 16px;
  color: #8c8c8c;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.add-model-icon:hover {
  color: #2b5ffa;
  background: #f0f5ff;
}

.sub-tabs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
}
.sub-tabs {
  display: flex;
}
.sub-tab {
  padding: 10px 16px;
  font-size: 13px;
  color: #595959;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  margin-bottom: -1px;
}
.sub-tab:hover {
  color: #2b5ffa;
}
.sub-tab.active {
  color: #2b5ffa;
  border-bottom-color: #2b5ffa;
  font-weight: 500;
}
.version-area {
  display: flex;
  align-items: center;
  gap: 10px;
}
.manage-version {
  font-size: 13px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #e8e8e8;
  background: #f5f7fa;
  flex-shrink: 0;
}
.filter-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-label {
  font-size: 13px;
  color: #595959;
  white-space: nowrap;
}

.table-wrap {
  flex: 1;
  padding: 0 16px;
  overflow: auto;
  background: #fff;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid #e8e8e8;
  background: #fff;
  flex-shrink: 0;
}

.bottom-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 16px 12px;
  background: #fff;
  flex-shrink: 0;
}
</style>
