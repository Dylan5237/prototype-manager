<template>
  <div class="app-wrapper">
    <!-- Top Header -->
    <div class="top-header">
      <div class="header-left">
        <div class="logo-box">
          <el-icon :size="20" color="#fff"><OfficeBuilding /></el-icon>
        </div>
        <span class="header-prefix">医院</span>
        <span class="header-tab active">建模开发平台</span>
      </div>
      <div class="header-right">
        <div class="header-icon-btn">
          <el-icon :size="18" color="#fff"><Bell /></el-icon>
        </div>
        <div class="user-info">
          <el-avatar :size="24" src="https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png" />
          <span class="user-name">管理员</span>
          <el-icon :size="12" color="rgba(255,255,255,0.8)"><ArrowDown /></el-icon>
        </div>
        <el-icon :size="16" color="rgba(255,255,255,0.8)" class="header-icon"><Lock /></el-icon>
        <el-icon :size="16" color="rgba(255,255,255,0.8)" class="header-icon"><Setting /></el-icon>
      </div>
    </div>

    <!-- Main Body -->
    <div class="main-body">
      <!-- Global Sidebar -->
      <div class="global-sidebar">
        <div class="nav-group">
          <div class="nav-item has-children">
            <el-icon><Collection /></el-icon>
            <span>产品设计平台</span>
            <el-icon class="arrow-icon"><ArrowDown /></el-icon>
          </div>
          <div class="sub-nav">
            <div class="sub-item">业务域设计</div>
            <div class="sub-item">规则建模</div>
            <div class="sub-item">连接集成</div>
            <div class="sub-item">业务提示语</div>
            <div class="sub-item">血缘关系</div>
            <div class="sub-item">血缘日志</div>
            <div class="sub-item active">版本管理</div>
          </div>
        </div>
        <div class="nav-group">
          <div class="nav-item has-children">
            <el-icon><Document /></el-icon>
            <span>标准管理平台</span>
            <el-icon class="arrow-icon"><ArrowRight /></el-icon>
          </div>
        </div>
      </div>

      <!-- Content Area -->
      <div class="content-area">
        <!-- Page Tabs -->
        <div class="page-tabs">
          <div
            class="tab-item"
            :class="{ active: activePageTab === 'version' }"
            @click="activePageTab = 'version'"
          >
            <span>版本发布管理</span>
            <el-icon class="close-icon"><Close /></el-icon>
          </div>
          <div
            class="tab-item"
            :class="{ active: activePageTab === 'design' }"
            @click="activePageTab = 'design'"
          >
            <span>业务域设计</span>
            <el-icon class="close-icon"><Close /></el-icon>
          </div>
        </div>

        <!-- Page Content -->
        <div class="page-content">
          <!-- Left Tree Panel -->
          <div class="tree-panel">
            <el-input v-model="treeKeyword" placeholder="输入关键字检索" :prefix-icon="Search" clearable />
            <div class="tree-wrap">
              <div class="tree-node">
                <span class="tree-toggle"><el-icon><ArrowDown /></el-icon></span>
                <span class="node-icon domain"><el-icon><OfficeBuilding /></el-icon></span>
                <span class="node-label">智业业务域</span>
              </div>
              <div class="tree-children">
                <div class="tree-node">
                  <span class="tree-toggle"><el-icon><ArrowDown /></el-icon></span>
                  <span class="node-icon layer"><el-icon><Folder /></el-icon></span>
                  <span class="node-label">业务活动层</span>
                </div>
                <div class="tree-children">
                  <div class="tree-node">
                    <span class="tree-toggle"><el-icon><ArrowDown /></el-icon></span>
                    <span class="node-icon layer"><el-icon><Folder /></el-icon></span>
                    <span class="node-label">临床业务</span>
                  </div>
                  <div class="tree-children">
                    <div class="tree-node leaf">
                      <span class="tree-indent"></span>
                      <span class="node-icon leaf-icon"><el-icon><Document /></el-icon></span>
                      <span class="node-label">诊断域</span>
                    </div>
                    <div class="tree-node leaf">
                      <span class="tree-indent"></span>
                      <span class="node-icon leaf-icon"><el-icon><Document /></el-icon></span>
                      <span class="node-label">就诊域</span>
                    </div>
                    <div
                      class="tree-node leaf"
                      :class="{ active: activePageTab === 'design' }"
                      @click="activePageTab = 'design'"
                    >
                      <span class="tree-indent"></span>
                      <span class="node-icon leaf-icon"><el-icon><Document /></el-icon></span>
                      <span class="node-label">医嘱域</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Detail Panel -->
          <div class="detail-panel">
            <template v-if="activePageTab === 'version'">
              <div class="version-layout">
                <div class="version-content">
                  <!-- Domain Header -->
                  <div class="domain-header">
                    <div class="domain-title-row">
                      <span class="domain-name" @click="activePageTab = 'design'">医嘱域</span>
                    </div>
                    <div class="domain-meta">
                      <span>创建时间：2026-03-13 15:00:09</span>
                    </div>
                    <div class="domain-tags">
                      <el-tag v-for="i in 12" :key="i" type="info" effect="plain" size="small" class="info-tag">业务域基础信息</el-tag>
                    </div>
                  </div>

                  <!-- Main Tabs -->
                  <el-tabs v-model="activeMainTab" type="border-card" class="main-tabs">
                    <!-- 概览 -->
                    <el-tab-pane label="概览" name="overview">
                      <div class="overview-body">
                        <div class="overview-nav">
                          <div
                            v-for="item in overviewNavs"
                            :key="item.key"
                            class="overview-nav-item"
                            :class="{ active: overviewSubTab === item.key }"
                            @click="overviewSubTab = item.key"
                          >
                            <div class="nav-text">{{ item.label }}</div>
                          </div>
                        </div>
                        <div class="overview-table-wrap">
                          <!-- 版本切换栏（仅概览） -->
                          <div class="overview-version-bar">
                            <div class="overview-version-left">
                              <span class="overview-version-label">当前版本：</span>
                              <el-select v-model="selectedVersionId" size="small" style="width: 180px">
                                <el-option
                                  v-for="v in versionList"
                                  :key="v.id"
                                  :label="v.name"
                                  :value="v.id"
                                >
                                  <span style="float: left">{{ v.name }}</span>
                                  <el-tag
                                    size="small"
                                    :type="v.tag === '最新' ? 'success' : 'info'"
                                    style="float: right; margin-top: 2px;"
                                  >{{ v.tag }}</el-tag>
                                </el-option>
                              </el-select>
                            </div>
                            <div class="overview-version-right">
                              <span class="overview-version-time">创建时间：{{ selectedVersion.createTime }}</span>
                            </div>
                          </div>

                          <!-- 变更记录 -->
                          <el-table v-if="overviewSubTab === 'changes'" :data="currentChangeRecords" border style="width: 100%" size="small" height="100%">
                            <el-table-column prop="type" label="变更类型" width="80" />
                            <el-table-column prop="object" label="变更对象" min-width="180" />
                            <el-table-column prop="model" label="所属模型" width="100" />
                            <el-table-column prop="detail" label="变更详情" min-width="200" show-overflow-tooltip />
                            <el-table-column prop="operator" label="操作人" width="80" />
                            <el-table-column prop="time" label="变更时间" width="140" />
                            <el-table-column label="操作" width="80" fixed="right">
                              <template #default="{ row }">
                                <el-button link type="primary" size="small" @click="openDetail('change', row)">查看详情</el-button>
                              </template>
                            </el-table-column>
                          </el-table>

                          <!-- 外部依赖 -->
                          <template v-if="overviewSubTab === 'dependencies'">
                            <div class="sub-pane-flex">
                              <div class="scroll-table-area">
                                <el-table :data="currentDependencies" border style="width: 100%" size="small">
                                  <el-table-column prop="service" label="微服务名称" width="110" />
                                  <el-table-column prop="versionRange" label="兼容版本范围" width="120" />
                                  <el-table-column prop="desc" label="描述" width="90" />
                                  <el-table-column prop="status" label="兼容状态" width="80" />
                                  <el-table-column prop="time" label="变更时间" width="140" />
                                  <el-table-column min-width="1" />
                                  <el-table-column label="操作" width="80" fixed="right">
                                    <template #default="{ row }">
                                      <el-button link type="primary" size="small" @click="openDetail('dependency', row)">查看详情</el-button>
                                    </template>
                                  </el-table-column>
                                </el-table>
                              </div>
                              <div class="bottom-action-bar">
                                <el-button type="primary" @click="addDepVisible = true">添加依赖</el-button>
                              </div>
                            </div>
                          </template>

                          <!-- 对外能力 -->
                          <el-table v-if="overviewSubTab === 'capabilities'" :data="currentCapabilities" border style="width: 100%" size="small" height="100%">
                            <el-table-column prop="name" label="能力名称" min-width="180" />
                            <el-table-column prop="type" label="能力类型" width="90" />
                            <el-table-column prop="desc" label="能力描述" min-width="160" show-overflow-tooltip />
                            <el-table-column prop="status" label="可用状态" width="90" />
                            <el-table-column prop="time" label="变更时间" width="140" />
                            <el-table-column label="操作" width="80" fixed="right">
                              <template #default="{ row }">
                                <el-button link type="primary" size="small" @click="openDetail('capability', row)">查看详情</el-button>
                              </template>
                            </el-table-column>
                          </el-table>

                          <!-- 基础数据 -->
                          <el-table v-if="overviewSubTab === 'basicData'" :data="currentBasicDataList" border style="width: 100%" size="small" height="100%">
                            <el-table-column prop="name" label="基础数据名称" min-width="160" />
                            <el-table-column prop="type" label="基础数据类型" width="110" />
                            <el-table-column prop="code" label="数据编码" width="140" />
                            <el-table-column prop="operator" label="操作人" width="80" />
                            <el-table-column prop="time" label="变更时间" width="140" />
                            <el-table-column label="操作" width="80" fixed="right">
                              <template #default="{ row }">
                                <el-button link type="primary" size="small" @click="openDetail('basicData', row)">查看详情</el-button>
                              </template>
                            </el-table-column>
                          </el-table>
                        </div>
                      </div>
                    </el-tab-pane>

                    <!-- 发布管理 -->
                    <el-tab-pane label="发布记录" name="release">
                      <div class="tab-pane-body">
                        <div class="scroll-table-area">
                          <el-table :data="releaseList" border style="width: 100%" size="small">
                            <el-table-column prop="branch" label="分支类型" width="90" />
                            <el-table-column prop="version" label="版本号" width="140" />
                            <el-table-column prop="desc" label="版本描述" min-width="260" show-overflow-tooltip />
                            <el-table-column prop="operator" label="操作人" width="80" />
                            <el-table-column prop="time" label="变更时间" width="140" />
                            <el-table-column label="操作" width="80" fixed="right">
                              <template #default="{ row }">
                                <el-button link type="primary" size="small" @click="openDetail('release', row)">查看详情</el-button>
                              </template>
                            </el-table-column>
                          </el-table>
                        </div>
                        <div class="bottom-action-bar">
                          <el-button type="primary" @click="createReleaseVisible = true">提交测试</el-button>
                        </div>
                      </div>
                    </el-tab-pane>

                    <!-- BUG修复 -->
                    <el-tab-pane label="BUG修复" name="bugfix">
                      <div class="tab-pane-body">
                        <div class="bugfix-toolbar">
                          <el-radio-group v-model="interactionMode" size="small">
                            <el-radio-button :label="1">交互一（结构化对比）</el-radio-button>
                            <el-radio-button :label="2">交互二（表单三栏对比）</el-radio-button>
                          </el-radio-group>
                        </div>
                        <div class="scroll-table-area">
                          <el-table :data="bugFixList" border style="width: 100%" size="small">
                            <el-table-column prop="bugNo" label="BUG号" width="140" />
                            <el-table-column prop="version" label="版本号" width="140" />
                            <el-table-column prop="desc" label="BUG描述" min-width="200" show-overflow-tooltip />
                            <el-table-column prop="status" label="状态" width="80">
                              <template #default="{ row }">
                                <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
                              </template>
                            </el-table-column>
                            <el-table-column prop="operator" label="操作人" width="80" />
                            <el-table-column prop="updateTime" label="变更时间" width="140" />
                            <el-table-column label="操作" width="110" fixed="right">
                              <template #default="{ row }">
                                <div class="action-btns">
                                  <el-button link type="primary" size="small" @click="openDetail('bug', row)">查看</el-button>
                                  <el-button
                                    v-if="row.status === '研发完成'"
                                    link
                                    type="danger"
                                    size="small"
                                    @click="openMerge(row)"
                                  >合并</el-button>
                                </div>
                              </template>
                            </el-table-column>
                          </el-table>
                        </div>
                        <div class="bottom-action-bar">
                          <el-button type="primary" @click="createBugVisible = true">新建BUG</el-button>
                        </div>
                      </div>
                    </el-tab-pane>
                  </el-tabs>
                </div>
              </div>
            </template>
            <DomainDesign v-else @switch-to-version="activePageTab = 'version'" />
          </div>
        </div>
      </div>
    </div>

    <!-- Existing merge dialogs (preserved functionality) -->
    <MergeDialog
      v-model="mergeVisible"
      hotfix-name="v2.0.2-bugfix"
      :base="baseModel"
      :main="mainModel"
      :hotfix="hotfixModel"
      @merged="onMerged"
    />
    <MergeDialogMode2
      v-model="merge2Visible"
      hotfix-name="v2.0.2-bugfix"
      :base="baseModel"
      :main="mainModel"
      :hotfix="hotfixModel"
      @merged="onMerged"
    />

    <!-- New dialogs -->
    <CreateReleaseDialog v-model="createReleaseVisible" />
    <CreateBugDialog v-model="createBugVisible" />
    <AddDependencyDialog v-model="addDepVisible" />

    <!-- 通用详情弹窗 -->
    <el-dialog v-model="detailDialogVisible" :title="detailTitle" width="520px" align-center>
      <div class="detail-body">
        <div v-for="item in detailItems" :key="item.label" class="detail-row">
          <div class="detail-label">{{ item.label }}</div>
          <div class="detail-value">{{ item.value || '-' }}</div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="detailDialogVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Bell, Collection, Document, ArrowDown, ArrowRight,
  Search, OfficeBuilding, Folder, Close, Lock, Setting
} from '@element-plus/icons-vue';
import { bugFixList, baseModel, mainModel, hotfixModel } from './utils/mockData';
import MergeDialog from './components/MergeDialog.vue';
import MergeDialogMode2 from './components/MergeDialogMode2.vue';
import CreateReleaseDialog from './components/CreateReleaseDialog.vue';
import CreateBugDialog from './components/CreateBugDialog.vue';
import AddDependencyDialog from './components/AddDependencyDialog.vue';
import DomainDesign from './components/DomainDesign.vue';

const activePageTab = ref<'version' | 'design'>('version');
const activeMainTab = ref('overview');
const overviewSubTab = ref('changes');
const interactionMode = ref(1);
const mergeVisible = ref(false);
const merge2Visible = ref(false);
const createReleaseVisible = ref(false);
const createBugVisible = ref(false);
const addDepVisible = ref(false);
const treeKeyword = ref('');

const overviewNavs = [
  { key: 'changes', label: '变更记录' },
  { key: 'dependencies', label: '外部依赖' },
  { key: 'capabilities', label: '对外能力' },
  { key: 'basicData', label: '基础数据' },
];

// 版本列表（版本发布管理左侧）
const versionList = [
  { id: 'main-v2.2.0', name: 'main-v2.2.0', branch: 'main', createTime: '2026-03-12 10:00:00', tag: '最新' },
  { id: 'main-v2.1.0', name: 'main-v2.1.0', branch: 'main', createTime: '2026-02-15 08:55:00', tag: '历史' },
  { id: 'bugfix-v2.1.2', name: 'bugfix-v2.1.2', branch: 'bugfix', createTime: '2026-03-08 10:15:00', tag: '历史' },
  { id: 'bugfix-v2.0.5', name: 'bugfix-v2.0.5', branch: 'bugfix', createTime: '2026-02-25 16:45:00', tag: '历史' },
];
const selectedVersionId = ref('main-v2.2.0');
const selectedVersion = computed(() => versionList.find(v => v.id === selectedVersionId.value) || versionList[0]);

// 按版本隔离的概览数据
const versionOverviewMap: Record<string, any> = {
  'main-v2.2.0': {
    changeRecords: [
      { type: '新增', object: '门诊草药医嘱记录实体', model: '门诊医嘱', detail: '新增门诊草药医嘱记录实体及 herbalAssistFlag 字段', operator: '张xx', time: '2026-03-12 14:30:00' },
      { type: '修改', object: '校验患者皮试信息方法', model: '门诊医嘱', detail: '新增入参: skinTestResult 皮试结果代码', operator: '李xx', time: '2026-03-10 09:20:15' },
      { type: '修改', object: '门诊医嘱发送状态接口', model: '门诊医嘱', detail: 'status 字段类型由整数调整为中文本，兼容就诊域', operator: '李xx', time: '2026-03-08 10:15:22' },
      { type: '删除', object: '门诊临时医嘱数据集', model: '门诊医嘱', detail: '删除门诊临时医嘱数据集，合并至门诊医嘱记录', operator: '赵xx', time: '2026-02-28 11:05:33' },
      { type: '修改', object: '获取门诊药品医嘱列表方法', model: '门诊医嘱', detail: '出参新增 drugBatchNo 药品批次号', operator: '陈xx', time: '2026-02-20 16:40:08' },
      { type: '新增', object: '门诊材料医嘱明细记录实体', model: '门诊医嘱', detail: '新增门诊材料医嘱明细记录实体', operator: '陈xx', time: '2026-02-15 08:55:12' },
    ],
    dependencies: [
      { service: '预约服务', versionRange: '>= 3.2.0', desc: '预约域', status: '兼容', time: '2026-03-10 10:00:00' },
      { service: '就诊服务', versionRange: '>= 2.8.0', desc: '就诊域', status: '兼容', time: '2026-03-08 09:30:00' },
      { service: '药房服务', versionRange: '>= 4.1.0', desc: '药房域', status: '兼容', time: '2026-02-25 14:20:00' },
      { service: '收费服务', versionRange: '>= 5.0.0', desc: '收费域', status: '兼容', time: '2026-02-20 11:15:00' },
      { service: '配置服务', versionRange: '>= 1.9.0', desc: '配置域', status: '兼容', time: '2026-02-10 16:45:00' },
    ],
    capabilities: [
      { name: '医嘱开立API', type: 'API', desc: '支持门诊/住院医嘱开立', status: '已发布', time: '2026-03-12 10:30:00' },
      { name: '医嘱查询API', type: 'API', desc: '按患者ID查询历史医嘱', status: '已发布', time: '2026-03-10 09:20:00' },
      { name: '皮试校验API', type: 'API', desc: '校验患者皮试过敏信息', status: '已发布', time: '2026-03-08 11:00:00' },
      { name: '草药医嘱辅料查询页面', type: '页面', desc: '草药处方辅料维护页面', status: '已发布', time: '2026-02-28 14:15:00' },
      { name: '医嘱发送状态组件', type: '组件', desc: '医嘱发送状态实时展示组件', status: '已发布', time: '2026-02-20 16:40:00' },
    ],
    basicDataList: [
      { name: '医嘱类别字典', type: '字典', code: 'DICT_ORDER_TYPE', operator: '刘xx', time: '2026-03-12 08:00:00' },
      { name: '药品用法字典', type: '字典', code: 'DICT_DRUG_USAGE', operator: '刘xx', time: '2026-03-10 10:00:00' },
      { name: '给药途径字典', type: '字典', code: 'DICT_ADMIN_ROUTE', operator: '刘xx', time: '2026-03-05 09:30:00' },
      { name: '皮试结果字典', type: '字典', code: 'DICT_SKIN_TEST', operator: '刘xx', time: '2026-02-28 11:20:00' },
      { name: '科室字典', type: '字典', code: 'DICT_DEPT', operator: '刘xx', time: '2026-02-15 14:00:00' },
    ],
  },
  'main-v2.1.0': {
    changeRecords: [
      { type: '新增', object: '门诊材料医嘱明细记录实体', model: '门诊医嘱', detail: '新增门诊材料医嘱明细记录实体', operator: '陈xx', time: '2026-02-15 08:55:12' },
      { type: '修改', object: '门诊医嘱记录实体', model: '门诊医嘱', detail: '新增字段 urgentFlag 加急标识', operator: '陈xx', time: '2026-02-10 10:20:00' },
    ],
    dependencies: [
      { service: '预约服务', versionRange: '>= 3.1.0', desc: '预约域', status: '兼容', time: '2026-02-15 09:00:00' },
      { service: '就诊服务', versionRange: '>= 2.6.0', desc: '就诊域', status: '兼容', time: '2026-02-10 11:00:00' },
      { service: '配置服务', versionRange: '>= 1.8.0', desc: '配置域', status: '兼容', time: '2026-02-05 14:00:00' },
    ],
    capabilities: [
      { name: '医嘱开立API', type: 'API', desc: '支持门诊医嘱开立', status: '已发布', time: '2026-02-15 09:00:00' },
      { name: '医嘱查询API', type: 'API', desc: '按患者ID查询历史医嘱', status: '已发布', time: '2026-02-10 10:00:00' },
    ],
    basicDataList: [
      { name: '医嘱类别字典', type: '字典', code: 'DICT_ORDER_TYPE', operator: '刘xx', time: '2026-02-15 08:00:00' },
      { name: '科室字典', type: '字典', code: 'DICT_DEPT', operator: '刘xx', time: '2026-02-10 10:00:00' },
    ],
  },
  'bugfix-v2.1.2': {
    changeRecords: [
      { type: '修改', object: '门诊医嘱发送状态接口', model: '门诊医嘱', detail: 'status 字段类型由整数调整为中文本，兼容就诊域', operator: '李xx', time: '2026-03-08 10:15:22' },
      { type: '修改', object: '处方查询方法', model: '门诊医嘱', detail: '入参 deptCode 类型由整数调整为中文本', operator: '王xx', time: '2026-02-25 16:45:10' },
    ],
    dependencies: [
      { service: '就诊服务', versionRange: '>= 2.8.0', desc: '就诊域', status: '兼容', time: '2026-03-08 09:30:00' },
      { service: '配置服务', versionRange: '>= 1.9.0', desc: '配置域', status: '兼容', time: '2026-02-20 10:00:00' },
    ],
    capabilities: [
      { name: '医嘱查询API', type: 'API', desc: '按患者ID查询历史医嘱', status: '已发布', time: '2026-03-08 11:00:00' },
    ],
    basicDataList: [
      { name: '科室字典', type: '字典', code: 'DICT_DEPT', operator: '刘xx', time: '2026-03-08 09:00:00' },
    ],
  },
  'bugfix-v2.0.5': {
    changeRecords: [
      { type: '修改', object: '处方查询方法', model: '门诊医嘱', detail: '入参 deptCode 类型由整数调整为中文本', operator: '王xx', time: '2026-02-25 16:45:10' },
    ],
    dependencies: [
      { service: '配置服务', versionRange: '>= 1.8.0', desc: '配置域', status: '兼容', time: '2026-02-20 10:00:00' },
    ],
    capabilities: [],
    basicDataList: [
      { name: '科室字典', type: '字典', code: 'DICT_DEPT', operator: '刘xx', time: '2026-02-20 10:00:00' },
    ],
  },
};

const currentChangeRecords = computed(() => versionOverviewMap[selectedVersionId.value]?.changeRecords || []);
const currentDependencies = computed(() => versionOverviewMap[selectedVersionId.value]?.dependencies || []);
const currentCapabilities = computed(() => versionOverviewMap[selectedVersionId.value]?.capabilities || []);
const currentBasicDataList = computed(() => versionOverviewMap[selectedVersionId.value]?.basicDataList || []);

// 全局数据（发布管理 + BUG 修复为所有版本）
const releaseList = [
  { branch: 'main', version: 'v2.2.0-main', desc: '新增门诊草药医嘱记录实体及皮试校验方法入参扩展', operator: '李xx', time: '2026-03-12 10:00:00' },
  { branch: 'bugfix', version: 'v2.1.2-bugfix', desc: '修复门诊医嘱发送状态接口与就诊域字段冲突（status/patientId）', operator: '李xx', time: '2026-03-08 10:15:00' },
  { branch: 'main', version: 'v2.1.0-main', desc: '新增门诊材料医嘱明细记录实体', operator: '陈xx', time: '2026-02-15 08:55:00' },
  { branch: 'bugfix', version: 'v2.0.5-bugfix', desc: '修复处方查询方法入参 deptCode 类型错误', operator: '王xx', time: '2026-02-25 16:45:00' },
];

function statusType(status: string) {
  switch (status) {
    case '研发中': return 'warning';
    case '研发完成': return 'success';
    case '已合并': return 'info';
    default: return 'info';
  }
}

function openMerge(_row: any) {
  if (interactionMode.value === 1) {
    mergeVisible.value = true;
  } else {
    merge2Visible.value = true;
  }
}

function onMerged(result: any) {
  console.log('Merged result:', result);
  ElMessage.success('合并结果已生成（详见控制台）');
}

// 通用详情弹窗
const detailDialogVisible = ref(false);
const detailPayload = ref<{ type: string; row: any }>({ type: '', row: {} });
const detailTitle = computed(() => {
  const titles: Record<string, string> = {
    change: '变更记录详情',
    dependency: '外部依赖详情',
    capability: '对外能力详情',
    basicData: '基础数据详情',
    release: '发布详情',
    bug: 'BUG详情',
  };
  return titles[detailPayload.value.type] || '详情';
});
const detailItems = computed(() => {
  const r = detailPayload.value.row;
  switch (detailPayload.value.type) {
    case 'change':
      return [
        { label: '变更类型', value: r?.type },
        { label: '变更对象', value: r?.object },
        { label: '所属模型', value: r?.model },
        { label: '变更详情', value: r?.detail },
        { label: '操作人', value: r?.operator },
        { label: '变更时间', value: r?.time },
      ];
    case 'dependency':
      return [
        { label: '微服务名称', value: r?.service },
        { label: '兼容版本范围', value: r?.versionRange },
        { label: '描述', value: r?.desc },
        { label: '兼容状态', value: r?.status },
        { label: '变更时间', value: r?.time },
      ];
    case 'capability':
      return [
        { label: '能力名称', value: r?.name },
        { label: '能力类型', value: r?.type },
        { label: '能力描述', value: r?.desc },
        { label: '可用状态', value: r?.status },
        { label: '变更时间', value: r?.time },
      ];
    case 'basicData':
      return [
        { label: '基础数据名称', value: r?.name },
        { label: '基础数据类型', value: r?.type },
        { label: '数据编码', value: r?.code },
        { label: '操作人', value: r?.operator },
        { label: '变更时间', value: r?.time },
      ];
    case 'release':
      return [
        { label: '分支类型', value: r?.branch },
        { label: '版本号', value: r?.version },
        { label: '版本描述', value: r?.desc },
        { label: '操作人', value: r?.operator },
        { label: '变更时间', value: r?.time },
      ];
    case 'bug':
      return [
        { label: 'BUG号', value: r?.bugNo },
        { label: '版本号', value: r?.version },
        { label: 'BUG描述', value: r?.desc },
        { label: '状态', value: r?.status },
        { label: '操作人', value: r?.operator },
        { label: '变更时间', value: r?.updateTime },
      ];
    default:
      return [];
  }
});
function openDetail(type: string, row: any) {
  detailPayload.value = { type, row };
  detailDialogVisible.value = true;
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
body {
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
  background: #ffffff;
}
</style>

<style scoped>
.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Top Header */
.top-header {
  height: 48px;
  background: linear-gradient(90deg, #2b5ffa 0%, #1e4bdb 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 0;
}
.logo-box {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.header-prefix {
  font-size: 14px;
  color: rgba(255,255,255,0.85);
  padding: 0 10px;
  cursor: pointer;
  transition: color 0.2s;
}
.header-prefix:hover {
  color: #fff;
}
.header-tab {
  font-size: 14px;
  color: rgba(255,255,255,0.7);
  padding: 6px 14px;
  margin-left: 6px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.header-tab:hover {
  color: #fff;
  background: rgba(255,255,255,0.08);
}
.header-tab.active {
  color: #2b5ffa;
  font-weight: 600;
  background: #fff;
  border-radius: 4px 4px 0 0;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-icon-btn,
.header-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}
.header-icon-btn:hover,
.header-icon:hover {
  background: rgba(255,255,255,0.12);
}
.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  transition: background 0.2s;
  margin-left: 4px;
}
.user-info:hover {
  background: rgba(255,255,255,0.12);
}

/* Main Body */
.main-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Global Sidebar */
.global-sidebar {
  width: 180px;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 4px 0;
}
.nav-group {
  margin-bottom: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  color: #595959;
  cursor: pointer;
  transition: all 0.2s;
}
.nav-item:hover {
  background: #f5f5f5;
  color: #1890ff;
}
.nav-item.has-children {
  font-weight: 500;
  color: #262626;
}
.arrow-icon {
  margin-left: auto;
  font-size: 12px;
  color: #8c8c8c;
}
.sub-nav {
  padding-left: 12px;
}
.sub-item {
  padding: 8px 12px 8px 24px;
  font-size: 12px;
  color: #595959;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: all 0.2s;
}
.sub-item:hover {
  color: #1890ff;
  background: #f5f7fa;
}
.sub-item.active {
  color: #1890ff;
  background: #e6f7ff;
  border-left-color: #1890ff;
  font-weight: 500;
}

/* Content Area */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  overflow: hidden;
}
.page-tabs {
  display: flex;
  align-items: center;
  background: #f5f7fa;
  padding: 8px 12px 0;
  gap: 4px;
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: #595959;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  background: #fff;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.tab-item:hover {
  color: #2b5ffa;
}
.tab-item.active {
  color: #2b5ffa;
  border-bottom-color: #2b5ffa;
  font-weight: 500;
  background: #fff;
}
.close-icon {
  font-size: 12px;
  color: #8c8c8c;
}
.close-icon:hover {
  color: #f56c6c;
}

.page-content {
  display: flex;
  flex: 1;
  padding: 0 12px 12px;
  gap: 12px;
  overflow: hidden;
  background: #f5f7fa;
}

/* Tree Panel */
.tree-panel {
  width: 220px;
  background: #fff;
  border-radius: 0;
  border: 1px solid #e8e8e8;
  box-shadow: none;
  padding: 10px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.tree-wrap {
  margin-top: 10px;
  flex: 1;
  overflow-y: auto;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  font-size: 13px;
  color: #262626;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.2s;
}
.tree-node:hover {
  background: #f5f5f5;
}
.tree-node.leaf {
  padding-left: 20px;
}
.tree-node.active {
  background: #e6f7ff;
}
.tree-node.active .node-label,
.tree-node.active .tree-label {
  color: #1890ff;
  font-weight: 500;
}
.tree-toggle {
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #8c8c8c;
}
.tree-indent {
  width: 14px;
}
.node-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #1890ff;
}
.node-icon.layer {
  color: #faad14;
}
.node-icon.leaf-icon {
  color: #52c41a;
}
.tree-children {
  padding-left: 14px;
}
.tree-label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tree-tag {
  font-size: 10px;
  padding: 0 3px;
  border-radius: 2px;
  line-height: 14px;
  border: 1px solid;
}
.tree-tag.tag-blue {
  color: #1890ff;
  border-color: #91d5ff;
  background: #e6f7ff;
}
.tree-tag.tag-orange {
  color: #fa8c16;
  border-color: #ffd591;
  background: #fff7e6;
}

/* Detail Panel */
.detail-panel {
  flex: 1;
  background: #fff;
  border-radius: 0;
  border: 1px solid #e8e8e8;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.domain-header {
  background: #f6f7fb;
  padding: 14px 16px;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.domain-title-row {
  margin-bottom: 6px;
}
.domain-name {
  font-size: 18px;
  font-weight: 600;
  color: #2b5ffa;
  cursor: pointer;
  text-decoration: underline;
}
.domain-name:hover {
  color: #1e4bdb;
}
.domain-meta {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 10px;
}
.domain-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.info-tag {
  background: #fff;
  color: #595959;
  border-color: #d9d9d9;
}

.main-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.main-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: 1px solid #e8e8e8;
}
.main-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: #e8e8e8;
}
.main-tabs :deep(.el-tabs__item) {
  font-size: 13px;
  color: #595959;
  padding: 0 16px;
  height: 38px;
  line-height: 38px;
}
.main-tabs :deep(.el-tabs__item.is-active) {
  color: #2b5ffa;
  font-weight: 500;
}
.main-tabs :deep(.el-tabs__active-bar) {
  background-color: #2b5ffa;
  height: 2px;
}
.main-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}
.main-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

/* Overview */
.overview-body {
  display: flex;
  height: 100%;
}
.overview-nav {
  width: 44px;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.overview-nav-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-bottom: 1px solid #e8e8e8;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 2px;
  font-size: 13px;
  color: #595959;
  transition: all 0.2s;
}
.overview-nav-item:hover {
  background: #f5f5f5;
}
.overview-nav-item.active {
  background: #e6f7ff;
  color: #1890ff;
  font-weight: 500;
}
.overview-table-wrap {
  flex: 1;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Tab Pane Body */
.tab-pane-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  overflow: hidden;
}
.sub-pane-flex {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.scroll-table-area {
  flex: 1;
  overflow: auto;
}
.bottom-action-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 12px 0 0;
  flex-shrink: 0;
}

/* Bugfix toolbar */
.bugfix-toolbar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 12px;
}
.action-btns {
  display: flex;
  gap: 8px;
}

/* Table bottom bar - legacy removed */

/* Detail dialog */
.detail-body {
  padding: 4px 0;
}
.detail-row {
  display: flex;
  padding: 10px 0;
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
.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

/* 提升表格清晰度 */
.app-wrapper :deep(.el-table) {
  --el-table-header-bg-color: #fafafa;
  --el-table-border-color: #f0f0f0;
  font-size: 13px;
}
.app-wrapper :deep(.el-table th.el-table__cell) {
  font-weight: 500;
  color: #262626;
  padding: 8px 0;
}
.app-wrapper :deep(.el-table td.el-table__cell) {
  color: #595959;
  padding: 8px 0;
}

/* fixed right operation column separator */
.app-wrapper :deep(.el-table__fixed-right) {
  border-left: 1px solid #f0f0f0 !important;
  box-shadow: -2px 0 6px rgba(0,0,0,0.04) !important;
}

/* Version Layout */
.version-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.version-sidebar {
  width: 200px;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 10px 0;
}
.version-sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: #262626;
  padding: 0 12px 10px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 6px;
}
.version-item {
  padding: 10px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}
.version-item:hover {
  background: #f0f2f5;
}
.version-item.active {
  background: #e6f7ff;
  border-left-color: #2b5ffa;
}
.version-item-name {
  font-size: 13px;
  color: #262626;
  font-weight: 500;
  margin-bottom: 6px;
}
.version-item-branch {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.version-item-time {
  font-size: 12px;
  color: #8c8c8c;
}

.version-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.version-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}
.version-info-left {
  display: flex;
  align-items: center;
  font-size: 13px;
}
.version-info-label {
  color: #595959;
}
.version-info-value {
  color: #262626;
  font-weight: 600;
}
.version-info-right {
  font-size: 12px;
  color: #8c8c8c;
}

.version-item-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.overview-version-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  margin: -12px -12px 12px;
}
.overview-version-left {
  display: flex;
  align-items: center;
  font-size: 13px;
}
.overview-version-label {
  color: #595959;
  margin-right: 6px;
}
.overview-version-right {
  font-size: 12px;
  color: #8c8c8c;
}
</style>
