<template>
  <div class="home-page">
    <div class="page-header">
      <div class="page-title-wrapper">
        <h2 class="page-title">{{ tabTitle }}</h2>
        <el-tag type="info" effect="plain" size="large" class="title-count">{{ total }}</el-tag>
      </div>
      <div class="page-toolbar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索原型名称"
          clearable
          class="search-input"
          @keyup.enter="handleSearch"
        >
          <template #suffix>
            <el-icon @click="handleSearch" style="cursor:pointer"><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="filterCategory" placeholder="按类别筛选" clearable class="category-select" @change="handleCategoryChange">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="sortOrder" class="sort-select" @change="handleSortChange">
          <el-option label="最近更新" value="updated_desc" />
          <el-option label="最早更新" value="updated_asc" />
          <el-option label="最近创建" value="created_desc" />
          <el-option label="最早创建" value="created_asc" />
        </el-select>
        <el-button v-if="authStore.isAdmin || authStore.isEditor" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>让AI创建原型
        </el-button>
      </div>
    </div>

    <PlatformAnnouncementBanner />

    <el-alert
      v-if="agentUpdateVisible"
      class="agent-update-banner"
      :type="agentUpdateType"
      :closable="true"
      show-icon
      @close="dismissAgentUpdate"
    >
      <template #title>
        <div class="agent-update-title-row">
          <span>{{ agentUpdateTitle }}</span>
          <el-tag v-if="agentUpdateRelease" size="small" effect="plain">
            MCP {{ agentUpdateRelease.mcpVersion }} / Skill {{ agentUpdateRelease.skillVersion }}
          </el-tag>
        </div>
      </template>
      <div class="agent-update-content">
        <span>{{ agentUpdateDescription }}</span>
        <div class="agent-update-actions">
          <el-button
            v-if="agentUpdateCanSchedule"
            type="primary"
            size="small"
            :loading="agentUpdateSubmitting"
            @click="scheduleAgentUpdate"
          >安排下次启动更新</el-button>
          <el-button
            v-if="agentUpdateScheduled"
            size="small"
            :loading="agentUpdateLoading"
            @click="loadAgentUpdate"
          >刷新状态</el-button>
        </div>
      </div>
    </el-alert>

    <!-- 归属者筛选标签 -->
    <div v-if="creators.length > 0" class="creator-filter-bar">
      <span class="filter-label">归属者：</span>
      <el-tag
        v-for="c in creators"
        :key="c.id"
        :type="filterCreator === c.id ? '' : 'info'"
        :effect="filterCreator === c.id ? 'dark' : 'light'"
        size="small"
        class="creator-tag"
        @click="toggleCreator(c.id)"
      >{{ c.name }}</el-tag>
      <el-tag
        v-if="filterCreator !== null"
        type="info"
        size="small"
        effect="plain"
        class="creator-tag creator-clear"
        @click="filterCreator = null"
      > 清除</el-tag>
    </div>

    <div v-if="loading" class="loading-wrapper">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
    </div>

    <div v-else-if="filteredPrototypes.length === 0" class="empty-wrapper">
      <el-empty :description="creators.length > 0 ? '该归属者暂无原型' : '暂无原型'" />
    </div>

    <div v-else class="prototype-grid">
      <div v-for="p in filteredPrototypes" :key="p.id" class="prototype-card" @click="$router.push(`/prototype/${p.id}`)">
        <div class="card-body">
          <h3 class="card-title">{{ p.name }}</h3>
          <p class="card-desc">{{ p.description || '暂无描述' }}</p>
          <div class="card-meta">
            <el-tag v-for="cat in getProtoCategories(p)" :key="cat.id" size="small" effect="light" class="cat-tag">{{ cat.name }}</el-tag>
          </div>
          <div class="card-footer">
            <span class="card-author">
              <el-icon><User /></el-icon>
              {{ p.creator_name || getAuthorName(p.created_by) }}
            </span>
            <span class="card-date">{{ formatDate(p.created_at) }}</span>
          </div>
        </div>
        <el-dropdown v-if="authStore.isAdmin || p.created_by === authStore.user.id" trigger="click" @command="(cmd) => handleCardCommand(cmd, p)">
          <span class="card-version" @click.stop>v{{ p.version_label || p.version }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="delete">
                <el-icon><Delete /></el-icon>删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span v-else class="card-version">v{{ p.version_label || p.version }}</span>
      </div>
    </div>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadData"
      />
    </div>

    <el-dialog v-model="showCreateDialog" title="新建原型" width="760px" destroy-on-close>
      <template v-if="!prototypePromptGenerated">
        <el-alert type="info" :closable="false" show-icon title="先把需求整理成一段可复制提示词，再交给已接入伏羲的 AI 助手创建原型。" />
        <el-form class="prompt-form" label-position="top">
          <el-form-item label="创建模式">
            <el-radio-group v-model="prototypePromptMode">
              <el-radio-button label="alignment">快速验证</el-radio-button>
              <el-radio-button label="implementation-proof">按组件规范</el-radio-button>
            </el-radio-group>
            <span v-if="prototypePromptMode === 'alignment'" class="form-help">快速验证优先确认需求、布局和关键交互</span>
            <span v-else class="form-help">按选定 runtime 的组件规范实现，并增加完整构建和交付校验。</span>
          </el-form-item>
          <el-form-item label="需求描述" required>
            <el-input v-model="prototypeRequirement" type="textarea" :rows="8" placeholder="写清使用者、当前问题、期望结果、关键页面和验收方式。" />
          </el-form-item>
          <el-form-item label="需求文档本地路径（可选）">
            <el-input
              v-model="prototypeFilePath"
              class="file-path-input"
              placeholder="粘贴需求文档完整本地路径，例如 C:\\Users\\you\\Documents\\需求.docx"
              clearable
            />
            <span class="form-help">生成提示词时会把文件名和本地路径拼接到需求描述中。</span>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert type="success" :closable="false" show-icon :title="'提示词已生成 · ' + (prototypePromptMode === 'alignment' ? '快速验证' : '按组件规范')">
          <p>复制完整提示词，发送给已经接入伏羲的 AI 助手。修改需求时可返回编辑，当前输入会保留。</p>
        </el-alert>
        <el-input v-model="prototypePrompt" type="textarea" :rows="22" readonly class="prototype-prompt-output" />
      </template>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ prototypePromptGenerated ? '关闭' : '取消' }}</el-button>
        <el-button v-if="prototypePromptGenerated" @click="returnPrototypePromptEdit">返回编辑</el-button>
        <el-button v-if="prototypePromptGenerated" type="primary" @click="copyPrototypePrompt">复制完整提示词</el-button>
        <el-button v-else type="primary" @click="generatePrototypePrompt">生成完整提示词</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showMcpDialog" title="接入平台MCP" width="720px">
      <div class="mcp-dialog-body">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="复制下面的提示词发给你的 AI 助手，它会自动完成 MCP 接入和连通验证。"
        />
        <el-alert
          v-if="mcpPrompt"
          type="success"
          :closable="false"
          show-icon
          :title="`安装 token 至 ${mcpTokenExpiresLocal} 有效；连接码至 ${mcpConnectCodeExpiresLocal} 有效。请尽快复制提示词给 AI 助手完成首次兑换。`"
        />
        <el-alert
          v-else
          type="warning"
          :closable="false"
          show-icon
          title="完整接入包暂不可用，请确认平台已配置 Skill 分发目录后重试。"
        />
        <el-input
          v-model="mcpPrompt"
          type="textarea"
          :rows="14"
          readonly
          class="mcp-prompt"
        />
      </div>
      <template #footer>
        <el-button @click="showMcpDialog = false">关闭</el-button>
        <el-button type="primary" :loading="mcpLoading" :disabled="!mcpPrompt" @click="copyMcpPrompt">
          <el-icon><DocumentCopy /></el-icon>复制提示词
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPrototypes, getMyPrototypes, getSharedPrototypes, deletePrototype } from '../api/prototypes'
import { getUsers, getAgentBootstrap, getMcpSessions, getAgentUpdates, createAgentUpdateIntent } from '../api/auth'
import { getCategories } from '../api/prototypes'
import { Search, Plus, User, Loading, Delete, DocumentCopy } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'
import { buildPrototypePrompt } from '../utils/prototype-prompts'
import PlatformAnnouncementBanner from '../components/PlatformAnnouncementBanner.vue'

const authStore = useAuthStore()
const route = useRoute()

const prototypes = ref([])
const users = ref([])
const categories = ref([])
const searchKeyword = ref('')
const filterCategory = ref(null)
const sortOrder = ref('updated_desc')
const filterCreator = ref(null)
const currentPage = ref(1)
const pageSize = 12
const total = ref(0)
const loading = ref(false)

const showCreateDialog = ref(false)
const prototypePromptMode = ref('alignment')
const prototypeRequirement = ref('')
const prototypeFilePath = ref('')
const prototypePrompt = ref('')
const prototypePromptGenerated = ref(false)
const showMcpDialog = ref(false)
const mcpTokenExpiresAt = ref('')
const mcpConnectCodeExpiresAt = ref('')
const mcpLoading = ref(false)
const mcpPrompt = ref('')
const agentUpdateLoading = ref(false)
const agentUpdateSubmitting = ref(false)
const agentUpdateSession = ref(null)
const agentUpdate = ref(null)
const agentUpdateIntent = ref(null)
const agentUpdateAvailable = ref(false)
const agentUpdateDismissed = ref(false)

const AGENT_UPDATE_DISMISSED_PREFIX = 'fuxi.agent-update.completed-dismissed'

const mcpTokenExpiresLocal = computed(() => {
  if (!mcpTokenExpiresAt.value) return ''
  const d = new Date(mcpTokenExpiresAt.value)
  if (Number.isNaN(d.getTime())) return mcpTokenExpiresAt.value
  return d.toLocaleString('zh-CN', { hour12: false })
})

const mcpConnectCodeExpiresLocal = computed(() => {
  if (!mcpConnectCodeExpiresAt.value) return ''
  const d = new Date(mcpConnectCodeExpiresAt.value)
  if (Number.isNaN(d.getTime())) return mcpConnectCodeExpiresAt.value
  return d.toLocaleString('zh-CN', { hour12: false })
})

const agentUpdateRelease = computed(() => agentUpdate.value || agentUpdateIntent.value?.release || null)
const agentUpdateIntentStatus = computed(() => agentUpdateIntent.value?.status || '')
const agentUpdateScheduled = computed(() => ['scheduled', 'running'].includes(agentUpdateIntentStatus.value))
const agentUpdateCompleted = computed(() => agentUpdateIntentStatus.value === 'completed')
const agentUpdateRolledBack = computed(() => ['rolled_back', 'failed'].includes(agentUpdateIntentStatus.value))
const agentUpdateCanSchedule = computed(() => agentUpdateAvailable.value && Boolean(agentUpdateRelease.value) && !agentUpdateScheduled.value && !agentUpdateCompleted.value)
const agentUpdateVisible = computed(() => Boolean((agentUpdateRelease.value || agentUpdateScheduled.value) && !agentUpdateDismissed.value))
const agentUpdateType = computed(() => {
  if (agentUpdateScheduled.value) return 'success'
  if (agentUpdateCompleted.value) return 'success'
  if (agentUpdateRolledBack.value) return 'warning'
  return agentUpdateRelease.value ? 'warning' : 'info'
})
const agentUpdateTitle = computed(() => {
  if (agentUpdateCompleted.value) return 'MCP 与 Skill 更新完成'
  if (agentUpdateRolledBack.value) return '更新未通过，已恢复旧版本'
  if (agentUpdateIntentStatus.value === 'running') return '更新正在等待客户端启动完成'
  if (agentUpdateIntentStatus.value === 'scheduled') return '已安排下次启动更新'
  return '发现 MCP 与 Skill 更新'
})
const agentUpdateDescription = computed(() => {
  if (agentUpdateCompleted.value) return '新版本已通过启动前检查，当前客户端下次调用将使用新版本。'
  if (agentUpdateRolledBack.value) return '新版本检查未通过，旧版本仍可继续使用；可以稍后重新安排更新。'
  if (agentUpdateIntentStatus.value === 'running') return '启动器已经领取更新，客户端下次启动前会完成校验和切换。'
  if (agentUpdateIntentStatus.value === 'scheduled') return '当前客户端继续可用；关闭并重新打开 AI 客户端后才会执行更新。'
  return '更新不会立即修改本地文件；确认后将在 AI 客户端下一次启动前执行，失败会自动恢复旧版本。'
})

const activeTab = computed(() => route.query.tab || 'all')

const tabTitleMap = { all: '全部原型', mine: '我的原型', shared: '分享给我' }
const tabTitle = computed(() => tabTitleMap[activeTab.value] || '全部原型')

function getAuthorName(userId) {
  const u = users.value.find(u => u.id === userId)
  return u ? (u.nickname || u.username) : `用户${userId}`
}

// 从当前列表提取唯一归属者
const creators = computed(() => {
  const map = new Map()
  prototypes.value.forEach(p => {
    const name = p.creator_name || getAuthorName(p.created_by)
    if (!map.has(p.created_by)) {
      map.set(p.created_by, { id: p.created_by, name })
    }
  })
  return Array.from(map.values())
})

// 筛选后的原型列表
const filteredPrototypes = computed(() => {
  if (filterCreator.value === null) return prototypes.value
  return prototypes.value.filter(p => p.created_by === filterCreator.value)
})

function handleSearch() {
  currentPage.value = 1
  loadData()
}

function handleCategoryChange() {
  currentPage.value = 1
  loadData()
}

function handleSortChange() {
  currentPage.value = 1
  loadData()
}

function toggleCreator(id) {
  filterCreator.value = filterCreator.value === id ? null : id
}

function getProtoCategories(prototype) {
  if (!prototype.categories) return []
  return prototype.categories
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getApiFunction() {
  switch (activeTab.value) {
    case 'mine': return getMyPrototypes
    case 'shared': return getSharedPrototypes
    default: return getPrototypes
  }
}

async function loadData() {
  loading.value = true
  try {
    const apiFn = getApiFunction()
    const res = await apiFn({
      page: currentPage.value,
      pageSize,
      keyword: searchKeyword.value || undefined,
      category_id: filterCategory.value || undefined,
      sort: sortOrder.value,
      scope: activeTab.value === 'all' ? 'all' : undefined
    })
    prototypes.value = res.data.data || []
    total.value = res.data.total || 0
    // 如果当前筛选的归属者不在结果中，自动清除
    if (filterCreator.value && !prototypes.value.some(p => p.created_by === filterCreator.value)) {
      filterCreator.value = null
    }
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  try {
    const res = await getUsers()
    users.value = res.data.data || []
  } catch (err) {
    console.error('加载用户失败', err)
  }
}

async function loadCategories() {
  try {
    const res = await getCategories()
    categories.value = res.data.data || []
  } catch (err) {
    console.error('加载类别失败', err)
  }
}

function openCreateDialog() {
  prototypePromptMode.value = 'alignment'
  prototypeRequirement.value = ''
  prototypeFilePath.value = ''
  prototypePrompt.value = ''
  prototypePromptGenerated.value = false
  showCreateDialog.value = true
}

function getAttachmentName(filePath) {
  return filePath.split(/[\\/]/).pop() || filePath
}

function generatePrototypePrompt() {
  const attachmentPath = prototypeFilePath.value.trim()
  if (!prototypeRequirement.value.trim() && !attachmentPath) {
    ElMessage.warning('请输入需求或选择一份需求文档')
    return
  }
  prototypePrompt.value = buildPrototypePrompt({
    requirement: prototypeRequirement.value.trim(),
    mode: prototypePromptMode.value,
    attachmentName: attachmentPath ? getAttachmentName(attachmentPath) : '',
    attachmentPath
  })
  prototypePromptGenerated.value = true
}

function returnPrototypePromptEdit() {
  prototypePromptGenerated.value = false
}

function copyPrototypePrompt() {
  copyClipboardText(prototypePrompt.value)
    .then(() => ElMessage.success('完整提示词已复制'))
    .catch(() => ElMessage.warning('复制失败，请手工选择提示词'))
}

function agentUpdateDismissalKey(releaseId) {
  const userId = authStore.user?.id || 'anonymous'
  return `${AGENT_UPDATE_DISMISSED_PREFIX}:${userId}:${releaseId}`
}

function hasDismissedCompletedUpdate(releaseId) {
  if (!releaseId) return false
  try {
    return localStorage.getItem(agentUpdateDismissalKey(releaseId)) === '1'
  } catch (err) {
    return false
  }
}

function dismissAgentUpdate() {
  const releaseId = agentUpdateRelease.value?.releaseId
  if (agentUpdateCompleted.value && releaseId) {
    try {
      localStorage.setItem(agentUpdateDismissalKey(releaseId), '1')
    } catch (err) {
      // 本地存储不可用时仍允许本次页面关闭提示。
    }
  }
  agentUpdateDismissed.value = true
}

async function loadAgentBootstrap() {
  mcpLoading.value = true
  try {
    const res = await getAgentBootstrap()
    mcpPrompt.value = res.data.data.prompt
    mcpTokenExpiresAt.value = res.data.data.expiresAt
    mcpConnectCodeExpiresAt.value = res.data.data.connectCodeExpiresAt
  } catch (err) {
    mcpPrompt.value = ''
    mcpTokenExpiresAt.value = ''
    mcpConnectCodeExpiresAt.value = ''
    ElMessage.error(err.response?.data?.message || '生成 Skill + MCP 接入提示词失败')
  } finally {
    mcpLoading.value = false
  }
}

async function loadAgentUpdate() {
  agentUpdateLoading.value = true
  try {
    const sessionsRes = await getMcpSessions()
    const sessions = (sessionsRes.data.data || []).filter(session => !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now())
    agentUpdateSession.value = sessions[0] || null
    if (!agentUpdateSession.value) {
      agentUpdate.value = null
      agentUpdateIntent.value = null
      agentUpdateAvailable.value = false
      agentUpdateDismissed.value = false
      return
    }
    const updatesRes = await getAgentUpdates(agentUpdateSession.value.id)
    const data = updatesRes.data.data || {}
    agentUpdateAvailable.value = (data.updates || []).length > 0
    agentUpdate.value = data.updates?.[0] || null
    const candidateIntents = [...(data.intents || []), ...(data.recentIntents || [])]
    agentUpdateIntent.value = candidateIntents.find(intent => intent.releaseId === agentUpdate.value?.releaseId)
      || (agentUpdate.value ? null : candidateIntents[0] || null)
    if (!agentUpdate.value && agentUpdateIntent.value?.release) {
      agentUpdate.value = agentUpdateIntent.value.release
    }
    agentUpdateDismissed.value = agentUpdateCompleted.value
      && hasDismissedCompletedUpdate(agentUpdateRelease.value?.releaseId)
  } catch (err) {
    // 没有设备会话时不打扰原型列表；只有已接入用户才显示更新状态。
    agentUpdate.value = null
    agentUpdateIntent.value = null
    agentUpdateAvailable.value = false
    agentUpdateDismissed.value = false
  } finally {
    agentUpdateLoading.value = false
  }
}

async function scheduleAgentUpdate() {
  if (!agentUpdateSession.value || !agentUpdateRelease.value) return
  agentUpdateSubmitting.value = true
  try {
    const res = await createAgentUpdateIntent({
      sessionId: agentUpdateSession.value.id,
      releaseId: agentUpdateRelease.value.releaseId
    })
    agentUpdateIntent.value = res.data.data.intent
    ElMessage.success('已安排下次启动更新，当前客户端继续可用')
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '安排更新失败')
  } finally {
    agentUpdateSubmitting.value = false
  }
}

async function openMcpDialog() {
  showMcpDialog.value = true
  await loadAgentBootstrap()
}

function copyMcpPrompt() {
  copyClipboardText(mcpPrompt.value)
    .then(() => ElMessage.success('MCP 接入提示词已复制'))
    .catch(() => ElMessage.warning('复制失败，请手工选择提示词'))
}

async function handleCardCommand(command, p) {
  if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        '确定要将原型「' + p.name + '」移到回收站吗？',
        '确认删除',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
      )
      await deletePrototype(p.id)
      ElMessage.success('已移到回收站')
      loadData()
    } catch (e) {
      if (e !== 'cancel') ElMessage.error('删除失败')
    }
  }
}

watch(() => route.query.tab, () => {
  currentPage.value = 1
  filterCreator.value = null
  loadData()
})

onMounted(() => {
  window.addEventListener('fuxi:open-mcp', openMcpDialog)
  loadData()
  loadUsers()
  loadCategories()
  loadAgentUpdate()
})

onBeforeUnmount(() => {
  window.removeEventListener('fuxi:open-mcp', openMcpDialog)
})
</script>

<style scoped>
.home-page {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.agent-update-banner {
  margin: -8px 0 20px;
}

.agent-update-title-row,
.agent-update-content,
.agent-update-actions {
  display: flex;
  align-items: center;
}

.agent-update-title-row {
  gap: 10px;
  flex-wrap: wrap;
}

.agent-update-content {
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  line-height: 1.6;
}

.agent-update-actions {
  gap: 8px;
  flex-shrink: 0;
}

.page-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.title-count {
  font-weight: 600;
}

.page-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  width: 220px;
}

.category-select {
  width: 150px;
}

.mcp-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mcp-prompt :deep(textarea) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  line-height: 1.55;
}

.prompt-form {
  margin-top: 18px;
}

.form-help {
  display: block;
  margin-top: 6px;
  color: #718096;
  font-size: 12px;
}

.file-path-input {
  margin-top: 10px;
}

.sort-select {
  width: 128px;
}

.prototype-prompt-output :deep(textarea) {
  color: #e2e8f0;
  background: #172033;
  font-family: Consolas, Monaco, monospace;
  line-height: 1.65;
}

/* 归属者筛选标签栏 */
.creator-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: #718096;
  margin-right: 2px;
}

.creator-tag {
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
}

.creator-tag:hover {
  transform: translateY(-1px);
}

.creator-clear {
  margin-left: 4px;
}

.loading-wrapper,
.empty-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 80px 0;
}

/* ========================================
   4列网格布局
   ======================================== */
.prototype-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}

/* ========================================
   卡片样式 - 简约风格
   ======================================== */
.prototype-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
}

.prototype-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #4299e1, #48bb78);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.prototype-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.1);
}

.prototype-card:hover::before {
  opacity: 1;
}

.card-body {
  padding: 18px 18px 14px;
}

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1a202c;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.card-desc {
  font-size: 13px;
  color: #718096;
  margin-bottom: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 39px;
}

.card-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  min-height: 24px;
}

.cat-tag {
  font-size: 12px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #a0aec0;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.card-author {
  display: flex;
  align-items: center;
  gap: 4px;
}

.card-version {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #4299e1;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}

.prototype-card .el-dropdown {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
}

.prototype-card .el-dropdown .card-version {
  position: static;
  cursor: pointer;
  user-select: none;
}

.prototype-card .el-dropdown .card-version:hover {
  background: #3182ce;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

/* ========================================
   响应式
   ======================================== */
@media (max-width: 1200px) {
  .prototype-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .prototype-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-toolbar {
    width: 100%;
  }

  .search-input,
  .category-select {
    width: 100%;
  }

  .prototype-grid {
    grid-template-columns: 1fr;
  }
}
</style>
