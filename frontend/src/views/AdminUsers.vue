<template>
  <div class="admin-users">
    <div class="page-header">
      <h1>用户管理</h1>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        新建用户
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索账号或昵称"
        clearable
        style="width: 280px"
        @keyup.enter="handleSearch"
      >
        <template #suffix>
          <el-icon @click="handleSearch" style="cursor:pointer"><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <el-table :data="filteredUsers" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="账号" width="150" />
      <el-table-column prop="nickname" label="昵称" width="150" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="getRoleType(row.role)" size="small">{{ getRoleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">
            <el-icon><Edit /></el-icon>编辑
          </el-button>
          <el-button size="small" type="danger" plain @click="handleDelete(row)">
            <el-icon><Delete /></el-icon>删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建用户弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建用户" width="420px" destroy-on-close>
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="80px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="createForm.username" placeholder="登录账号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="createForm.password" type="password" placeholder="初始密码" show-password />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="createForm.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="createForm.role" placeholder="选择角色" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="上传者" value="uploader" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑用户弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑用户" width="420px" destroy-on-close>
      <el-form :model="editForm" :rules="editRules" ref="editFormRef" label-width="80px">
        <el-form-item label="账号">
          <el-input v-model="editForm.username" disabled />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="editForm.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="editForm.role" placeholder="选择角色" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="上传者" value="uploader" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="重置密码">
          <el-input v-model="editForm.password" type="password" placeholder="留空则不修改密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleEdit" :loading="editing">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUsers, registerUser, updateUser, deleteUser } from '../api/auth'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

console.log('[AdminUsers] api imports:', typeof getUsers, typeof registerUser, typeof updateUser, typeof deleteUser)

const authStore = useAuthStore()
const users = ref([])
const loading = ref(false)
const searchKeyword = ref('')

/* ========== 新建 ========== */
const showCreateDialog = ref(false)
const creating = ref(false)
const createFormRef = ref(null)
const createForm = ref({
  username: '',
  password: '',
  nickname: '',
  role: 'viewer'
})
const createRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

function openCreateDialog() {
  createForm.value = { username: '', password: '', nickname: '', role: 'viewer' }
  showCreateDialog.value = true
}

async function handleCreate() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    await registerUser(createForm.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

/* ========== 编辑 ========== */
const showEditDialog = ref(false)
const editing = ref(false)
const editFormRef = ref(null)
const editForm = ref({
  id: null,
  username: '',
  nickname: '',
  role: 'viewer',
  password: ''
})
const editRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

function openEditDialog(row) {
  editForm.value = {
    id: row.id,
    username: row.username,
    nickname: row.nickname || '',
    role: row.role,
    password: ''
  }
  showEditDialog.value = true
}

async function handleEdit() {
  console.log('[handleEdit] updateUser type:', typeof updateUser, 'id:', editForm.value.id)
  const valid = await editFormRef.value.validate().catch(() => false)
  if (!valid) return
  editing.value = true
  try {
    const payload = {
      nickname: editForm.value.nickname,
      role: editForm.value.role
    }
    if (editForm.value.password) {
      payload.password = editForm.value.password
    }
    await updateUser(editForm.value.id, payload)
    ElMessage.success('更新成功')
    showEditDialog.value = false
    loadData()
  } catch (err) {
    console.error('[handleEdit] error:', err)
    ElMessage.error(err.response?.data?.message || err.message || '更新失败')
  } finally {
    editing.value = false
  }
}

/* ========== 删除 ========== */
async function handleDelete(row) {
  console.log('[handleDelete] deleteUser type:', typeof deleteUser, 'id:', row.id)
  try {
    await ElMessageBox.confirm(
      `确定删除用户 "${row.nickname || row.username}" 吗？删除后无法恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    await deleteUser(row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err) {
    console.error('[handleDelete] error:', err)
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || err.message || '删除失败')
    }
  }
}

/* ========== 搜索 ========== */
const filteredUsers = computed(() => {
  if (!searchKeyword.value) return users.value
  const kw = searchKeyword.value.toLowerCase()
  return users.value.filter(u =>
    (u.username && u.username.toLowerCase().includes(kw)) ||
    (u.nickname && u.nickname.toLowerCase().includes(kw))
  )
})

function handleSearch() {
  // 前端过滤，无需额外操作
}

/* ========== 公共 ========== */
async function loadData() {
  loading.value = true
  try {
    const res = await getUsers()
    users.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function getRoleLabel(role) {
  const map = { admin: '管理员', uploader: '上传者', viewer: '查看者' }
  return map[role] || role
}

function getRoleType(role) {
  const map = { admin: 'danger', uploader: 'success', viewer: 'info' }
  return map[role] || 'info'
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
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h1 {
  font-size: 22px;
  color: #303133;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
</style>
