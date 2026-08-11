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
        <el-button @click="openMcpDialog">
          <el-icon><Connection /></el-icon>接入平台MCP
        </el-button>
        <el-button v-if="authStore.isAdmin || authStore.isEditor" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>新建原型
        </el-button>
      </div>
    </div>

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

    <el-dialog v-model="showCreateDialog" title="新建原型" width="480px">
      <el-form :model="newPrototype" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="newPrototype.name" placeholder="请输入原型名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newPrototype.description" type="textarea" :rows="3" placeholder="请输入原型描述" />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="newPrototype.category_ids" multiple placeholder="选择类别" style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
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
          v-if="mcpToken"
          type="success"
          :closable="false"
          show-icon
          :title="`已生成短期 MCP token（${mcpTokenExpiresAt} 前有效）。复制提示词发给 AI 助手后，它会自动写入配置并验证连通。`"
        />
        <el-alert
          v-else
          type="warning"
          :closable="false"
          show-icon
          title="未获取到短期 token，请确认已登录后重试。提示词会要求 AI 助手向你索取 JWT。"
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
        <el-button type="primary" @click="copyMcpPrompt">
          <el-icon><DocumentCopy /></el-icon>复制提示词
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPrototypes, getMyPrototypes, getSharedPrototypes, createPrototype, deletePrototype } from '../api/prototypes'
import { getUsers, getMcpToken } from '../api/auth'
import { getCategories } from '../api/prototypes'
import { Search, Plus, User, Loading, Delete, Connection, DocumentCopy } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()

const prototypes = ref([])
const users = ref([])
const categories = ref([])
const searchKeyword = ref('')
const filterCategory = ref(null)
const filterCreator = ref(null)
const currentPage = ref(1)
const pageSize = 12
const total = ref(0)
const loading = ref(false)

const showCreateDialog = ref(false)
const newPrototype = ref({ name: '', description: '', category_ids: [] })
const creating = ref(false)
const showMcpDialog = ref(false)
const mcpToken = ref('')
const mcpTokenExpiresAt = ref('')
const mcpLoading = ref(false)
const mcpPrompt = computed(() => buildMcpPrompt())

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
  newPrototype.value = { name: '', description: '', category_ids: [] }
  showCreateDialog.value = true
}

function getFuxiApiUrl() {
  const url = new URL(window.location.href)
  if (url.port === '3000') {
    url.port = '3001'
  }
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.origin
}

async function loadMcpToken() {
  mcpLoading.value = true
  try {
    const res = await getMcpToken()
    mcpToken.value = res.data.data.token
    mcpTokenExpiresAt.value = res.data.data.expiresAt
  } catch (err) {
    mcpToken.value = ''
    mcpTokenExpiresAt.value = ''
    ElMessage.error('获取 MCP 接入 token 失败，请先登录')
  } finally {
    mcpLoading.value = false
  }
}

function buildMcpPrompt() {
  const apiUrl = getFuxiApiUrl()
  const token = mcpToken.value
  const tokenBlock = token
    ? `     FUXI_TOKEN=${token}\n     # token 有效期至 ${mcpTokenExpiresAt.value}，过期后请回到平台重新生成`
    : `     FUXI_TOKEN=<在这里粘贴平台生成的短期 token>`
  return `请帮我自动接入伏羲平台 MCP，不要让我手动编辑配置文件。

目标：
- MCP 名称：fuxi-platform
- 伏羲后端 API：${apiUrl}
- MCP server 来自伏羲平台仓库的 mcp-server/src/server.js

请你执行：
1. 在当前机器或当前工作区中定位 FuxiPlatform/mcp-server/src/server.js；如果没有找到，请提示我提供平台仓库路径或安装包。
2. 检查 Node.js 版本，需要 >= 18。
3. 将该 stdio MCP server 写入你当前使用的 MCP Host 配置：
     command: node
     args: [<FuxiPlatform绝对路径>/mcp-server/src/server.js]
     env:
       FUXI_API_URL=${apiUrl}
${tokenBlock}
4. 不要把 token 写进仓库文件；只写入 MCP Host 的本地安全配置。
5. 接入后调用 fuxi-platform 的 check_connection 工具验证连通性；如果 token 已过期，请告诉我重新到平台生成。
6. 连通后列出可用工具，并告诉我后续上传原型应该使用 fuxi-adapter + 原型规范 skill 生成，再用 Fuxi MCP 上传。

如果你的环境没有可写的 MCP 配置入口，请明确告诉我卡在哪一步，并给出需要我点击确认的最小操作。`
}

async function openMcpDialog() {
  showMcpDialog.value = true
  await loadMcpToken()
}

function copyMcpPrompt() {
  copyText(mcpPrompt.value, 'MCP 接入提示词已复制')
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

async function handleCreate() {
  if (!newPrototype.value.name?.trim()) {
    ElMessage.warning('请输入原型名称')
    return
  }
  creating.value = true
  try {
    await createPrototype(newPrototype.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '创建失败')
  } finally {
    creating.value = false
  }
}

function copyText(text, successMsg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success(successMsg)
    }).catch(() => {
      fallbackCopy(text, successMsg)
    })
  } else {
    fallbackCopy(text, successMsg)
  }
}

function fallbackCopy(text, successMsg) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  ElMessage.success(successMsg)
}

watch(() => route.query.tab, () => {
  currentPage.value = 1
  filterCreator.value = null
  loadData()
})

onMounted(() => {
  loadData()
  loadUsers()
  loadCategories()
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
