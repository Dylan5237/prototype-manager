<template>
  <el-drawer
    v-model="visible"
    :title="`需求设计文档 — ${currentModuleLabel}`"
    size="680px"
    direction="rtl"
    destroy-on-close
    class="design-doc-drawer"
  >
    <div class="doc-drawer-body">
      <!-- 左侧模块导航 -->
      <div class="doc-module-nav">
        <div
          v-for="m in moduleList"
          :key="m.key"
          class="doc-module-item"
          :class="{ active: activeModule === m.key }"
          @click="activeModule = m.key"
        >
          <el-icon size="14"><component :is="m.icon" /></el-icon>
          <span class="module-label">{{ m.label }}</span>
          <el-tag v-if="m.badge" size="small" :type="m.badgeType" class="module-badge">{{ m.badge }}</el-tag>
        </div>
      </div>

      <!-- 右侧文档内容 -->
      <div class="doc-content">
        <div class="doc-section">
          <div class="doc-section-title">📌 模块背景</div>
          <div class="doc-section-body">{{ currentDoc.background }}</div>
        </div>

        <div class="doc-section">
          <div class="doc-section-title">🎯 设计目标</div>
          <div class="doc-section-body">
            <ul>
              <li v-for="(goal, i) in currentDoc.goals" :key="i">{{ goal }}</li>
            </ul>
          </div>
        </div>

        <div class="doc-section">
          <div class="doc-section-title">📋 功能清单</div>
          <div class="doc-section-body">
            <div v-for="(feat, i) in currentDoc.features" :key="i" class="feature-item">
              <div class="feature-header">
                <el-tag size="small" :type="feat.priority === 'P0' ? 'danger' : feat.priority === 'P1' ? 'warning' : 'info'">{{ feat.priority }}</el-tag>
                <span class="feature-name">{{ feat.name }}</span>
                <el-tag v-if="feat.status" size="small" :type="feat.status === '已完成' ? 'success' : 'warning'" effect="plain">{{ feat.status }}</el-tag>
              </div>
              <div class="feature-desc">{{ feat.desc }}</div>
            </div>
          </div>
        </div>

        <div v-if="currentDoc.interactions" class="doc-section">
          <div class="doc-section-title">🔄 核心交互流程</div>
          <div class="doc-section-body">
            <el-steps direction="vertical" :active="currentDoc.interactions.length">
              <el-step
                v-for="(step, i) in currentDoc.interactions"
                :key="i"
                :title="step.title"
                :description="step.desc"
              />
            </el-steps>
          </div>
        </div>

        <div v-if="currentDoc.dataSpec" class="doc-section">
          <div class="doc-section-title">🗂️ 数据规范</div>
          <div class="doc-section-body">
            <el-table :data="currentDoc.dataSpec" size="small" border style="width: 100%">
              <el-table-column prop="field" label="字段" width="120" />
              <el-table-column prop="type" label="类型" width="80" />
              <el-table-column prop="required" label="必填" width="60">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.required ? 'danger' : 'info'">{{ row.required ? '是' : '否' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="desc" label="说明" min-width="160" show-overflow-tooltip />
            </el-table>
          </div>
        </div>

        <div v-if="currentDoc.boundaryCases" class="doc-section">
          <div class="doc-section-title">⚠️ 边界情况</div>
          <div class="doc-section-body">
            <div v-for="(bc, i) in currentDoc.boundaryCases" :key="i" class="boundary-item">
              <el-icon size="14" color="#e6a23c"><Warning /></el-icon>
              <span>{{ bc }}</span>
            </div>
          </div>
        </div>

        <div class="doc-footer">
          <el-divider />
          <div class="doc-meta">
            <span>文档版本：v1.0</span>
            <span>最后更新：2026-04-03</span>
            <span>负责人：产品经理</span>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Warning } from '@element-plus/icons-vue';

const props = defineProps<{
  modelValue: boolean;
  pageTab: string;
  mainTab: string;
  subTab: string;
  domainName: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const moduleList = [
  { key: 'overview', label: '版本总览', icon: 'Document', badge: '6个子模块', badgeType: 'primary' },
  { key: 'release', label: '发布管理', icon: 'Collection', badge: '', badgeType: 'info' },
  { key: 'demand', label: '需求看板', icon: 'List', badge: '9个域', badgeType: 'success' },
  { key: 'bugfix', label: 'BUG修复', icon: 'WarnTriangleFilled', badge: '2种交互', badgeType: 'warning' },
  { key: 'design', label: '业务域建模', icon: 'OfficeBuilding', badge: '3个域', badgeType: 'primary' },
  { key: 'merge', label: '合并冲突', icon: 'Link', badge: '拓扑排序', badgeType: 'danger' },
];

const activeModule = ref('overview');

// 根据当前页面上下文自动选中对应模块
watch(
  () => [props.pageTab, props.mainTab, props.subTab],
  ([pageTab, mainTab]) => {
    if (pageTab === 'design') {
      activeModule.value = 'design';
    } else if (mainTab === 'overview') {
      activeModule.value = 'overview';
    } else if (mainTab === 'release') {
      activeModule.value = 'release';
    } else if (mainTab === 'demand') {
      activeModule.value = 'demand';
    } else if (mainTab === 'bugfix') {
      activeModule.value = 'bugfix';
    }
  },
  { immediate: true }
);

const currentModuleLabel = computed(() => {
  const m = moduleList.find((i) => i.key === activeModule.value);
  return m ? m.label : '版本总览';
});

interface FeatureItem {
  name: string;
  desc: string;
  priority: string;
  status: string;
}

interface DocModule {
  background: string;
  goals: string[];
  features: FeatureItem[];
  interactions?: { title: string; desc: string }[];
  dataSpec?: { field: string; type: string; required: boolean; desc: string }[];
  boundaryCases?: string[];
}

const docMap: Record<string, DocModule> = {
  overview: {
    background: '版本总览是业务域版本管理的核心入口，提供对单一业务域（如医嘱域）在特定版本下的全景视图。涵盖变更记录、外部依赖、对外能力、基础数据、业务提示语和需求追踪六大维度，帮助研发、测试、产品快速了解版本的完整面貌。',
    goals: [
      '实现版本维度的全量信息聚合，避免信息分散在多个系统',
      '支持多版本切换对比，追溯历史变更',
      '建立需求与版本的双向追踪链路',
      '统一管理外部依赖关系，降低跨域协作风险',
    ],
    features: [
      { name: '变更记录', desc: '展示当前版本下的所有模型变更（新增/修改/删除），含操作人和时间', priority: 'P0', status: '已完成' },
      { name: '外部依赖', desc: '对象级依赖管理（业务域+依赖对象+对象类型+描述+状态），替代旧版版本号级依赖', priority: 'P0', status: '已完成' },
      { name: '对外能力', desc: '展示本域对外暴露的 API、页面、组件等能力清单', priority: 'P1', status: '已完成' },
      { name: '基础数据', desc: '字典类基础数据的版本快照', priority: 'P1', status: '已完成' },
      { name: '业务提示语', desc: '错误码、反馈类型、业务提示代码等提示语管理', priority: 'P1', status: '已完成' },
      { name: '需求追踪', desc: '按当前版本号反向关联需求，展示关联需求的优先级、状态、负责人', priority: 'P0', status: '已完成' },
    ],
    interactions: [
      { title: '选择版本', desc: '在概览页顶部下拉框切换版本（main/bugfix），页面数据自动刷新' },
      { title: '查看子模块', desc: '点击左侧垂直导航（变更/依赖/能力/数据/提示语/需求）切换子 Tab' },
      { title: '查看详情', desc: '表格每行末尾「查看详情」点击后弹出抽屉展示完整字段' },
      { title: '添加依赖', desc: '外部依赖 Tab 底部「添加依赖」按钮打开对象级依赖选择对话框' },
    ],
    dataSpec: [
      { field: 'versionId', type: 'string', required: true, desc: '版本唯一标识，如 main-v2.2.0' },
      { field: 'branch', type: 'string', required: true, desc: '分支类型：main / bugfix' },
      { field: 'changeType', type: 'enum', required: true, desc: '变更类型：新增/修改/删除' },
      { field: 'objectName', type: 'string', required: true, desc: '变更对象名称' },
      { field: 'operator', type: 'string', required: true, desc: '操作人，格式：姓氏+xx' },
      { field: 'dependencyDomain', type: 'string', required: true, desc: '依赖所属业务域' },
      { field: 'dependencyObject', type: 'string', required: true, desc: '依赖对象名称' },
      { field: 'objType', type: 'enum', required: true, desc: '对象类型：接口/实体/方法/页面/组件' },
      { field: 'demandId', type: 'string', required: false, desc: '关联需求编号' },
      { field: 'bizDomains', type: 'string', required: false, desc: '业务域协作标签，多个用+连接' },
    ],
    boundaryCases: [
      '版本号格式兼容：需同时支持 main-v2.2.0 和 v2.2.0-main 两种格式',
      '需求与版本关联时，若需求 relatedVersion 为空，则不显示在追踪列表',
      '跨域需求需在提出域和接收域双向展示',
      '外部依赖添加时，对象名称需从本域已有对象库中选择，避免随意填写',
    ],
  },
  release: {
    background: '发布管理负责版本从「开发完成」到「测试通过」到「正式发布」的全流程管控。支持 main 和 bugfix 两条分支的版本提交，自动计算下一个语义化版本号。',
    goals: [
      '规范版本发布流程，确保每次发布都有完整的变更描述',
      '自动版本号计算，避免人工出错',
      '支持 main（常规迭代）和 bugfix（紧急修复）双分支',
    ],
    features: [
      { name: '版本列表', desc: '展示所有已发布版本的分支、版本号、描述、操作人、时间', priority: 'P0', status: '已完成' },
      { name: '提交测试', desc: '选择分支后自动计算下一版本号，填写描述后提交测试', priority: 'P0', status: '已完成' },
      { name: '语义化版本', desc: '遵循 major.minor.patch 规则，自动递增 patch', priority: 'P1', status: '已完成' },
    ],
    interactions: [
      { title: '切换分支', desc: '提交测试对话框中选择 main/bugfix，版本号自动刷新' },
      { title: '提交测试', desc: '填写版本描述后点击提交，版本进入测试阶段' },
    ],
    dataSpec: [
      { field: 'branch', type: 'enum', required: true, desc: '分支：main / bugfix' },
      { field: 'version', type: 'string', required: true, desc: '自动生成的语义化版本号' },
      { field: 'description', type: 'text', required: true, desc: '版本变更描述' },
      { field: 'domain', type: 'string', required: true, desc: '所属业务域' },
    ],
    boundaryCases: [
      '若某分支下无历史版本，自动从 v1.0.0 开始',
      '版本号计算基于已有版本的最大值，而非时间',
      '提交测试时描述不能为空',
    ],
  },
  demand: {
    background: '需求看板是需求管理的核心视图，替代原有的「按业务组分类」模式，改为「按业务域分类」，支持跨域需求在提出域和接收域双向展示。同时集成 BUG 视图，实现需求与缺陷的统一管理。',
    goals: [
      '按业务域（而非研发组）组织需求，更贴合业务视角',
      '支持跨域协作需求的双域展示',
      '需求与 BUG 统一入口，减少页面跳转',
      '实时统计各域待办数量',
    ],
    features: [
      { name: '业务域 Tab', desc: '9 个业务域 Tab：医嘱/收费/就诊/诊断/病历/药剂/供应链/资源/结算', priority: 'P0', status: '已完成' },
      { name: '需求/BUG 切换', desc: 'Radio 按钮切换需求列表和 BUG 列表', priority: 'P0', status: '已完成' },
      { name: '跨域需求双展示', desc: 'bizDomains 包含多个域时，在对应域下均展示', priority: 'P0', status: '已完成' },
      { name: '优先级标签', desc: 'P0/P1/P2/高/中/低 多级别优先级可视化', priority: 'P1', status: '已完成' },
      { name: '状态流转', desc: '提出 → 已设计 → 开发中 → 已完成', priority: 'P1', status: '已完成' },
    ],
    interactions: [
      { title: '切换业务域', desc: '点击顶部域 Tab，列表自动过滤该域相关需求' },
      { title: '切换视图', desc: '点击「需求/BUG」Radio 切换列表数据源' },
      { title: '查看详情', desc: '点击需求行弹出详情抽屉' },
    ],
    dataSpec: [
      { field: 'id', type: 'string', required: true, desc: '需求编号，如 REQ-2026-015' },
      { field: 'group', type: 'string', required: true, desc: '所属研发组' },
      { field: 'scope', type: 'enum', required: true, desc: '范围：组内/跨组' },
      { field: 'bizDomains', type: 'string', required: true, desc: '业务域，多个用+连接' },
      { field: 'type', type: 'enum', required: true, desc: '类型：新增/优化' },
      { field: 'title', type: 'string', required: true, desc: '需求标题' },
      { field: 'priority', type: 'enum', required: true, desc: '优先级：P0/P1/P2/高/中/低' },
      { field: 'status', type: 'enum', required: true, desc: '状态：提出/已设计/开发中/已完成' },
      { field: 'owner', type: 'string', required: true, desc: '负责人' },
      { field: 'relatedVersion', type: 'string', required: false, desc: '关联版本号' },
    ],
    boundaryCases: [
      '跨组需求（scope=跨组）需用红色标签高亮，提示多方协作',
      '已完成的需求不在 DomainDesign「本域待办需求」中统计',
      'BUG 视图复用 bugFixList 数据源，不单独建表',
    ],
  },
  bugfix: {
    background: 'BUG 修复模块管理从发现到修复到合并的完整生命周期。支持两种冲突解决交互模式（结构化对比 vs 表单三栏对比），满足不同复杂度的合并场景。',
    goals: [
      '可视化 BUG 修复进度（研发中 → 研发完成 → 已合并）',
      '支持一键触发合并，自动检测冲突',
      '提供两种冲突解决交互，灵活适配不同用户习惯',
    ],
    features: [
      { name: 'BUG 列表', desc: '展示 BUG 号、版本、描述、状态、操作人、时间', priority: 'P0', status: '已完成' },
      { name: '状态流转', desc: '研发中 → 研发完成 → 已合并，不同状态对应不同操作权限', priority: 'P0', status: '已完成' },
      { name: '合并按钮', desc: '研发完成状态的 BUG 显示「合并」按钮，触发冲突检测', priority: 'P0', status: '已完成' },
      { name: '交互模式切换', desc: '结构化对比（卡片式）和表单三栏对比（字段级）两种模式', priority: 'P1', status: '已完成' },
      { name: '新建 BUG', desc: '弹出表单录入新 BUG', priority: 'P1', status: '已完成' },
    ],
    interactions: [
      { title: '新建 BUG', desc: '点击「新建BUG」填写 BUG 号、版本、描述后保存' },
      { title: '查看 BUG', desc: '点击「查看」弹出详情抽屉' },
      { title: '触发合并', desc: '研发完成状态的 BUG 点击「合并」打开 MergeDialog' },
      { title: '解决冲突', desc: '在 MergeDialog 中逐条解决冲突或一键采纳某分支' },
    ],
    dataSpec: [
      { field: 'bugNo', type: 'string', required: true, desc: 'BUG 编号，如 BUG-2026-0312-003' },
      { field: 'version', type: 'string', required: true, desc: '发现版本号' },
      { field: 'desc', type: 'text', required: true, desc: 'BUG 描述' },
      { field: 'status', type: 'enum', required: true, desc: '状态：研发中/研发完成/已合并' },
      { field: 'operator', type: 'string', required: true, desc: '操作人' },
      { field: 'updateTime', type: 'datetime', required: true, desc: '最后更新时间' },
    ],
    boundaryCases: [
      '只有「研发完成」状态的 BUG 才显示合并按钮',
      '合并前若存在冲突，确认合并按钮置灰，必须先解决全部冲突',
      '合并后 BUG 状态自动更新为「已合并」',
    ],
  },
  design: {
    background: '业务域建模是核心开发入口，提供实体建模、方法建模、接口建模、物理建模、事件建模五大子模块。支持多域动态切换（医嘱域/就诊域/门诊收费域），每个域有独立的模型 Tab 和数据。',
    goals: [
      '支持多业务域的动态建模，域切换时数据和模型 Tab 自动适配',
      '建模与需求深度绑定，提交模型时必须关联需求',
      '实时展示本域待办需求，方便开发时参考',
      '支持实体、方法、接口等多维度建模',
    ],
    features: [
      { name: '多域动态建模', desc: '左侧树点击不同域，右侧建模页面自动切换标题、模型 Tab、数据', priority: 'P0', status: '已完成' },
      { name: '五维建模', desc: '实体/方法/接口/物理/事件五大建模子 Tab', priority: 'P0', status: '已完成' },
      { name: '本域待办需求', desc: '顶部 Badge 实时统计本域待办需求数，点击弹窗查看列表', priority: 'P0', status: '已完成' },
      { name: '提交模型', desc: '选择模型对象范围 + 关联需求 + 自动计算版本号，一键提交', priority: 'P0', status: '已完成' },
      { name: '版本信息', desc: '展示当前域+分支+版本号信息', priority: 'P1', status: '已完成' },
    ],
    interactions: [
      { title: '切换业务域', desc: '左侧树点击「医嘱域/就诊域/门诊收费域」切换建模上下文' },
      { title: '切换模型 Tab', desc: '点击顶部模型 Tab（医嘱信息/草药处方等）切换当前模型' },
      { title: '提交模型', desc: '点击「提交模型」打开对话框，选择对象范围、勾选需求、填写描述后提交' },
      { title: '查看待办需求', desc: '点击「本域待办需求」链接查看当前域的需求清单' },
    ],
    dataSpec: [
      { field: 'domainName', type: 'string', required: true, desc: '业务域名称' },
      { field: 'branch', type: 'enum', required: true, desc: '分支：main / bugfix' },
      { field: 'version', type: 'string', required: true, desc: '当前版本号' },
      { field: 'modelTab', type: 'string', required: true, desc: '当前模型 Tab' },
      { field: 'subTab', type: 'enum', required: true, desc: '建模维度：entity/method/interface/physical/event' },
      { field: 'entityName', type: 'string', required: true, desc: '实体名称' },
      { field: 'inherit', type: 'string', required: false, desc: '继承实体' },
      { field: 'entityType', type: 'enum', required: true, desc: '实体类型：主实体/子实体' },
      { field: 'methodName', type: 'string', required: true, desc: '方法名称' },
      { field: 'enName', type: 'string', required: true, desc: '方法英文名称' },
      { field: 'bizCategory', type: 'string', required: true, desc: '业务分类' },
      { field: 'techCategory', type: 'enum', required: true, desc: '技术类别' },
    ],
    boundaryCases: [
      '切换域时，模型 Tab 需按域配置动态渲染（不同域有不同的模型 Tab）',
      '提交模型时至少要选择一个模型对象，否则提示错误',
      '关联需求列表只展示本域且状态为「提出/已设计/开发中/已完成」的需求',
      '门诊就诊记录等主实体不可删除',
    ],
  },
  merge: {
    background: '合并冲突解决模块提供 Hotfix → Main 分支合并时的可视化冲突检测与解决能力。基于三向合并算法（diff3），自动识别冲突、自动合并单向变更，并提供依赖拓扑排序建议，确保合并顺序正确。',
    goals: [
      '可视化三向对比（Base / Main / Hotfix），冲突一目了然',
      '自动识别单向新增/删除/修改，减少人工判断',
      '提供一键批量采纳某分支的能力',
      '通过依赖拓扑分析，提示合理的合并顺序',
    ],
    features: [
      { name: '三向对比', desc: 'Base（基准）、Main（目标）、Hotfix（源）三方并排展示', priority: 'P0', status: '已完成' },
      { name: '冲突检测', desc: '自动检测三方冲突节点，左侧导航高亮红色', priority: 'P0', status: '已完成' },
      { name: '自动合并', desc: '单向变更（只有一方修改/新增/删除）自动标记为 auto', priority: 'P0', status: '已完成' },
      { name: '批量采纳', desc: '一键全部采纳 Main 或全部采纳 Hotfix', priority: 'P1', status: '已完成' },
      { name: '冲突解决器', desc: '对冲突节点选择采纳 Main/Hotfix/自定义值', priority: 'P0', status: '已完成' },
      { name: '新增对象处理', desc: '单向新增场景特殊 UI：友好提示 + 对象预览', priority: 'P1', status: '已完成' },
      { name: '删除对象处理', desc: '单向删除场景警告提示 + 保留/删除确认', priority: 'P1', status: '已完成' },
      { name: '依赖拓扑排序', desc: '分析实体继承链和方法依赖，给出合并顺序建议', priority: 'P1', status: '已完成' },
    ],
    interactions: [
      { title: '打开合并', desc: 'BUG 修复页点击「合并」或提交模型后触发合并' },
      { title: '查看冲突', desc: '左侧「冲突」Tab 列出所有冲突节点，点击跳转详情' },
      { title: '解决冲突', desc: '选择采纳 Main / Hotfix / 自定义值，实时预览合并结果' },
      { title: '自动合并确认', desc: 'auto 类节点默认已选好值，可直接确认或手动切换' },
      { title: '查看依赖提示', desc: 'Header 点击「依赖提示」Badge 查看拓扑排序建议' },
      { title: '确认合并', desc: '所有冲突解决后，点击「确认合并」生成合并结果' },
    ],
    dataSpec: [
      { field: 'baseValue', type: 'any', required: false, desc: '基准版本值（三向合并的共同祖先）' },
      { field: 'mainValue', type: 'any', required: false, desc: '目标分支（Main）当前值' },
      { field: 'hotfixValue', type: 'any', required: false, desc: '源分支（Hotfix）当前值' },
      { field: 'mergeType', type: 'enum', required: true, desc: '合并类型：unchanged/auto/conflict' },
      { field: 'resolution', type: 'enum', required: false, desc: '解决策略：main/hotfix/custom' },
      { field: 'resolvedValue', type: 'any', required: false, desc: '解决后的最终值' },
      { field: 'extend', type: 'string', required: false, desc: '实体继承字段，用于拓扑分析' },
      { field: 'params', type: 'array', required: false, desc: '方法参数列表，source 字段用于依赖分析' },
    ],
    boundaryCases: [
      '若冲突未全部解决，确认合并按钮置灰并提示剩余冲突数',
      '单向新增对象默认采纳新增方的值，无需用户手动选择',
      '单向删除对象需用户确认是否保留，避免误删',
      '拓扑排序仅分析「变更列表内」的实体依赖，未变更的实体不参与排序',
      '自定义值需支持 JSON 对象和原始值两种格式',
    ],
  },
};

const currentDoc = computed(() => docMap[activeModule.value] || docMap.overview);
</script>

<style scoped>
.doc-drawer-body {
  display: flex;
  height: 100%;
  margin: -20px;
}

.doc-module-nav {
  width: 160px;
  flex-shrink: 0;
  background: #f5f7fa;
  border-right: 1px solid #e8e8e8;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-module-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: #595959;
}
.doc-module-item:hover {
  background: #e6f7ff;
  color: #1890ff;
}
.doc-module-item.active {
  background: #2b5ffa;
  color: #fff;
  font-weight: 500;
}
.doc-module-item.active :deep(.el-icon) {
  color: #fff;
}
.module-label {
  flex: 1;
}
.module-badge {
  transform: scale(0.85);
  transform-origin: right center;
}

.doc-content {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
}

.doc-section {
  margin-bottom: 20px;
}
.doc-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}
.doc-section-body {
  font-size: 13px;
  color: #595959;
  line-height: 1.8;
}
.doc-section-body ul {
  padding-left: 18px;
  margin: 0;
}
.doc-section-body li {
  margin-bottom: 6px;
}

.feature-item {
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  margin-bottom: 8px;
}
.feature-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.feature-name {
  font-weight: 500;
  color: #262626;
  flex: 1;
}
.feature-desc {
  font-size: 12px;
  color: #8c8c8c;
  padding-left: 4px;
}

.boundary-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #595959;
  line-height: 1.6;
}

.doc-footer {
  margin-top: 8px;
}
.doc-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
