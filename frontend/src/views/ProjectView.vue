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
        <div v-for="group in project.menu_config?.items" :key="group.key" class="menu-group">
          <div class="group-label">{{ group.label }}</div>
          <div
            v-for="item in group.children"
            :key="item.key"
            :class="['menu-item', { active: isActive(group, item) }]"
            role="button"
            tabindex="0"
            :aria-current="isActive(group, item) ? 'page' : undefined"
            @click="selectMenu(group, item)"
            @keydown.enter="selectMenu(group, item)"
            @keydown.space.prevent="selectMenu(group, item)"
          >
            <span class="item-label"><i class="menu-dot"></i>{{ item.label }}</span>
            <span v-if="getMenuState(group, item)" class="menu-state" :class="getMenuState(group, item).tone">
              {{ getMenuState(group, item).text }}
            </span>
          </div>
        </div>
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
              <p class="eyebrow">{{ activeGroup?.label || '当前功能模块' }}</p>
              <h2>{{ activeItem.label }}</h2>
              <p>查看该菜单节点的负责人、绑定原型、正式版本与协作状态。</p>
            </div>
            <div class="owner-card">
              <span class="owner-avatar">{{ currentOwnerName.slice(0, 1).toUpperCase() }}</span>
              <span class="owner-copy">
                <small>当前节点负责人</small>
                <strong>{{ currentOwnerName }}</strong>
              </span>
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
                <div><span>待处理候选</span><strong :class="{ 'metric-warning': pendingReadyCount }">{{ pendingReadyCount }}</strong></div>
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
            <div v-if="changes.length" class="activity-list">
              <div v-for="change in changes.slice(0, 4)" :key="change.id" class="activity-item">
                <span class="activity-dot" :class="`status-${change.status}`"></span>
                <div class="activity-copy">
                  <strong>{{ change.title }}</strong>
                  <p>{{ change.creator_name || change.creator_username || '协作者' }} · {{ changeStatusMeta(change.status).label }} · 基于 v{{ change.base_version_number }}</p>
                </div>
                <el-button text type="primary" size="small" @click="openChangesDialog">查看</el-button>
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

    <el-dialog v-model="changeRequestVisible" :title="editingChangeId ? '修改 AI 任务' : '让 AI 修改'" width="620px" destroy-on-close>
      <template v-if="!changeTaskResult">
        <p class="dialog-tip">描述想看到的结果。Agent 会基于当前正式版本生成独立候选，不会直接覆盖原型。任务被 AI 领取前可以修改或删除。</p>
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
          <p>把下面完整提示词发送给已经接入伏羲的 AI 助手。任务码十分钟内有效且只能使用一次。</p>
        </el-alert>
        <div class="task-code-row">
          <span>任务码</span>
          <code>{{ changeTaskResult.handoffCode }}</code>
        </div>
        <p class="dialog-tip">版本策略：{{ changeTaskResult.change?.version_strategy_type === 'custom' ? `自定义 v${changeTaskResult.change.version_strategy_value}` : 'AI 决定 major / minor / patch' }}</p>
        <pre class="task-prompt">{{ changeTaskResult.prompt }}</pre>
        <p class="dialog-tip">候选上传后仍需项目负责人采用，当前正式版本不会自动改变。</p>
      </template>
      <template #footer>
        <el-button @click="changeRequestVisible = false">{{ changeTaskResult ? '关闭' : '取消' }}</el-button>
        <el-button v-if="changeTaskResult" type="primary" @click="copyChangePrompt">复制完整提示词</el-button>
        <el-button v-else type="primary" :loading="creatingChange" @click="submitChangeTask">{{ editingChangeId ? '保存并重新生成提示词' : '生成 AI 任务' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="changesVisible" title="任务管理器" width="90%" top="5vh" destroy-on-close>
      <div class="changes-layout" v-loading="changesLoading">
        <div class="changes-list">
          <div class="task-manager-hint">这里记录本项目的 AI 修改任务。任务被领取前可编辑或删除，领取后进入候选审核流程。</div>
          <button
            v-for="change in changes"
            :key="change.id"
            :class="['change-card', { active: selectedChange?.id === change.id }]"
            @click="selectChange(change)"
          >
            <div class="change-card-head">
              <strong>{{ change.title }}</strong>
              <el-tag :type="changeStatusMeta(change.status).type" size="small">
                {{ changeStatusMeta(change.status).label }}
              </el-tag>
            </div>
            <span>{{ change.creator_name || change.creator_username }} · 基于 v{{ change.base_version_number }}</span>
          </button>
          <el-empty v-if="!changesLoading && !changes.length" description="暂无候选修改" />
        </div>
        <div v-if="selectedChange" class="change-detail">
          <div class="change-summary">
            <div>
              <h3>{{ selectedChange.title }}</h3>
              <p>{{ selectedChange.requirement }}</p>
              <div class="change-meta">
                <span>状态：{{ changeStatusMeta(selectedChange.status).label }}</span>
                <span>任务码：{{ handoffStatusMeta(selectedChange).label }}</span>
                <span>基础版本：v{{ selectedChange.base_version_number }}</span>
              </div>
            </div>
            <el-alert
              v-if="selectedChange.status === 'stale'"
              title="这个候选基于旧版本，当前正式版本没有受到影响。请基于最新版重新发起。"
              type="warning"
              :closable="false"
              show-icon
            />
            <el-alert
              v-else-if="selectedChange.status === 'preview_pending'"
              title="候选已上传，正在整理交付状态；如预览无法加载，请让 AI 排查后重新上传。"
              type="info"
              :closable="false"
              show-icon
            />
            <el-alert
              v-else-if="selectedChange.status === 'invalid' && selectedChange.validation_errors?.length"
              title="候选静态校验失败，不能采纳"
              type="error"
              :closable="false"
              show-icon
            >
              <ul class="validation-errors">
                <li v-for="error in selectedChange.validation_errors" :key="error">{{ error }}</li>
              </ul>
            </el-alert>
            <div v-if="selectedChange.status === 'ready' && canManage" class="review-actions">
              <el-button type="danger" plain @click="rejectSelectedChange">退回</el-button>
              <el-button type="primary" :loading="reviewingChange" @click="adoptSelectedChange">采用候选</el-button>
            </div>
            <div v-else-if="canEditTask(selectedChange)" class="review-actions">
              <el-button plain @click="editSelectedTask">编辑任务</el-button>
              <el-button type="danger" plain @click="deleteSelectedTask">删除任务</el-button>
            </div>
            <el-alert
              v-else-if="selectedChange.status === 'editing' && selectedChange.handoff_status === 'redeemed'"
              title="AI 已领取任务，任务内容已锁定；请等待候选上传。"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
          <div v-if="selectedChange.preview_path" class="candidate-boundary">
            <div class="candidate-boundary-bar">
              <span class="candidate-chip">候选版本</span>
              <span>仅供审核预览 · 不会自动改变正式原型</span>
            </div>
            <iframe
              :key="candidatePreviewUrl"
              :src="candidatePreviewUrl"
              class="candidate-preview"
              frameborder="0"
            />
          </div>
          <el-empty v-else description="候选尚未准备好预览" />
        </div>
        <el-empty v-else class="change-detail" description="请选择一个候选" />
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
import { findFirstBoundMenu, normalizeMenuConfigForBindings } from '../utils/project-menu'
import {
  canEditProjectTask,
  getProjectPermissions,
  getProjectRoleLabel
} from '../utils/project-permissions'
import {
  getProject, bindPrototype, removeProjectPrototype,
  checkoutPrototype, checkinPrototype, releaseCheckout,
  getProjectSnapshots, createProjectSnapshot, restoreProjectSnapshot, deleteProjectSnapshot,
  getProjectMembers, addProjectMember, removeProjectMember,
  createPrototypeChange, getProjectChanges, updateProjectChange, deleteProjectChange,
  adoptProjectChange, rejectProjectChange
} from '../api/projects'
import ProjectFormDialog from '../components/ProjectFormDialog.vue'
import ProjectHeader from '../components/project/ProjectHeader.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const project = ref({ menu_config: { items: [] }, prototypes: [] })
const loading = ref(false)
const role = ref(null)

const activeGroup = ref(null)
const activeItem = ref(null)

const showMenuDialog = ref(false)

const prototypes = ref([])
const prototypesLoading = ref(false)
const prototypesTotal = ref(0)
const prototypesPage = ref(1)
const prototypesPageSize = 20
const prototypeKeyword = ref('')
const selectedPrototypeId = ref('')
const binding = ref(false)
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

const changeRequestVisible = ref(false)
const editingChangeId = ref(null)
const changeTitle = ref('')
const changeRequirement = ref('')
const changeVersionStrategyType = ref('auto')
const changeVersionStrategyValue = ref('')
const changeTaskResult = ref(null)
const creatingChange = ref(false)
const changesVisible = ref(false)
const changes = ref([])
const changesLoading = ref(false)
const selectedChange = ref(null)
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
  return project.value.menu_config?.items?.some(g => g.children?.length > 0)
})

const projectPermissions = computed(() => getProjectPermissions(role.value))
const canManage = computed(() => projectPermissions.value.canManage)
const canEdit = computed(() => projectPermissions.value.canEdit)
const roleLabel = computed(() => getProjectRoleLabel(role.value))

function menuPath(group, item) {
  return `${group.key}/${item.key}`
}

function menuPathLabel(group, item) {
  return `${group.label} / ${item.label}`
}

function findMenuByPath(path) {
  if (!path) return null
  for (const group of project.value.menu_config?.items || []) {
    for (const item of group.children || []) {
      if (menuPath(group, item) === path) return { group, item }
    }
  }
  return null
}

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
  const target = findMenuByPath(requestedBinding?.menu_path || requestedMenuPath)
  if (target) {
    selectMenu(target.group, target.item)
    return
  }

  // 无有效深链接时固定打开菜单配置顺序中的第一个已绑定菜单。
  // 深链接失效时也回退到同一默认入口，避免落在空白工作区。
  const firstBound = findFirstBoundMenu(project.value.menu_config, project.value.prototypes)
  if (firstBound) selectMenu(firstBound.group, firstBound.item)
}

const activePath = computed(() => {
  if (!activeGroup.value || !activeItem.value) return null
  return menuPath(activeGroup.value, activeItem.value)
})

const activePathLabel = computed(() => {
  if (!activeGroup.value || !activeItem.value) return ''
  return menuPathLabel(activeGroup.value, activeItem.value)
})

const currentBinding = computed(() => {
  if (!activePath.value) return null
  return project.value.prototypes?.find(pp => pp.menu_path === activePath.value) || null
})

const currentOwnerName = computed(() => {
  const owner = project.value.members?.find(member => member.role === 'owner')
  return owner?.nickname || owner?.username || project.value.creator_name || '未配置'
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

const pendingReadyCount = computed(() => changes.value.filter(change => change.status === 'ready').length)

const candidatePreviewUrl = computed(() => {
  if (!selectedChange.value?.preview_path) return ''
  const token = authStore.token || ''
  return `${selectedChange.value.preview_path}?token=${encodeURIComponent(token)}`
})

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

function selectMenu(group, item) {
  activeGroup.value = group
  activeItem.value = item
  selectedPrototypeId.value = ''
  selectedChange.value = null
  loadChanges()
}

function selectChange(change) {
  selectedChange.value = change
}

function isActive(group, item) {
  return activeGroup.value?.key === group.key && activeItem.value?.key === item.key
}

function getCheckoutStatus(group, item) {
  const path = menuPath(group, item)
  const pp = project.value.prototypes?.find(p => p.menu_path === path)
  if (!pp || !pp.checkout) return null
  const isMe = pp.checkout.user_id === authStore.user?.id
  return {
    type: isMe ? 'success' : 'warning',
    text: isMe ? '我签出' : `${pp.checkout.nickname || pp.checkout.username} 签出`
  }
}

function getMenuState(group, item) {
  const path = menuPath(group, item)
  const pp = project.value.prototypes?.find(p => p.menu_path === path)
  if (!pp) return { text: '未绑定', tone: 'empty' }
  const hasPending = changes.value.some(change => change.status === 'ready' && change.prototype_id === pp.prototype_id)
  if (hasPending) return { text: '待确认', tone: 'warn' }
  if (pp.checkout) return { text: '签出中', tone: 'warn' }
  return { text: '稳定', tone: 'stable' }
}

function changeStatusMeta(status) {
  const map = {
    editing: { label: '进行中', type: 'info' },
    preview_pending: { label: '交付状态整理中', type: 'info' },
    ready: { label: '待确认', type: 'warning' },
    invalid: { label: '预览失败', type: 'danger' },
    adopted: { label: '已采用', type: 'success' },
    rejected: { label: '已退回', type: 'danger' },
    stale: { label: '已过期', type: 'warning' },
    cancelled: { label: '已取消', type: 'info' }
  }
  return map[status] || { label: status, type: 'info' }
}

function handoffStatusMeta(change) {
  if (change.handoff_status === 'redeemed') return { label: '已领取' }
  if (change.handoff_status === 'expired') return { label: '已过期，可重新生成' }
  if (change.handoff_status === 'revoked') return { label: '已撤销' }
  return { label: '待领取' }
}

function canEditTask(change) {
  return canEditProjectTask({
    role: role.value,
    isPlatformAdmin: authStore.isAdmin,
    userId: authStore.user?.id,
    change
  })
}

async function loadChanges() {
  const prototypeId = currentBinding.value?.prototype_id
  if (!prototypeId) {
    changes.value = []
    return
  }
  changesLoading.value = true
  try {
    const res = await getProjectChanges(route.params.id, { prototypeId })
    changes.value = res.data.data || []
    if (selectedChange.value) {
      selectedChange.value = changes.value.find(change => change.id === selectedChange.value.id) || changes.value[0] || null
    }
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '加载候选失败')
  } finally {
    changesLoading.value = false
  }
}

function openChangeRequest() {
  editingChangeId.value = null
  changeTitle.value = ''
  changeRequirement.value = ''
  changeVersionStrategyType.value = 'auto'
  changeVersionStrategyValue.value = ''
  changeTaskResult.value = null
  changeRequestVisible.value = true
}

function editSelectedTask() {
  if (!canEditTask(selectedChange.value)) return
  editingChangeId.value = selectedChange.value.id
  changeTitle.value = selectedChange.value.title || ''
  changeRequirement.value = selectedChange.value.requirement || ''
  changeVersionStrategyType.value = selectedChange.value.version_strategy_type || 'auto'
  changeVersionStrategyValue.value = selectedChange.value.version_strategy_value || ''
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
  creatingChange.value = true
  try {
    const payload = {
      title: (changeTitle.value.trim() || changeRequirement.value.trim()).slice(0, 120),
      requirement: changeRequirement.value.trim(),
      versionStrategy: {
        type: changeVersionStrategyType.value,
        value: changeVersionStrategyType.value === 'custom' ? changeVersionStrategyValue.value.trim() : null
      }
    }
    const res = editingChangeId.value
      ? await updateProjectChange(route.params.id, editingChangeId.value, payload)
      : await createPrototypeChange(route.params.id, currentBinding.value.prototype_id, payload)
    changeTaskResult.value = res.data.data
    await loadChanges()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '生成任务失败')
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

async function openChangesDialog(preferredChange = null) {
  changesVisible.value = true
  await loadChanges()
  selectChange(
    (preferredChange && changes.value.find(change => change.id === preferredChange.id))
      || changes.value.find(change => change.status === 'ready')
      || changes.value[0]
      || null
  )
}

async function adoptSelectedChange() {
  if (!selectedChange.value) return
  try {
    await ElMessageBox.confirm(
      `采用后将生成新的正式版本；其他基于 v${selectedChange.value.base_version_number} 的候选可能过期。`,
      '采用候选',
      { type: 'warning', confirmButtonText: '确认采用' }
    )
    reviewingChange.value = true
    await adoptProjectChange(route.params.id, selectedChange.value.id)
    ElMessage.success('候选已采用，正式版本已更新')
    previewNonce.value += 1
    await Promise.all([loadProject(), loadChanges()])
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '采用失败')
  } finally {
    reviewingChange.value = false
  }
}

async function deleteSelectedTask() {
  if (!canEditTask(selectedChange.value)) return
  try {
    await ElMessageBox.confirm(
      '删除后任务码立即失效，当前正式版本和其他候选不受影响。',
      '删除任务',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
    await deleteProjectChange(route.params.id, selectedChange.value.id)
    ElMessage.success('任务已删除')
    selectedChange.value = null
    await loadChanges()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '删除任务失败')
  }
}

async function rejectSelectedChange() {
  if (!selectedChange.value) return
  try {
    const { value } = await ElMessageBox.prompt('请说明退回原因，当前正式版本不会改变。', '退回候选', {
      confirmButtonText: '确认退回',
      inputValidator: input => Boolean(input?.trim()) || '请输入退回原因'
    })
    await rejectProjectChange(route.params.id, selectedChange.value.id, { note: value.trim() })
    ElMessage.success('候选已退回')
    await loadChanges()
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
.activity-section { width: min(1180px, 100%); margin: 0 auto; }.section-heading { min-height: 62px; }.section-heading h3 { margin: 0; color: #25344a; font-size: 16px; font-weight: 650; }.activity-list { padding: 2px 20px 8px; }.activity-item { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 12px; border-bottom: 1px solid #edf1f6; padding: 14px 0; }.activity-item:last-child { border-bottom: 0; }.activity-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }.activity-dot.status-ready { background: #f59e0b; }.activity-dot.status-adopted { background: #10b981; }.activity-dot.status-invalid, .activity-dot.status-rejected { background: #ef4444; }.activity-copy { min-width: 0; }.activity-copy strong { display: block; overflow: hidden; color: #334155; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.activity-copy p { margin: 4px 0 0; color: #8a96a8; font-size: 12px; }
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
.candidate-boundary {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff7ed;
}
.candidate-boundary-bar {
  color: #7c4a03;
  background: #fff1d6;
  border-bottom-color: #f6d58c;
}
.candidate-chip {
  color: #7c4a03;
  background: #f6ad55;
}
.candidate-preview {
  width: 100%;
  flex: 1;
  height: 0;
  min-height: 58vh;
  background: #fff;
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
