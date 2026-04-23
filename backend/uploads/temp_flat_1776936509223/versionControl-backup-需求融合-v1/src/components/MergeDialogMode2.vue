<template>
  <el-dialog
    v-model="visible"
    title="合并分支 - 交互二（表单对比）"
    width="95%"
    top="3vh"
    :close-on-click-modal="false"
    destroy-on-close
    class="merge-dialog-2"
  >
    <div class="merge2-container">
      <!-- Header -->
      <div class="merge2-header">
        <div class="header-branch">
          <el-tag size="large" type="warning">Hotfix: {{ hotfixName }}</el-tag>
          <el-icon size="20" class="header-arrow"><Right /></el-icon>
          <el-tag size="large" type="info">Base</el-tag>
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

      <!-- Main Body -->
      <div class="merge2-body">
        <!-- Object List -->
        <div class="entity-list-panel">
          <div class="panel-title">变更对象</div>
          <div class="entity-list">
            <div
              v-for="item in objectList"
              :key="item.id"
              class="entity-item"
              :class="{
                active: currentObjectId === item.id,
                'entity-conflict': item.hasConflict,
                'entity-auto': item.hasAuto && !item.hasConflict,
              }"
              @click="selectObject(item)"
            >
              <div class="entity-name">{{ item.name }}</div>
              <div class="entity-code">({{ item.code }})</div>
              <div class="entity-type">{{ item.type === 'method' ? '方法' : '实体' }}</div>
              <el-tag v-if="item.hasConflict" size="small" type="danger" effect="dark" class="entity-badge">冲突</el-tag>
              <el-tag v-else-if="item.hasAuto" size="small" type="warning" effect="plain" class="entity-badge">变更</el-tag>
            </div>
          </div>
        </div>

        <!-- Three-column comparison -->
        <div class="comparison-area">
          <div class="comparison-col">
            <div class="col-header hotfix">Hotfix（源分支）</div>
            <div class="col-body">
              <EntityEditor
                v-if="currentObjectType === 'entity'"
                :entity="currentHotfixData"
                :highlight-map="currentHighlightMap"
                @select-field="onSelectField"
              />
              <MethodEditor
                v-else
                :method="currentHotfixData"
                :highlight-map="currentHighlightMap"
                @select-param="onSelectParam"
              />
            </div>
          </div>
          <div class="comparison-col">
            <div class="col-header base">Base（基线）</div>
            <div class="col-body">
              <EntityEditor
                v-if="currentObjectType === 'entity'"
                :entity="currentBaseData"
                :highlight-map="{}"
              />
              <MethodEditor
                v-else
                :method="currentBaseData"
                :highlight-map="{}"
              />
            </div>
          </div>
          <div class="comparison-col">
            <div class="col-header main">Main（目标分支）</div>
            <div class="col-body">
              <EntityEditor
                v-if="currentObjectType === 'entity'"
                :entity="currentMainData"
                :highlight-map="currentHighlightMap"
                @select-field="onSelectField"
              />
              <MethodEditor
                v-else
                :method="currentMainData"
                :highlight-map="currentHighlightMap"
                @select-param="onSelectParam"
              />
            </div>
          </div>
        </div>
      </div>

    </div>

    <template #footer>
      <div v-if="selectedItemId" class="resolution-panel-footer">
        <div class="resolution-header">
          <div class="resolution-title">
            <el-icon size="16" color="#f56c6c" v-if="selectedNode?.mergeType === 'conflict'"><Warning /></el-icon>
            <el-icon size="16" color="#e6a23c" v-else><InfoFilled /></el-icon>
            <span>当前选中：{{ selectedItemLabel }}</span>
            <el-tag v-if="selectedNode?.mergeType === 'conflict'" size="small" type="danger" effect="dark">冲突</el-tag>
            <el-tag v-else size="small" type="warning" effect="plain">变更</el-tag>
          </div>
          <el-icon size="18" class="resolution-close" @click="selectedItemId = ''; selectedItemProp = ''"><Close /></el-icon>
        </div>
        <div class="resolution-values">
          <div class="value-block">
            <div class="value-label hotfix">Hotfix</div>
            <div class="value-box">{{ fmt(selectedNode?.hotfixValue) }}</div>
            <el-button
              v-if="selectedNode"
              size="small"
              :type="selectedNode.resolution === 'hotfix' ? 'warning' : 'default'"
              @click="setResolution('hotfix')"
            >采纳</el-button>
          </div>
          <div class="value-block">
            <div class="value-label base">Base</div>
            <div class="value-box gray">{{ fmt(selectedNode?.baseValue) }}</div>
          </div>
          <div class="value-block">
            <div class="value-label main">Main</div>
            <div class="value-box">{{ fmt(selectedNode?.mainValue) }}</div>
            <el-button
              v-if="selectedNode"
              size="small"
              :type="selectedNode.resolution === 'main' ? 'primary' : 'default'"
              @click="setResolution('main')"
            >采纳</el-button>
          </div>
        </div>
        <div v-if="selectedNode?.mergeType === 'conflict' && !selectedNode.resolution" class="resolution-tip">
          <el-alert title="该字段存在冲突，请先选择采纳 Hotfix 或 Main" type="error" :closable="false" show-icon />
        </div>
      </div>
      <div v-else class="footer-hint">
        <el-icon size="14" color="#909399"><InfoFilled /></el-icon>
        <span>点击上方高亮单元格进行裁决，或在顶部点击【全部采纳 Main / Hotfix】批量处理</span>
      </div>
    </template>

    <!-- Pre-submit confirmation dialog -->
    <el-dialog
      v-model="confirmVisible"
      title="合并结果确认"
      width="800px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div class="confirm-content">
        <p class="confirm-tip">请核对以下已裁决的变更项，确认无误后提交合并。</p>
        <el-table :data="resolutionSummary" size="small" stripe border max-height="360">
          <el-table-column prop="objectName" label="归属对象" width="140" show-overflow-tooltip />
          <el-table-column prop="objectType" label="类型" width="60" align="center" />
          <el-table-column prop="itemName" label="冲突项" min-width="140" show-overflow-tooltip />
          <el-table-column prop="hotfixValue" label="Hotfix 结果" min-width="100" show-overflow-tooltip />
          <el-table-column prop="mainValue" label="Main 结果" min-width="100" show-overflow-tooltip />
          <el-table-column prop="result" label="处理结果" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.result === '采纳 Main' ? 'primary' : row.result === '采纳 Hotfix' ? 'warning' : 'info'" size="small">
                {{ row.result }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" @click="doMerge">确认提交</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Right, Warning, InfoFilled, Close } from '@element-plus/icons-vue';
import type { DiffNode } from '../types';
import { diff3, countConflicts, resolveAll as resolveAllFn, buildMergedResult } from '../utils/diff3';
import EntityEditor from './EntityEditor.vue';
import MethodEditor from './MethodEditor.vue';

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
const currentObjectId = ref<string>('');
const currentObjectType = ref<'entity' | 'method'>('entity');
const selectedItemId = ref<string>('');
const selectedItemProp = ref<string>('');
const confirmVisible = ref(false);

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      diffTree.value = diff3(props.base, props.main, props.hotfix);
      const first = objectList.value[0];
      if (first) {
        currentObjectId.value = first.id;
        currentObjectType.value = first.type;
      } else {
        currentObjectId.value = '';
      }
      selectedItemId.value = '';
      selectedItemProp.value = '';
    }
  }
);

function checkSubtree(node: DiffNode, predicate: (n: DiffNode) => boolean): boolean {
  if (predicate(node)) return true;
  if (node.children) {
    return node.children.some(c => checkSubtree(c, predicate));
  }
  return false;
}

function collectObjects(parentKey: string, type: 'entity' | 'method', list: any[]) {
  const parentNode = diffTree.value.children?.find(c => c.key === parentKey);
  parentNode?.children?.forEach(node => {
    const hasConflict = checkSubtree(node, n => n.mergeType === 'conflict');
    const hasAuto = checkSubtree(node, n => n.mergeType === 'auto');
    if (hasConflict || hasAuto) {
      list.push({
        id: node.key,
        code: node.hotfixValue?.code || node.mainValue?.code || node.baseValue?.code,
        name: node.label,
        type,
        hasConflict,
        hasAuto,
      });
    }
  });
}

const objectList = computed(() => {
  const result: any[] = [];
  collectObjects('entities', 'entity', result);
  collectObjects('methods', 'method', result);
  // sort: conflict first
  return result.sort((a, b) => Number(b.hasConflict) - Number(a.hasConflict));
});

function selectObject(item: any) {
  currentObjectId.value = item.id;
  currentObjectType.value = item.type;
  selectedItemId.value = '';
  selectedItemProp.value = '';
}

function getObjectData(source: any, id: string, type: 'entity' | 'method') {
  const list = type === 'entity' ? source?.entities || [] : source?.methods || [];
  return list.find((e: any) => e.id === id) || {};
}

const currentBaseData = computed(() => getObjectData(props.base, currentObjectId.value, currentObjectType.value));
const currentMainData = computed(() => getObjectData(props.main, currentObjectId.value, currentObjectType.value));
const currentHotfixData = computed(() => getObjectData(props.hotfix, currentObjectId.value, currentObjectType.value));

const currentDiffNode = computed(() => {
  const parentKey = currentObjectType.value === 'entity' ? 'entities' : 'methods';
  const parentNode = diffTree.value.children?.find(c => c.key === parentKey);
  return parentNode?.children?.find(c => c.key === currentObjectId.value);
});

const currentHighlightMap = computed(() => {
  const map: Record<string, 'added' | 'removed' | 'modified' | 'conflict'> = {};
  const root = currentDiffNode.value;
  if (!root) return map;

  // 1) top-level attributes
  for (const child of root.children || []) {
    if (child.key === 'fields' || child.key === 'params') continue;
    if (child.mergeType === 'unchanged') continue;
    const isLeaf = !child.children || child.children.length === 0;
    if (isLeaf) {
      map[child.key] = child.mergeType === 'conflict' ? 'conflict' :
        child.hotfixChange === 'added' || child.mainChange === 'added' ? 'added' :
        child.hotfixChange === 'removed' || child.mainChange === 'removed' ? 'removed' : 'modified';
    } else {
      child.children?.forEach(grand => {
        if (grand.mergeType !== 'unchanged') {
          map[`${child.key}.${grand.key}`] = grand.mergeType === 'conflict' ? 'conflict' :
            grand.hotfixChange === 'added' || grand.mainChange === 'added' ? 'added' :
            grand.hotfixChange === 'removed' || grand.mainChange === 'removed' ? 'removed' : 'modified';
        }
      });
    }
  }

  // 2) field/param level
  const childListKey = currentObjectType.value === 'entity' ? 'fields' : 'params';
  const listNode = root.children?.find(c => c.key === childListKey);
  listNode?.children?.forEach(itemNode => {
    if (itemNode.mergeType === 'unchanged') return;
    const itemId = itemNode.key;
    const isLeaf = !itemNode.children || itemNode.children.length === 0;
    if (isLeaf) {
      map[itemId] = itemNode.mergeType === 'conflict' ? 'conflict' :
        itemNode.hotfixChange === 'added' || itemNode.mainChange === 'added' ? 'added' :
        itemNode.hotfixChange === 'removed' || itemNode.mainChange === 'removed' ? 'removed' : 'modified';
    } else {
      itemNode.children?.forEach(propNode => {
        if (propNode.mergeType !== 'unchanged') {
          map[`${itemId}.${propNode.key}`] = propNode.mergeType === 'conflict' ? 'conflict' :
            propNode.hotfixChange === 'added' || propNode.mainChange === 'added' ? 'added' :
            propNode.hotfixChange === 'removed' || propNode.mainChange === 'removed' ? 'removed' : 'modified';
        }
      });
    }
  });

  return map;
});

const selectedNode = computed(() => {
  if (!selectedItemId.value || !currentDiffNode.value) return null;
  const childListKey = currentObjectType.value === 'entity' ? 'fields' : 'params';
  const listNode = currentDiffNode.value.children?.find(c => c.key === childListKey);
  const itemNode = listNode?.children?.find(c => c.key === selectedItemId.value);
  if (!itemNode) {
    // maybe top-level attribute
    return currentDiffNode.value.children?.find(c => c.key === selectedItemId.value) || null;
  }
  if (selectedItemProp.value && itemNode.children) {
    return itemNode.children.find(c => c.key === selectedItemProp.value) || itemNode;
  }
  return itemNode;
});

const selectedItemLabel = computed(() => {
  if (!selectedItemId.value || !currentDiffNode.value) return '';
  const childListKey = currentObjectType.value === 'entity' ? 'fields' : 'params';
  const listNode = currentDiffNode.value.children?.find(c => c.key === childListKey);
  const itemNode = listNode?.children?.find(c => c.key === selectedItemId.value);
  const itemName = itemNode?.label || selectedItemId.value;
  if (selectedItemProp.value && selectedNode.value && selectedNode.value.key !== selectedItemId.value) {
    return `${itemName} / ${selectedNode.value.label || selectedNode.value.key}`;
  }
  return itemName;
});

const conflictCount = computed(() => countConflicts(diffTree.value));

function onSelectField(payload: { rowId: string; prop?: string }) {
  selectedItemId.value = payload.rowId;
  if (payload.prop) {
    selectedItemProp.value = payload.prop;
  } else {
    const fieldsNode = currentDiffNode.value?.children?.find(c => c.key === 'fields');
    const fieldNode = fieldsNode?.children?.find(c => c.key === payload.rowId);
    const firstChangedProp = fieldNode?.children?.find(c => c.mergeType !== 'unchanged');
    selectedItemProp.value = firstChangedProp?.key || '';
  }
}

function onSelectParam(payload: { rowId: string; prop?: string }) {
  selectedItemId.value = payload.rowId;
  if (payload.prop) {
    selectedItemProp.value = payload.prop;
  } else {
    const paramsNode = currentDiffNode.value?.children?.find(c => c.key === 'params');
    const paramNode = paramsNode?.children?.find(c => c.key === payload.rowId);
    const firstChangedProp = paramNode?.children?.find(c => c.mergeType !== 'unchanged');
    selectedItemProp.value = firstChangedProp?.key || '';
  }
}

function setResolution(side: 'main' | 'hotfix') {
  if (!selectedNode.value) return;
  selectedNode.value.resolution = side;
  selectedNode.value.resolvedValue = side === 'main' ? selectedNode.value.mainValue : selectedNode.value.hotfixValue;
  ElMessage.success(`已采纳 ${side === 'main' ? 'Main' : 'Hotfix'}`);
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
  confirmVisible.value = true;
}

function doMerge() {
  const result = buildMergedResult(diffTree.value);
  confirmVisible.value = false;
  visible.value = false;
  emit('merged', result);
  ElMessage.success('合并成功');
}

interface ResolutionItem {
  objectName: string;
  objectType: string;
  itemName: string;
  hotfixValue: string;
  mainValue: string;
  result: string;
}

const resolutionSummary = computed((): ResolutionItem[] => {
  const list: ResolutionItem[] = [];

  function walk(node: DiffNode) {
    if (!node.children) return;
    const entitiesNode = node.children.find(c => c.key === 'entities');
    const methodsNode = node.children.find(c => c.key === 'methods');

    [entitiesNode, methodsNode].forEach(parent => {
      if (!parent?.children) return;
      const objectType = parent.key === 'entities' ? '实体' : '方法';
      parent.children.forEach(obj => {
        const objectName = obj.label;
        obj.children?.forEach(child => {
          if (child.mergeType === 'unchanged') return;
          if (child.key === 'fields' || child.key === 'params') {
            child.children?.forEach(item => {
              if (item.mergeType === 'unchanged') return;
              const isLeaf = !item.children || item.children.length === 0;
              if (isLeaf) {
                if (item.resolution) {
                  list.push({
                    objectName,
                    objectType,
                    itemName: item.label,
                    hotfixValue: fmt(item.hotfixValue),
                    mainValue: fmt(item.mainValue),
                    result: item.resolution === 'main' ? '采纳 Main' : item.resolution === 'hotfix' ? '采纳 Hotfix' : '自定义',
                  });
                }
              } else {
                item.children?.forEach(prop => {
                  if (prop.mergeType !== 'unchanged' && prop.resolution) {
                    list.push({
                      objectName,
                      objectType,
                      itemName: `${item.label} / ${prop.label || prop.key}`,
                      hotfixValue: fmt(prop.hotfixValue),
                      mainValue: fmt(prop.mainValue),
                      result: prop.resolution === 'main' ? '采纳 Main' : prop.resolution === 'hotfix' ? '采纳 Hotfix' : '自定义',
                    });
                  }
                });
              }
            });
          } else {
            // top-level attribute
            const isLeaf = !child.children || child.children.length === 0;
            if (isLeaf && child.resolution) {
              list.push({
                objectName,
                objectType,
                itemName: child.label || child.key,
                hotfixValue: fmt(child.hotfixValue),
                mainValue: fmt(child.mainValue),
                result: child.resolution === 'main' ? '采纳 Main' : child.resolution === 'hotfix' ? '采纳 Hotfix' : '自定义',
              });
            } else if (child.children) {
              child.children?.forEach(grand => {
                if (grand.mergeType !== 'unchanged' && grand.resolution) {
                  list.push({
                    objectName,
                    objectType,
                    itemName: `${child.label || child.key} / ${grand.label || grand.key}`,
                    hotfixValue: fmt(grand.hotfixValue),
                    mainValue: fmt(grand.mainValue),
                    result: grand.resolution === 'main' ? '采纳 Main' : grand.resolution === 'hotfix' ? '采纳 Hotfix' : '自定义',
                  });
                }
              });
            }
          }
        });
      });
    });
  }

  walk(diffTree.value);
  return list;
});

function fmt(v: any): string {
  if (v === null) return 'null';
  if (v === undefined) return '(无)';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
</script>

<style scoped>
.merge2-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.merge-dialog-2 :deep(.el-dialog) {
  display: flex !important;
  flex-direction: column;
  max-height: 96vh;
  margin-top: 2vh !important;
  margin-bottom: 2vh !important;
}
.merge-dialog-2 :deep(.el-dialog__body) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}
.merge-dialog-2 :deep(.el-dialog__footer) {
  padding: 0;
  border-top: none;
}
.merge2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e4e7ed;
  background: #f5f7fa;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;
}
.header-branch {
  display: flex;
  align-items: center;
  gap: 8px;
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
.merge2-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.entity-list-panel {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid #e4e7ed;
  background: #fafafa;
  display: flex;
  flex-direction: column;
}
.panel-title {
  padding: 10px 12px;
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
}
.entity-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.entity-item {
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.entity-item:hover {
  border-color: #c0c4cc;
}
.entity-item.active {
  border-color: #409eff;
  background: #ecf5ff;
}
.entity-conflict {
  border-left: 4px solid #f56c6c;
}
.entity-auto {
  border-left: 4px solid #e6a23c;
}
.entity-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}
.entity-code {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}
.entity-type {
  font-size: 10px;
  color: #c0c4cc;
  margin-top: 2px;
}
.entity-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  transform: scale(0.8);
  transform-origin: top right;
}
.comparison-area {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px;
  overflow: hidden;
  background: #f5f7fa;
  min-height: 0;
}
.comparison-col {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.col-header {
  padding: 8px 10px;
  font-weight: 600;
  font-size: 13px;
  text-align: center;
  border-radius: 4px 4px 0 0;
  border: 1px solid;
  border-bottom: none;
  flex-shrink: 0;
}
.col-header.hotfix {
  background: #fdf6ec;
  color: #e6a23c;
  border-color: #f5dab1;
}
.col-header.base {
  background: #f4f4f5;
  color: #606266;
  border-color: #d3d3d3;
}
.col-header.main {
  background: #ecf5ff;
  color: #409eff;
  border-color: #b3d8ff;
}
.col-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.resolution-panel-footer {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #fff;
}
.footer-hint {
  padding: 12px 16px;
  border-top: 1px solid #e4e7ed;
  background: #f5f7fa;
  font-size: 13px;
  color: #909399;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.resolution-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.resolution-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.resolution-close {
  cursor: pointer;
  color: #909399;
  transition: color 0.2s;
}
.resolution-close:hover {
  color: #606266;
}
.resolution-values {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
}
.value-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid #e4e7ed;
}
.value-label {
  font-size: 12px;
  font-weight: 600;
}
.value-label.hotfix {
  color: #e6a23c;
}
.value-label.base {
  color: #909399;
}
.value-label.main {
  color: #409eff;
}
.value-box {
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
  color: #303133;
  min-height: 32px;
  word-break: break-all;
}
.value-box.gray {
  background: #f5f7fa;
  color: #606266;
}
.resolution-tip {
  margin-top: 6px;
}
.confirm-content {
  padding: 0 8px;
}
.confirm-tip {
  font-size: 13px;
  color: #606266;
  margin-bottom: 12px;
}
</style>
