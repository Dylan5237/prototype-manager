<template>
  <div class="home-view">
    <div class="page-header">
      <h1>原型列表</h1>
      <el-button v-if="authStore.isUploader" type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建原型
      </el-button>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索原型名称或描述"
        clearable
        style="width: 280px"
        @keyup.enter="handleSearch"
      >
        <template #suffix>
          <el-icon @click="handleSearch" style="cursor:pointer"><Search /></el-icon>
        </template>
      </el-input>
      <el-select
        v-model="selectedCategory"
        placeholder="全部分类"
        clearable
        style="width: 160px"
        @change="handleSearch"
      >
        <el-option
          v-for="cat in categories"
          :key="cat.id"
          :label="cat.name"
          :value="cat.id"
        />
      </el-select>
    </div>

    <el-empty v-if="prototypes.length === 0 && !loading" description="暂无原型" />
    
    <el-row v-else :gutter="16">
      <el-col v-for="item in prototypes" :key="item.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="prototype-card" shadow="hover" @click="goToDetail(item.id)">
          <div class="card-header">
            <div class="card-title">
              <el-icon><Folder /></el-icon>
              <span class="name">{{ item.name }}</span>
            </div>
            <el-tag :type="getStatusType(item.sync_status)" size="small">
              {{ getStatusText(item.sync_status) }}
            </el-tag>
          </div>
          <p class="card-desc">{{ item.description || '暂无描述' }}</p>
          <div class="card-meta">
            <span v-if="item.category_name" class="category-tag">{{ item.category_name }}</span>
            <span class="creator">{{ item.creator_name }}</span>
          </div>
          <div class="card-meta">
            <span v-if="item.github_url" class="github-link" @click.stop>
              <el-icon><Link /></el-icon>
              <a :href="item.github_url" target="_blank">GitHub</a>
            </span>
            <span class="update-time">{{ formatDate(item.updated_at) }}</span>
          </div>
          <div class="card-actions" @click.stop>
            <el-button size="small" @click="goToDetail(item.id)">查看</el-button>
            <el-button
              v-if="canEdit(item)"
              size="small"
              type="danger"
              plain
              @click="handleDelete(item)"
            >删除</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建原型弹窗 -->
    <el-dialog v-model="showCreateDialog" title="新建原型" width="500px">
      <el-form :model="createForm" label-width="100px" :rules="createRules" ref="createFormRef">
        <el-form-item label="名称" prop="name">
          <el-input v-model="createForm.name" placeholder="请输入原型名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="createForm.categoryId" placeholder="请选择分类" style="width:100%">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="GitHub链接">
          <el-input v-model="createForm.githubUrl" placeholder="https://github.com/owner/repo" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="createForm.tags" multiple filterable allow-create placeholder="输入标签" style="width:100%">
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
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { getPrototypes, createPrototype, deletePrototype, getCategories } from '../api/prototypes'

const router = useRouter()
const authStore = useAuthStore()
const prototypes = ref([])
const categories = ref([])
const loading = ref(false)
const searchKeyword = ref('')
const selectedCategory = ref('')
const showCreateDialog = ref(false)
const creating = ref(false)
const createFormRef = ref(null)
const createForm = ref({
  name: '',
  description: '',
  githubUrl: '',
  categoryId: null,
  tags: []
})

const createRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }]
}

async function loadData() {
  loading.value = true
  try {
    const [protoRes, catRes] = await Promise.all([
      getPrototypes({ keyword: searchKeyword.value, category_id: selectedCategory.value }),
      getCategories()
    ])
    prototypes.value = protoRes.data.data || []
    categories.value = catRes.data.data || []
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  loadData()
}

function goToDetail(id) {
  router.push(`/prototype/${id}`)
}

function canEdit(item) {
  return authStore.isAdmin || item.created_by === authStore.user?.id
}

async function handleCreate() {
  const valid = await createFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  creating.value = true
  try {
    await createPrototype(createForm.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    createForm.value = { name: '', description: '', githubUrl: '', categoryId: null, tags: [] }
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleDelete(item) {
  try {
    await ElMessageBox.confirm(`确定删除原型 "${item.name}" 吗？`, '确认删除', { type: 'warning' })
    await deletePrototype(item.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function getStatusType(status) {
  const map = {
    success: 'success',
    failed: 'danger',
    syncing: 'warning',
    uploaded: 'success',
    pending: 'info'
  }
  return map[status] || 'info'
}

function getStatusText(status) {
  const map = {
    success: '已同步',
    failed: '同步失败',
    syncing: '同步中',
    uploaded: '已上传',
    pending: '待同步'
  }
  return map[status] || status
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

onMounted(loadData)
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h1 {
  font-size: 22px;
  color: #303133;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.prototype-card {
  margin-bottom: 16px;
  cursor: pointer;
  transition: transform 0.2s;
}

.prototype-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.card-title .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.card-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 36px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #c0c4cc;
  margin-bottom: 8px;
}

.category-tag {
  background: #ecf5ff;
  color: #409eff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.creator {
  color: #909399;
}

.github-link {
  display: flex;
  align-items: center;
  gap: 4px;
}

.github-link a {
  color: #409eff;
  text-decoration: none;
}

.card-actions {
  display: flex;
  gap: 8px;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}
</style>
