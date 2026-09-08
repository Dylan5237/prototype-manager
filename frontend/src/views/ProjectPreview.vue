<template>
  <div class="project-workbench" :class="{ 'is-focus': focusMode }">
    <header class="workbench-context">
      <div class="context-main">
        <el-button class="back-button" text @click="backToProject" aria-label="返回项目">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <div class="context-copy">
          <div class="context-breadcrumb">
            <span>{{ project.name || '项目' }}</span>
            <el-icon><ArrowRight /></el-icon>
            <span>{{ activePathLabel || '请选择菜单节点' }}</span>
          </div>
          <div class="context-title-row">
            <strong>{{ currentBinding?.prototype_name || '原型工作台' }}</strong>
            <el-tag v-if="currentBinding" type="success" effect="light" size="small">
              正式 v{{ currentBinding.version_label || currentBinding.version_number }}
            </el-tag>
          </div>
        </div>
      </div>
      <div class="context-actions">
        <el-button text :type="pendingReadyCount ? 'warning' : 'default'" @click="openReviewDrawer">
          <el-icon><List /></el-icon>待处理
          <el-badge v-if="pendingReadyCount" :value="pendingReadyCount" class="pending-badge" />
        </el-button>
        <el-button text @click="toggleFocus"><el-icon><FullScreen /></el-icon>{{ focusMode ? '退出专注' : '专注模式' }}</el-button>
      </div>
    </header>

    <section class="workbench-toolbar" aria-label="原型预览工具栏">
      <div class="version-switcher">
        <el-button
          class="menu-trigger"
          type="primary"
          plain
          @click="openMenuDrawer"
          aria-label="打开项目菜单"
          :aria-expanded="menuDrawerOpen"
        >
          <el-icon><Menu /></el-icon>
          <span>项目菜单</span>
        </el-button>
        <el-radio-group v-model="previewMode" size="small" :disabled="!currentBinding">
          <el-radio-button value="formal">正式版 v{{ currentBinding?.version_label || currentBinding?.version_number || '-' }}</el-radio-button>
          <el-radio-button v-if="pendingRevision" value="revision">待审修订</el-radio-button>
        </el-radio-group>
        <el-tag v-if="previewMode === 'revision' && pendingRevision" type="warning" effect="light" size="small">待你确认</el-tag>
      </div>
      <div class="toolbar-actions">
        <div class="device-switch" role="group" aria-label="预览设备宽度">
          <el-button text :class="{ active: deviceMode === 'responsive' }" @click="deviceMode = 'responsive'" aria-label="适配宽度"><el-icon><Monitor /></el-icon></el-button>
          <el-button text :class="{ active: deviceMode === 'tablet' }" @click="deviceMode = 'tablet'" aria-label="平板宽度"><el-icon><Cellphone /></el-icon></el-button>
          <el-button text :class="{ active: deviceMode === 'mobile' }" @click="deviceMode = 'mobile'" aria-label="手机宽度"><el-icon><Iphone /></el-icon></el-button>
        </div>
        <el-button v-if="currentBinding" text @click="goPrototype(currentBinding.prototype_id)"><el-icon><Link /></el-icon>原型详情</el-button>
        <el-button v-if="canEdit && currentBinding" type="primary" @click="openChangeRequest"><el-icon><MagicStick /></el-icon>让 AI 修改</el-button>
      </div>
    </section>

    <main class="canvas-stage" :class="`device-${deviceMode}`">
      <div v-if="loading" class="canvas-state"><el-icon class="is-loading"><Loading /></el-icon><span>正在加载项目原型…</span></div>
      <template v-else-if="previewMode === 'revision' && pendingRevision && candidatePreviewUrl">
        <div class="canvas-frame-shell">
          <div class="canvas-label candidate-label"><el-tag type="warning" effect="light" size="small">待审修订</el-tag><span>{{ selectedTask?.title || '待审修订' }} · 仅供审核，不会自动替换正式版</span></div>
          <iframe :key="candidatePreviewUrl" :src="candidatePreviewUrl" class="prototype-frame" frameborder="0" title="待审修订预览" />
        </div>
      </template>
      <template v-else-if="previewUrl">
        <div class="canvas-frame-shell">
          <div class="canvas-label"><span>{{ activePathLabel }}</span><span>当前正式版本 v{{ currentBinding.version_label || currentBinding.version_number }}</span></div>
          <iframe :key="previewUrl" :src="previewUrl" class="prototype-frame" frameborder="0" title="正式原型预览" />
        </div>
      </template>
      <div v-else class="canvas-state">
        <el-empty v-if="activeItem && !currentBinding" description="该菜单项尚未绑定原型"><el-button type="primary" @click="backToProject">返回项目绑定原型</el-button></el-empty>
        <el-empty v-else description="请选择项目菜单节点" />
      </div>
      <div v-if="focusMode" class="focus-controls" aria-label="专注模式控制">
        <el-button circle type="primary" plain class="focus-menu-trigger" @click="openMenuDrawer" aria-label="打开项目菜单" :aria-expanded="menuDrawerOpen">
          <el-icon><Menu /></el-icon>
        </el-button>
        <el-button circle type="primary" plain class="focus-exit-trigger" @click="toggleFocus" aria-label="退出专注模式">
          <el-icon><FullScreen /></el-icon>
        </el-button>
      </div>
    </main>

    <el-drawer v-model="menuDrawerOpen" direction="ltr" size="360px" :with-header="false" class="menu-drawer" destroy-on-close>
      <div class="drawer-header">
        <div><p class="drawer-eyebrow">项目菜单</p><h2>{{ project.name || '项目' }}</h2><p>切换节点后显示对应绑定原型</p></div>
        <el-button text @click="menuDrawerOpen = false" aria-label="关闭项目菜单"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="drawer-scroll menu-tree">
        <ProjectMenuTree :nodes="project.menu_config?.items" :active-path="activePath" :state-for="menuStateForPath" @select="selectMenuNode" />
        <el-empty v-if="!hasMenu" description="暂无菜单配置" />
      </div>
      <div class="drawer-footer"><span>当前路径</span><strong>{{ activePathLabel || '未选择' }}</strong></div>
    </el-drawer>

    <el-drawer v-model="reviewDrawerOpen" direction="rtl" size="86%" :with-header="false" class="review-drawer" destroy-on-close>
      <div class="drawer-header">
        <div><p class="drawer-eyebrow">模块协作</p><h2>{{ activeItem?.label || '待处理' }}</h2><p>对照正式版与当前待审修订，历史尝试默认收起</p></div>
        <el-button text @click="reviewDrawerOpen = false" aria-label="关闭协作抽屉"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="drawer-scroll review-content" v-loading="tasksLoading">
        <section class="review-owner"><span class="owner-avatar">{{ ownerName.slice(0, 1).toUpperCase() }}</span><div><small>当前节点负责人</small><strong>{{ ownerName }}</strong></div><el-tag v-if="currentBinding" type="success" effect="light" size="small">正式 v{{ currentBinding.version_label || currentBinding.version_number }}</el-tag></section>
        <div v-if="tasks.length" class="change-list">
          <button v-for="task in tasks" :key="task.id" type="button" :class="['change-item', { active: selectedTask?.id === task.id }]" @click="selectTask(task)">
            <span class="change-item-main"><strong>{{ task.title }}</strong><small>{{ displayPersonName(task.requester_name, task.requester_username, '发起人') }} · 基线 v{{ task.base_version_number }} · 提交 {{ task.candidate_count || 0 }}</small></span>
            <el-tag :type="taskStatusMeta(task.status).type" size="small" effect="light">{{ taskStatusMeta(task.status).label }}</el-tag>
          </button>
        </div>
        <el-empty v-else-if="!tasksLoading" description="当前菜单暂无协作任务" />
        <section v-if="selectedTask" class="change-detail">
          <TaskCandidateHistory
            :candidates="candidates"
            :selected-candidate="selectedCandidate"
            :loading="candidatesLoading"
            :reviewing="reviewingChange"
            :role="role"
            :task="selectedTask"
            :module-label="activeItem?.label || ''"
            :owner-name="displayPersonName(selectedTask.responsible?.nickname, selectedTask.responsible?.username, ownerName)"
            :official-preview-url="formalPreviewUrl || ''"
            :official-binding="currentBinding"
            :preview-token="authStore.token || ''"
            @select="selectCandidate"
            @adopt="adoptSelectedCandidate"
            @return="returnSelectedCandidate"
          />
        </section>
      </div>
    </el-drawer>

    <el-dialog v-model="changeRequestVisible" title="让 AI 修改" width="620px" destroy-on-close>
      <template v-if="!changeTaskResult">
        <p class="dialog-tip">描述想看到的结果。平台会创建 Task v2 任务；Agent 基于当前正式版本提交待审修订，不会直接覆盖原型。</p>
        <el-form label-position="top">
          <el-form-item label="任务标题"><el-input v-model="changeTitle" maxlength="120" placeholder="例如：客户列表增加跟进筛选" /></el-form-item>
          <el-form-item label="修改目标"><el-input v-model="changeRequirement" type="textarea" :rows="6" maxlength="4000" show-word-limit placeholder="例如：在客户列表增加最近跟进时间，并支持按跟进状态筛选" /></el-form-item>
          <el-form-item label="版本号策略" required><el-radio-group v-model="changeVersionStrategyType"><el-radio value="auto">让 AI 决定版本号</el-radio><el-radio value="custom">自定义版本号</el-radio></el-radio-group><p class="dialog-tip">AI 只选择 major、minor 或 patch，平台负责计算准确版本号。</p></el-form-item>
          <el-form-item v-if="changeVersionStrategyType === 'custom'" label="自定义 SemVer" required><el-input v-model="changeVersionStrategyValue" placeholder="例如 1.2.0" /><p class="dialog-tip">必须高于当前正式版本，且不能重复。</p></el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert title="任务已生成" type="success" :closable="false" show-icon><p>把下面完整提示词发送给已经接入伏羲的 AI 助手。请使用 taskId 提交待审修订，不要走旧的 /changes 写入。</p></el-alert>
        <div class="task-code-row"><span>taskId</span><code>{{ changeTaskResult.taskId }}</code></div>
        <div v-if="changeTaskResult.handoffCode" class="task-code-row"><span>任务码</span><code>{{ changeTaskResult.handoffCode }}</code></div>
        <p class="dialog-tip">版本策略：{{ changeTaskResult.task?.version_strategy_type === 'custom' ? `自定义 v${changeTaskResult.task.version_strategy_value}` : 'AI 决定 major / minor / patch' }}</p>
        <pre class="task-prompt">{{ changeTaskResult.prompt }}</pre><p class="dialog-tip">修订上传后仍需项目负责人采用为正式版，当前正式版本不会自动改变。</p>
      </template>
      <template #footer><el-button @click="changeRequestVisible = false">{{ changeTaskResult ? '关闭' : '取消' }}</el-button><el-button v-if="changeTaskResult" type="primary" @click="copyChangePrompt">复制完整提示词</el-button><el-button v-else type="primary" :loading="creatingChange" @click="submitChangeTask">生成 AI 任务</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, ArrowRight, Menu, List, FullScreen, Link, MagicStick, Monitor, Cellphone, Iphone, Close, Loading } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'
import { findFirstBoundMenu, findMenuByPath, listMenuLeaves, menuNodeLabelPath, menuNodePath, normalizeMenuConfigForBindings } from '../utils/project-menu'
import { getProject, getProjectPortal, getProjectTasks, getTaskCandidates, createProjectTask, acceptProjectTask, adoptProjectCandidate, returnProjectCandidate, checkoutPrototype, checkinPrototype, releaseCheckout } from '../api/projects'
import ProjectMenuTree from '../components/project/ProjectMenuTree.vue'
import TaskCandidateHistory from '../components/project/TaskCandidateHistory.vue'
import { displayPersonName, pickPendingRevision, taskStatusMeta } from '../utils/candidate-review'
import { startBoundProjectTask } from '../utils/project-task-create'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const project = ref({ menu_config: { items: [] }, prototypes: [] })
const role = ref(null)
const loading = ref(false)
const activeGroup = ref(null)
const activeItem = ref(null)
const activeAncestors = ref([])
const menuDrawerOpen = ref(false)
const reviewDrawerOpen = ref(false)
const focusMode = ref(false)
const deviceMode = ref('responsive')
const previewMode = ref('formal')
const previewNonce = ref(0)
const tasks = ref([])
const tasksLoading = ref(false)
const selectedTask = ref(null)
const candidates = ref([])
const candidatesLoading = ref(false)
const selectedCandidate = ref(null)
const reviewingChange = ref(false)
const changeRequestVisible = ref(false)
const changeTitle = ref('')
const changeRequirement = ref('')
const changeVersionStrategyType = ref('auto')
const changeVersionStrategyValue = ref('')
const changeTaskResult = ref(null)
const creatingChange = ref(false)

const canManage = computed(() => role.value === 'owner' || role.value === 'admin')
const canEdit = computed(() => canManage.value || role.value === 'editor')
const hasMenu = computed(() => listMenuLeaves(project.value.menu_config).length > 0)
const activePath = computed(() => activeItem.value ? menuNodePath(activeAncestors.value, activeItem.value) : null)
const activePathLabel = computed(() => activeItem.value ? menuNodeLabelPath(activeAncestors.value, activeItem.value) : '')
const currentBinding = computed(() => activePath.value ? project.value.prototypes?.find(binding => binding.menu_path === activePath.value) || null : null)
const ownerName = computed(() => {
  const owner = project.value.members?.find(member => member.role === 'owner')
  return owner?.nickname || owner?.username || project.value.creator_name || '未配置'
})
const formalPreviewUrl = computed(() => {
  const binding = currentBinding.value
  if (!binding?.entry_file) return null
  const token = authStore.token || ''
  return `/preview/${binding.prototype_id}/${binding.entry_file}?token=${encodeURIComponent(token)}&refresh=${previewNonce.value}`
})
const previewUrl = computed(() => previewMode.value === 'formal' ? formalPreviewUrl.value : null)
const pendingRevision = computed(() => pickPendingRevision(candidates.value))
const candidatePreviewUrl = computed(() => {
  if (!pendingRevision.value?.preview_path) return ''
  return `${pendingRevision.value.preview_path}?token=${encodeURIComponent(authStore.token || '')}`
})
const pendingReadyCount = computed(() => tasks.value.reduce((sum, task) => sum + Number(task.pending_candidate_count || 0), 0))
const isMyCheckout = computed(() => currentBinding.value?.checkout?.user_id === authStore.user?.id)
const expireTip = computed(() => {
  const expiresAt = currentBinding.value?.checkout?.expires_at
  if (!expiresAt) return ''
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000)
  if (diff <= 0) return '已超时'
  if (diff < 60) return `${diff} 分钟后自动释放`
  return `${Math.floor(diff / 60)} 小时后释放`
})

onMounted(loadProject)

async function loadProject() {
  loading.value = true
  try {
    let data
    try {
      const res = await getProject(route.params.id)
      data = res.data.data
    } catch (error) {
      const res = await getProjectPortal(route.params.id)
      data = res.data.data
      role.value = null
    }
    project.value = data ? { ...data, menu_config: normalizeMenuConfigForBindings(data.menu_config, data.prototypes) } : { menu_config: { items: [] }, prototypes: [] }
    role.value = data?.role ?? role.value
    selectRequestedMenu()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载项目失败')
  } finally {
    loading.value = false
  }
}

function selectRequestedMenu() {
  const requestedPath = Array.isArray(route.query.menuPath) ? route.query.menuPath[0] : route.query.menuPath
  const requestedPrototypeId = Array.isArray(route.query.prototypeId) ? route.query.prototypeId[0] : route.query.prototypeId
  const binding = project.value.prototypes?.find(item => (requestedPath && item.menu_path === requestedPath) || (requestedPrototypeId && item.prototype_id === requestedPrototypeId))
  const target = findMenuByPath(project.value.menu_config, binding?.menu_path || requestedPath)
  if (target) return selectMenuNode({node:target.node,ancestors:target.ancestors}, {persist:false})
  const first = findFirstBoundMenu(project.value.menu_config, project.value.prototypes) || listMenuLeaves(project.value.menu_config)[0]
  if (first) selectMenuNode(first, {persist:false})
}

function selectMenuNode({node,ancestors}, { persist = true } = {}) {
  activeAncestors.value = ancestors || []
  activeGroup.value = ancestors?.[0] || node
  activeItem.value = node
  previewMode.value = 'formal'
  selectedTask.value = null
  selectedCandidate.value = null
  candidates.value = []
  if (persist) {
    const query = { ...route.query, menuPath: menuNodePath(ancestors,node) }
    delete query.prototypeId
    router.replace({ query })
    menuDrawerOpen.value = false
  }
  loadTasks()
}

function currentNodeId() {
  return currentBinding.value?.node_id || activeItem.value?.id || null
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
    const preferredId = selectedTask.value?.id
    selectedTask.value = tasks.value.find(task => task.id === preferredId)
      || tasks.value.find(task => Number(task.pending_candidate_count || 0) > 0)
      || tasks.value[0]
      || null
    await loadCandidates()
    if (!pendingRevision.value) previewMode.value = 'formal'
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载任务失败')
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
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载修订记录失败')
  } finally {
    candidatesLoading.value = false
  }
}

function openMenuDrawer() { reviewDrawerOpen.value = false; menuDrawerOpen.value = true }
async function openReviewDrawer() { menuDrawerOpen.value = false; reviewDrawerOpen.value = true; await loadTasks() }
async function selectTask(task) {
  selectedTask.value = task
  selectedCandidate.value = null
  await loadCandidates()
}
function selectCandidate(candidate) {
  selectedCandidate.value = candidate
}
function toggleFocus() { focusMode.value = !focusMode.value }
function backToProject() { router.push({ name: 'project', params: { id: route.params.id }, query: activePath.value ? { menuPath: activePath.value } : {} }) }
function goPrototype(id) { router.push(`/prototype/${id}`) }
function menuStateForPath(path) {
  const binding=project.value.prototypes?.find(item=>item.menu_path===path)
  if(!binding)return {text:'未绑定',tone:'empty'}
  if(binding.checkout)return {text:binding.checkout.user_id===authStore.user?.id?'我签出':'签出中',tone:'warn'}
  return {text:'稳定',tone:'stable'}
}
function openChangeRequest() { changeTitle.value = ''; changeRequirement.value = ''; changeVersionStrategyType.value = 'auto'; changeVersionStrategyValue.value = ''; changeTaskResult.value = null; changeRequestVisible.value = true }
async function submitChangeTask() {
  if (!changeRequirement.value.trim()) return ElMessage.warning('请描述修改目标')
  if (changeVersionStrategyType.value === 'custom' && !changeVersionStrategyValue.value.trim()) return ElMessage.warning('请输入自定义版本号')
  if (!currentBinding.value) return ElMessage.warning('当前菜单尚未绑定原型')
  if (!authStore.user?.id) return ElMessage.warning('请先登录后再创建任务')
  creatingChange.value = true
  try {
    changeTaskResult.value = await startBoundProjectTask({
      projectId: route.params.id,
      projectName: project.value.name,
      binding: currentBinding.value,
      menuPath: activePathLabel.value,
      title: (changeTitle.value.trim() || changeRequirement.value.trim()).slice(0, 120),
      requirement: changeRequirement.value.trim(),
      versionStrategy: { type: changeVersionStrategyType.value, value: changeVersionStrategyType.value === 'custom' ? changeVersionStrategyValue.value.trim() : null },
      responsibleUserId: authStore.user.id,
      createProjectTask,
      acceptProjectTask
    })
    await loadTasks()
  } catch (error) { ElMessage.error(error.response?.data?.message || error.message || '生成任务失败') } finally { creatingChange.value = false }
}
async function copyChangePrompt() { try { await copyClipboardText(changeTaskResult.value?.prompt || ''); ElMessage.success('完整提示词已复制') } catch (error) { ElMessage.warning('复制失败，请手工选择任务文字') } }
async function adoptSelectedCandidate(candidate = selectedCandidate.value) {
  if (!candidate) return
  try {
    await ElMessageBox.confirm('采用后将生成新的正式版本，当前线上正式版会被这次待审修订替换。', '采用为正式版', { type: 'warning', confirmButtonText: '确认采用' })
    reviewingChange.value = true
    await adoptProjectCandidate(route.params.id, candidate.id)
    ElMessage.success('已采用为正式版')
    previewMode.value = 'formal'; previewNonce.value += 1
    await Promise.all([loadProject(), loadTasks()])
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '采用失败') } finally { reviewingChange.value = false }
}
async function returnSelectedCandidate(candidate = selectedCandidate.value) {
  if (!candidate) return
  try {
    const { value } = await ElMessageBox.prompt('请说明退回原因，当前正式版本不会改变。', '退回修订', { confirmButtonText: '确认退回', inputValidator: input => Boolean(input?.trim()) || '请输入退回原因' })
    await returnProjectCandidate(route.params.id, candidate.id, { note: value.trim() }); ElMessage.success('已退回，正式版未改变'); await loadTasks()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '退回失败') }
}
async function handleCheckout() { if (!currentBinding.value) return; try { await checkoutPrototype(route.params.id, currentBinding.value.id, { note: '' }); ElMessage.success('签出成功'); await loadProject() } catch (error) { ElMessage.error(error.response?.data?.message || '签出失败') } }
async function handleCheckin() { if (!currentBinding.value) return; try { await checkinPrototype(route.params.id, currentBinding.value.id); ElMessage.success('签入成功'); await loadProject() } catch (error) { ElMessage.error(error.response?.data?.message || '签入失败') } }
async function handleForceRelease() { if (!currentBinding.value) return; try { await ElMessageBox.confirm(`确定强制释放「${currentBinding.value.prototype_name}」的签出锁吗？`, '强制释放', { type: 'warning' }); await releaseCheckout(route.params.id, currentBinding.value.id); ElMessage.success('已强制释放'); await loadProject() } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '释放失败') } }
</script>

<style scoped>
.project-workbench { --border: #dfe6ef; position: relative; display: flex; width: 100%; height: 100vh; min-width: 0; flex-direction: column; overflow: hidden; background: #eef2f7; color: #172033; }
.workbench-context { display: flex; min-height: 58px; flex: none; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.97); padding: 0 18px; }
.context-main,.context-actions,.context-title-row,.context-breadcrumb,.toolbar-actions,.version-switcher,.device-switch,.drawer-header,.review-owner,.change-item,.change-detail-heading,.review-actions { display: flex; align-items: center; }
.context-main { min-width: 0; gap: 10px; }.back-button { flex: none; }.context-copy { min-width: 0; }.context-breadcrumb { gap: 6px; color: #8090a5; font-size: 12px; }.context-breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.context-title-row { gap: 10px; margin-top: 3px; }.context-title-row strong { overflow: hidden; color: #172033; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.context-actions { flex: none; gap: 2px; }.pending-badge { margin-left: 5px; }
.workbench-toolbar { display: flex; min-height: 50px; flex: none; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border); background: #f8fafc; padding: 0 14px; }.version-switcher { min-width: 0; gap: 10px; }.menu-trigger { flex: none; font-weight: 600; }.menu-trigger .el-icon { margin-right: 4px; }.toolbar-actions { gap: 8px; }.device-switch { height: 32px; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: #fff; }.device-switch .el-button { width: 34px; height: 30px; margin: 0; border-radius: 0; color: #8794a8; }.device-switch .el-button + .el-button { border-left: 1px solid var(--border); }.device-switch .el-button.active { background: #eaf2ff; color: #2563eb; }
.canvas-stage { position: relative; display: flex; min-width: 0; min-height: 0; flex: 1; align-items: stretch; justify-content: center; overflow: hidden; padding: 10px; background: #e8edf4; }.canvas-frame-shell { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex-direction: column; }.canvas-stage.device-tablet .canvas-frame-shell { width: min(820px, 100%); }.canvas-stage.device-mobile .canvas-frame-shell { width: min(430px, 100%); }.prototype-frame { display: block; width: 100%; height: auto; min-width: 0; min-height: 0; flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgb(15 23 42 / 8%); }.canvas-label { display: flex; min-height: 28px; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px; color: #8794a8; font-size: 11px; }.candidate-label { color: #9a6509; }.candidate-label .el-tag { pointer-events: auto; }.canvas-state { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }.canvas-state .el-icon { margin-right: 8px; }
.focus-controls { position: absolute; top: 14px; right: 14px; left: 14px; z-index: 4; display: flex; justify-content: space-between; pointer-events: none; }.focus-controls .el-button { pointer-events: auto; border-color: rgb(148 163 184 / 45%); background: rgb(255 255 255 / 82%); box-shadow: 0 6px 18px rgb(15 23 42 / 15%); backdrop-filter: blur(8px); }.project-workbench.is-focus .workbench-context,.project-workbench.is-focus .workbench-toolbar { display: none; }.project-workbench.is-focus .canvas-stage { padding: 0; }.project-workbench.is-focus .canvas-label { display: none; }.project-workbench.is-focus .prototype-frame { border: 0; border-radius: 0; box-shadow: none; }
.drawer-header { justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border); padding: 20px 22px 17px; }.drawer-header > div { min-width: 0; }.drawer-header h2 { margin: 3px 0 0; color: #172033; font-size: 18px; }.drawer-header p:last-child { margin: 6px 0 0; color: #8794a8; font-size: 12px; }.drawer-eyebrow { margin: 0; color: #8290a5; font-size: 11px; font-weight: 600; letter-spacing: .05em; }.drawer-scroll { min-height: 0; overflow-y: auto; padding: 16px; }.menu-group { margin-bottom: 16px; }.group-label { padding: 0 8px 8px; color: #8290a5; font-size: 12px; font-weight: 600; }.menu-item { display: flex; width: 100%; min-height: 42px; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #334155; padding: 8px 10px 8px 14px; text-align: left; cursor: pointer; }.menu-item:hover { background: #f5f8fc; }.menu-item.active { border-color: #cfe0ff; background: #eaf2ff; color: #2563eb; font-weight: 600; }.item-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.item-meta { display: inline-flex; flex: none; align-items: center; gap: 4px; }.drawer-footer { display: flex; justify-content: space-between; gap: 10px; border-top: 1px solid var(--border); background: #f8fafc; padding: 14px 22px; color: #8290a5; font-size: 12px; }.drawer-footer strong { max-width: 220px; overflow: hidden; color: #334155; text-overflow: ellipsis; white-space: nowrap; }
.review-content { padding: 0; }.review-owner { gap: 10px; border-bottom: 1px solid var(--border); padding: 18px 20px; }.owner-avatar { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 50%; background: #e8f0ff; color: #2563eb; font-size: 14px; font-weight: 700; }.review-owner > div { display: flex; min-width: 0; flex: 1; flex-direction: column; }.review-owner small { color: #8794a8; font-size: 11px; }.review-owner strong { margin-top: 2px; color: #27364f; font-size: 13px; }.change-list { padding: 14px 16px 6px; }.change-item { width: 100%; justify-content: space-between; gap: 10px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 11px 12px; text-align: left; cursor: pointer; }.change-item:hover { border-color: #b9d0fb; }.change-item.active { border-color: #6b9cf0; background: #f3f7ff; box-shadow: 0 0 0 2px #eaf2ff; }.change-item-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }.change-item-main strong { overflow: hidden; color: #334155; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.change-item-main small { margin-top: 4px; color: #8794a8; font-size: 11px; }.change-detail { border-top: 1px solid var(--border); padding: 18px 20px 24px; }.change-detail-heading { align-items: flex-start; justify-content: space-between; gap: 12px; }.change-detail-heading h3 { margin: 0; color: #25344a; font-size: 16px; }.change-detail-heading p { margin: 6px 0 0; color: #718096; font-size: 12px; line-height: 1.6; }.change-meta { display: flex; flex-wrap: wrap; gap: 7px 12px; margin: 11px 0; color: #8794a8; font-size: 11px; }.adopt-hint { margin: 12px 0; color: #718096; font-size: 12px; line-height: 1.6; }.review-actions { gap: 8px; margin: 12px 0; }.drawer-candidate-preview { display: block; width: 100%; height: 280px; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }.validation-errors { margin: 5px 0 0; padding-left: 16px; line-height: 1.6; }.dialog-tip { color: #718096; font-size: 13px; line-height: 1.7; }.task-code-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; color: #606266; font-size: 13px; }.task-code-row code { padding: 4px 8px; color: #1f2937; background: #f2f6fc; border: 1px solid #dcdfe6; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }.task-prompt { box-sizing: border-box; width: 100%; max-height: 360px; overflow: auto; margin-top: 16px; padding: 14px; color: #e2e8f0; background: #172033; border-radius: 8px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 12px; }
@media (max-width: 760px) { .workbench-context { min-height: 54px; padding: 0 10px; }.context-actions .el-button { padding: 8px 5px; }.context-actions .el-button span:not(.el-icon) { display: none; }.context-breadcrumb { max-width: 43vw; }.workbench-toolbar { overflow-x: auto; padding: 0 8px; }.toolbar-actions { margin-left: auto; }.toolbar-actions > .el-button:not(:last-child) { display: none; }.canvas-stage { padding: 6px; } }
</style>
