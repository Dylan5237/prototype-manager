<template>
  <el-dialog v-model="dialogVisible" title="新建BUG" width="560px" align-center destroy-on-close>
    <el-form :model="form" label-width="90px">
      <el-form-item label="分支:">
        <el-select v-model="form.branch" style="width: 160px">
          <el-option label="main" value="main" />
          <el-option label="bugfix" value="bugfix" />
        </el-select>
      </el-form-item>

      <el-form-item label="*版本号:">
        <el-select v-model="form.version" style="width: 200px">
          <el-option label="v1.2.1" value="v1.2.1" />
          <el-option label="v1.2.0" value="v1.2.0" />
          <el-option label="v1.1.9" value="v1.1.9" />
        </el-select>
      </el-form-item>

      <el-form-item label="*业务域:">
        <el-input v-model="form.domain" disabled />
      </el-form-item>

      <el-form-item label="*BUG号:">
        <el-select v-model="form.bugNos" multiple collapse-tags collapse-tags-tooltip placeholder="请选择BUG号" style="width: 100%">
          <el-option label="BUG001" value="BUG001" />
          <el-option label="BUG002" value="BUG002" />
          <el-option label="BUG003" value="BUG003" />
          <el-option label="BUG004" value="BUG004" />
        </el-select>
      </el-form-item>

      <el-form-item label="*BUG描述:">
        <div class="desc-wrap">
          <el-input v-model="form.desc" type="textarea" :rows="8" placeholder="BUG详细描述，默认从禅道BUG描述加载" />
          <el-link type="primary" class="ai-link">AI总结</el-link>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

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
  branch: 'bugfix',
  version: 'v1.2.1',
  domain: '业务活动层-医嘱域',
  bugNos: ['BUG001'] as string[],
  desc: '',
});
</script>

<style scoped>
.desc-wrap {
  width: 100%;
  position: relative;
}
.desc-wrap .el-textarea {
  width: 100%;
}
.ai-link {
  position: absolute;
  right: 10px;
  top: 8px;
  font-size: 13px;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
