<template>
  <div class="admin-categories">
    <div class="page-toolbar">
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        新建类别
      </el-button>
    </div>

    <el-table :data="categories" v-loading="loading" stripe class="data-table">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="类别名称" width="200" />
      <el-table-column prop="description" label="描述" min-width="300">
        <template #default="{ row }">
          <span class="description-text">{{ row.description || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <div class="table-actions">
            <el-button size="small" @click="openEditDialog(row)">
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建类别弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建类别" width="420px" destroy-on-close>
      <el-form :model="createForm" :rules="formRules" ref="createFormRef" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="类别名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="类别描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="submitting">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑类别弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑类别" width="420px" destroy-on-close>
      <el-form :model="editForm" :rules="formRules" ref="editFormRef" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="editForm.name" placeholder="类别名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="类别描述（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleEdit" :loading="submitting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api/prototypes'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'

const categories = ref([])
const loading = ref(false)
const submitting = ref(false)

/* ========== 新建 ========== */
const showCreateDialog = ref(false)
const createFormRef = ref(null)
const createForm = ref({ name: '', description: '' })
const formRules = {
  name: [{ required: true, message: '请输入类别名称', trigger: 'blur' }]
}

function openCreateDialog() {
  createForm.value = { name: '', description: '' }
  showCreateDialog.value = true
}

async function handleCreate() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await createCategory({ name: createForm.value.name, description: createForm.value.description })
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

/* ========== 编辑 ========== */
const showEditDialog = ref(false)
const editFormRef = ref(null)
const editForm = ref({ id: null, name: '', description: '' })

function openEditDialog(row) {
  editForm.value = {
    id: row.id,
    name: row.name || '',
    description: row.description || ''
  }
  showEditDialog.value = true
}

async function handleEdit() {
  const valid = await editFormRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await updateCategory(editForm.value.id, {
      name: editForm.value.name,
      description: editForm.value.description
    })
    ElMessage.success('更新成功')
    showEditDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '更新失败')
  } finally {
    submitting.value = false
  }
}

/* ========== 删除 ========== */
async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除类别 "${row.name}" 吗？该类别下的原型将变为未分类。`,
      '确认删除',
      { type: 'warning' }
    )
    await deleteCategory(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

/* ========== 公共 ========== */
async function loadData() {
  loading.value = true
  try {
    const res = await getCategories()
    categories.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(loadData)
</script>

<style scoped>
.admin-categories {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 20px;
}

.data-table {
  border-radius: 8px;
  overflow: hidden;
}

.description-text {
  color: #595959;
  font-size: 14px;
}

.table-actions {
  display: flex;
  gap: 8px;
}
</style>
