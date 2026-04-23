<template>
  <div class="demand-board">
    <!-- 需求/BUG 切换 -->
    <div class="kind-switch-bar">
      <el-radio-group v-model="kind" size="small">
        <el-radio-button label="demand">需求</el-radio-button>
        <el-radio-button label="bug">BUG</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 业务域切换栏 -->
    <div class="group-tabs-bar">
      <div
        v-for="d in domainTabs"
        :key="d.key"
        class="group-tab"
        :class="{ active: activeDomain === d.key }"
        @click="activeDomain = d.key"
      >
        <span>{{ d.label }}</span>
        <el-tag size="small" :type="d.key === activeDomain ? 'primary' : 'info'" class="group-count">
          {{ d.count }}
        </el-tag>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="demand-filter-bar">
      <el-radio-group v-model="scopeFilter" size="small">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="internal">域内</el-radio-button>
        <el-radio-button label="cross">跨域</el-radio-button>
      </el-radio-group>
      <el-select v-model="statusFilter" size="small" clearable placeholder="状态" style="width: 110px">
        <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
      </el-select>
      <el-select v-model="priorityFilter" size="small" clearable placeholder="优先级" style="width: 100px">
        <el-option v-for="p in priorityOptions" :key="p" :label="p" :value="p" />
      </el-select>
      <el-input v-model="keyword" size="small" placeholder="搜索标题/编号" clearable style="width: 200px" :prefix-icon="Search" />
    </div>

    <!-- 需求表格 -->
    <div v-if="kind === 'demand'" class="demand-table-wrap">
      <el-table :data="filteredDemands" border size="small" style="width: 100%" height="100%">
        <el-table-column prop="id" label="编号" width="125" />
        <el-table-column prop="page" label="页面/模块" width="100" />
        <el-table-column prop="type" label="类型" width="60">
          <template #default="{ row }">
            <el-tag size="small" :type="row.type === '新增' ? 'success' : 'warning'">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="需求" min-width="180" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityTagType(row.priority)">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="85">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="iteration" label="迭代版本" width="95" />
        <el-table-column prop="bizDomains" label="业务域协作" width="115" show-overflow-tooltip />
        <el-table-column label="前后端" width="75" align="center">
          <template #default="{ row }">
            <span v-if="row.frontend && row.backend" class="scope-tag both">前后端</span>
            <span v-else-if="row.frontend" class="scope-tag fe">前端</span>
            <span v-else-if="row.backend" class="scope-tag be">后端</span>
            <span v-else class="scope-tag none">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="frontendEstDays" label="前端估时" width="75" align="center" />
        <el-table-column prop="scope" label="范围" width="70">
          <template #default="{ row }">
            <el-tag size="small" :type="row.scope === '跨组' ? 'danger' : 'info'">{{ row.scope }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="80" />
        <el-table-column prop="planTime" label="计划完成" width="105" />
        <el-table-column min-width="1" />
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- BUG 表格 -->
    <div v-else class="demand-table-wrap">
      <el-table :data="filteredBugs" border size="small" style="width: 100%" height="100%">
        <el-table-column prop="bugNo" label="BUG号" width="130" />
        <el-table-column prop="version" label="版本号" width="130" />
        <el-table-column prop="desc" label="BUG描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="bugStatusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="80" />
        <el-table-column prop="updateTime" label="变更时间" width="140" />
        <el-table-column min-width="1" />
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openBugDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-action-bar">
      <el-button type="primary" size="small">{{ kind === 'demand' ? '新建需求' : '新建BUG' }}</el-button>
      <el-button size="small">导出清单</el-button>
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="需求详情" width="520px" align-center>
      <div class="detail-body">
        <div v-for="item in detailItems" :key="item.label" class="detail-row">
          <div class="detail-label">{{ item.label }}</div>
          <div class="detail-value">{{ item.value || '-' }}</div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- BUG 详情弹窗 -->
    <el-dialog v-model="bugDetailVisible" title="BUG详情" width="520px" align-center>
      <div class="detail-body">
        <div v-for="item in bugDetailItems" :key="item.label" class="detail-row">
          <div class="detail-label">{{ item.label }}</div>
          <div class="detail-value">{{ item.value || '-' }}</div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="bugDetailVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { demandList, bugFixList, type DemandItem, type BugFixItem } from '../utils/mockData';

const kind = ref<'demand' | 'bug'>('demand');

// 业务域列表（从需求数据中提取唯一域）
const allDomains = computed(() => {
  const set = new Set<string>();
  demandList.forEach(d => {
    d.bizDomains.split(/[+、,]/).forEach(s => {
      const domain = s.trim();
      if (domain) set.add(domain);
    });
  });
  return Array.from(set).sort();
});

const activeDomain = ref('');

const domainTabs = computed(() => {
  const tabs = allDomains.value.map(d => {
    const count = demandList.filter(item => {
      const domains = item.bizDomains.split(/[+、,]/).map(s => s.trim());
      return domains.includes(d);
    }).length;
    return { key: d, label: d, count };
  });
  // 默认选中第一个
  if (tabs.length && !activeDomain.value) {
    activeDomain.value = tabs[0].key;
  }
  return tabs;
});

const scopeFilter = ref('all');
const statusFilter = ref('');
const priorityFilter = ref('');
const keyword = ref('');

const statusOptions = ['提出', '已设计', '开发中', '测试中', '已上线', '暂缓', '已完成', '设计完成', '产品验收'];
const priorityOptions = ['P0', 'P1', 'P2', '高', '中', '低'];

const filteredDemands = computed(() => {
  if (!activeDomain.value) return [];
  return demandList.filter(d => {
    const domains = d.bizDomains.split(/[+、,]/).map(s => s.trim());
    if (!domains.includes(activeDomain.value)) return false;
    if (scopeFilter.value === 'internal' && d.scope !== '组内') return false;
    if (scopeFilter.value === 'cross' && d.scope !== '跨组') return false;
    if (statusFilter.value && d.status !== statusFilter.value) return false;
    if (priorityFilter.value && d.priority !== priorityFilter.value) return false;
    if (keyword.value) {
      const k = keyword.value.toLowerCase();
      return d.title.toLowerCase().includes(k) || d.id.toLowerCase().includes(k) || d.page.toLowerCase().includes(k);
    }
    return true;
  });
});

const filteredBugs = computed(() => {
  return bugFixList.filter(b => {
    if (keyword.value) {
      const k = keyword.value.toLowerCase();
      return b.desc.toLowerCase().includes(k) || b.bugNo.toLowerCase().includes(k);
    }
    return true;
  });
});

function priorityTagType(p: string) {
  if (p === 'P0' || p === '高') return 'danger';
  if (p === 'P1' || p === '中') return 'warning';
  return 'info';
}

function statusTagType(s: string) {
  if (['已上线', '已完成', '产品验收'].includes(s)) return 'success';
  if (['开发中', '测试中'].includes(s)) return 'primary';
  if (['已设计', '设计完成'].includes(s)) return 'warning';
  if (s === '暂缓') return 'info';
  return '';
}

function bugStatusType(s: string) {
  if (s === '研发中') return 'warning';
  if (s === '研发完成') return 'success';
  return 'info';
}

// 详情弹窗
const detailVisible = ref(false);
const currentRow = ref<DemandItem | null>(null);

const detailItems = computed(() => {
  const r = currentRow.value;
  if (!r) return [];
  return [
    { label: '需求编号', value: r.id },
    { label: '所属小组', value: r.group },
    { label: '需求范围', value: r.scope },
    { label: '页面/模块', value: r.page },
    { label: '需求类型', value: r.type },
    { label: '需求标题', value: r.title },
    { label: '需求描述', value: r.desc },
    { label: '优先级', value: r.priority },
    { label: '当前状态', value: r.status },
    { label: '迭代版本', value: r.iteration },
    { label: '业务域协作', value: r.bizDomains },
    { label: '前后端范围', value: r.frontend && r.backend ? '前后端' : r.frontend ? '前端' : r.backend ? '后端' : '-' },
    { label: '前端估时', value: String(r.frontendEstDays) },
    { label: '负责人', value: r.owner },
    { label: '计划完成时间', value: r.planTime },
    { label: '关联版本', value: r.relatedVersion || '-' },
    { label: '提出人', value: r.creator },
    { label: '提出时间', value: r.createTime },
  ];
});

function openDetail(row: DemandItem) {
  currentRow.value = row;
  detailVisible.value = true;
}

// BUG 详情
const bugDetailVisible = ref(false);
const currentBug = ref<BugFixItem | null>(null);

const bugDetailItems = computed(() => {
  const r = currentBug.value;
  if (!r) return [];
  return [
    { label: 'BUG号', value: r.bugNo },
    { label: '版本号', value: r.version },
    { label: 'BUG描述', value: r.desc },
    { label: '状态', value: r.status },
    { label: '操作人', value: r.operator },
    { label: '变更时间', value: r.updateTime },
  ];
});

function openBugDetail(row: BugFixItem) {
  currentBug.value = row;
  bugDetailVisible.value = true;
}
</script>

<style scoped>
.demand-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 16px;
  overflow: hidden;
}

.kind-switch-bar {
  padding: 10px 0 6px;
  flex-shrink: 0;
}

.group-tabs-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
  max-height: 110px;
  overflow-y: auto;
}
.group-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: #595959;
  cursor: pointer;
  border-radius: 4px;
  background: #f5f5f5;
  transition: all 0.2s;
}
.group-tab:hover {
  background: #e6f7ff;
  color: #1890ff;
}
.group-tab.active {
  background: #2b5ffa;
  color: #fff;
  font-weight: 500;
}
.group-count {
  margin-left: 2px;
}

.demand-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  flex-shrink: 0;
}

.demand-table-wrap {
  flex: 1;
  overflow: hidden;
}

.scope-tag {
  font-size: 11px;
  padding: 0 4px;
  border-radius: 2px;
  line-height: 16px;
  display: inline-block;
}
.scope-tag.both { background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; }
.scope-tag.fe { background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
.scope-tag.be { background: #fff7e6; color: #fa8c16; border: 1px solid #ffd591; }
.scope-tag.none { color: #bfbfbf; }

.bottom-action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 10px 0 12px;
  flex-shrink: 0;
  border-top: 1px solid #e8e8e8;
  margin-top: 8px;
}

.detail-body {
  padding: 4px 8px;
}
.detail-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}
.detail-row:last-child {
  border-bottom: none;
}
.detail-label {
  width: 110px;
  color: #8c8c8c;
  flex-shrink: 0;
}
.detail-value {
  flex: 1;
  color: #262626;
  word-break: break-all;
}
</style>
