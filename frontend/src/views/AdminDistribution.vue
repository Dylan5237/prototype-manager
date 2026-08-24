<template>
  <div class="management-page admin-distribution">
    <div class="management-page-head">
      <div>
        <div class="management-title-line">
          <h1>原型分发</h1>
          <span class="management-count">{{ filteredPrototypes.length }}</span>
        </div>
        <p class="management-description">调整原型归属人，提交前明确显示影响对象。</p>
      </div>
      <div class="management-toolbar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索原型"
          clearable
          class="management-search"
          @keyup.enter="loadData"
        >
          <template #suffix>
            <el-icon class="search-action" @click="loadData"><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <div class="management-panel">
      <el-table :data="filteredPrototypes" v-loading="loading">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="原型名称" min-width="200">
        <template #default="{ row }">
          <router-link :to="`/prototype/${row.id}`" class="prototype-link">{{ row.name }}</router-link>
        </template>
      </el-table-column>
      <el-table-column label="当前归属者" width="150">
        <template #default="{ row }">
          <el-tag type="info" size="small" effect="light">{{ getOwnerName(row.created_by) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="290" align="right" header-align="right" fixed="right">
        <template #default="{ row }">
          <div class="management-table-actions transfer-cell">
            <el-select
              v-model="transferTargets[row.id]"
              placeholder="选择新用户"
              size="small"
              style="width: 180px;"
            >
              <el-option
                v-for="u in editorUsers"
                :key="u.id"
                :label="u.nickname || u.username"
                :value="u.id"
                :disabled="u.id === row.created_by"
              />
            </el-select>
            <el-button
              size="small"
              type="primary"
              :disabled="!transferTargets[row.id] || transferTargets[row.id] === row.created_by"
              @click="handleTransfer(row, transferTargets[row.id])"
            >转移</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty><el-empty description="暂无符合条件的原型" :image-size="96" /></template>
      </el-table>
    </div>

    <el-dialog v-model="showTransferDialog" title="变更原型归属" width="460px" class="management-dialog">
      <p class="transfer-confirm-text">
        确定将原型 <strong>{{ transferringPrototype?.name }}</strong> 的归属者从
        <strong>{{ getOwnerName(transferringPrototype?.created_by) }}</strong>
        转移给 <strong>{{ getOwnerName(transferTargetId) }}</strong> 吗？
      </p>
      <template #footer>
        <el-button @click="showTransferDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmTransfer" :loading="transferring">确认转移</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getPrototypes, transferPrototype } from '../api/prototypes'
import { getUsers } from '../api/auth'
import { Search } from '@element-plus/icons-vue'

const prototypes = ref([])
const users = ref([])
const loading = ref(false)
const searchKeyword = ref('')
const transferTargets = reactive({})

const showTransferDialog = ref(false)
const transferringPrototype = ref(null)
const transferTargetId = ref(null)
const transferring = ref(false)

const editorUsers = computed(() =>
  users.value.filter(u => {
    const roles = Array.isArray(u.role) ? u.role : [u.role]
    return roles.includes('uploader') || roles.includes('editor') || roles.includes('admin')
  })
)

const filteredPrototypes = computed(() => {
  if (!searchKeyword.value) return prototypes.value
  const kw = searchKeyword.value.toLowerCase()
  return prototypes.value.filter(p => p.name?.toLowerCase().includes(kw))
})

function getOwnerName(userId) {
  const u = users.value.find(u => u.id === userId)
  return u ? (u.nickname || u.username) : `用户${userId}`
}

function handleTransfer(prototype, targetId) {
  if (!targetId || targetId === prototype.created_by) return
  transferringPrototype.value = prototype
  transferTargetId.value = targetId
  showTransferDialog.value = true
}

async function confirmTransfer() {
  transferring.value = true
  try {
    await transferPrototype(transferringPrototype.value.id, transferTargetId.value)
    ElMessage.success(`已将「${transferringPrototype.value.name}」转移给「${getOwnerName(transferTargetId.value)}」`)
    showTransferDialog.value = false
    await loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '转移失败')
  } finally {
    transferring.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    const [protoRes, usersRes] = await Promise.all([
      getPrototypes({ page: 1, pageSize: 1000, scope: 'all' }),
      getUsers()
    ])
    prototypes.value = protoRes.data.data || []
    users.value = usersRes.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.search-action {
  cursor: pointer;
}

.prototype-link {
  color: #3498db;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s ease;
}

.prototype-link:hover {
  color: #2980b9;
  text-decoration: underline;
}

.transfer-cell {
  width: 100%;
}

.transfer-confirm-text {
  font-size: 14px;
  line-height: 1.6;
  color: #595959;
}

.transfer-confirm-text strong {
  color: #262626;
}
</style>
