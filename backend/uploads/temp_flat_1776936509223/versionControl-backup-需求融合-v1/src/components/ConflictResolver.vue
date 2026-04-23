<template>
  <div class="conflict-resolver">
    <div class="resolver-header">
      <el-icon size="18" color="#f56c6c"><Warning /></el-icon>
      <span class="resolver-title">该节点存在冲突，请选择合并策略</span>
    </div>

    <div class="resolver-body">
      <el-radio-group v-model="localResolution" size="large">
        <el-radio-button label="main">
          <div class="radio-content">
            <span>采纳 Main</span>
            <el-tag size="small" type="info" effect="plain">目标分支</el-tag>
          </div>
        </el-radio-button>
        <el-radio-button label="hotfix">
          <div class="radio-content">
            <span>采纳 Hotfix</span>
            <el-tag size="small" type="info" effect="plain">源分支</el-tag>
          </div>
        </el-radio-button>
        <el-radio-button label="custom">
          <div class="radio-content">
            <span>自定义</span>
            <el-tag size="small" type="warning" effect="plain">手动编辑</el-tag>
          </div>
        </el-radio-button>
      </el-radio-group>

      <div v-if="localResolution === 'custom'" class="custom-editor">
        <div class="editor-label">自定义值</div>
        <el-input
          v-if="isPrimitive"
          v-model="textValue"
          placeholder="请输入自定义值"
        />
        <el-input
          v-else
          v-model="textValue"
          type="textarea"
          :rows="4"
          placeholder="请输入 JSON 格式的自定义值"
        />
        <div v-if="!isPrimitive" class="editor-tip">支持 JSON 对象或数组</div>
      </div>

      <div v-if="localResolution && localResolution !== 'custom'" class="preview-section">
        <div class="preview-label">当前选择结果</div>
        <BusinessNodeCard :value="selectedValue" />
      </div>

      <div v-if="localResolution === 'custom' && textValue" class="preview-section">
        <div class="preview-label">自定义结果预览</div>
        <BusinessNodeCard :value="parsedCustomValue" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { Warning } from '@element-plus/icons-vue';
import BusinessNodeCard from './BusinessNodeCard.vue';

const props = defineProps<{
  modelValue?: 'main' | 'hotfix' | 'custom';
  customValue?: any;
  base?: any;
  main?: any;
  hotfix?: any;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: 'main' | 'hotfix' | 'custom'): void;
  (e: 'update:customValue', val: any): void;
}>();

const localResolution = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val as any),
});

const isPrimitive = computed(() => {
  const v = props.main !== undefined ? props.main : props.hotfix;
  return v === null || v === undefined || typeof v !== 'object';
});

const textValue = computed({
  get: () => {
    if (props.customValue === undefined) return '';
    if (isPrimitive.value) return String(props.customValue);
    return JSON.stringify(props.customValue, null, 2);
  },
  set: (val) => {
    if (!localResolution.value || localResolution.value !== 'custom') return;
    if (isPrimitive.value) {
      emit('update:customValue', val);
      return;
    }
    try {
      emit('update:customValue', JSON.parse(val));
    } catch {
      // 解析失败时仍然更新字符串，预览会显示错误状态
      emit('update:customValue', val);
    }
  },
});

const selectedValue = computed(() => {
  if (localResolution.value === 'main') return props.main;
  if (localResolution.value === 'hotfix') return props.hotfix;
  return props.base;
});

const parsedCustomValue = computed(() => {
  if (isPrimitive.value) return props.customValue;
  try {
    return JSON.parse(props.customValue);
  } catch {
    return props.customValue;
  }
});

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal === 'custom' && props.customValue === undefined) {
      const defaultVal = props.main !== undefined ? props.main : props.hotfix;
      emit('update:customValue', defaultVal);
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.conflict-resolver {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
}
.resolver-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.resolver-title {
  font-weight: 600;
  color: #f56c6c;
}
.radio-content {
  display: flex;
  align-items: center;
  gap: 6px;
}
.custom-editor {
  margin-top: 16px;
}
.editor-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: 500;
}
.editor-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}
.preview-section {
  margin-top: 16px;
}
.preview-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: 500;
}
</style>
