<template>
  <div class="project-portal">
    <ProjectHeader
      :project="project"
      :role-label="roleLabel"
      :can-manage="canManage"
      @back="router.push('/projects')"
      @manage-menu="showMenuDialog = true"
      @snapshots="openSnapshotDialog"
      @members="openMembersDialog"
      @full-preview="openFullPreview"
    />

    <div class="portal-body">
      <aside class="portal-menu" aria-label="项目菜单">
        <ProjectMenuTree :nodes="project.menu_config?.items" :active-path="activePath" :state-for="getMenuStateByPath" @select="selectMenuNode" />
        <el-empty v-if="!hasMenu" description="暂无菜单配置" />
        <div v-else class="nav-footnote">
          <strong>项目结构提示</strong>
          左侧只放稳定的业务入口；进入原型工作台后，菜单与协作信息从覆盖抽屉展开。
        </div>
      </aside>

      <main class="portal-content">
        <div v-if="!activeItem" class="empty-content">
          <el-empty description="请从左侧选择一个菜单项" />
        </div>

        <template v-else>
          <section class="module-hero">
            <div class="module-heading">
              <p class="eyebrow">{{ activeParentLabel || '当前功能模块' }}</p>
              <h2>{{ activeItem.label }}</h2>
              <p>查看该菜单节点的负责人、绑定原型、正式版本与协作状态。</p>
            </div>
            <div class="owner-card">
              <span class="owner-avatar">{{ currentOwnerName.slice(0, 1).toUpperCase() }}</span>
              <span class="owner-copy">
                <small>当前节点负责人</small>
                <strong>{{ currentOwnerName }}</strong>
              </span>
              <el-button v-if="canManage && activeItem?.id" text type="primary" size="small" @click="openAssignmentDialog">配置分工</el-button>
            </div>
          </section>

          <section class="portal-grid">
            <article v-if="currentBinding" class="prototype-card">
              <div class="card-kicker"><span>绑定原型</span><el-tag type="success" effect="light" size="small">正式版</el-tag></div>
              <div class="prototype-card-body">
                <div class="prototype-thumb" aria-hidden="true"><span></span><span></span><span></span></div>
                <div class="prototype-card-copy">
                  <div class="prototype-title-row">
                    <h3>{{ currentBinding.prototype_name }}</h3>
                    <el-tag type="info" effect="plain" size="small">v{{ currentBinding.version_label || currentBinding.version_number }}</el-tag>
                  </div>
                  <p>{{ currentBinding.prototype_description || '进入工作台查看并操作该菜单节点的原型。' }}</p>
                  <div class="prototype-meta">
                    <span>菜单路径：{{ activePathLabel }}</span>
                    <span v-if="currentBinding.entry_file">入口：{{ currentBinding.entry_file }}</span>
                  </div>
                  <div class="card-actions">
                    <el-button type="primary" @click="enterWorkspace">进入原型工作台</el-button>
                    <el-button text @click="goPrototype(currentBinding.prototype_id)"><el-icon><Link /></el-icon>原型详情</el-button>
                    <el-button v-if="canManage" text type="danger" :loading="unbinding" @click="handleUnbind">解绑原型</el-button>
                  </div>
                </div>
              </div>
            </article>

            <article v-else class="bind-card">
              <div class="card-kicker"><span>绑定原型</span><el-tag type="warning" effect="light" size="small">未绑定</el-tag></div>
              <div class="bind-card-body">
                <el-empty description="该菜单项尚未绑定原型">
                  <template #description>
                    <p>该菜单项尚未绑定原型</p>
                    <p v-if="canManage" class="bind-tip">选择一个原型绑定到「{{ activePathLabel }}」</p>
                  </template>
                </el-empty>
                <div v-if="canManage" class="bind-form">
                  <el-select
                    v-model="selectedPrototypeId"
                    filterable
                    remote
                    reserve-keyword
                    placeholder="选择原型"
                    style="width: min(320px, 100%)"
                    :remote-method="handlePrototypeSearch"
                    :loading="prototypesLoading"
                  >
                    <el-option v-for="prototype in availablePrototypes" :key="prototype.id" :label="prototype.name" :value="prototype.id" />
                  </el-select>
                  <el-button type="primary" @click="handleBind" :loading="binding">绑定</el-button>
                </div>
                <el-pagination
                  v-if="prototypesTotal > prototypesPageSize"
                  class="prototype-pagination"
                  small
                  layout="prev, pager, next"
                  :current-page="prototypesPage"
                  :page-size="prototypesPageSize"
                  :total="prototypesTotal"
                  @current-change="handlePrototypePageChange"
                />
              </div>
            </article>

            <aside class="collab-card">
              <div class="card-kicker"><span>模块协作</span><el-tag v-if="pendingReadyCount" type="warning" effect="light" size="small">待处理</el-tag></div>
              <div class="metric-list">
                <div><span>当前负责人</span><strong>{{ currentOwnerName }}</strong></div>
                <div><span>待审修订</span><strong :class="{ 'metric-warning': pendingReadyCount }">{{ pendingReadyCount }}</strong></div>
                <div><span>绑定状态</span><strong>{{ currentBinding ? '已绑定' : '未绑定' }}</strong></div>
                <div v-if="currentBinding"><span>签出状态</span><strong>{{ currentCheckoutLabel }}</strong></div>
              </div>
              <div class="collab-actions">
                <el-button v-if="currentBinding && canEdit && !currentBinding.checkout" text type="primary" @click="handleCheckout">签出原型</el-button>
                <el-button v-if="currentBinding && isMyCheckout" text type="success" @click="handleCheckin">签入</el-button>
                <el-button v-if="currentBinding && canManage && currentBinding.checkout && !isMyCheckout" text type="warning" @click="handleForceRelease">释放签出</el-button>
                <el-button v-if="currentBinding && (canEdit || pendingReadyCount)" text type="primary" @click="openChangesDialog">查看协作任务</el-button>
              </div>
            </aside>
          </section>

          <section class="activity-section">
            <div class="section-heading">
              <div><p class="eyebrow">协作动态</p><h3>围绕当前菜单节点</h3></div>
              <el-button v-if="canEdit && currentBinding" text type="primary" @click="openChangeRequest">让 AI 修改</el-button>
            </div>
            <div v-if="tasks.length" class="activity-list">
              <div v-for="task in tasks.slice(0, 4)" :key="task.id" class="activity-item">
                <span class="activity-dot" :class="`status-${task.status}`"></span>
                <div class="activity-copy">
                  <strong>{{ task.title }}</strong>
                  <p>{{ displayPersonName(task.requester_name, task.requester_username, '发起人') }} · {{ taskStatusMeta(task.status).label }} · 提交 {{ task.candidate_count || 0 }} · 基线 v{{ task.base_version_number }}</p>
                </div>
                <el-button text type="primary" size="small" @click="openChangesDialog(task)">查看</el-button>
              </div>
            </div>
            <el-empty v-else description="当前菜单暂无协作任务" :image-size="72" />
          </section>
        </template>
      </main>
    </div>

    <!-- 管理菜单弹窗 -->
    <ProjectFormDialog
      v-model:visible="showMenuDialog"
      :project="project"
      @saved="loadProject"
    />

    <el-dialog v-model="changeRequestVisible" title="让 AI 修改" width="620px" destroy-on-close>
      <template v-if="!changeTaskResult">
        <p class="dialog-tip">描述想看到的结果。平台会创建 Task v2 任务；Agent 基于当前正式版本提交待审修订，不会直接覆盖原型。</p>
        <el-form label-position="top">
          <el-form-item label="任务标题">
            <el-input
              v-model="changeTitle"
              maxlength="120"
              placeholder="例如：客户列表增加跟进筛选"
            />
          </el-form-item>
          <el-form-item label="修改目标">
            <el-input
              v-model="changeRequirement"
              type="textarea"
              :rows="6"
              maxlength="4000"
              show-word-limit
              placeholder="例如：在客户列表增加最近跟进时间，并支持按跟进状态筛选"
            />
          </el-form-item>
          <el-form-item label="版本号策略" required>
            <el-radio-group v-model="changeVersionStrategyType">
              <el-radio label="auto">让 AI 决定版本号</el-radio>
              <el-radio label="custom">自定义版本号</el-radio>
            </el-radio-group>
            <p class="dialog-tip">AI 只选择 major、minor 或 patch，平台负责计算准确版本号。</p>
          </el-form-item>
          <el-form-item v-if="changeVersionStrategyType === 'custom'" label="自定义 SemVer" required>
            <el-input v-model="changeVersionStrategyValue" placeholder="例如 1.2.0" />
            <p class="dialog-tip">必须高于当前正式版本，且不能重复。</p>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert title="任务已生成" type="success" :closable="false" show-icon>
          <p>把下面完整提示词发送给已经接入伏羲的 AI 助手。请使用 taskId 提交待审修订，不要走旧的 /changes 写入。</p>
        </el-alert>
        <div class="task-code-row">
          <span>taskId</span>
          <code>{{ changeTaskResult.taskId }}</code>
        </div>
        <div v-if="changeTaskResult.handoffCode" class="task-code-row">
          <span>任务码</span>
          <code>{{ changeTaskResult.handoffCode }}</code>
        </div>
        <p class="dialog-tip">版本策略：{{ changeTaskResult.task?.version_strategy_type === 'custom' ? `自定义 v${changeTaskResult.task.version_strategy_value}` : 'AI 决定 major / minor / patch' }}</p>
        <pre class="task-prompt">{{ changeTaskResult.prompt }}</pre>
        <p class="dialog-tip">修订上传后仍需项目负责人采用为正式版，当前正式版本不会自动改变。</p>
      </template>
      <template #footer>
        <el-button @click="changeRequestVisible = false">{{ changeTaskResult ? '关闭' : '取消' }}</el-button>
        <el-button v-if="changeTaskResult" type="primary" @click="copyChangePrompt">复制完整提示词</el-button>
        <el-button v-else type="primary" :loading="creatingChange" @click="submitChangeTask">生成 AI 任务</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="changesVisible" title="任务管理器" width="90%" top="5vh" destroy-on-close>
      <div class="changes-layout" v-loading="tasksLoading">
        <div class="changes-list">
          <div class="task-manager-hint">这里记录本节点的协作任务。审核时只对照正式版与当前待审修订；校验失败、退回和被替代的旧提议收在历史尝试里。</div>
          <button
            v-for="task in tasks"
            :key="task.id"
            :class="['change-card', { active: selectedTask?.id === task.id }]"
            @click="selectTask(task)"
          >
            <div class="change-card-head">
              <strong>{{ task.title }}</strong>
              <el-tag :type="taskStatusMeta(task.status).type" size="small">
                {{ taskStatusMeta(task.status).label }}
              </el-tag>
            </div>
            <span>{{ displayPersonName(task.requester_name, task.requester_username, '发起人') }} · 基线 v{{ task.base_version_number }} · 提交 {{ task.candidate_count || 0 }}</span>
          </button>
          <el-empty v-if="!tasksLoading && !tasks.length" description="暂无协作任务" />
        </div>
        <div v-if="selectedTask" class="change-detail">
          <div class="change-summary">
            <div>
              <h3>{{ selectedTask.title }}</h3>
              <p>{{ selectedTask.requirement }}</p>
            </div>
            <div class="review-actions">
              <el-button
                v-if="canCancelTask(selectedTask)"
                type="danger"
                plain
                @click="cancelSelectedTask"
              >取消任务</el-button>
            </div>
          </div>
          <div class="task-history-pane">
            <TaskCandidateHistory
              :candidates="candidates"
              :selected-candidate="selectedCandidate"
              :loading="candidatesLoading"
              :reviewing="reviewingChange"
              :role="role"
              :task="selectedTask"
              :module-label="activeItem?.label || ''"
              :owner-name="taskOwnerName"
              :official-preview-url="previewUrl || ''"
              :official-binding="currentBinding"
              :preview-token="authStore.token || ''"
              @select="selectCandidate"
              @adopt="adoptSelectedCandidate"
              @return="returnSelectedCandidate"
            />
          </div>
        </div>
        <el-empty v-else class="change-detail" description="请选择一个任务" />
      </div>
    </el-dialog>

    <!-- 快照弹窗 -->
    <el-dialog v-model="snapshotVisible" title="项目快照" width="640px">
      <div class="snapshot-form" v-if="canManage">
        <el-input v-model="snapshotName" placeholder="快照名称，例如：v1.0 基线" style="width: 280px" />
        <el-button type="primary" @click="handleCreateSnapshot" :loading="creatingSnapshot">创建快照</el-button>
      </div>
      <el-table :data="snapshots" style="width: 100%; margin-top: 16px" v-loading="snapshotsLoading">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="version_label" label="版本标签" />
        <el-table-column prop="creator_name" label="创建者" />
        <el-table-column prop="created_at" label="时间" :formatter="formatDate" />
        <el-table-column v-if="canManage" label="操作" width="160">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleRestoreSnapshot(row)">恢复</el-button>
            <el-button text type="danger" size="small" @click="handleDeleteSnapshot(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 成员管理弹窗 -->
    <el-dialog v-model="membersVisible" title="项目成员" width="560px">
      <div v-if="canManage" class="member-form">
        <el-select
          v-model="memberUsername"
          filterable
          remote
          reserve-keyword
          placeholder="输入用户名搜索"
          :remote-method="handleMemberSearch"
          :loading="memberSearching"
          style="width: 220px"
        >
          <el-option
            v-for="u in memberOptions"
            :key="u.id"
            :label="`${u.nickname || u.username} (${u.username})`"
            :value="u.username"
          />
        </el-select>
        <el-select v-model="memberRole" style="width: 120px">
          <el-option label="编辑者" value="editor" />
          <el-option label="查看者" value="viewer" />
        </el-select>
        <el-button type="primary" @click="handleAddMember" :loading="addingMember">添加</el-button>
      </div>
      <el-table :data="members" style="width: 100%; margin-top: 16px" v-loading="membersLoading">
        <el-table-column prop="nickname" label="昵称" />
        <el-table-column prop="username" label="账号" />
        <el-table-column prop="role" label="角色">
          <template #default="{ row }">
            {{ row.role === 'editor' ? '编辑者' : '查看者' }}
          </template>
        </el-table-column>
        <el-table-column v-if="canManage" label="操作" width="80">
          <template #default="{ row }">
            <el-button text type="danger" size="small" @click="handleRemoveMember(row.user_id)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="assignmentVisible" :title="`节点分工 · ${activeItem?.label || ''}`" width="520px">
      <el-form label-width="90px" v-loading="assignmentLoading">
        <el-form-item label="节点负责人">
          <el-select v-model="assignmentOwnerId" clearable placeholder="暂不设置" style="width: 100%">
            <el-option v-for="member in assignableMembers" :key="member.user_id" :label="member.nickname || member.username" :value="member.user_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="参与者">
          <el-select v-model="assignmentContributorIds" multiple collapse-tags placeholder="选择参与者" style="width: 100%">
            <el-option v-for="member in assignableMembers" :key="member.user_id" :label="member.nickname || member.username" :value="member.user_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignmentVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignmentSaving" @click="saveNodeAssignments">保存分工</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { ElMessageBox } from 'element-plus/es/components/message-box/index.mjs'
import { Link } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { getPrototypes } from '../api/prototypes'
import { searchUsers } from '../api/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'
import { findFirstBoundMenu, findMenuByPath, listMenuLeaves, menuNodeLabelPath, menuNodePath, normalizeMenuConfigForBindings } from '../utils/project-menu'
import {
  canCancelProjectTask,
  getProjectPermissions,
  getProjectRoleLabel
} from '../utils/project-permissions'
import { displayPersonName, pickPendingRevision, taskStatusMeta } from '../utils/candidate-review'
import { startBoundProjectTask } from '../utils/project-task-create'
import {
  getProject, bindPrototype, removeProjectPrototype,
  checkoutPrototype, checkinPrototype, releaseCheckout,
  getProjectSnapshots, createProjectSnapshot, restoreProjectSnapshot, deleteProjectSnapshot,
  getProjectMembers, addProjectMember, removeProjectMember, getProjectNodes, updateProjectNodeAssignments,
  createProjectTask, acceptProjectTask,
  getProjectTasks, getTaskCandidates, adoptProjectCandidate, returnProjectCandidate, cancelProjectTask
} from '../api/projects'
import ProjectFormDialog from '../components/ProjectFormDialog.vue'
import ProjectHeader from '../components/project/ProjectHeader.vue'
import ProjectMenuTree from '../components/project/ProjectMenuTree.vue'
import TaskCandidateHistory from '../components/project/TaskCandidateHistory.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const project = ref({ menu_config: { items: [] }, prototypes: [] })
const loading = ref(false)
const role = ref(null)

const activeGroup = ref(null)
const activeItem = ref(null)
const activeAncestors = ref([])

const showMenuDialog = ref(false)

const prototypes = ref([])
const prototypesLoading = ref(false)
const prototypesTotal = ref(0)
const prototypesPage = ref(1)
const prototypesPageSize = 20
const prototypeKeyword = ref('')
const selectedPrototypeId = ref('')
const binding = ref(false)
const unbinding = ref(false)
let prototypeSearchTimer = null

const snapshotVisible = ref(false)
const snapshots = ref([])
const snapshotsLoading = ref(false)
const snapshotName = ref('')
const creatingSnapshot = ref(false)

const membersVisible = ref(false)
const members = ref([])
const membersLoading = ref(false)
const memberUsername = ref('')
const memberRole = ref('editor')
const memberOptions = ref([])
const memberSearching = ref(false)
const addingMember = ref(false)
const assignmentVisible = ref(false)
const assignmentLoading = ref(false)
const assignmentSaving = ref(false)
const assignmentOwnerId = ref(null)
const assignmentContributorIds = ref([])

const changeRequestVisible = ref(false)
const changeTitle = ref('')
const changeRequirement = ref('')
const changeVersionStrategyType = ref('auto')
const changeVersionStrategyValue = ref('')
const changeTaskResult = ref(null)
const creatingChange = ref(false)
const changesVisible = ref(false)
const tasks = ref([])
const tasksLoading = ref(false)
const selectedTask = ref(null)
const candidates = ref([])
const candidatesLoading = ref(false)
const selectedCandidate = ref(null)
const reviewingChange = ref(false)
const previewNonce = ref(0)

onMounted(() => {
  loadProject()
  loadPrototypes()
})

async function loadProject() {
  loading.value = true
  try {
    const res = await getProject(route.params.id)
    project.value = {
      ...res.data.data,
      menu_config: normalizeMenuConfigForBindings(res.data.data.menu_config, res.data.data.prototypes)
    }
    role.value = project.value.role
    selectRequestedMenu()
  } catch (err) {
    ElMessage.error('加载项目失败')
  } finally {
    loading.value = false
  }
}

async function loadPrototypes({ keyword = prototypeKeyword.value, page = prototypesPage.value } = {}) {
  prototypesLoading.value = true
  try {
    const res = await getPrototypes({
      keyword,
      page,
      pageSize: prototypesPageSize,
      scope: authStore.isAdmin ? 'all' : 'my'
    })
    prototypes.value = res.data.data || []
    prototypesTotal.value = Number(res.data.total || prototypes.value.length)
    prototypesPage.value = page
    prototypeKeyword.value = keyword
  } catch (err) {
    ElMessage.error('加载原型列表失败')
  } finally {
    prototypesLoading.value = false
  }
}

function handlePrototypeSearch(keyword) {
  const normalized = String(keyword || '').trim()
  prototypeKeyword.value = normalized
  prototypesPage.value = 1
  if (prototypeSearchTimer) clearTimeout(prototypeSearchTimer)
  prototypeSearchTimer = setTimeout(() => {
    loadPrototypes({ keyword: normalized, page: 1 })
  }, 180)
}

function handlePrototypePageChange(page) {
  loadPrototypes({ keyword: prototypeKeyword.value, page })
}

const hasMenu = computed(() => {
  return listMenuLeaves(project.value.menu_config).length > 0
})

const projectPermissions = computed(() => getProjectPermissions(role.value))
const canManage = computed(() => projectPermissions.value.canManage)
const canEdit = computed(() => projectPermissions.value.canEdit)
const roleLabel = computed(() => getProjectRoleLabel(role.value))

function selectRequestedMenu() {
  const requestedPrototypeId = Array.isArray(route.query.prototypeId)
    ? route.query.prototypeId[0]
    : route.query.prototypeId
  const requestedMenuPath = Array.isArray(route.query.menuPath)
    ? route.query.menuPath[0]
    : route.query.menuPath

  const requestedBinding = project.value.prototypes?.find(binding => {
    if (requestedPrototypeId && binding.prototype_id !== requestedPrototypeId) return false
    if (requestedMenuPath && binding.menu_path !== requestedMenuPath) return false
    return Boolean(requestedPrototypeId || requestedMenuPath)
  })
  const target = findMenuByPath(project.value.menu_config, requestedBinding?.menu_path || requestedMenuPath)
  if (target) {
    selectMenuNode({ node: target.node, ancestors: target.ancestors, path: menuNodePath(target.ancestors, target.node) })
    return
  }

  // 无有效深链接时固定打开菜单配置顺序中的第一个已绑定菜单。
  // 深链接失效时也回退到同一默认入口，避免落在空白工作区。
  const firstBound = findFirstBoundMenu(project.value.menu_config, project.value.prototypes)
  if (firstBound) selectMenuNode(firstBound)
}

const activePath = computed(() => {
  if (!activeItem.value) return null
  return menuNodePath(activeAncestors.value, activeItem.value)
})

const activePathLabel = computed(() => {
  if (!activeItem.value) return ''
  return menuNodeLabelPath(activeAncestors.value, activeItem.value)
})
const activeParentLabel = computed(() => activeAncestors.value.map(item => item.label).join(' / '))

const currentBinding = computed(() => {
  if (!activePath.value) return null
  return project.value.prototypes?.find(pp => pp.menu_path === activePath.value) || null
})

const currentOwnerName = computed(() => {
  const node = project.value.nodes?.find(item => item.id === activeItem.value?.id)
  return node?.owner_name || node?.owner_username || '未配置'
})

const assignableMembers = computed(() => {
  const owner = { user_id: project.value.created_by, username: project.value.creator_name || '项目负责人', nickname: project.value.creator_name || '项目负责人' }
  return [owner, ...(project.value.members || []).filter(member => member.role === 'editor')]
    .filter((member, index, list) => list.findIndex(item => Number(item.user_id) === Number(member.user_id)) === index)
})

const currentCheckoutLabel = computed(() => {
  const checkout = currentBinding.value?.checkout
  if (!checkout) return '未签出'
  if (checkout.user_id === authStore.user?.id) return `我签出 · ${expireTip.value}`
  return `${checkout.nickname || checkout.username || '其他成员'} 签出`
})

const availablePrototypes = computed(() => {
  const pathBoundIds = new Set(
    project.value.prototypes
      ?.filter(pp => pp.menu_path === activePath.value)
      .map(pp => pp.prototype_id) || []
  )
  // 同一原型可以在同一项目的多个菜单位置展示；只排除当前菜单位置已经绑定的原型。
  return prototypes.value.filter(p => !pathBoundIds.has(p.id))
})

const previewUrl = computed(() => {
  const pp = currentBinding.value
  if (!pp || !pp.entry_file) return null
  const token = authStore.token || ''
  return `/preview/${pp.prototype_id}/${pp.entry_file}?token=${token}&refresh=${previewNonce.value}`
})

const pendingReadyCount = computed(() => tasks.value.reduce((sum, task) => sum + Number(task.pending_candidate_count || 0), 0))

const taskOwnerName = computed(() => displayPersonName(
  selectedTask.value?.responsible?.nickname,
  selectedTask.value?.responsible?.username,
  currentOwnerName.value || '未接受'
))

const isMyCheckout = computed(() => {
  const c = currentBinding.value?.checkout
  return c && c.user_id === authStore.user?.id
})

const expireTip = computed(() => {
  const c = currentBinding.value?.checkout
  if (!c) return ''
  const exp = new Date(c.expires_at)
  const now = new Date()
  const diff = Math.ceil((exp - now) / (1000 * 60))
  if (diff <= 0) return '已超时'
  if (diff < 60) return `${diff} 分钟后自动释放`
  return `${Math.floor(diff / 60)} 小时后释放`
})

function selectMenuNode({ node, ancestors }) {
  activeAncestors.value = ancestors || []
  activeGroup.value = ancestors?.[0] || node
  activeItem.value = node
  selectedPrototypeId.value = ''
  selectedTask.value = null
  selectedCandidate.value = null
  loadTasks()
}

async function selectTask(task) {
  selectedTask.value = task
  selectedCandidate.value = null
  await loadCandidates()
}

function selectCandidate(candidate) {
  selectedCandidate.value = candidate
}

function getMenuStateByPath(path) {
  const pp = project.value.prototypes?.find(p => p.menu_path === path)
  if (!pp) return { text: '未绑定', tone: 'empty' }
  const hasPending = tasks.value.some(task => Number(task.pending_candidate_count || 0) > 0 && (task.node_id === pp.node_id || task.prototype_id === pp.prototype_id))
  if (hasPending) return { text: '待确认', tone: 'warn' }
  if (pp.checkout) return { text: '签出中', tone: 'warn' }
  return { text: '稳定', tone: 'stable' }
}

function currentNodeId() {
  return currentBinding.value?.node_id || activeItem.value?.id || null
}

function canCancelTask(task) {
  return canCancelProjectTask({
    role: role.value,
    isPlatformAdmin: authStore.isAdmin,
    userId: authStore.user?.id,
    task
  })
}

async function loadTasks() {
  const nodeId = currentNodeId()
  if (!nodeId) {
    tasks.value = []
    selectedTask.value = null
    candidates.value = []
    selectedCandidate.value = null
    return
  }
  tasksLoading.value = true
  try {
    const res = await getProjectTasks(route.params.id, { nodeId })
    tasks.value = res.data.data || []
    if (selectedTask.value) {
      selectedTask.value = tasks.value.find(task => task.id === selectedTask.value.id) || tasks.value[0] || null
    }
    await loadCandidates()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '加载任务失败')
  } finally {
    tasksLoading.value = false
  }
}

async function loadCandidates() {
  if (!selectedTask.value) {
    candidates.value = []
    selectedCandidate.value = null
    return
  }
  candidatesLoading.value = true
  try {
    const res = await getTaskCandidates(route.params.id, selectedTask.value.id)
    candidates.value = res.data.data || []
    selectedCandidate.value = pickPendingRevision(candidates.value)
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '加载修订记录失败')
  } finally {
    candidatesLoading.value = false
  }
}

function openChangeRequest() {
  changeTitle.value = ''
  changeRequirement.value = ''
  changeVersionStrategyType.value = 'auto'
  changeVersionStrategyValue.value = ''
  changeTaskResult.value = null
  changeRequestVisible.value = true
}

async function submitChangeTask() {
  if (!changeRequirement.value.trim()) {
    ElMessage.warning('请描述修改目标')
    return
  }
  if (changeVersionStrategyType.value === 'custom' && !changeVersionStrategyValue.value.trim()) {
    ElMessage.warning('请输入自定义版本号')
    return
  }
  if (!currentBinding.value) {
    ElMessage.warning('当前菜单尚未绑定原型')
    return
  }
  if (!authStore.user?.id) {
    ElMessage.warning('请先登录后再创建任务')
    return
  }
  creatingChange.value = true
  try {
    changeTaskResult.value = await startBoundProjectTask({
      projectId: route.params.id,
      projectName: project.value.name,
      binding: currentBinding.value,
      menuPath: activePathLabel.value,
      title: (changeTitle.value.trim() || changeRequirement.value.trim()).slice(0, 120),
      requirement: changeRequirement.value.trim(),
      versionStrategy: {
        type: changeVersionStrategyType.value,
        value: changeVersionStrategyType.value === 'custom' ? changeVersionStrategyValue.value.trim() : null
      },
      responsibleUserId: authStore.user.id,
      createProjectTask,
      acceptProjectTask
    })
    await loadTasks()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || err.message || '生成任务失败')
  } finally {
    creatingChange.value = false
  }
}

async function copyChangePrompt() {
  try {
    const prompt = changeTaskResult.value?.prompt || ''
    if (!prompt.trim()) throw new Error('empty prompt')
    await copyClipboardText(prompt)
    ElMessage.success('完整提示词已复制')
  } catch (err) {
    ElMessage.warning('复制失败，请手工选择任务文字')
  }
}

async function openChangesDialog(preferredTask = null) {
  changesVisible.value = true
  await loadTasks()
  const nextTask = (preferredTask && tasks.value.find(task => task.id === preferredTask.id))
    || tasks.value.find(task => Number(task.pending_candidate_count || 0) > 0)
    || tasks.value[0]
    || null
  if (nextTask) await selectTask(nextTask)
}

async function adoptSelectedCandidate(candidate = selectedCandidate.value) {
  if (!candidate) return
  try {
    await ElMessageBox.confirm(
      `采用后将生成新的正式版本，当前线上正式版会被这次待审修订替换。`,
      '采用为正式版',
      { type: 'warning', confirmButtonText: '确认采用' }
    )
    reviewingChange.value = true
    await adoptProjectCandidate(route.params.id, candidate.id)
    ElMessage.success('已采用为正式版')
    previewNonce.value += 1
    await Promise.all([loadProject(), loadTasks()])
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '采用失败')
  } finally {
    reviewingChange.value = false
  }
}

async function cancelSelectedTask() {
  if (!canCancelTask(selectedTask.value)) return
  try {
    await ElMessageBox.confirm(
      '取消后任务保留历史并撤销未使用交接，当前正式版本不受影响。',
      '取消任务',
      { type: 'warning', confirmButtonText: '确认取消', cancelButtonText: '返回' }
    )
    await cancelProjectTask(route.params.id, selectedTask.value.id)
    ElMessage.success('任务已取消')
    await loadTasks()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '取消任务失败')
  }
}

async function returnSelectedCandidate(candidate = selectedCandidate.value) {
  if (!candidate) return
  try {
    const { value } = await ElMessageBox.prompt('请说明退回原因，当前正式版本不会改变。', '退回修订', {
      confirmButtonText: '确认退回',
      inputValidator: input => Boolean(input?.trim()) || '请输入退回原因'
    })
    await returnProjectCandidate(route.params.id, candidate.id, { note: value.trim() })
    ElMessage.success('已退回，正式版未改变')
    await loadTasks()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '退回失败')
  }
}

async function handleBind() {
  if (!selectedPrototypeId.value) {
    ElMessage.warning('请选择原型')
    return
  }
  binding.value = true
  try {
    await bindPrototype(route.params.id, {
      prototypeId: selectedPrototypeId.value,
      menuPath: activePath.value,
      sortOrder: 0
    })
    ElMessage.success('绑定成功')
    selectedPrototypeId.value = ''
    loadProject()
  } catch (err) {
    const message = err.response?.data?.message || '绑定失败'
    ElMessage.error(message)
  } finally {
    binding.value = false
  }
}

async function handleUnbind() {
  if (!currentBinding.value) return
  try {
    await ElMessageBox.confirm(
      `只解除「${activePathLabel.value}」与「${currentBinding.value.prototype_name}」的项目绑定；原型、正式版本和历史记录不会删除。`,
      '解绑原型',
      { type: 'warning', confirmButtonText: '确认解绑', cancelButtonText: '取消' }
    )
    unbinding.value = true
    await removeProjectPrototype(route.params.id, currentBinding.value.id)
    ElMessage.success('已解除绑定，原型和历史记录保持不变')
    await loadProject()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '解绑失败')
  } finally {
    unbinding.value = false
  }
}

async function handleCheckout() {
  if (!currentBinding.value) return
  try {
    await checkoutPrototype(route.params.id, currentBinding.value.id, { note: '' })
    ElMessage.success('签出成功')
    loadProject()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '签出失败')
  }
}

async function handleCheckin() {
  if (!currentBinding.value) return
  try {
    await checkinPrototype(route.params.id, currentBinding.value.id)
    ElMessage.success('签入成功')
    loadProject()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '签入失败')
  }
}

async function handleForceRelease() {
  if (!currentBinding.value) return
  try {
    await ElMessageBox.confirm(`确定强制释放「${currentBinding.value.prototype_name}」的签出锁吗？`, '强制释放', { type: 'warning' })
    await releaseCheckout(route.params.id, currentBinding.value.id)
    ElMessage.success('已强制释放')
    loadProject()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '释放失败')
    }
  }
}

function goPrototype(id) {
  router.push(`/prototype/${id}`)
}

function openFullPreview() {
  window.open(`/project/${route.params.id}/preview`, '_blank')
}

function enterWorkspace() {
  router.push({
    name: 'project-preview',
    params: { id: route.params.id },
    query: activePath.value ? { menuPath: activePath.value } : {}
  })
}

async function openSnapshotDialog() {
  snapshotVisible.value = true
  snapshotName.value = ''
  loadSnapshots()
}

async function loadSnapshots() {
  snapshotsLoading.value = true
  try {
    const res = await getProjectSnapshots(route.params.id)
    snapshots.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载快照失败')
  } finally {
    snapshotsLoading.value = false
  }
}

async function handleCreateSnapshot() {
  if (!snapshotName.value.trim()) {
    ElMessage.warning('请输入快照名称')
    return
  }
  creatingSnapshot.value = true
  try {
    await createProjectSnapshot(route.params.id, { name: snapshotName.value.trim() })
    ElMessage.success('快照创建成功')
    snapshotName.value = ''
    loadSnapshots()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '创建失败')
  } finally {
    creatingSnapshot.value = false
  }
}

async function handleRestoreSnapshot(row) {
  try {
    await ElMessageBox.confirm(`确定恢复到快照「${row.name}」吗？当前菜单结构和原型版本将被覆盖。`, '恢复快照', { type: 'warning' })
    await restoreProjectSnapshot(route.params.id, row.id)
    ElMessage.success('恢复成功')
    loadProject()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '恢复失败')
    }
  }
}

async function handleDeleteSnapshot(row) {
  try {
    await ElMessageBox.confirm('确定删除该快照吗？', '删除快照', { type: 'warning' })
    await deleteProjectSnapshot(route.params.id, row.id)
    ElMessage.success('删除成功')
    loadSnapshots()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

async function openMembersDialog() {
  membersVisible.value = true
  memberUsername.value = ''
  memberOptions.value = []
  loadMembers()
}

async function loadMembers() {
  membersLoading.value = true
  try {
    const res = await getProjectMembers(route.params.id)
    members.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载成员失败')
  } finally {
    membersLoading.value = false
  }
}

async function handleMemberSearch(keyword) {
  if (!keyword) {
    memberOptions.value = []
    return
  }
  memberSearching.value = true
  try {
    const res = await searchUsers(keyword)
    memberOptions.value = (res.data.data || []).filter(u => u.id !== authStore.user?.id)
  } catch (err) {
    memberOptions.value = []
  } finally {
    memberSearching.value = false
  }
}

async function handleAddMember() {
  if (!memberUsername.value) {
    ElMessage.warning('请选择用户')
    return
  }
  const user = memberOptions.value.find(u => u.username === memberUsername.value)
  if (!user) {
    ElMessage.warning('用户不存在')
    return
  }
  addingMember.value = true
  try {
    await addProjectMember(route.params.id, { userId: user.id, role: memberRole.value })
    ElMessage.success('添加成功')
    memberUsername.value = ''
    memberOptions.value = []
    loadMembers()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '添加失败')
  } finally {
    addingMember.value = false
  }
}

async function handleRemoveMember(userId) {
  try {
    await ElMessageBox.confirm('确定移除该成员吗？', '移除成员', { type: 'warning' })
    await removeProjectMember(route.params.id, userId)
    ElMessage.success('已移除')
    loadMembers()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '移除失败')
    }
  }
}

async function openAssignmentDialog() {
  if (!activeItem.value?.id) return
  assignmentVisible.value = true
  assignmentLoading.value = true
  try {
    const res = await getProjectNodes(route.params.id)
    const node = (res.data.data || []).find(item => item.id === activeItem.value.id)
    const assignments = node?.assignments || []
    assignmentOwnerId.value = assignments.find(item => item.assignment_role === 'owner')?.user_id || null
    assignmentContributorIds.value = assignments.filter(item => item.assignment_role === 'contributor').map(item => item.user_id)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载节点分工失败')
  } finally {
    assignmentLoading.value = false
  }
}

async function saveNodeAssignments() {
  if (!activeItem.value?.id) return
  assignmentSaving.value = true
  try {
    await updateProjectNodeAssignments(route.params.id, activeItem.value.id, {
      ownerId: assignmentOwnerId.value,
      contributorIds: assignmentContributorIds.value
    })
    ElMessage.success('节点分工已更新')
    assignmentVisible.value = false
    await loadProject()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '保存节点分工失败')
  } finally {
    assignmentSaving.value = false
  }
}

function formatDate(row, col, val) {
  if (!val) return ''
  const d = new Date(val)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
</script>

<style scoped>
.project-portal {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);
  color: #1a2438;
  background: #f6f8fc;
}
.portal-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  overflow: hidden;
}
.portal-menu {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 14px;
  border-right: 1px solid #e7ebf2;
  background: #fff;
}
.menu-group { margin: 12px 0 18px; }
.group-label {
  padding: 0 8px 6px;
  color: #9ba7bb;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 9px;
  color: #5e6c85;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: .18s ease;
}
.menu-item:hover,
.menu-item:focus-visible { color: #2958d5; background: #f4f7ff; outline: none; }
.menu-item.active { color: #2958d5; background: #edf2ff; font-weight: 700; }
.item-label { display: flex; min-width: 0; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-dot { width: 7px; height: 7px; flex: 0 0 auto; border: 1.5px solid #89a1d6; border-radius: 3px; background: #fff; }
.menu-item.active .menu-dot { border-color: #3c6ff2; background: #3c6ff2; }
.menu-state { border-radius: 99px; padding: 2px 5px; color: #11966c; background: #eaf8f2; font-size: 9px; white-space: nowrap; }
.menu-state.warn { color: #c47a16; background: #fff6e5; }
.menu-state.empty { color: #9ba7bb; background: #f1f3f6; }
.nav-footnote { margin: 22px 5px 0; border: 1px solid #e0e7f6; border-radius: 9px; padding: 10px; color: #72809a; background: #f6f8ff; font-size: 11px; line-height: 1.55; }
.nav-footnote strong { display: block; margin-bottom: 3px; color: #2958d5; }
.portal-content { min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 24px; padding: 30px clamp(22px, 4vw, 56px) 42px; }
.empty-content,
.bind-card-body { display: flex; min-height: 420px; flex: 1; flex-direction: column; align-items: center; justify-content: center; }
.eyebrow { margin: 0 0 5px; color: #8290a5; font-size: 12px; font-weight: 600; letter-spacing: .04em; }
.module-hero { display: flex; width: min(1180px, 100%); align-items: center; justify-content: space-between; gap: 24px; margin: 0 auto; }
.module-heading { min-width: 0; }
.module-heading h2 { margin: 0; color: #111827; font-size: clamp(24px, 3vw, 32px); font-weight: 650; letter-spacing: -.02em; }
.module-heading > p:last-child { margin: 9px 0 0; color: #66758b; font-size: 14px; }
.owner-card { display: flex; min-width: 210px; align-items: center; gap: 11px; border: 1px solid #dfe6ef; border-radius: 10px; background: #fff; padding: 11px 14px; box-shadow: 0 1px 2px rgb(15 23 42 / 3%); }
.owner-avatar { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 50%; color: #2563eb; background: #e8f0ff; font-size: 14px; font-weight: 700; }
.owner-copy { display: flex; min-width: 0; flex-direction: column; }.owner-copy small { color: #8491a5; font-size: 11px; }.owner-copy strong { margin-top: 2px; color: #1f2937; font-size: 13px; }
.portal-grid { display: grid; width: min(1180px, 100%); grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; margin: 0 auto; }
.prototype-card, .bind-card, .collab-card, .activity-section { border: 1px solid #dfe6ef; border-radius: 12px; background: #fff; box-shadow: 0 2px 5px rgb(15 23 42 / 3%); }
.card-kicker, .section-heading { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid #edf1f6; padding: 0 20px; }
.card-kicker > span { color: #25344a; font-weight: 650; }
.prototype-card-body { display: flex; align-items: center; gap: 22px; padding: 24px; }
.prototype-thumb { position: relative; width: 184px; height: 112px; flex: none; overflow: hidden; border: 1px solid #dce4ee; border-radius: 8px; background: linear-gradient(135deg, #f8fbff, #edf3fa); }
.prototype-thumb::before { position: absolute; inset: 0 0 auto; height: 27px; background: #173a60; content: ''; }.prototype-thumb::after { position: absolute; inset: 27px auto 0 0; width: 43px; background: #eef3f9; content: ''; }
.prototype-thumb span { position: absolute; left: 60px; right: 17px; height: 8px; border-radius: 3px; background: #d8e3f0; }.prototype-thumb span:nth-child(1) { top: 47px; }.prototype-thumb span:nth-child(2) { top: 66px; right: 42px; }.prototype-thumb span:nth-child(3) { top: 85px; right: 65px; }
.prototype-card-copy { min-width: 0; flex: 1; }.prototype-title-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }.prototype-title-row h3 { margin: 0; color: #172033; font-size: 19px; font-weight: 650; }.prototype-card-copy > p { margin: 9px 0 0; color: #718096; font-size: 13px; line-height: 1.6; }.prototype-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 11px; color: #8a96a8; font-size: 12px; }.card-actions { display: flex; align-items: center; gap: 10px; margin-top: 19px; }
.bind-card { min-height: 250px; }.bind-tip { margin: 8px 0 0; color: #8a96a8; font-size: 13px; }.bind-form { display: flex; width: min(460px, 100%); flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 14px; }.prototype-pagination { margin-top: 14px; }
.collab-card { min-height: 250px; }.metric-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 18px; border-bottom: 1px solid #edf1f6; padding: 14px 2px; color: #718096; font-size: 13px; }.metric-list > div:last-child { border-bottom: 0; }.metric-list strong { color: #24344d; font-size: 13px; text-align: right; }.metric-list .metric-warning { color: #c27803; }.collab-actions { display: flex; flex-wrap: wrap; gap: 2px 10px; border-top: 1px solid #edf1f6; padding: 10px 16px 12px; }
.activity-section { width: min(1180px, 100%); margin: 0 auto; }.section-heading { min-height: 62px; }.section-heading h3 { margin: 0; color: #25344a; font-size: 16px; font-weight: 650; }.activity-list { padding: 2px 20px 8px; }.activity-item { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 12px; border-bottom: 1px solid #edf1f6; padding: 14px 0; }.activity-item:last-child { border-bottom: 0; }.activity-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }.activity-dot.status-ready, .activity-dot.status-awaiting_review { background: #f59e0b; }.activity-dot.status-adopted, .activity-dot.status-completed { background: #10b981; }.activity-dot.status-invalid, .activity-dot.status-rejected { background: #ef4444; }.activity-copy { min-width: 0; }.activity-copy strong { display: block; overflow: hidden; color: #334155; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.activity-copy p { margin: 4px 0 0; color: #8a96a8; font-size: 12px; }
.candidate-boundary-bar {
  min-height: 34px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #52606d;
  font-size: 12px;
  background: #e2e8f0;
  border-bottom: 1px solid #cbd5e0;
}
.candidate-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  color: #fff;
  background: #2563eb;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.snapshot-form,
.member-form {
  display: flex;
  gap: 10px;
}
.dialog-tip {
  color: #718096;
  font-size: 13px;
  line-height: 1.7;
}
.task-prompt {
  box-sizing: border-box;
  width: 100%;
  max-height: 360px;
  overflow: auto;
  margin-top: 16px;
  padding: 14px;
  color: #e2e8f0;
  background: #172033;
  border-radius: 8px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
  font-size: 12px;
}
.task-code-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  color: #606266;
  font-size: 13px;
}
.task-code-row code {
  padding: 4px 8px;
  color: #1f2937;
  background: #f2f6fc;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.changes-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  min-height: 68vh;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
}
.changes-list {
  padding: 12px;
  overflow-y: auto;
  background: #f7f9fc;
  border-right: 1px solid #e4e7ed;
}
.task-manager-hint {
  margin-bottom: 12px;
  padding: 10px;
  color: #52606d;
  background: #eef5ff;
  border: 1px solid #c6e2ff;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
}
.change-card {
  width: 100%;
  padding: 14px;
  margin-bottom: 10px;
  color: #303133;
  text-align: left;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
}
.change-card.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px #ecf5ff;
}
.change-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.change-card span {
  color: #909399;
  font-size: 12px;
}
.change-detail {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
}
.task-history-pane {
  min-height: 0;
  overflow: auto;
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.change-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border-bottom: 1px solid #e4e7ed;
}
.change-summary h3,
.change-summary p {
  margin: 0;
}
.change-summary p {
  margin-top: 6px;
  color: #606266;
}
.change-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 10px;
  color: #909399;
  font-size: 12px;
}
.review-actions {
  display: flex;
  gap: 8px;
}
.validation-errors {
  margin: 6px 0 0;
  padding-left: 18px;
  line-height: 1.6;
}
.task-history-pane :deep(.revision-review) {
  min-height: 0;
}
@media (max-width: 900px) {
  .portal-body { grid-template-columns: 190px minmax(0, 1fr); }
  .changes-layout {
    grid-template-columns: 1fr;
  }
  .changes-list {
    max-height: 220px;
    border-right: 0;
    border-bottom: 1px solid #e4e7ed;
  }
  .change-summary {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .portal-body { grid-template-columns: 1fr; }
}
</style>
