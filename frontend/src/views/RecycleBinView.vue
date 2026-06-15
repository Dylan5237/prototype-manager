<template>
  <PrototypeLayout>
    <div class="recycle-bin-container">
      <div class="page-header">
        <h2>回收站</h2>
        <el-button type="primary" @click="fetchRecycleBin" :loading="loading">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>

      <el-table :data="recycleBinList" v-loading="loading" style="width: 100%" stripe>
        <el-table-column prop="name" label="名称" min-width="200">
          <template #default="{ row }">
            <div class="proto-name">{{ row.name }}</div>
            <div class="proto-desc">{{ row.description || '暂无描述' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_by" label="创建者" width="120" align="center">
          <template #default="{ row }">
            {{ getAuthorName(row.created_by) }}
          </template>
        </el-table-column>
        <el-table-column prop="deleted_at" label="删除时间" width="180" align="center">
          <template #default="{ row }">
            {{ formatDate(row.deleted_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="handleRestore(row)"
              v-if="authStore.isAdmin || row.created_by === authStore.user.id"
            >
              <el-icon><RefreshLeft /></el-icon>恢复
            </el-button>
            <el-button
              type="danger"
              size="small"
              @click="handleHardDelete(row)"
              v-if="authStore.isAdmin"
            >
              <el-icon><Delete /></el-icon>彻底删除
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="回收站为空" />
        </template>
      </el-table>
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

const authStore = useAuthStore()
const recycleBinList = ref([])
const users = ref([])
const loading = ref(false)

const fetchRecycleBin = async () => {
  loading.value = true
  try {
    const res = await getRecycleBin()
    recycleBinList.value = res.data
  } catch (e) {
    ElMessage.error('获取回收站列表失败')
  } finally {
    loading.value = false
  }
}

const fetchUsers = async () => {
  try {
    const res = await getUsers()
    users.value = res.data
  } catch (e) {
    console.error('获取用户列表失败', e)
  }
}

const getAuthorName = (userId) => {
  const user = users.value.find(u => u.id === userId)
  return user ? user.username : '未知'
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
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
      '确认恢复',
      { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'info' }
    )
    await restorePrototype(row.id)
    ElMessage.success('恢复成功')
    fetchRecycleBin()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('恢复失败')
  }
}

const handleHardDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要彻底删除原型「${row.name}」吗？此操作不可恢复！`,
      '确认彻底删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
    await hardDeletePrototype(row.id)
    ElMessage.success('彻底删除成功')
    fetchRecycleBin()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

onMounted(() => {
  fetchRecycleBin()
  fetchUsers()
})
</script>

<style scoped>
.recycle-bin-container {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.proto-name {
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.proto-desc {
  font-size: 12px;
  color: #909399;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
