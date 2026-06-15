<template>
  <div class="home-page">
    <div class="page-header">
      <h2 class="page-title">{{ tabTitle }}</h2>
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
        <el-select v-model="filterCategory" placeholder="按类别筛选" clearable class="category-select" @change="loadData">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-button v-if="authStore.isAdmin || authStore.isUploader" type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>新建原型
        </el-button>
      </div>
    </div>

    <div v-if="loading" class="loading-wrapper">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
    </div>

    <div v-else-if="prototypes.length === 0" class="empty-wrapper">
      <el-empty description="暂无原型" />
    </div>

    <div v-else class="prototype-grid">
      <div v-for="p in prototypes" :key="p.id" class="prototype-card" @click="$router.push(`/prototype/${p.id}`)">
        <div class="card-body">
          <h3 class="card-title">{{ p.name }}</h3>
          <p class="card-desc">{{ p.description || '暂无描述' }}</p>
          <div class="card-meta">
            <el-tag v-for="cat in getProtoCategories(p)" :key="cat.id" size="small" effect="light" class="cat-tag">{{ cat.name }}</el-tag>
          </div>
          <div class="card-footer">
            <span class="card-author">
              <el-icon><User /></el-icon>
              {{ getAuthorName(p.created_by) }}
            </span>
            <span class="card-date">{{ formatDate(p.created_at) }}</span>
          </div>
        </div>
        <el-dropdown v-if="authStore.isAdmin || p.created_by === authStore.user.id" trigger="click" @command="(cmd) => handleCardCommand(cmd, p)">
          <span class="card-version" @click.stop>v{{ p.version }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="delete">
                <el-icon><Delete /></el-icon>删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <span v-else class="card-version">v{{ p.version }}</span>
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPrototypes, getMyPrototypes, getSharedPrototypes, createPrototype, deletePrototype } from '../api/prototypes'
import { getUsers } from '../api/auth'
import { getCategories } from '../api/prototypes'
import { Search, Plus, User, Loading, Delete } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const route = useRoute()

const prototypes = ref([])
const users = ref([])
const categories = ref([])
const searchKeyword = ref('')
const filterCategory = ref(null)
const currentPage = ref(1)
const pageSize = 8
const total = ref(0)
const loading = ref(false)

const showCreateDialog = ref(false)
const newPrototype = ref({ name: '', description: '', category_ids: [] })
const creating = ref(false)

const activeTab = computed(() => route.query.tab || 'all')

const tabTitleMap = { all: '全部原型', mine: '我的原型', shared: '分享给我' }
const tabTitle = computed(() => tabTitleMap[activeTab.value] || '全部原型')

function getAuthorName(userId) {
  const u = users.value.find(u => u.id === userId)
  return u ? (u.nickname || u.username) : `用户${userId}`
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

watch(() => route.query.tab, () => {
  currentPage.value = 1
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

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
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
