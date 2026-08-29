<template>
  <div class="management-page admin-groups">
    <ManagementPageHeader title="用户组管理" :count="filteredGroups.length" description="按团队维护成员集合，用于共享和分发原型。">
      <el-input v-model="searchKeyword" placeholder="搜索用户组" clearable class="management-search" @keyup.enter="handleSearch">
        <template #suffix><el-icon class="search-action" @click="handleSearch"><Search /></el-icon></template>
      </el-input>
      <el-button type="primary" @click="openCreateDialog"><el-icon><Plus /></el-icon>新建用户组</el-button>
    </ManagementPageHeader>

    <div class="management-panel">
      <el-table class="management-table" :data="filteredGroups" v-loading="loading" table-layout="fixed">
        <el-table-column prop="id" label="ID" width="64" align="left" header-align="left">
          <template #default="{ row }"><span class="management-muted">{{ row.id ?? '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="name" label="组名称" width="190" align="left" header-align="left">
          <template #default="{ row }"><span class="management-primary-text">{{ row.name || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="220" align="left" header-align="left" show-overflow-tooltip>
          <template #default="{ row }"><span>{{ row.description || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="成员" min-width="300" align="left" header-align="left">
          <template #default="{ row }">
            <div v-if="row.member_count" class="member-cell">
              <div class="management-tag-list">
                <el-tag v-for="(name, idx) in getVisibleMembers(row)" :key="idx" type="info" effect="plain">{{ name }}</el-tag>
                <el-tag v-if="getRemainingMemberCount(row) > 0" type="info" effect="plain">+{{ getRemainingMemberCount(row) }}</el-tag>
              </div>
              <el-popover placement="top" trigger="click" width="220">
                <template #reference><el-button link type="primary" class="view-members-link">查看成员</el-button></template>
                <div class="member-popover-content">
                  <p class="member-popover-title">全部成员（{{ row.member_count }}）</p>
                  <div v-if="row.members && row.members.length" class="member-popover-list">
                    <span v-for="m in row.members" :key="m.user_id" class="member-popover-item">{{ m.nickname || m.username }}</span>
                  </div>
                  <p v-else class="management-muted">暂无成员</p>
                </div>
              </el-popover>
            </div>
            <span v-else class="management-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="creator_name" label="创建人" width="150" align="left" header-align="left">
          <template #default="{ row }"><span>{{ row.creator_name || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="210" align="left" header-align="left">
          <template #default="{ row }"><span class="management-time">{{ formatDate(row.created_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" header-align="center">
          <template #default="{ row }">
            <div class="management-table-actions management-table-actions--center">
              <el-button size="small" @click="openEditDialog(row)"><el-icon><Edit /></el-icon>编辑</el-button>
              <el-button size="small" type="danger" plain @click="handleDelete(row)"><el-icon><Delete /></el-icon>删除</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty><el-empty description="暂无符合条件的用户组" :image-size="72" /></template>
      </el-table>
    </div>

    <!-- 新建/编辑用户组弹窗 -->
    <el-dialog v-model="showDialog" :title="isEdit ? '编辑用户组' : '新建用户组'" width="620px" class="management-dialog" destroy-on-close>
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="组名称" prop="name">
          <el-input v-model="form.name" placeholder="如：天宫后端产品" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="简要说明该组用途" />
        </el-form-item>
        <el-form-item label="成员" prop="memberIds">
          <el-transfer
            v-model="form.memberIds"
            :data="transferData"
            :titles="['全部用户', '已选成员']"
            :button-texts="['移除', '添加']"
            filterable
            :filter-method="filterUser"
            filter-placeholder="搜索用户"
            class="group-transfer"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">{{ isEdit ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { getGroups, getGroup, createGroup, updateGroup, deleteGroup } from '../api/groups'
import { getUsers } from '../api/auth'
import { Plus, Edit, Delete, Search } from '@element-plus/icons-vue'
import ManagementPageHeader from '../components/ManagementPageHeader.vue'

const groups = ref([])
const users = ref([])
const loading = ref(false)
const usersLoading = ref(false)
const searchKeyword = ref('')

const showDialog = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const formRef = ref(null)
const form = ref({
  id: null,
  name: '',
  description: '',
  memberIds: []
})

const rules = {
  name: [{ required: true, message: '请输入组名称', trigger: 'blur' }],
  memberIds: [{ required: true, type: 'array', min: 1, message: '请至少选择一名成员', trigger: 'change' }]
}

function openCreateDialog() {
  isEdit.value = false
  form.value = { id: null, name: '', description: '', memberIds: [] }
  showDialog.value = true
}

async function openEditDialog(row) {
  isEdit.value = true
  // 列表接口返回成员预览，编辑时需拉取详情以获取完整成员ID列表
  let memberIds = []
  try {
    const res = await getGroup(row.id)
    if (res.data.success) {
      memberIds = res.data.data.member_ids || []
    }
  } catch (err) {
    console.error('加载组详情失败', err)
  }
  form.value = {
    id: row.id,
    name: row.name,
    description: row.description || '',
    memberIds
  }
  showDialog.value = true
}

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = {
      name: form.value.name,
      description: form.value.description,
      memberIds: form.value.memberIds
    }
    if (isEdit.value) {
      await updateGroup(form.value.id, payload)
      ElMessage.success(`已更新用户组「${form.value.name}」`)
    } else {
      await createGroup(payload)
      ElMessage.success(`已创建用户组「${form.value.name}」`)
    }
    showDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || (isEdit.value ? '更新失败' : '创建失败'))
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除用户组 "${row.name}" 吗？删除后不影响已产生的分享记录。`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning', customClass: 'management-confirm' }
    )
    await deleteGroup(row.id)
    ElMessage.success(`已删除用户组「${row.name}」`)
    await loadData()
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error(err.response?.data?.message || err.message || '删除失败')
    }
  }
}

const transferData = computed(() =>
  users.value.map(u => ({
    key: u.id,
    label: `${u.nickname || u.username} (${u.username})`,
    disabled: false
  }))
)

function filterUser(query, item) {
  return item.label.toLowerCase().includes((query || '').toLowerCase())
}

function getVisibleMembers(row) {
  return (row.member_preview || []).slice(0, 3)
}

function getRemainingMemberCount(row) {
  return Math.max(0, Number(row.member_count || 0) - getVisibleMembers(row).length)
}

const filteredGroups = computed(() => {
  if (!searchKeyword.value) return groups.value
  const kw = searchKeyword.value.toLowerCase()
  return groups.value.filter(g =>
    (g.name && g.name.toLowerCase().includes(kw)) ||
    (g.description && g.description.toLowerCase().includes(kw))
  )
})

function handleSearch() {
  // 前端过滤
}

async function loadData() {
  loading.value = true
  try {
    const res = await getGroups()
    groups.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  usersLoading.value = true
  try {
    const res = await getUsers()
    users.value = res.data.data || []
  } catch (err) {
    console.error('加载用户失败', err)
  } finally {
    usersLoading.value = false
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(() => {
  loadData()
  loadUsers()
})
</script>

<style scoped>
.search-action {
  cursor: pointer;
}

.view-members-link {
  font-size: 12px;
}

.member-popover-content {
  max-height: 240px;
  overflow-y: auto;
}

.member-popover-title {
  margin: 0 0 8px;
  font-weight: 600;
  font-size: 13px;
  color: #333;
}

.member-popover-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-popover-item {
  font-size: 13px;
  color: #555;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.group-transfer {
  display: flex;
  justify-content: center;
}

.group-transfer :deep(.el-transfer-panel) {
  width: 220px;
}
</style>
