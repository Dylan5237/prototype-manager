<template>
  <div class="admin-users">
    <div class="page-header">
      <h1>用户管理</h1>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建用户
      </el-button>
    </div>

    <el-table :data="users" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="账号" width="150" />
      <el-table-column prop="nickname" label="昵称" width="150" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="getRoleType(row.role)">{{ getRoleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建用户弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建用户" width="400px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="登录账号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="初始密码" show-password />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="选择角色" style="width:100%">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUsers, registerUser } from '../api/auth'

const users = ref([])
const loading = ref(false)
const showCreateDialog = ref(false)
const creating = ref(false)
const formRef = ref(null)
const form = ref({
  username: '',
  password: '',
  nickname: '',
  role: 'viewer'
})

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

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

async function handleCreate() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  creating.value = true
  try {
    await registerUser(form.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    form.value = { username: '', password: '', nickname: '', role: 'viewer' }
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

onMounted(loadData)
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h1 {
  font-size: 22px;
  color: #303133;
}
</style>
