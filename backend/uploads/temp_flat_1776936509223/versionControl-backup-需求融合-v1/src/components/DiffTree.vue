<template>
  <div class="diff-tree">
    <div class="tree-header">变更导航</div>

    <el-tabs v-model="activeTab" type="border-card" class="tree-tabs">
      <!-- 冲突 Tab -->
      <el-tab-pane name="conflict">
        <template #label>
          <span class="tab-label">
            <el-icon size="14"><Warning /></el-icon>
            冲突
            <el-badge v-if="conflictList.length" :value="conflictList.length" type="danger" />
          </span>
        </template>
        <div v-if="conflictList.length" class="tree-list">
          <div
            v-for="item in conflictList"
            :key="item.id"
            class="tree-item item-conflict"
            :class="{ active: selectedId === item.id }"
            @click="selectItem(item)"
          >
            <div class="item-path">{{ item.pathLabels.join(' / ') }}</div>
            <div class="item-meta">
              <el-tag size="small" type="danger" effect="dark">冲突</el-tag>
              <span v-if="item.node.resolution" class="resolved-tip">已裁决: {{ resolutionText(item.node.resolution) }}</span>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无冲突，可直接合并" :image-size="60" />
      </el-tab-pane>

      <!-- Hotfix Tab -->
      <el-tab-pane name="hotfix">
        <template #label>
          <span class="tab-label">
            <el-icon size="14"><Flag /></el-icon>
            Hotfix
            <el-badge v-if="hotfixList.length" :value="hotfixList.length" />
          </span>
        </template>
        <div v-if="hotfixList.length" class="tree-list">
          <div
            v-for="item in hotfixList"
            :key="item.id"
            class="tree-item"
            :class="{ active: selectedId === item.id, 'item-hotfix': true }"
            @click="selectItem(item)"
          >
            <div class="item-path">{{ item.pathLabels.join(' / ') }}</div>
            <div class="item-meta">
              <el-tag size="small" :type="changeTagType(item.node.hotfixChange)">
                {{ changeText(item.node.hotfixChange) }}
              </el-tag>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无 Hotfix 变更" :image-size="60" />
      </el-tab-pane>

      <!-- Main Tab -->
      <el-tab-pane name="main">
        <template #label>
          <span class="tab-label">
            <el-icon size="14"><House /></el-icon>
            Main
            <el-badge v-if="mainList.length" :value="mainList.length" type="primary" />
          </span>
        </template>
        <div v-if="mainList.length" class="tree-list">
          <div
            v-for="item in mainList"
            :key="item.id"
            class="tree-item"
            :class="{ active: selectedId === item.id, 'item-main': true }"
            @click="selectItem(item)"
          >
            <div class="item-path">{{ item.pathLabels.join(' / ') }}</div>
            <div class="item-meta">
              <el-tag size="small" :type="changeTagType(item.node.mainChange)">
                {{ changeText(item.node.mainChange) }}
              </el-tag>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无 Main 变更" :image-size="60" />
      </el-tab-pane>

      <!-- 全部 Tab -->
      <el-tab-pane name="all">
        <template #label>
          <span class="tab-label">
            <el-icon size="14"><List /></el-icon>
            全部
            <el-badge v-if="allList.length" :value="allList.length" type="info" />
          </span>
        </template>
        <div v-if="allList.length" class="tree-list">
          <div
            v-for="item in allList"
            :key="item.id"
            class="tree-item"
            :class="itemClass(item)"
            @click="selectItem(item)"
          >
            <div class="item-path">{{ item.pathLabels.join(' / ') }}</div>
            <div class="item-meta">
              <el-tag
                v-if="item.node.mergeType === 'conflict'"
                size="small"
                type="danger"
                effect="dark"
              >冲突</el-tag>
              <template v-else>
                <el-tag size="small" :type="changeTagType(item.node.hotfixChange !== 'unchanged' ? item.node.hotfixChange : item.node.mainChange)">
                  {{ item.node.hotfixChange !== 'unchanged' ? changeText(item.node.hotfixChange) : changeText(item.node.mainChange) }}
                </el-tag>
                <el-tag size="small" type="info" effect="plain" class="source-tag">
                  {{ item.node.hotfixChange !== 'unchanged' ? 'Hotfix' : 'Main' }}
                </el-tag>
              </template>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无变更" :image-size="60" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Warning, Flag, House, List } from '@element-plus/icons-vue';
import type { DiffNode } from '../types';
import { collectLeafChanges, type FlatDiffItem } from '../utils/diff3';

const props = defineProps<{
  data: DiffNode;
}>();

const emit = defineEmits<{
  (e: 'select', node: DiffNode): void;
}>();

const activeTab = ref('conflict');
const selectedId = ref<string>('');

const allList = computed(() => collectLeafChanges(props.data));

const conflictList = computed(() => allList.value.filter((i) => i.node.mergeType === 'conflict'));
const hotfixList = computed(() => allList.value.filter((i) => i.node.hotfixChange !== 'unchanged'));
const mainList = computed(() => allList.value.filter((i) => i.node.mainChange !== 'unchanged'));

watch(
  () => props.data,
  () => {
    activeTab.value = conflictList.value.length ? 'conflict' : 'all';
    const first = conflictList.value[0] || allList.value[0];
    if (first) {
      selectedId.value = first.id;
      emit('select', first.node);
    }
  },
  { immediate: true }
);

function selectItem(item: FlatDiffItem) {
  selectedId.value = item.id;
  emit('select', item.node);
}

function itemClass(item: FlatDiffItem) {
  return {
    active: selectedId.value === item.id,
    'item-conflict': item.node.mergeType === 'conflict',
    'item-hotfix': item.node.mergeType !== 'conflict' && item.node.hotfixChange !== 'unchanged',
    'item-main': item.node.mergeType !== 'conflict' && item.node.mainChange !== 'unchanged',
  };
}

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

function resolutionText(r: string) {
  switch (r) {
    case 'main': return 'Main';
    case 'hotfix': return 'Hotfix';
    case 'custom': return '自定义';
    default: return r;
  }
}
</script>

<style scoped>
.diff-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-right: 1px solid #e4e7ed;
}
.tree-header {
  padding: 12px 16px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
  flex-shrink: 0;
}
.tree-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tree-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 0;
}
.tree-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
}
.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.tab-label :deep(.el-badge__content) {
  transform: translate(60%, -40%) scale(0.8);
}
.tree-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tree-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
}
.tree-item:hover {
  border-color: #c0c4cc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.tree-item.active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
}
.item-conflict {
  border-left: 4px solid #f56c6c;
}
.item-conflict.active {
  background: #fef0f0;
}
.item-hotfix {
  border-left: 4px solid #67c23a;
}
.item-hotfix.active {
  background: #f0f9eb;
}
.item-main {
  border-left: 4px solid #409eff;
}
.item-main.active {
  background: #ecf5ff;
}
.item-path {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
  line-height: 1.4;
  margin-bottom: 6px;
}
.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.resolved-tip {
  font-size: 12px;
  color: #67c23a;
}
.source-tag {
  transform: scale(0.9);
  transform-origin: left center;
}
</style>
