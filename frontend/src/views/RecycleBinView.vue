<template>
  <PrototypeLayout>
    <div class="management-page recycle-bin-container">
      <ManagementPageHeader title="回收站" :count="recycleBinList.length" description="可恢复已删除原型；彻底删除后无法恢复。">
        <el-button @click="fetchRecycleBin" :loading="loading"><el-icon><Refresh /></el-icon>刷新</el-button>
      </ManagementPageHeader>

      <div class="management-panel">
        <el-table class="recycle-table" :data="recycleBinList" v-loading="loading" style="width: 100%" table-layout="fixed">
          <el-table-column prop="name" label="名称" min-width="420" align="left" header-align="left">
            <template #default="{ row }">
              <div class="proto-name">{{ row.name || '—' }}</div>
              <div class="proto-desc">{{ row.description || '暂无描述' }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="version" label="版本" width="110" align="center" header-align="center">
            <template #default="{ row }">
              <el-tag size="small">v{{ row.version ?? 0 }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_by" label="创建者" width="150" align="center" header-align="center">
            <template #default="{ row }">
              {{ row.creator_name || getAuthorName(row.created_by) }}
            </template>
          </el-table-column>
          <el-table-column prop="deleted_at" label="删除时间" width="190" align="center" header-align="center">
            <template #default="{ row }">
              {{ formatDate(row.deleted_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230" align="left" header-align="left">
            <template #default="{ row }">
              <div class="recycle-actions">
                <el-button
                  size="small"
                  @click="handleRestore(row)"
                  v-if="authStore.isAdmin || row.created_by === authStore.user.id"
                >
                  <el-icon><RefreshLeft /></el-icon>恢复
                </el-button>
                <el-button
                  type="danger"
                  plain
                  size="small"
                  @click="handleHardDelete(row)"
                  v-if="authStore.isAdmin"
                >
                  <el-icon><Delete /></el-icon>彻底删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        <template #empty>
          <el-empty description="回收站为空" :image-size="96" />
        </template>
        </el-table>
      </div>
    </div>
  </PrototypeLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, RefreshLeft, Delete } from '@element-plus/icons-vue'
import PrototypeLayout from '@/components/PrototypeLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { getRecycleBin, restorePrototype, hardDeletePrototype } from '@/api/prototypes'
import { getUsers } from '@/api/auth'
import ManagementPageHeader from '@/components/ManagementPageHeader.vue'

const authStore = useAuthStore()
const recycleBinList = ref([])
const users = ref([])
const loading = ref(false)

const fetchRecycleBin = async () => {
  loading.value = true
  try {
    const res = await getRecycleBin()
    console.log('[RecycleBin] API response:', JSON.stringify(res.data))
    // 后端返回 { success: true, data: [...] }，axios 的 res.data 即该对象
    const list = res.data?.data ?? res.data
    recycleBinList.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('[RecycleBin] fetch error:', e.response?.status, e.response?.data || e.message)
    ElMessage.error('获取回收站列表失败')
  } finally {
    loading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const res = await getUsers()
    const list = res.data?.data ?? res.data
    users.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('获取用户列表失败', e)
  }
}

const getAuthorName = (userId) => {
  if (userId === null || userId === undefined || userId === '') return '—'
  const user = users.value.find(u => u.id === userId)
  return user ? (user.nickname || user.username) : '—'
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleRestore = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要恢复原型「${row.name}」吗？`,
      '恢复原型',
      { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'info', customClass: 'management-confirm' }
    )
    await restorePrototype(row.id)
    ElMessage.success(`已恢复「${row.name}」`)
    await fetchRecycleBin()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e.response?.data?.message || '恢复失败')
  }
}

const handleHardDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除原型「${row.name}」吗？此操作不可恢复！`,
      '彻底删除原型',
      { confirmButtonText: '彻底删除', cancelButtonText: '取消', type: 'warning', customClass: 'management-confirm' }
    )
    await hardDeletePrototype(row.id)
    ElMessage.success(`已彻底删除「${row.name}」`)
    await fetchRecycleBin()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e.response?.data?.message || '删除失败')
  }
}

onMounted(() => {
  fetchRecycleBin()
  fetchUsers()
})
</script>

<style scoped>
.proto-name {
  font-weight: 600;
  color: #172033;
  margin-bottom: 4px;
}

.proto-desc {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recycle-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
}
</style>
