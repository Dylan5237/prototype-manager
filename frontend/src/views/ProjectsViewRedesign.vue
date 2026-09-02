<template>
  <div class="projects-page">
    <div class="page-wrap">
      <div class="page-header">
        <div>
          <div class="eyebrow">Project workspace</div>
          <h1 class="page-title">项目</h1>
          <p class="page-description">按业务系统组织原型，把需要决策的状态放在一起。</p>
        </div>
        <el-button type="primary" class="primary-action" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          创建项目
        </el-button>
      </div>

      <section class="overview-strip" aria-label="项目概览">
        <article class="metric-card">
          <span class="metric-label">我参与的项目</span>
          <strong class="metric-value">{{ total }}</strong>
          <span class="metric-delta">{{ activeProjectCount }} 个近期有更新</span>
        </article>
        <article class="metric-card metric-card--attention">
          <span class="metric-label">待处理候选</span>
          <strong class="metric-value">{{ pendingCandidateCount }}</strong>
          <span class="metric-delta">需要负责人确认</span>
        </article>
        <article class="metric-card metric-card--green">
          <span class="metric-label">绑定原型</span>
          <strong class="metric-value">{{ prototypeCount }}</strong>
          <span class="metric-delta">来自当前可见项目</span>
        </article>
        <article class="metric-card metric-card--purple">
          <span class="metric-label">项目成员</span>
          <strong class="metric-value">{{ memberCount }}</strong>
          <span class="metric-delta">当前项目范围内</span>
        </article>
      </section>

      <div class="toolbar-row">
        <div class="filter-tabs" role="tablist" aria-label="项目范围">
          <button
            v-for="item in scopeOptions"
            :key="item.value"
            type="button"
            class="filter-tab"
            :class="{ active: scope === item.value }"
            :aria-selected="scope === item.value"
            role="tab"
            @click="selectScope(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="toolbar-tools">
          <label class="search-box">
            <el-icon><Search /></el-icon>
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索项目名称或描述"
              aria-label="搜索项目"
              @keyup.enter="reloadProjects"
            />
          </label>
          <el-select v-model="status" class="status-select" aria-label="项目状态" @change="reloadProjects">
            <el-option label="全部状态" value="all" />
            <el-option label="待确认" value="pending" />
          </el-select>
          <el-button text class="refresh-button" @click="loadProjects">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>

      <div v-loading="loading" class="project-grid">
        <article v-for="(project, index) in projects" :key="project.id" class="project-card">
          <div class="project-card-head">
            <div class="project-card-title">
              <span class="project-icon" :class="projectIconClass(index)">{{ projectInitial(project.name) }}</span>
              <h2>{{ project.name }}</h2>
            </div>
            <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, project)">
              <button type="button" class="more-button" :aria-label="`${project.name} 更多操作`">⋯</button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">编辑信息</el-dropdown-item>
                  <el-dropdown-item command="delete" divided type="danger">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <p class="project-card-description">{{ project.description || '暂无描述' }}</p>
          <span class="status-chip" :class="projectStatus(project).tone">{{ projectStatus(project).label }}</span>
          <div class="card-stats">
            <div class="card-stat"><strong>{{ project.prototype_count ?? 0 }}</strong><span>绑定原型</span></div>
            <div class="card-stat"><strong :class="{ attention: project.pending_candidate_count > 0 }">{{ project.pending_candidate_count ?? 0 }}</strong><span>待确认候选</span></div>
            <div class="card-stat"><strong>{{ project.member_count ?? 0 }}</strong><span>成员</span></div>
          </div>
          <div class="project-card-footer">
            <span class="owner">
              <span class="avatar">{{ projectInitial(project.creator_name || project.created_by) }}</span>
              {{ project.creator_name || project.created_by || '未指定' }}
            </span>
            <span class="activity">{{ formatDate(project.last_activity_at || project.updated_at) || '暂无活动' }}</span>
            <el-button class="enter-button" size="small" @click="goProject(project.id)">进入工作台&nbsp;→</el-button>
          </div>
        </article>

        <div v-if="!loading && projects.length === 0" class="empty-card">
          <strong>没有找到匹配项目</strong>
          <span>换个关键词或清除筛选条件</span>
        </div>
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
    </div>

    <ProjectFormDialog v-model:visible="dialogVisible" :project="editingProject" @saved="loadProjects" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { deleteProject, getProjects } from '../api/projects'
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

const scopeOptions = [
  { label: '全部项目', value: 'all' },
  { label: '我负责', value: 'owned' },
  { label: '有待处理', value: 'pending' }
]

const pendingCandidateCount = computed(() => projects.value.reduce((sum, project) => sum + Number(project.pending_candidate_count || 0), 0))
const prototypeCount = computed(() => projects.value.reduce((sum, project) => sum + Number(project.prototype_count || 0), 0))
const memberCount = computed(() => projects.value.reduce((sum, project) => sum + Number(project.member_count || 0), 0))
const activeProjectCount = computed(() => projects.value.filter(project => project.last_activity_at || project.updated_at).length)

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

function selectScope(nextScope) {
  if (scope.value === nextScope) return
  scope.value = nextScope
  reloadProjects()
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
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '删除失败')
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function projectInitial(value) {
  return String(value || '项').trim().slice(0, 1).toUpperCase()
}

function projectIconClass(index) {
  return ['blue', 'orange', 'green', 'purple'][index % 4]
}

function projectStatus(project) {
  if (Number(project.pending_candidate_count || 0) > 0) return { label: '需要关注', tone: 'attention' }
  if (Number(project.prototype_count || 0) > 0) return { label: '稳定运行', tone: 'stable' }
  return { label: '尚未配置', tone: 'neutral' }
}
</script>

<style scoped>
.projects-page { min-height: calc(100vh - 56px); padding: 34px; color: #1a2438; background: #f6f8fc; }
.page-wrap { max-width: 1420px; margin: 0 auto; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.eyebrow { color: #3c6ff2; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.page-title { margin: 6px 0 5px; color: #1a2438; font-size: 28px; line-height: 1.2; letter-spacing: -.035em; }
.page-description { margin: 0; color: #72809a; font-size: 13px; }
.primary-action { min-height: 36px; border-radius: 8px; }
.overview-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 25px; }
.metric-card { position: relative; overflow: hidden; border: 1px solid #e7ebf2; border-radius: 13px; padding: 17px 18px; background: #fff; box-shadow: 0 4px 16px rgba(24, 40, 75, .07); }
.metric-card::after { position: absolute; right: -18px; bottom: -25px; width: 80px; height: 80px; border-radius: 50%; background: #edf2ff; content: ''; }
.metric-card--attention::after { background: #fff6e5; }
.metric-card--green::after { background: #eaf8f2; }
.metric-card--purple::after { background: #f1edff; }
.metric-label, .metric-delta, .metric-value { position: relative; z-index: 1; display: block; }
.metric-label { color: #72809a; font-size: 12px; }
.metric-value { margin-top: 7px; color: #1a2438; font-size: 25px; font-weight: 750; letter-spacing: -.04em; }
.metric-delta { margin-top: 2px; color: #11966c; font-size: 11px; }
.metric-card--attention .metric-delta { color: #c47a16; }
.metric-card--purple .metric-delta { color: #7160d5; }
.toolbar-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 15px; }
.filter-tabs { display: flex; gap: 3px; padding: 3px; border: 1px solid #e7ebf2; border-radius: 9px; background: #eef1f7; }
.filter-tab { border: 0; border-radius: 7px; padding: 7px 13px; color: #72809a; background: transparent; cursor: pointer; font-size: 12px; }
.filter-tab.active { color: #1a2438; background: #fff; box-shadow: 0 2px 6px rgba(31,49,87,.09); font-weight: 700; }
.filter-tab:focus-visible, .more-button:focus-visible { outline: 3px solid #a9c2ff; outline-offset: 2px; }
.toolbar-tools { display: flex; align-items: center; gap: 12px; }
.search-box { display: flex; align-items: center; gap: 8px; width: 248px; height: 36px; border: 1px solid #d7deeb; border-radius: 8px; padding: 0 11px; color: #9ba7bb; background: #fff; }
.search-box input { width: 100%; height: 34px; border: 0; outline: 0; color: #1a2438; background: transparent; font-size: 12px; }
.status-select { width: 118px; }
.refresh-button { color: #72809a; }
.project-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 17px; }
.project-card { display: flex; min-height: 243px; flex-direction: column; border: 1px solid #e7ebf2; border-radius: 14px; padding: 19px; background: #fff; box-shadow: 0 4px 16px rgba(24, 40, 75, .07); transition: .2s ease; }
.project-card:hover { border-color: #b9c9ec; box-shadow: 0 18px 50px rgba(24, 40, 75, .08); transform: translateY(-2px); }
.project-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.project-card-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.project-card-title h2 { overflow: hidden; margin: 0; color: #1a2438; font-size: 16px; letter-spacing: -.02em; text-overflow: ellipsis; white-space: nowrap; }
.project-icon { display: grid; place-items: center; width: 37px; height: 37px; flex: 0 0 auto; border-radius: 11px; color: #fff; background: linear-gradient(145deg, #6e92fb, #3664df); font-size: 17px; font-weight: 800; }
.project-icon.orange { background: linear-gradient(145deg, #e7ae60, #c77c2c); }
.project-icon.green { background: linear-gradient(145deg, #5fc7a3, #13936b); }
.project-icon.purple { background: linear-gradient(145deg, #aa9af5, #7160d5); }
.more-button { width: 27px; height: 27px; border: 0; border-radius: 7px; color: #9ba7bb; background: transparent; cursor: pointer; font-size: 19px; }
.more-button:hover { color: #3c6ff2; background: #edf2ff; }
.project-card-description { min-height: 42px; margin: 17px 0; color: #72809a; font-size: 12px; line-height: 1.7; }
.status-chip { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; border-radius: 99px; padding: 4px 8px; color: #11966c; background: #eaf8f2; font-size: 11px; font-weight: 700; }
.status-chip::before { width: 5px; height: 5px; border-radius: 50%; background: currentColor; content: ''; }
.status-chip.attention { color: #c47a16; background: #fff6e5; }
.status-chip.neutral { color: #72809a; background: #f0f2f6; }
.card-stats { display: flex; gap: 19px; padding: 12px 0; margin-top: 12px; border-top: 1px solid #e7ebf2; border-bottom: 1px solid #e7ebf2; }
.card-stat { display: grid; gap: 2px; }
.card-stat strong { color: #1a2438; font-size: 15px; letter-spacing: -.02em; }
.card-stat strong.attention { color: #c47a16; }
.card-stat span { color: #72809a; font-size: 11px; }
.project-card-footer { display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 14px; }
.owner { display: flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; color: #72809a; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.avatar { display: grid; place-items: center; width: 22px; height: 22px; flex: 0 0 auto; border-radius: 7px; color: #fff; background: linear-gradient(145deg, #d08a71, #98536e); font-size: 9px; font-weight: 800; }
.activity { color: #9ba7bb; font-size: 11px; white-space: nowrap; }
.enter-button { margin-left: auto; white-space: nowrap; }
.empty-card { display: grid; place-items: center; min-height: 243px; border: 1px dashed #d7deeb; border-radius: 14px; color: #72809a; background: rgba(255,255,255,.6); text-align: center; }
.empty-card strong { display: block; margin-bottom: 5px; color: #1a2438; }
.projects-pagination { justify-content: center; margin-top: 24px; }
@media (max-width: 1180px) { .project-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 820px) {
  .projects-page { padding: 24px 17px; }
  .overview-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar-row { align-items: flex-start; flex-direction: column; }
  .toolbar-tools { width: 100%; flex-wrap: wrap; }
  .search-box { flex: 1; min-width: 210px; }
}
@media (max-width: 600px) {
  .page-header { align-items: flex-start; flex-direction: column; }
  .project-grid { grid-template-columns: 1fr; }
  .toolbar-tools { align-items: stretch; }
  .status-select { width: 110px; }
}
</style>
