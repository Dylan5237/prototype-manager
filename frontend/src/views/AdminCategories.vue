<template>
  <div class="management-page admin-categories">
    <div class="management-page-head">
      <div>
        <div class="management-title-line">
          <h1>类别管理</h1>
          <span class="management-count">{{ filteredCategories.length }}</span>
        </div>
        <p class="management-description">维护原型筛选使用的少量稳定类别。</p>
      </div>
      <div class="management-toolbar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索类别"
          clearable
          class="management-search"
          @keyup.enter="loadData"
        >
          <template #suffix>
            <el-icon class="search-action" @click="loadData"><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          新建类别
        </el-button>
      </div>
    </div>

    <div class="management-panel">
      <el-table :data="filteredCategories" v-loading="loading">
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
      <el-table-column label="操作" width="190" align="right" header-align="right" fixed="right">
        <template #default="{ row }">
          <div class="management-table-actions">
            <el-button size="small" @click="openEditDialog(row)">
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty><el-empty description="暂无符合条件的类别" :image-size="96" /></template>
      </el-table>
    </div>

    <!-- 新建类别弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建类别" width="460px" class="management-dialog" destroy-on-close>
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
    <el-dialog v-model="showEditDialog" title="编辑类别" width="460px" class="management-dialog" destroy-on-close>
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api/prototypes'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'

const categories = ref([])
const loading = ref(false)
const submitting = ref(false)
const searchKeyword = ref('')

const filteredCategories = computed(() => {
  if (!searchKeyword.value) return categories.value
  const kw = searchKeyword.value.toLowerCase()
  return categories.value.filter(c =>
    (c.name && c.name.toLowerCase().includes(kw)) ||
    (c.description && c.description.toLowerCase().includes(kw))
  )
})

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
    ElMessage.success(`已创建类别「${createForm.value.name}」`)
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
    ElMessage.success(`已更新类别「${editForm.value.name}」`)
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
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', customClass: 'management-confirm' }
    )
    await deleteCategory(row.id)
    ElMessage.success(`已删除类别「${row.name}」`)
    await loadData()
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
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
.search-action {
  cursor: pointer;
}

.description-text {
  color: #595959;
  font-size: 14px;
}

</style>
