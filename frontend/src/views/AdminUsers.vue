<template>
  <div class="management-page admin-users">
    <ManagementPageHeader title="用户列表" :count="filteredUsers.length" description="管理账号、显示名称、固定角色与所属用户组。">
      <el-input v-model="searchKeyword" placeholder="搜索账号或昵称" clearable class="management-search" @keyup.enter="handleSearch">
        <template #suffix><el-icon class="search-action" @click="handleSearch"><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="openCreateDialog"><el-icon><Plus /></el-icon>新建用户</el-button>
    </ManagementPageHeader>

    <div class="management-panel">
      <el-table class="management-table" :data="filteredUsers" v-loading="loading" table-layout="fixed">
        <el-table-column prop="id" label="ID" width="64" align="left" header-align="left">
          <template #default="{ row }"><span class="management-muted">{{ row.id ?? '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="username" label="账号" width="190" align="left" header-align="left">
          <template #default="{ row }"><span class="management-primary-text">{{ row.username || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" width="190" align="left" header-align="left">
          <template #default="{ row }"><span class="management-primary-text">{{ row.nickname || row.username || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="角色" width="200" align="left" header-align="left">
          <template #default="{ row }">
            <div class="management-tag-list">
              <el-tag v-for="r in getRolesArray(row.role)" :key="r" :type="getRoleType(r)" effect="light">{{ getRoleLabel(r) }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属组" min-width="220" align="left" header-align="left">
          <template #default="{ row }">
            <div v-if="row.groups && row.groups.length" class="management-tag-list">
              <el-tag v-for="g in getVisibleGroups(row)" :key="g.id" type="info" effect="plain">{{ g.name }}</el-tag>
              <el-tag v-if="row.groups.length > 3" type="info" effect="plain">+{{ row.groups.length - 3 }}</el-tag>
            </div>
            <span v-else class="management-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="210" align="left" header-align="left">
          <template #default="{ row }"><span class="management-time">{{ formatDate(row.created_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="170" align="center" header-align="center">
          <template #default="{ row }">
            <div class="management-table-actions management-table-actions--center">
              <el-button size="small" @click="openEditDialog(row)"><el-icon><Edit /></el-icon>编辑</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(row)"><el-icon><Delete /></el-icon>删除</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无符合条件的用户" :image-size="72" /></template>
      </el-table>
    </div>

    <!-- 新建用户弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建用户" width="460px" class="management-dialog" destroy-on-close>
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
        <el-form-item label="角色" prop="roles">
          <el-select v-model="createForm.roles" multiple placeholder="选择角色（可多选）" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="编辑者" value="uploader" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属组">
          <el-select v-model="createForm.groupIds" multiple placeholder="选择所属用户组（可多选）" style="width:100%">
            <el-option
              v-for="g in groups"
              :key="g.id"
              :label="g.name"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>

    <!-- 编辑用户弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑用户" width="460px" class="management-dialog" destroy-on-close>
      <el-form :model="editForm" :rules="editRules" ref="editFormRef" label-width="80px">
        <el-form-item label="账号">
          <el-input v-model="editForm.username" disabled />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="editForm.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色" prop="roles">
          <el-select v-model="editForm.roles" multiple placeholder="选择角色（可多选）" style="width:100%">
            <el-option label="管理员" value="admin" />
            <el-option label="编辑者" value="uploader" />
            <el-option label="查看者" value="viewer" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属组">
          <el-select v-model="editForm.groupIds" multiple placeholder="选择所属用户组（可多选）" style="width:100%">
            <el-option
              v-for="g in groups"
              :key="g.id"
              :label="g.name"
              :value="g.id"
            />
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
import { ref, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUsers, registerUser, updateUser, deleteUser } from '../api/auth'
import { getGroups } from '../api/groups'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import ManagementPageHeader from '../components/ManagementPageHeader.vue'

const users = ref([])
const groups = ref([])
const loading = ref(false)
const groupsLoading = ref(false)
const searchKeyword = ref('')

// 将 role 统一转为数组，并把 editor 映射为 uploader
function getRolesArray(role) {
  if (!role) return ['viewer']
  const arr = Array.isArray(role) ? role : [role]
  return arr.map(r => r === 'editor' ? 'uploader' : r)
}

function getVisibleGroups(row) {
  return (row.groups || []).slice(0, 3)
}

/* ========== 新建 ========== */
const showCreateDialog = ref(false)
const creating = ref(false)
const createFormRef = ref(null)
const createForm = ref({
  username: '',
  password: '111111',
  nickname: '',
  roles: ['viewer', 'uploader'],
  groupIds: []
})
const createRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  roles: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }]
}

function openCreateDialog() {
  createForm.value = { username: '', password: '111111', nickname: '', roles: ['viewer', 'uploader'], groupIds: [] }
  showCreateDialog.value = true
}

watch(() => createForm.value.username, (username, previousUsername) => {
  if (!createForm.value.nickname || createForm.value.nickname === previousUsername) {
    createForm.value.nickname = username
  }
})

async function handleCreate() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  creating.value = true
  try {
    await registerUser({
      username: createForm.value.username,
      password: createForm.value.password,
      nickname: createForm.value.nickname,
      role: createForm.value.roles,
      groupIds: createForm.value.groupIds
    })
    ElMessage.success(`已创建用户「${createForm.value.nickname || createForm.value.username}」`)
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
  roles: ['viewer'],
  groupIds: [],
  password: ''
})
const editRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  roles: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }]
}

function openEditDialog(row) {
  editForm.value = {
    id: row.id,
    username: row.username,
    nickname: row.nickname || '',
    roles: getRolesArray(row.role),
    groupIds: (row.groups || []).map(g => g.id),
    password: ''
  }
  showEditDialog.value = true
}

async function handleEdit() {
  const valid = await editFormRef.value.validate().catch(() => false)
  if (!valid) return
  editing.value = true
  try {
    const payload = {
      nickname: editForm.value.nickname,
      role: editForm.value.roles,
      groupIds: editForm.value.groupIds
    }
    if (editForm.value.password) {
      payload.password = editForm.value.password
    }
    await updateUser(editForm.value.id, payload)
    ElMessage.success(`已更新用户「${editForm.value.nickname || editForm.value.username}」`)
    showEditDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '更新失败')
  } finally {
    editing.value = false
  }
}

/* ========== 删除 ========== */
async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除用户 "${row.nickname || row.username}" 吗？删除后无法恢复。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', customClass: 'management-confirm' }
    )
    await deleteUser(row.id)
    ElMessage.success(`已删除用户「${row.nickname || row.username}」`)
    await loadData()
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
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

async function loadGroups() {
  groupsLoading.value = true
  try {
    const res = await getGroups()
    groups.value = res.data.data || []
  } catch (err) {
    console.error('加载用户组失败', err)
  } finally {
    groupsLoading.value = false
  }
}

function getRoleLabel(role) {
  const map = { admin: '管理员', uploader: '编辑者', editor: '编辑者', viewer: '查看者' }
  return map[role] || role
}

function getRoleType(role) {
  const map = { admin: 'danger', uploader: 'success', editor: 'success', viewer: 'info' }
  return map[role] || 'info'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  loadData()
  loadGroups()
})
</script>

<style scoped>
.search-action {
  cursor: pointer;
}

.role-tag {
  margin-right: 4px;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.group-tag {
  margin-right: 0;
}

</style>
