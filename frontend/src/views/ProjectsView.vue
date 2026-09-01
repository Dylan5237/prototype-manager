<template>
  <div class="projects-page">
    <div class="page-header">
      <div class="header-left">
        <h1>项目</h1>
        <p class="sub-title">按业务系统组织原型，统一门户入口</p>
      </div>
      <div class="header-actions">
        <div class="toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索项目"
            clearable
            style="width: 300px"
            @keyup.enter="reloadProjects"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="scope" style="width: 120px" @change="reloadProjects">
            <el-option label="全部项目" value="all" />
            <el-option label="我负责" value="owned" />
            <el-option label="我参与" value="participating" />
            <el-option label="有待处理" value="pending" />
          </el-select>
          <el-select v-model="status" style="width: 110px" @change="reloadProjects">
            <el-option label="全部状态" value="all" />
            <el-option label="待确认" value="pending" />
          </el-select>
          <el-button text @click="loadProjects">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          创建项目
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="project-grid">
      <el-card v-for="project in projects" :key="project.id" class="project-card" shadow="hover">
        <div class="card-header">
          <div class="card-title">
            <el-icon :size="22" color="#4facfe"><FolderOpened /></el-icon>
            <span>{{ project.name }}</span>
          </div>
          <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, project)">
            <el-button text><el-icon><MoreFilled /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">编辑信息</el-dropdown-item>
                <el-dropdown-item command="delete" divided type="danger">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <p class="card-desc">{{ project.description || '暂无描述' }}</p>
        <div class="card-meta">
          <span>创建者：{{ project.creator_name || project.created_by }}</span>
          <span class="card-summary">
            <span>原型 {{ project.prototype_count ?? 0 }}</span>
            <span>成员 {{ project.member_count ?? 0 }}</span>
            <span :class="{ 'has-pending': project.pending_candidate_count > 0 }">待确认 {{ project.pending_candidate_count ?? 0 }}</span>
          </span>
          <span>最近活动：{{ formatDate(project.last_activity_at || project.updated_at) }}</span>
        </div>
        <div class="card-actions">
          <el-button type="primary" @click="goProject(project.id)">进入项目</el-button>
        </div>
      </el-card>

      <el-empty v-if="!loading && projects.length === 0" description="暂无项目" />
    </div>

    <el-pagination
      v-if="total > pageSize"
      class="projects-pagination"
      layout="prev, pager, next, total"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      @current-change="handlePageChange"
    />

    <ProjectFormDialog v-model:visible="dialogVisible" :project="editingProject" @saved="loadProjects" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Plus, Search, Refresh, FolderOpened, MoreFilled } from '@element-plus/icons-vue'
import { getProjects, deleteProject } from '../api/projects'
import ProjectFormDialog from '../components/ProjectFormDialog.vue'

const router = useRouter()
const projects = ref([])
const loading = ref(false)
const keyword = ref('')
const scope = ref('all')
const status = ref('all')
const page = ref(1)
const pageSize = 12
const total = ref(0)
const dialogVisible = ref(false)
const editingProject = ref(null)

onMounted(loadProjects)

async function loadProjects() {
  loading.value = true
  try {
    const res = await getProjects({
      keyword: keyword.value,
      scope: scope.value,
      status: status.value,
      page: page.value,
      pageSize
    })
    projects.value = res.data.data || []
    total.value = Number(res.data.total || projects.value.length)
    page.value = Number(res.data.page || page.value)
  } catch (err) {
    ElMessage.error('加载项目失败')
  } finally {
    loading.value = false
  }
}

function reloadProjects() {
  page.value = 1
  loadProjects()
}

function handlePageChange(nextPage) {
  page.value = nextPage
  loadProjects()
}

function openCreateDialog() {
  editingProject.value = null
  dialogVisible.value = true
}

function openEditDialog(project) {
  editingProject.value = project
  dialogVisible.value = true
}

async function handleDelete(project) {
  try {
    await ElMessageBox.confirm(`确定删除项目「${project.name}」吗？`, '确认删除', { type: 'warning' })
    await deleteProject(project.id)
    ElMessage.success('删除成功')
    loadProjects()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

function handleCommand(cmd, project) {
  if (cmd === 'edit') openEditDialog(project)
  if (cmd === 'delete') handleDelete(project)
}

function goProject(id) {
  router.push(`/project/${id}`)
}

function formatDate(str) {
  if (!str) return ''
  const d = new Date(str)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
</script>

<style scoped>
.projects-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 24px;
}
.page-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #1a202c;
}
.sub-title {
  color: #718096;
  font-size: 13px;
  margin-top: 4px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}
.projects-pagination {
  justify-content: center;
  margin-top: 24px;
}
.project-card {
  border-radius: 12px;
  transition: transform 0.2s;
}
.project-card:hover {
  transform: translateY(-2px);
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1a202c;
}
.card-desc {
  color: #4a5568;
  font-size: 13px;
  line-height: 1.5;
  min-height: 40px;
  margin-bottom: 12px;
}
.card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #718096;
  margin-bottom: 16px;
}

.card-summary {
  display: flex;
  gap: 12px;
}
.card-summary .has-pending {
  color: #b7791f;
  font-weight: 600;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .toolbar {
    width: 100%;
  }

  .toolbar :deep(.el-input) {
    flex: 1;
    width: auto !important;
  }
}
</style>
