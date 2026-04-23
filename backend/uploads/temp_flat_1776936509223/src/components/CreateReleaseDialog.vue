<template>
  <el-dialog v-model="dialogVisible" title="提交测试" width="560px" align-center destroy-on-close>
    <el-form :model="form" label-width="100px" class="release-form">
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
        <div class="desc-row">
          <el-input v-model="form.description" type="textarea" :rows="4" placeholder="输入版本变更信息" />
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary">提交测试</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
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
  domain: '业务活动层-医嘱域',
  version: '',
  description: '',
});

// 模拟已发布版本库（实际应由父组件传入或接口获取）
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
</script>

<style scoped>
.required-label .star {
  color: #f56c6c;
  margin-right: 2px;
}
.release-form :deep(.el-form-item__content) {
  align-items: flex-start;
}
.desc-row {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.desc-row .el-textarea {
  flex: 1;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
