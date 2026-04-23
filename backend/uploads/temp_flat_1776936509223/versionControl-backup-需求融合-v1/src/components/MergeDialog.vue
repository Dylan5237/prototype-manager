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

            <div v-if="selectedNode.mergeType === 'auto'" class="auto-notice">
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
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Right } from '@element-plus/icons-vue';
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
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const autoSource = computed(() => {
  if (!selectedNode.value) return '';
  const eqBaseMain = deepEqual(selectedNode.value.baseValue, selectedNode.value.mainValue);
  return eqBaseMain ? 'Hotfix' : 'Main';
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
</style>
