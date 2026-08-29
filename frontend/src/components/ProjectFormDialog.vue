<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="isEdit ? '编辑项目' : '创建项目'"
    width="680px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form :model="form" label-width="80px" ref="formRef" :rules="rules">
      <el-form-item label="项目名称" prop="name">
        <el-input v-model="form.name" placeholder="例如：天宫平台" />
      </el-form-item>
      <el-form-item label="项目描述">
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="简要描述项目范围" />
      </el-form-item>

      <el-form-item label="菜单结构">
        <div class="menu-editor">
          <div v-for="(group, gIdx) in form.menuConfig.items" :key="group.key || gIdx" class="menu-group">
            <div class="group-header">
              <el-input v-model="group.label" placeholder="一级菜单名称" class="group-input" />
              <el-button text type="danger" @click="removeGroup(gIdx)">删除</el-button>
            </div>
            <div class="group-children">
              <div v-for="(item, iIdx) in group.children" :key="item.key || iIdx" class="menu-item-row">
                <el-input v-model="item.label" placeholder="二级菜单名称" class="item-input" />
                <el-button text type="danger" size="small" @click="removeItem(group, iIdx)">删除</el-button>
              </div>
              <el-button text size="small" @click="addItem(group)">+ 添加二级菜单</el-button>
            </div>
          </div>
          <el-button text @click="addGroup">+ 添加一级菜单</el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="saving">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { createProject, updateProject } from '../api/projects'

const props = defineProps({
  visible: Boolean,
  project: Object
})
const emit = defineEmits(['update:visible', 'saved'])

const formRef = ref(null)
const saving = ref(false)
const form = ref({
  name: '',
  description: '',
  menuConfig: { items: [] }
})
const isEdit = ref(false)

const rules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }]
}

watch(() => props.project, (val) => {
  if (val) {
    isEdit.value = true
    form.value = {
      name: val.name || '',
      description: val.description || '',
      menuConfig: val.menu_config || { items: [] }
    }
  } else {
    isEdit.value = false
    form.value = { name: '', description: '', menuConfig: { items: [] } }
  }
}, { immediate: true })

function addGroup() {
  form.value.menuConfig.items.push({
    key: 'group_' + Date.now(),
    label: '',
    children: []
  })
}

function removeGroup(idx) {
  form.value.menuConfig.items.splice(idx, 1)
}

function addItem(group) {
  group.children.push({
    key: 'item_' + Date.now(),
    label: ''
  })
}

function removeItem(group, idx) {
  group.children.splice(idx, 1)
}

function handleClose() {
  formRef.value?.resetFields()
  form.value = { name: '', description: '', menuConfig: { items: [] } }
}

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // 校验菜单名称非空
  for (const g of form.value.menuConfig.items) {
    if (!g.label.trim()) {
      ElMessage.warning('一级菜单名称不能为空')
      return
    }
    for (const item of g.children) {
      if (!item.label.trim()) {
        ElMessage.warning('二级菜单名称不能为空')
        return
      }
    }
  }

  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description,
      menuConfig: form.value.menuConfig
    }
    if (isEdit.value) {
      await updateProject(props.project.id, payload)
    } else {
      await createProject(payload)
    }
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.menu-editor {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}
.menu-group {
  margin-bottom: 12px;
  padding: 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.group-input {
  flex: 1;
}
.group-children {
  padding-left: 24px;
}
.menu-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.item-input {
  flex: 1;
}
</style>
