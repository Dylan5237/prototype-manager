<template>
  <el-dialog
    v-model="visible"
    title="合并分支"
    width="90%"
    top="5vh"
    :close-on-click-modal="false"
    destroy-on-close
    class="merge-dialog"
  >
    <div class="merge-container">
      <!-- Header -->
      <div class="merge-header">
        <div class="header-branch">
          <el-tag size="large" type="warning">Hotfix: {{ hotfixName }}</el-tag>
          <el-icon size="20" class="header-arrow"><Right /></el-icon>
          <el-tag size="large" type="primary">Main</el-tag>
        </div>
        <div class="header-stats">
          <el-tag v-if="conflictCount > 0" type="danger" effect="dark">未解决冲突: {{ conflictCount }}</el-tag>
          <el-tag v-else type="success" effect="dark">无冲突，可直接合并</el-tag>
          <el-tag v-if="newObjectCount > 0" type="success" effect="plain">新增对象: {{ newObjectCount }}</el-tag>
          <el-tag v-if="removedObjectCount > 0" type="info" effect="plain">删除对象: {{ removedObjectCount }}</el-tag>
          <el-tag
            v-if="dependencyAlerts.length"
            type="warning"
            effect="plain"
            style="cursor: pointer"
            @click="showDependencyDialog = true"
          >
            <el-icon size="12"><Warning /></el-icon>
            依赖提示 {{ dependencyAlerts.length }}
          </el-tag>
        </div>
        <div class="header-actions">
          <el-button @click="resolveAll('main')" :disabled="conflictCount === 0">全部采纳 Main</el-button>
          <el-button @click="resolveAll('hotfix')" :disabled="conflictCount === 0">全部采纳 Hotfix</el-button>
          <el-button type="primary" :disabled="conflictCount > 0" @click="submitMerge">确认合并</el-button>
        </div>
      </div>

      <!-- Body -->
      <div class="merge-body">
        <div class="tree-panel">
          <DiffTree :data="diffTree" @select="onSelectNode" />
        </div>

        <div class="detail-panel">
          <template v-if="selectedNode">
            <div class="detail-breadcrumb">
              <el-breadcrumb separator="/">
                <el-breadcrumb-item>业务域模型</el-breadcrumb-item>
                <el-breadcrumb-item>{{ selectedNode.label }}</el-breadcrumb-item>
              </el-breadcrumb>
            </div>

            <div class="detail-path">路径: <code>{{ selectedNode.path || 'root' }}</code></div>

            <div class="detail-comparison">
              <div class="comparison-side">
                <div class="side-header hotfix-header">
                  <span>Hotfix（源分支）</span>
                  <el-tag v-if="selectedNode.hotfixChange !== 'unchanged'" :type="changeTagType(selectedNode.hotfixChange)">
                    {{ changeText(selectedNode.hotfixChange) }}
                  </el-tag>
                </div>
                <div class="side-content">
                  <BusinessNodeCard :value="selectedNode.hotfixValue" :change-type="selectedNode.hotfixChange" />
                </div>
              </div>

              <div class="comparison-side">
                <div class="side-header main-header">
                  <span>Main（目标分支）</span>
                  <el-tag v-if="selectedNode.mainChange !== 'unchanged'" :type="changeTagType(selectedNode.mainChange)">
                    {{ changeText(selectedNode.mainChange) }}
                  </el-tag>
                </div>
                <div class="side-content">
                  <BusinessNodeCard :value="selectedNode.mainValue" :change-type="selectedNode.mainChange" />
                </div>
              </div>
            </div>

            <!-- Auto: 单向新增 -->
            <div v-if="selectedNode.mergeType === 'auto' && isSingleSideAdd" class="auto-notice">
              <el-alert
                :title="`${addSide === 'hotfix' ? 'Hotfix' : 'Main'} 新增对象`"
                type="success"
                :closable="false"
                show-icon
              >
                <template #default>
                  该对象在 Base 中不存在，由 <strong>{{ addSide === 'hotfix' ? 'Hotfix' : 'Main' }}</strong> 分支新增，系统将自动采纳。
                </template>
              </el-alert>
              <div class="auto-preview">
                <div class="preview-label">新增对象预览</div>
                <BusinessNodeCard :value="selectedNode.resolvedValue" change-type="added" />
              </div>
            </div>

            <!-- Auto: 单向删除 -->
            <div v-else-if="selectedNode.mergeType === 'auto' && isSingleSideRemove" class="auto-notice">
              <el-alert
                :title="`${removeSide === 'hotfix' ? 'Hotfix' : 'Main'} 删除对象`"
                type="warning"
                :closable="false"
                show-icon
              >
                <template #default>
                  该对象在 Base 中存在，但 <strong>{{ removeSide === 'hotfix' ? 'Hotfix' : 'Main' }}</strong> 已将其删除，请确认合并策略：
                </template>
              </el-alert>
              <div class="auto-actions">
                <el-radio-group v-model="selectedNode.resolution" size="default" @change="onAutoResolutionChange">
                  <el-radio-button label="main">
                    {{ removeSide === 'main' ? '保留（采纳 Hotfix）' : '删除（采纳 Main）' }}
                  </el-radio-button>
                  <el-radio-button label="hotfix">
                    {{ removeSide === 'hotfix' ? '保留（采纳 Main）' : '删除（采纳 Hotfix）' }}
                  </el-radio-button>
                </el-radio-group>
              </div>
              <div class="auto-preview">
                <div class="preview-label">当前合并结果</div>
                <BusinessNodeCard :value="selectedNode.resolvedValue" :change-type="selectedNode.resolvedValue === undefined ? 'removed' : 'unchanged'" />
              </div>
            </div>

            <!-- Auto: 普通自动合并 -->
            <div v-else-if="selectedNode.mergeType === 'auto'" class="auto-notice">
              <el-alert title="系统自动合并" type="success" :closable="false" show-icon>
                <template #default>
                  系统建议采纳 <strong>{{ autoSource }}</strong> 的值，您也可以手动切换：
                </template>
              </el-alert>
              <div class="auto-actions">
                <el-radio-group v-model="selectedNode.resolution" size="default" @change="onAutoResolutionChange">
                  <el-radio-button label="main">采纳 Main ({{ fmt(selectedNode.mainValue) }})</el-radio-button>
                  <el-radio-button label="hotfix">采纳 Hotfix ({{ fmt(selectedNode.hotfixValue) }})</el-radio-button>
                </el-radio-group>
              </div>
              <div class="auto-preview">
                <div class="preview-label">当前合并结果</div>
                <BusinessNodeCard :value="selectedNode.resolvedValue" />
              </div>
            </div>

            <ConflictResolver
              v-if="selectedNode.mergeType === 'conflict'"
              v-model="selectedNode.resolution"
              v-model:customValue="selectedNode.resolvedValue"
              :base="selectedNode.baseValue"
              :main="selectedNode.mainValue"
              :hotfix="selectedNode.hotfixValue"
            />
          </template>

          <div v-else class="empty-state">
            <el-empty description="请在左侧变更导航中选择一项查看详情" />
          </div>
        </div>
      </div>
    </div>

    <!-- 依赖拓扑排序提示对话框 -->
    <el-dialog
      v-model="showDependencyDialog"
      title="依赖拓扑排序建议"
      width="560px"
      align-center
      append-to-body
    >
      <div class="dependency-body">
        <el-alert
          title="以下变更对象之间存在依赖关系，建议按拓扑顺序处理"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
        />
        <div class="dependency-list">
          <div v-for="(alert, idx) in dependencyAlerts" :key="idx" class="dependency-item">
            <el-icon color="#e6a23c" size="16"><Warning /></el-icon>
            <span class="dependency-text">{{ alert }}</span>
          </div>
        </div>
        <div v-if="topoOrder.length" class="topo-section">
          <div class="topo-title">建议合并顺序</div>
          <el-steps direction="vertical" :active="topoOrder.length">
            <el-step v-for="(item, idx) in topoOrder" :key="idx" :title="item.name" :description="item.reason" />
          </el-steps>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showDependencyDialog = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Right, Warning } from '@element-plus/icons-vue';
import type { DiffNode } from '../types';
import { diff3, countConflicts, resolveAll as resolveAllFn, buildMergedResult, deepEqual } from '../utils/diff3';
import DiffTree from './DiffTree.vue';
import BusinessNodeCard from './BusinessNodeCard.vue';
import ConflictResolver from './ConflictResolver.vue';

const props = defineProps<{
  modelValue: boolean;
  hotfixName: string;
  base: any;
  main: any;
  hotfix: any;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'merged', result: any): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const diffTree = ref<DiffNode>(diff3(props.base, props.main, props.hotfix));
const selectedNode = ref<DiffNode | null>(null);
const showDependencyDialog = ref(false);

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      diffTree.value = diff3(props.base, props.main, props.hotfix);
      selectedNode.value = null;
    }
  }
);

const conflictCount = computed(() => countConflicts(diffTree.value));

function onSelectNode(node: DiffNode) {
  selectedNode.value = node;
}

function resolveAll(side: 'main' | 'hotfix') {
  resolveAllFn(diffTree.value, side);
  ElMessage.success(`已全部采纳 ${side === 'main' ? 'Main' : 'Hotfix'}`);
}

function submitMerge() {
  if (conflictCount.value > 0) {
    ElMessage.error(`还有 ${conflictCount.value} 处冲突未解决`);
    return;
  }
  const result = buildMergedResult(diffTree.value);
  emit('merged', result);
  visible.value = false;
  ElMessage.success('合并成功');
}

function onAutoResolutionChange(val: 'main' | 'hotfix') {
  if (selectedNode.value) {
    selectedNode.value.resolvedValue = val === 'main' ? selectedNode.value.mainValue : selectedNode.value.hotfixValue;
  }
}

function fmt(v: any): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') {
    const name = v.name || v.label || v.code || v.title;
    if (name) return name;
    return JSON.stringify(v).slice(0, 60);
  }
  return String(v);
}

const autoSource = computed(() => {
  if (!selectedNode.value) return '';
  const eqBaseMain = deepEqual(selectedNode.value.baseValue, selectedNode.value.mainValue);
  return eqBaseMain ? 'Hotfix' : 'Main';
});

// 单向新增检测
const isSingleSideAdd = computed(() => {
  if (!selectedNode.value) return false;
  const h = selectedNode.value.hotfixChange;
  const m = selectedNode.value.mainChange;
  return (h === 'added' && m === 'unchanged') || (m === 'added' && h === 'unchanged');
});

const addSide = computed(() => {
  if (!selectedNode.value) return '';
  if (selectedNode.value.hotfixChange === 'added') return 'hotfix';
  if (selectedNode.value.mainChange === 'added') return 'main';
  return '';
});

// 单向删除检测
const isSingleSideRemove = computed(() => {
  if (!selectedNode.value) return false;
  const h = selectedNode.value.hotfixChange;
  const m = selectedNode.value.mainChange;
  return (h === 'removed' && m === 'unchanged') || (m === 'removed' && h === 'unchanged');
});

const removeSide = computed(() => {
  if (!selectedNode.value) return '';
  if (selectedNode.value.hotfixChange === 'removed') return 'hotfix';
  if (selectedNode.value.mainChange === 'removed') return 'main';
  return '';
});

// 统计新增/删除对象数
function countChanges(node: DiffNode, type: 'added' | 'removed'): number {
  if (!node.children || node.children.length === 0) {
    if (node.hotfixChange === type || node.mainChange === type) return 1;
    return 0;
  }
  return node.children.reduce((sum, child) => sum + countChanges(child, type), 0);
}

const newObjectCount = computed(() => countChanges(diffTree.value, 'added'));
const removedObjectCount = computed(() => countChanges(diffTree.value, 'removed'));

// 依赖分析
interface ChangedEntity {
  name: string;
  extend: string;
  changeType: string;
  source: string;
}

function collectChangedEntities(node: DiffNode): ChangedEntity[] {
  const result: ChangedEntity[] = [];
  function walk(n: DiffNode) {
    if (n.mergeType === 'unchanged') return;
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf && n.path.includes('entities') && n.path !== 'entities') {
      const val = n.hotfixValue !== undefined ? n.hotfixValue : n.mainValue;
      if (val && typeof val === 'object' && 'extend' in val) {
        result.push({
          name: val.name || n.label,
          extend: val.extend || '-',
          changeType: n.hotfixChange !== 'unchanged' ? n.hotfixChange : n.mainChange,
          source: n.hotfixChange !== 'unchanged' ? 'hotfix' : 'main',
        });
      }
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }
  walk(node);
  return result;
}

const dependencyAlerts = computed(() => {
  const alerts: string[] = [];
  const entities = collectChangedEntities(diffTree.value);
  const entityNames = new Set(entities.map((e) => e.name));

  for (const ent of entities) {
    if (ent.extend && ent.extend !== '-' && ent.extend !== '标准记录实体') {
      if (entityNames.has(ent.extend)) {
        alerts.push(`实体「${ent.name}」继承自「${ent.extend}」，建议先合并父实体再合并子实体`);
      }
    }
  }

  // 检查方法依赖实体
  const changedMethods: { name: string; params: any[] }[] = [];
  function collectMethods(n: DiffNode) {
    if (n.mergeType === 'unchanged') return;
    const isLeaf = !n.children || n.children.length === 0;
    if (isLeaf && n.path.includes('methods') && n.path !== 'methods') {
      const val = n.hotfixValue !== undefined ? n.hotfixValue : n.mainValue;
      if (val && typeof val === 'object' && 'params' in val) {
        changedMethods.push({ name: val.name || n.label, params: val.params || [] });
      }
    }
    if (n.children) {
      for (const child of n.children) collectMethods(child);
    }
  }
  collectMethods(diffTree.value);

  for (const method of changedMethods) {
    for (const param of method.params) {
      const sourceEntity = param.source;
      if (sourceEntity && sourceEntity !== '虚拟参数' && sourceEntity !== '系统分页对象') {
        const matched = entities.find((e) => sourceEntity.includes(e.name) || e.name.includes(sourceEntity.replace('记录', '')));
        if (matched) {
          alerts.push(`方法「${method.name}」依赖实体「${matched.name}」，建议先合并实体再合并方法`);
        }
      }
    }
  }

  return [...new Set(alerts)];
});

// 拓扑排序建议
const topoOrder = computed(() => {
  const entities = collectChangedEntities(diffTree.value);
  const order: { name: string; reason: string }[] = [];
  const visited = new Set<string>();

  function visit(ent: ChangedEntity) {
    if (visited.has(ent.name)) return;
    if (ent.extend && ent.extend !== '-' && ent.extend !== '标准记录实体') {
      const parent = entities.find((e) => e.name === ent.extend);
      if (parent) visit(parent);
    }
    visited.add(ent.name);
    order.push({
      name: ent.name,
      reason: ent.extend !== '-' ? `继承自 ${ent.extend}` : '无继承依赖',
    });
  }

  for (const ent of entities) {
    visit(ent);
  }

  return order;
});

function changeTagType(change: string) {
  switch (change) {
    case 'added': return 'success';
    case 'removed': return 'danger';
    case 'modified': return 'warning';
    default: return 'info';
  }
}

function changeText(change: string) {
  switch (change) {
    case 'added': return '新增';
    case 'removed': return '删除';
    case 'modified': return '修改';
    default: return '未变更';
  }
}
</script>

<style scoped>
.merge-container {
  display: flex;
  flex-direction: column;
  height: 70vh;
  min-height: 500px;
}
.merge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #f5f7fa;
  border-radius: 8px 8px 0 0;
  flex-shrink: 0;
}
.header-branch {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-arrow {
  color: #909399;
}
.header-stats {
  display: flex;
  gap: 8px;
  align-items: center;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.merge-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.tree-panel {
  width: 280px;
  flex-shrink: 0;
  overflow: auto;
}
.detail-panel {
  flex: 1;
  padding: 16px;
  overflow: auto;
  background: #fff;
}
.detail-breadcrumb {
  margin-bottom: 12px;
}
.detail-path {
  font-size: 12px;
  color: #909399;
  margin-bottom: 16px;
}
.detail-path code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
}
.detail-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.comparison-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
}
.hotfix-header {
  background: #fdf6ec;
  color: #e6a23c;
  border: 1px solid #f5dab1;
}
.main-header {
  background: #ecf5ff;
  color: #409eff;
  border: 1px solid #b3d8ff;
}
.side-content {
  flex: 1;
}
.auto-notice {
  margin-top: 8px;
}
.auto-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.auto-preview {
  margin-top: 16px;
}
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 依赖对话框 */
.dependency-body {
  padding: 4px 0;
}
.dependency-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.dependency-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 6px;
}
.dependency-text {
  font-size: 13px;
  color: #595959;
  line-height: 1.5;
}
.topo-section {
  padding-top: 8px;
  border-top: 1px solid #e8e8e8;
}
.topo-title {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
  margin-bottom: 12px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
