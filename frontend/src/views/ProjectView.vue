<template>
  <div class="project-portal">
    <div class="portal-header">
      <div class="header-left">
        <el-button text @click="$router.push('/projects')">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <div class="title-block">
          <h1>{{ project.name }}</h1>
          <p class="sub">{{ project.description || '暂无描述' }}</p>
        </div>
      </div>
      <div class="header-actions">
        <el-tag v-if="roleLabel" size="small" effect="plain" type="info">{{ roleLabel }}</el-tag>
        <el-button v-if="canManage" text @click="showMenuDialog = true">
          <el-icon><Edit /></el-icon>
          管理菜单
        </el-button>
        <el-button v-if="canManage" text @click="openSnapshotDialog">
          <el-icon><Camera /></el-icon>
          快照
        </el-button>
        <el-button v-if="canManage" text @click="openMembersDialog">
          <el-icon><User /></el-icon>
          成员
        </el-button>
        <el-button type="success" @click="openFullPreview">
          <el-icon><FullScreen /></el-icon>
          全屏预览
        </el-button>
      </div>
    </div>

    <div class="portal-body">
      <div class="portal-menu">
        <div v-for="group in project.menu_config?.items" :key="group.key" class="menu-group">
          <div class="group-label">{{ group.label }}</div>
          <div
            v-for="item in group.children"
            :key="item.key"
            :class="['menu-item', { active: isActive(group, item) }]"
            @click="selectMenu(group, item)"
          >
            <span class="item-label">{{ item.label }}</span>
            <el-tag v-if="getCheckoutStatus(group, item)" :type="getCheckoutStatus(group, item).type" size="small" effect="dark">
              {{ getCheckoutStatus(group, item).text }}
            </el-tag>
          </div>
        </div>
        <el-empty v-if="!hasMenu" description="暂无菜单配置" />
      </div>

      <div class="portal-content">
        <div v-if="!activeItem" class="empty-content">
          <el-empty description="请从左侧选择一个菜单项" />
        </div>
        <div v-else-if="!currentBinding" class="bind-panel">
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
              placeholder="选择原型"
              style="width: 320px"
              :loading="prototypesLoading"
            >
              <el-option
                v-for="p in availablePrototypes"
                :key="p.id"
                :label="p.name"
                :value="p.id"
              />
            </el-select>
            <el-button type="primary" @click="handleBind" :loading="binding">绑定</el-button>
          </div>
        </div>
        <div v-else class="preview-panel">
          <div class="preview-toolbar">
            <div class="preview-info">
              <span class="prototype-name">{{ currentBinding.prototype_name }}</span>
              <span class="version">v{{ currentBinding.version_label || currentBinding.version_number }}</span>
            </div>
            <div class="preview-actions">
              <el-button v-if="canManage && pendingReadyCount" type="warning" size="small" @click="openChangesDialog">
                待确认 {{ pendingReadyCount }}
              </el-button>
              <el-button v-if="canEdit" text size="small" @click="openChangesDialog">
                任务管理器
              </el-button>
              <el-button v-if="canEdit" type="primary" size="small" @click="openChangeRequest">
                让 AI 修改
              </el-button>
              <el-button text size="small" @click="goPrototype(currentBinding.prototype_id)">
                <el-icon><Link /></el-icon>
                原型详情
              </el-button>
            </div>
          </div>
          <div class="preview-boundary">
            <div class="preview-boundary-bar">
              <div class="preview-boundary-brand">
                <span class="fuxi-chip">伏羲平台</span>
                <span>项目门户</span>
              </div>
              <span class="preview-boundary-note">以下区域为原型内容 · 当前正式版本 v{{ currentBinding.version_label || currentBinding.version_number }}</span>
            </div>
            <div class="preview-frame-wrapper">
            <iframe v-if="previewUrl" :key="previewUrl" :src="previewUrl" class="preview-frame" frameborder="0"></iframe>
            <el-empty v-else description="原型没有可预览的入口文件" />
            </div>
          </div>
        </div>
      </div>
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
              :title="candidateSmokePending ? '正在自动检查候选预览' : '预览校验尚未完成，请刷新后重试'"
              type="info"
              :closable="false"
              show-icon
            />
            <el-alert
              v-else-if="selectedChange.status === 'invalid' && selectedChange.validation_errors?.length"
              title="候选预览校验失败，不能采纳"
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
              @load="handleCandidateFrameLoad"
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
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="handleRestoreSnapshot(row)">恢复</el-button>
            <el-button v-if="canManage" text type="danger" size="small" @click="handleDeleteSnapshot(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 成员管理弹窗 -->
    <el-dialog v-model="membersVisible" title="项目成员" width="560px">
      <div class="member-form">
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
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button text type="danger" size="small" @click="handleRemoveMember(row.user_id)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Edit, Camera, Link, User, FullScreen
} from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { getPrototypes } from '../api/prototypes'
import { searchUsers } from '../api/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'
import {
  getProject, bindPrototype, removeProjectPrototype,
  checkoutPrototype, checkinPrototype, releaseCheckout,
  getProjectSnapshots, createProjectSnapshot, restoreProjectSnapshot, deleteProjectSnapshot,
  getProjectMembers, addProjectMember, removeProjectMember,
  createPrototypeChange, getProjectChanges, updateProjectChange, deleteProjectChange,
  adoptProjectChange, rejectProjectChange, recordProjectChangePreviewValidation
} from '../api/projects'
import ProjectFormDialog from '../components/ProjectFormDialog.vue'

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
const selectedPrototypeId = ref('')
const binding = ref(false)

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
const candidateSmokePending = ref(false)
let candidateFrameElement = null

onMounted(() => {
  loadProject()
  loadPrototypes()
  window.addEventListener('message', handlePreviewSmokeMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handlePreviewSmokeMessage)
})

async function loadProject() {
  loading.value = true
  try {
    const res = await getProject(route.params.id)
    project.value = res.data.data
    role.value = res.data.data.role
    selectRequestedMenu()
  } catch (err) {
    ElMessage.error('加载项目失败')
  } finally {
    loading.value = false
  }
}

async function loadPrototypes() {
  prototypesLoading.value = true
  try {
    const res = await getPrototypes({})
    prototypes.value = res.data.data || []
  } catch (err) {
    ElMessage.error('加载原型列表失败')
  } finally {
    prototypesLoading.value = false
  }
}

const hasMenu = computed(() => {
  return project.value.menu_config?.items?.some(g => g.children?.length > 0)
})

const canManage = computed(() => {
  return role.value === 'owner' || role.value === 'admin'
})

const canEdit = computed(() => {
  return role.value === 'owner' || role.value === 'admin' || role.value === 'editor'
})

const roleLabel = computed(() => {
  const map = { owner: '创建者', admin: '管理员', editor: '编辑者', viewer: '查看者' }
  return map[role.value] || ''
})

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
  if (target) selectMenu(target.group, target.item)
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
  candidateFrameElement = null
  candidateSmokePending.value = false
  loadChanges()
}

function selectChange(change) {
  selectedChange.value = change
  candidateFrameElement = null
  candidateSmokePending.value = change?.status === 'preview_pending'
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

function changeStatusMeta(status) {
  const map = {
    editing: { label: '进行中', type: 'info' },
    preview_pending: { label: '预览校验中', type: 'info' },
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
  return Boolean(change && canEdit.value && change.status === 'editing' && change.handoff_status !== 'redeemed')
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

async function openChangesDialog() {
  changesVisible.value = true
  await loadChanges()
  selectChange(changes.value.find(change => change.status === 'ready') || changes.value[0] || null)
}

function handleCandidateFrameLoad(event) {
  candidateFrameElement = event.currentTarget
  if (selectedChange.value?.status === 'preview_pending') {
    candidateSmokePending.value = true
  }
}

async function handlePreviewSmokeMessage(event) {
  const data = event.data
  if (!data || data.source !== 'fuxi-preview-smoke' || !candidateFrameElement) return
  if (event.source !== candidateFrameElement.contentWindow) return
  const change = selectedChange.value
  if (!change || change.status !== 'preview_pending') return
  if (!['passed', 'failed'].includes(data.status)) return

  candidateSmokePending.value = false
  try {
    await recordProjectChangePreviewValidation(route.params.id, change.id, {
      status: data.status,
      errors: Array.isArray(data.errors) ? data.errors : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      durationMs: data.durationMs
    })
    await loadChanges()
    if (selectedChange.value?.id === change.id) {
      selectedChange.value = changes.value.find(item => item.id === change.id) || selectedChange.value
    }
    if (data.status === 'passed') ElMessage.success('候选预览校验通过，可提交负责人审核')
    else ElMessage.error('候选预览校验失败，不能采纳')
  } catch (err) {
    ElMessage.warning(err.response?.data?.message || '预览校验结果回写失败，请刷新重试')
  }
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
  background: #f5f7fa;
}
.portal-header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title-block h1 {
  font-size: 18px;
  font-weight: 600;
  color: #1a202c;
}
.title-block .sub {
  font-size: 12px;
  color: #718096;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.portal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.portal-menu {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  overflow-y: auto;
  padding: 12px 0;
}
.menu-group {
  margin-bottom: 8px;
}
.group-label {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 10px 28px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
  transition: background 0.2s;
}
.menu-item:hover {
  background: #f5f7fa;
}
.menu-item.active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}
.item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.portal-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.empty-content,
.bind-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.bind-tip {
  color: #909399;
  font-size: 13px;
  margin-top: 8px;
}
.bind-form {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.preview-toolbar {
  height: 48px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.preview-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.prototype-name {
  font-weight: 600;
  color: #1a202c;
}
.version {
  color: #909399;
  font-size: 12px;
}
.preview-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.expire-tip {
  font-size: 12px;
  color: #e6a23c;
}
.preview-frame-wrapper {
  flex: 1;
  position: relative;
  padding: 10px;
  background: #edf2f7;
}
.preview-frame {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: block;
  background: #fff;
  border: 1px solid #cbd5e0;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 8%);
}
.preview-boundary {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #edf2f7;
}
.preview-boundary-bar,
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
.preview-boundary-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #243b53;
  font-weight: 600;
}
.fuxi-chip,
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
.preview-boundary-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
