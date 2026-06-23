<template>
  <div class="admin-distribution">
    <div class="page-toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索原型名称"
        clearable
        class="search-input"
        @keyup.enter="loadData"
      >
        <template #suffix>
          <el-icon @click="loadData" style="cursor:pointer"><Search /></el-icon>
        </template>
      </el-input>
      <el-button
        type="primary"
        :disabled="selectedPrototypes.length === 0"
        @click="openBatchShareDialog"
      >
        <el-icon><Share /></el-icon>
        批量协作分享
        <el-tag v-if="selectedPrototypes.length" size="small" type="info" effect="plain" class="count-tag">{{ selectedPrototypes.length }}</el-tag>
      </el-button>
    </div>

    <el-table
      :data="filteredPrototypes"
      v-loading="loading"
      stripe
      class="data-table"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" />
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
      <el-table-column label="转移归属" width="280" fixed="right">
        <template #default="{ row }">
          <div class="transfer-cell">
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
    </el-table>

    <!-- 确认转移弹窗 -->
    <el-dialog v-model="showTransferDialog" title="确认转移" width="400px">
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

    <!-- 批量协作分享弹窗 -->
    <el-dialog v-model="showShareDialog" title="协作分享" width="520px" destroy-on-close>
      <div class="share-summary">
        已选择 <strong>{{ selectedPrototypes.length }}</strong> 个原型，将分享给以下用户/用户组：
      </div>
      <el-form label-width="80px">
        <el-form-item label="分享给用户">
          <el-select
            v-model="shareUserIds"
            multiple
            filterable
            placeholder="选择用户（可多选）"
            style="width: 100%"
          >
            <el-option
              v-for="u in shareableUsers"
              :key="u.id"
              :label="`${u.nickname || u.username} (${u.username})`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分享给用户组">
          <el-select
            v-model="shareGroupIds"
            multiple
            filterable
            placeholder="选择用户组（可多选）"
            style="width: 100%"
          >
            <el-option
              v-for="g in groups"
              :key="g.id"
              :label="`${g.name} (${g.member_count || 0}人)`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showShareDialog = false">取消</el-button>
        <el-button
          type="primary"
          @click="confirmBatchShare"
          :loading="sharing"
          :disabled="shareUserIds.length === 0 && shareGroupIds.length === 0"
        >确认分享</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getPrototypes, transferPrototype, sharePrototype } from '../api/prototypes'
import { getUsers } from '../api/auth'
import { getGroups } from '../api/groups'
import { useAuthStore } from '../stores/auth'
import { Search, Share } from '@element-plus/icons-vue'

const authStore = useAuthStore()

const prototypes = ref([])
const users = ref([])
const groups = ref([])
const loading = ref(false)
const searchKeyword = ref('')
const transferTargets = reactive({})
const selectedPrototypes = ref([])

const showTransferDialog = ref(false)
const transferringPrototype = ref(null)
const transferTargetId = ref(null)
const transferring = ref(false)

const showShareDialog = ref(false)
const shareUserIds = ref([])
const shareGroupIds = ref([])
const sharing = ref(false)

const editorUsers = computed(() =>
  users.value.filter(u => {
    const roles = Array.isArray(u.role) ? u.role : [u.role]
    return roles.includes('uploader') || roles.includes('editor') || roles.includes('admin')
  })
)

// 分享目标用户：排除当前登录用户自己
const shareableUsers = computed(() =>
  users.value.filter(u => u.id !== authStore.user?.id)
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

function handleSelectionChange(rows) {
  selectedPrototypes.value = rows
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
    ElMessage.success('转移成功')
    showTransferDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '转移失败')
  } finally {
    transferring.value = false
  }
}

function openBatchShareDialog() {
  if (selectedPrototypes.value.length === 0) {
    ElMessage.warning('请先选择要分享的原型')
    return
  }
  shareUserIds.value = []
  shareGroupIds.value = []
  showShareDialog.value = true
}

async function confirmBatchShare() {
  if (shareUserIds.value.length === 0 && shareGroupIds.value.length === 0) {
    ElMessage.warning('请至少选择一个分享目标')
    return
  }
  sharing.value = true
  const prototypeIds = selectedPrototypes.value.map(p => p.id)
  const tasks = []
  prototypeIds.forEach(protoId => {
    shareUserIds.value.forEach(userId => {
      tasks.push(sharePrototype(protoId, { userId }).then(() => ({ ok: true, protoId, target: userId, type: 'user' })).catch(err => ({ ok: false, protoId, target: userId, type: 'user', message: err.response?.data?.message || err.message })))
    })
    shareGroupIds.value.forEach(groupId => {
      tasks.push(sharePrototype(protoId, { groupId }).then(() => ({ ok: true, protoId, target: groupId, type: 'group' })).catch(err => ({ ok: false, protoId, target: groupId, type: 'group', message: err.response?.data?.message || err.message })))
    })
  })
  try {
    const results = await Promise.all(tasks)
    const failed = results.filter(r => !r.ok)
    if (failed.length === 0) {
      ElMessage.success(`已成功分享给 ${results.length} 个目标`)
      showShareDialog.value = false
    } else {
      ElMessage.warning(`${results.length - failed.length} 个目标分享成功，${failed.length} 个失败`)
    }
  } catch (err) {
    ElMessage.error('分享过程发生异常')
  } finally {
    sharing.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    const [protoRes, usersRes, groupsRes] = await Promise.all([
      getPrototypes({ page: 1, pageSize: 1000, scope: 'all' }),
      getUsers(),
      getGroups()
    ])
    prototypes.value = protoRes.data.data || []
    users.value = usersRes.data.data || []
    groups.value = groupsRes.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.admin-distribution {
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
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 16px;
}

.search-input {
  width: 260px;
}

.count-tag {
  margin-left: 6px;
}

.data-table {
  border-radius: 8px;
  overflow: hidden;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.transfer-confirm-text {
  font-size: 14px;
  line-height: 1.6;
  color: #595959;
}

.transfer-confirm-text strong {
  color: #262626;
}

.share-summary {
  margin-bottom: 16px;
  font-size: 14px;
  color: #595959;
}

.share-summary strong {
  color: #262626;
}
</style>
