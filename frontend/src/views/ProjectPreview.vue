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
        <el-button text @click="openMenuDrawer"><el-icon><Menu /></el-icon>项目菜单</el-button>
        <el-button text :type="pendingReadyCount ? 'warning' : 'default'" @click="openReviewDrawer">
          <el-icon><List /></el-icon>待处理
          <el-badge v-if="pendingReadyCount" :value="pendingReadyCount" class="pending-badge" />
        </el-button>
        <el-button text @click="toggleFocus"><el-icon><FullScreen /></el-icon>{{ focusMode ? '退出专注' : '专注模式' }}</el-button>
      </div>
    </header>

    <section class="workbench-toolbar" aria-label="原型预览工具栏">
      <div class="version-switcher">
        <el-radio-group v-model="previewMode" size="small" :disabled="!currentBinding">
          <el-radio-button value="formal">正式版 v{{ currentBinding?.version_label || currentBinding?.version_number || '-' }}</el-radio-button>
          <el-radio-button v-if="previewableChanges.length" value="candidate">候选版</el-radio-button>
        </el-radio-group>
        <el-tag v-if="previewMode === 'candidate' && selectedChange" type="warning" effect="light" size="small">{{ changeStatusMeta(selectedChange.status).label }}</el-tag>
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
      <template v-else-if="previewMode === 'candidate' && selectedChange && candidatePreviewUrl">
        <div class="canvas-label candidate-label"><el-tag type="warning" effect="light" size="small">候选预览</el-tag><span>{{ selectedChange.title }} · 仅供审核，不会自动替换正式版</span></div>
        <iframe :key="candidatePreviewUrl" :src="candidatePreviewUrl" class="prototype-frame" frameborder="0" title="候选原型预览" />
      </template>
      <template v-else-if="previewUrl">
        <div class="canvas-label"><span>{{ activePathLabel }}</span><span>当前正式版本 v{{ currentBinding.version_label || currentBinding.version_number }}</span></div>
        <iframe :key="previewUrl" :src="previewUrl" class="prototype-frame" frameborder="0" title="正式原型预览" />
      </template>
      <div v-else class="canvas-state">
        <el-empty v-if="activeItem && !currentBinding" description="该菜单项尚未绑定原型"><el-button type="primary" @click="backToProject">返回项目绑定原型</el-button></el-empty>
        <el-empty v-else description="请选择项目菜单节点" />
      </div>
    </main>

    <el-drawer v-model="menuDrawerOpen" direction="ltr" size="360px" :with-header="false" class="menu-drawer" destroy-on-close>
      <div class="drawer-header">
        <div><p class="drawer-eyebrow">项目菜单</p><h2>{{ project.name || '项目' }}</h2><p>切换节点后显示对应绑定原型</p></div>
        <el-button text @click="menuDrawerOpen = false" aria-label="关闭项目菜单"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="drawer-scroll menu-tree">
        <div v-for="group in project.menu_config?.items" :key="group.key" class="menu-group">
          <div class="group-label">{{ group.label }}</div>
          <button v-for="item in group.children" :key="item.key" type="button" :class="['menu-item', { active: isActive(group, item) }]" @click="selectMenu(group, item)">
            <span class="item-label">{{ item.label }}</span>
            <span class="item-meta"><el-tag v-if="bindingFor(group, item)" size="small" effect="plain" type="success">已绑定</el-tag><el-tag v-if="getCheckoutStatus(group, item)" :type="getCheckoutStatus(group, item).type" size="small" effect="plain">{{ getCheckoutStatus(group, item).text }}</el-tag></span>
          </button>
        </div>
        <el-empty v-if="!hasMenu" description="暂无菜单配置" />
      </div>
      <div class="drawer-footer"><span>当前路径</span><strong>{{ activePathLabel || '未选择' }}</strong></div>
    </el-drawer>

    <el-drawer v-model="reviewDrawerOpen" direction="rtl" size="420px" :with-header="false" class="review-drawer" destroy-on-close>
      <div class="drawer-header">
        <div><p class="drawer-eyebrow">模块协作</p><h2>{{ activeItem?.label || '待处理' }}</h2><p>当前菜单节点的候选与协作任务</p></div>
        <el-button text @click="reviewDrawerOpen = false" aria-label="关闭协作抽屉"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="drawer-scroll review-content" v-loading="changesLoading">
        <section class="review-owner"><span class="owner-avatar">{{ ownerName.slice(0, 1).toUpperCase() }}</span><div><small>当前节点负责人</small><strong>{{ ownerName }}</strong></div><el-tag v-if="currentBinding" type="success" effect="light" size="small">正式 v{{ currentBinding.version_label || currentBinding.version_number }}</el-tag></section>
        <div v-if="changes.length" class="change-list">
          <button v-for="change in changes" :key="change.id" type="button" :class="['change-item', { active: selectedChange?.id === change.id }]" @click="selectCandidate(change)">
            <span class="change-item-main"><strong>{{ change.title }}</strong><small>{{ change.creator_name || change.creator_username || '协作者' }} · 基于 v{{ change.base_version_number }}</small></span>
            <el-tag :type="changeStatusMeta(change.status).type" size="small" effect="light">{{ changeStatusMeta(change.status).label }}</el-tag>
          </button>
        </div>
        <el-empty v-else-if="!changesLoading" description="当前菜单暂无协作任务" />
        <section v-if="selectedChange" class="change-detail">
          <div class="change-detail-heading"><div><h3>{{ selectedChange.title }}</h3><p>{{ selectedChange.requirement }}</p></div><el-button v-if="selectedChange.preview_path" text type="primary" size="small" @click="previewCandidate">预览</el-button></div>
          <div class="change-meta"><span>状态：{{ changeStatusMeta(selectedChange.status).label }}</span><span>任务码：{{ handoffStatusMeta(selectedChange).label }}</span><span>基础版本：v{{ selectedChange.base_version_number }}</span></div>
          <el-alert v-if="selectedChange.status === 'stale'" title="候选基于旧版本，当前正式版本未受影响，请基于最新版重新发起。" type="warning" :closable="false" show-icon />
          <el-alert v-else-if="selectedChange.status === 'preview_pending'" title="候选正在整理预览交付状态。" type="info" :closable="false" show-icon />
          <el-alert v-else-if="selectedChange.status === 'invalid' && selectedChange.validation_errors?.length" title="候选静态校验失败，不能采纳。" type="error" :closable="false" show-icon><ul class="validation-errors"><li v-for="error in selectedChange.validation_errors" :key="error">{{ error }}</li></ul></el-alert>
          <p v-if="selectedChange.status === 'ready'" class="adopt-hint">采用后将生成新的正式版本，当前正式版本不会被覆盖。</p>
          <div v-if="selectedChange.status === 'ready' && canManage" class="review-actions"><el-button type="danger" plain @click="rejectSelectedChange">退回</el-button><el-button type="primary" :loading="reviewingChange" @click="adoptSelectedChange">采用候选</el-button></div>
          <div v-else-if="canEditTask(selectedChange)" class="review-actions"><el-button plain @click="editSelectedTask">编辑任务</el-button><el-button type="danger" plain @click="deleteSelectedTask">删除任务</el-button></div>
          <iframe v-if="selectedChange.preview_path" :key="candidatePreviewUrl" :src="candidatePreviewUrl" class="drawer-candidate-preview" frameborder="0" title="候选版本审核预览" />
          <el-empty v-else description="候选尚未准备好预览" :image-size="64" />
        </section>
      </div>
    </el-drawer>

    <el-dialog v-model="changeRequestVisible" :title="editingChangeId ? '修改 AI 任务' : '让 AI 修改'" width="620px" destroy-on-close>
      <template v-if="!changeTaskResult">
        <p class="dialog-tip">描述想看到的结果。Agent 会基于当前正式版本生成独立候选，不会直接覆盖原型。</p>
        <el-form label-position="top">
          <el-form-item label="任务标题"><el-input v-model="changeTitle" maxlength="120" placeholder="例如：客户列表增加跟进筛选" /></el-form-item>
          <el-form-item label="修改目标"><el-input v-model="changeRequirement" type="textarea" :rows="6" maxlength="4000" show-word-limit placeholder="例如：在客户列表增加最近跟进时间，并支持按跟进状态筛选" /></el-form-item>
          <el-form-item label="版本号策略" required><el-radio-group v-model="changeVersionStrategyType"><el-radio value="auto">让 AI 决定版本号</el-radio><el-radio value="custom">自定义版本号</el-radio></el-radio-group><p class="dialog-tip">AI 只选择 major、minor 或 patch，平台负责计算准确版本号。</p></el-form-item>
          <el-form-item v-if="changeVersionStrategyType === 'custom'" label="自定义 SemVer" required><el-input v-model="changeVersionStrategyValue" placeholder="例如 1.2.0" /><p class="dialog-tip">必须高于当前正式版本，且不能重复。</p></el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert title="任务已生成" type="success" :closable="false" show-icon><p>把下面完整提示词发送给已经接入伏羲的 AI 助手。任务码十分钟内有效且只能使用一次。</p></el-alert>
        <div class="task-code-row"><span>任务码</span><code>{{ changeTaskResult.handoffCode }}</code></div>
        <p class="dialog-tip">版本策略：{{ changeTaskResult.change?.version_strategy_type === 'custom' ? `自定义 v${changeTaskResult.change.version_strategy_value}` : 'AI 决定 major / minor / patch' }}</p>
        <pre class="task-prompt">{{ changeTaskResult.prompt }}</pre><p class="dialog-tip">候选上传后仍需项目负责人采用，当前正式版本不会自动改变。</p>
      </template>
      <template #footer><el-button @click="changeRequestVisible = false">{{ changeTaskResult ? '关闭' : '取消' }}</el-button><el-button v-if="changeTaskResult" type="primary" @click="copyChangePrompt">复制完整提示词</el-button><el-button v-else type="primary" :loading="creatingChange" @click="submitChangeTask">{{ editingChangeId ? '保存并重新生成提示词' : '生成 AI 任务' }}</el-button></template>
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
import { getProject, getProjectPortal, getProjectChanges, createPrototypeChange, updateProjectChange, deleteProjectChange, adoptProjectChange, rejectProjectChange, checkoutPrototype, checkinPrototype, releaseCheckout } from '../api/projects'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const project = ref({ menu_config: { items: [] }, prototypes: [] })
const role = ref(null)
const loading = ref(false)
const activeGroup = ref(null)
const activeItem = ref(null)
const menuDrawerOpen = ref(false)
const reviewDrawerOpen = ref(false)
const focusMode = ref(false)
const deviceMode = ref('responsive')
const previewMode = ref('formal')
const previewNonce = ref(0)
const changes = ref([])
const changesLoading = ref(false)
const selectedChange = ref(null)
const reviewingChange = ref(false)
const changeRequestVisible = ref(false)
const editingChangeId = ref(null)
const changeTitle = ref('')
const changeRequirement = ref('')
const changeVersionStrategyType = ref('auto')
const changeVersionStrategyValue = ref('')
const changeTaskResult = ref(null)
const creatingChange = ref(false)

const canManage = computed(() => role.value === 'owner' || role.value === 'admin')
const canEdit = computed(() => canManage.value || role.value === 'editor')
const hasMenu = computed(() => project.value.menu_config?.items?.some(group => group.children?.length > 0))
const activePath = computed(() => activeGroup.value && activeItem.value ? `${activeGroup.value.key}/${activeItem.value.key}` : null)
const activePathLabel = computed(() => activeGroup.value && activeItem.value ? `${activeGroup.value.label} / ${activeItem.value.label}` : '')
const currentBinding = computed(() => activePath.value ? project.value.prototypes?.find(binding => binding.menu_path === activePath.value) || null : null)
const ownerName = computed(() => {
  const owner = project.value.members?.find(member => member.role === 'owner')
  return owner?.nickname || owner?.username || project.value.creator_name || '未配置'
})
const previewUrl = computed(() => {
  const binding = currentBinding.value
  if (!binding?.entry_file || previewMode.value !== 'formal') return null
  const token = authStore.token || ''
  return `/preview/${binding.prototype_id}/${binding.entry_file}?token=${encodeURIComponent(token)}&refresh=${previewNonce.value}`
})
const candidatePreviewUrl = computed(() => {
  if (!selectedChange.value?.preview_path) return ''
  return `${selectedChange.value.preview_path}?token=${encodeURIComponent(authStore.token || '')}`
})
const previewableChanges = computed(() => changes.value.filter(change => Boolean(change.preview_path)))
const pendingReadyCount = computed(() => changes.value.filter(change => change.status === 'ready').length)
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
    project.value = data || { menu_config: { items: [] }, prototypes: [] }
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
  const target = findMenuByPath(binding?.menu_path || requestedPath)
  if (target) return selectMenu(target.group, target.item, { persist: false })
  const first = project.value.menu_config?.items?.flatMap(group => (group.children || []).map(item => ({ group, item })))?.[0]
  if (first) selectMenu(first.group, first.item, { persist: false })
}

function findMenuByPath(path) {
  if (!path) return null
  for (const group of project.value.menu_config?.items || []) {
    for (const item of group.children || []) if (`${group.key}/${item.key}` === path) return { group, item }
  }
  return null
}

function selectMenu(group, item, { persist = true } = {}) {
  activeGroup.value = group
  activeItem.value = item
  previewMode.value = 'formal'
  selectedChange.value = null
  if (persist) {
    const query = { ...route.query, menuPath: `${group.key}/${item.key}` }
    delete query.prototypeId
    router.replace({ query })
    menuDrawerOpen.value = false
  }
  loadChanges()
}

async function loadChanges() {
  const prototypeId = currentBinding.value?.prototype_id
  if (!prototypeId) { changes.value = []; selectedChange.value = null; return }
  changesLoading.value = true
  try {
    const res = await getProjectChanges(route.params.id, { prototypeId })
    changes.value = res.data.data || []
    selectedChange.value = changes.value.find(change => change.status === 'ready') || changes.value.find(change => change.preview_path) || changes.value[0] || null
    if (!previewableChanges.value.length) previewMode.value = 'formal'
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载候选失败')
  } finally {
    changesLoading.value = false
  }
}

function openMenuDrawer() { reviewDrawerOpen.value = false; menuDrawerOpen.value = true }
async function openReviewDrawer() { menuDrawerOpen.value = false; reviewDrawerOpen.value = true; await loadChanges() }
function selectCandidate(change) { selectedChange.value = change; if (change.preview_path) previewMode.value = 'candidate' }
function previewCandidate() { if (selectedChange.value?.preview_path) previewMode.value = 'candidate' }
function toggleFocus() { focusMode.value = !focusMode.value }
function backToProject() { router.push({ name: 'project', params: { id: route.params.id }, query: activePath.value ? { menuPath: activePath.value } : {} }) }
function goPrototype(id) { router.push(`/prototype/${id}`) }
function bindingFor(group, item) { return project.value.prototypes?.find(binding => binding.menu_path === `${group.key}/${item.key}`) || null }
function isActive(group, item) { return activeGroup.value?.key === group.key && activeItem.value?.key === item.key }
function getCheckoutStatus(group, item) {
  const checkout = bindingFor(group, item)?.checkout
  if (!checkout) return null
  return checkout.user_id === authStore.user?.id ? { type: 'success', text: '我签出' } : { type: 'warning', text: `${checkout.nickname || checkout.username || '其他成员'}签出` }
}
function changeStatusMeta(status) {
  const map = { editing: { label: '进行中', type: 'info' }, preview_pending: { label: '交付状态整理中', type: 'info' }, ready: { label: '待确认', type: 'warning' }, invalid: { label: '预览失败', type: 'danger' }, adopted: { label: '已采用', type: 'success' }, rejected: { label: '已退回', type: 'danger' }, stale: { label: '已过期', type: 'warning' }, cancelled: { label: '已取消', type: 'info' } }
  return map[status] || { label: status || '未知', type: 'info' }
}
function handoffStatusMeta(change) {
  if (change.handoff_status === 'redeemed') return { label: '已领取' }
  if (change.handoff_status === 'expired') return { label: '已过期，可重新生成' }
  if (change.handoff_status === 'revoked') return { label: '已撤销' }
  return { label: '待领取' }
}
function canEditTask(change) { return Boolean(change && canEdit.value && change.status === 'editing' && change.handoff_status !== 'redeemed') }
function openChangeRequest() { editingChangeId.value = null; changeTitle.value = ''; changeRequirement.value = ''; changeVersionStrategyType.value = 'auto'; changeVersionStrategyValue.value = ''; changeTaskResult.value = null; changeRequestVisible.value = true }
function editSelectedTask() { if (!canEditTask(selectedChange.value)) return; editingChangeId.value = selectedChange.value.id; changeTitle.value = selectedChange.value.title || ''; changeRequirement.value = selectedChange.value.requirement || ''; changeVersionStrategyType.value = selectedChange.value.version_strategy_type || 'auto'; changeVersionStrategyValue.value = selectedChange.value.version_strategy_value || ''; changeTaskResult.value = null; changeRequestVisible.value = true }
async function submitChangeTask() {
  if (!changeRequirement.value.trim()) return ElMessage.warning('请描述修改目标')
  if (changeVersionStrategyType.value === 'custom' && !changeVersionStrategyValue.value.trim()) return ElMessage.warning('请输入自定义版本号')
  if (!currentBinding.value) return ElMessage.warning('当前菜单尚未绑定原型')
  creatingChange.value = true
  try {
    const payload = { title: (changeTitle.value.trim() || changeRequirement.value.trim()).slice(0, 120), requirement: changeRequirement.value.trim(), versionStrategy: { type: changeVersionStrategyType.value, value: changeVersionStrategyType.value === 'custom' ? changeVersionStrategyValue.value.trim() : null } }
    const res = editingChangeId.value ? await updateProjectChange(route.params.id, editingChangeId.value, payload) : await createPrototypeChange(route.params.id, currentBinding.value.prototype_id, payload)
    changeTaskResult.value = res.data.data
    await loadChanges()
  } catch (error) { ElMessage.error(error.response?.data?.message || '生成任务失败') } finally { creatingChange.value = false }
}
async function copyChangePrompt() { try { await copyClipboardText(changeTaskResult.value?.prompt || ''); ElMessage.success('完整提示词已复制') } catch (error) { ElMessage.warning('复制失败，请手工选择任务文字') } }
async function adoptSelectedChange() {
  if (!selectedChange.value) return
  try {
    await ElMessageBox.confirm(`采用后将生成新的正式版本；其他基于 v${selectedChange.value.base_version_number} 的候选可能过期。`, '采用候选', { type: 'warning', confirmButtonText: '确认采用' })
    reviewingChange.value = true
    await adoptProjectChange(route.params.id, selectedChange.value.id)
    ElMessage.success('候选已采用，正式版本已更新')
    previewMode.value = 'formal'; previewNonce.value += 1
    await Promise.all([loadProject(), loadChanges()])
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '采用失败') } finally { reviewingChange.value = false }
}
async function rejectSelectedChange() {
  if (!selectedChange.value) return
  try {
    const { value } = await ElMessageBox.prompt('请说明退回原因，当前正式版本不会改变。', '退回候选', { confirmButtonText: '确认退回', inputValidator: input => Boolean(input?.trim()) || '请输入退回原因' })
    await rejectProjectChange(route.params.id, selectedChange.value.id, { note: value.trim() }); ElMessage.success('候选已退回'); await loadChanges()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '退回失败') }
}
async function deleteSelectedTask() {
  if (!canEditTask(selectedChange.value)) return
  try {
    await ElMessageBox.confirm('删除后任务码立即失效，当前正式版本和其他候选不受影响。', '删除任务', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
    await deleteProjectChange(route.params.id, selectedChange.value.id); ElMessage.success('任务已删除'); await loadChanges()
  } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '删除任务失败') }
}
async function handleCheckout() { if (!currentBinding.value) return; try { await checkoutPrototype(route.params.id, currentBinding.value.id, { note: '' }); ElMessage.success('签出成功'); await loadProject() } catch (error) { ElMessage.error(error.response?.data?.message || '签出失败') } }
async function handleCheckin() { if (!currentBinding.value) return; try { await checkinPrototype(route.params.id, currentBinding.value.id); ElMessage.success('签入成功'); await loadProject() } catch (error) { ElMessage.error(error.response?.data?.message || '签入失败') } }
async function handleForceRelease() { if (!currentBinding.value) return; try { await ElMessageBox.confirm(`确定强制释放「${currentBinding.value.prototype_name}」的签出锁吗？`, '强制释放', { type: 'warning' }); await releaseCheckout(route.params.id, currentBinding.value.id); ElMessage.success('已强制释放'); await loadProject() } catch (error) { if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '释放失败') } }
</script>

<style scoped>
.project-workbench { --border: #dfe6ef; display: flex; width: 100%; height: 100vh; min-width: 0; flex-direction: column; overflow: hidden; background: #eef2f7; color: #172033; }
.workbench-context { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--border); background: rgba(255,255,255,.97); padding: 0 18px; }
.context-main,.context-actions,.context-title-row,.context-breadcrumb,.toolbar-actions,.version-switcher,.device-switch,.drawer-header,.review-owner,.change-item,.change-detail-heading,.review-actions { display: flex; align-items: center; }
.context-main { min-width: 0; gap: 10px; }.back-button { flex: none; }.context-copy { min-width: 0; }.context-breadcrumb { gap: 6px; color: #8090a5; font-size: 12px; }.context-breadcrumb span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.context-title-row { gap: 10px; margin-top: 3px; }.context-title-row strong { overflow: hidden; color: #172033; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.context-actions { flex: none; gap: 2px; }.pending-badge { margin-left: 5px; }
.workbench-toolbar { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border); background: #f8fafc; padding: 0 14px; }.version-switcher { min-width: 0; gap: 10px; }.toolbar-actions { gap: 8px; }.device-switch { height: 32px; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: #fff; }.device-switch .el-button { width: 34px; height: 30px; margin: 0; border-radius: 0; color: #8794a8; }.device-switch .el-button + .el-button { border-left: 1px solid var(--border); }.device-switch .el-button.active { background: #eaf2ff; color: #2563eb; }
.canvas-stage { position: relative; display: flex; min-width: 0; min-height: 0; flex: 1; align-items: stretch; justify-content: center; overflow: hidden; padding: 10px; background: #e8edf4; }.canvas-stage.device-tablet .prototype-frame { width: min(820px, 100%); }.canvas-stage.device-mobile .prototype-frame { width: min(430px, 100%); }.prototype-frame { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgb(15 23 42 / 8%); }.canvas-label { position: absolute; top: 18px; right: 22px; left: 22px; z-index: 1; display: flex; justify-content: space-between; gap: 12px; pointer-events: none; color: #8794a8; font-size: 11px; }.candidate-label { color: #9a6509; }.candidate-label .el-tag { pointer-events: auto; }.canvas-state { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }.canvas-state .el-icon { margin-right: 8px; }
.drawer-header { justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border); padding: 20px 22px 17px; }.drawer-header > div { min-width: 0; }.drawer-header h2 { margin: 3px 0 0; color: #172033; font-size: 18px; }.drawer-header p:last-child { margin: 6px 0 0; color: #8794a8; font-size: 12px; }.drawer-eyebrow { margin: 0; color: #8290a5; font-size: 11px; font-weight: 600; letter-spacing: .05em; }.drawer-scroll { min-height: 0; overflow-y: auto; padding: 16px; }.menu-group { margin-bottom: 16px; }.group-label { padding: 0 8px 8px; color: #8290a5; font-size: 12px; font-weight: 600; }.menu-item { display: flex; width: 100%; min-height: 42px; align-items: center; justify-content: space-between; gap: 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #334155; padding: 8px 10px 8px 14px; text-align: left; cursor: pointer; }.menu-item:hover { background: #f5f8fc; }.menu-item.active { border-color: #cfe0ff; background: #eaf2ff; color: #2563eb; font-weight: 600; }.item-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.item-meta { display: inline-flex; flex: none; align-items: center; gap: 4px; }.drawer-footer { display: flex; justify-content: space-between; gap: 10px; border-top: 1px solid var(--border); background: #f8fafc; padding: 14px 22px; color: #8290a5; font-size: 12px; }.drawer-footer strong { max-width: 220px; overflow: hidden; color: #334155; text-overflow: ellipsis; white-space: nowrap; }
.review-content { padding: 0; }.review-owner { gap: 10px; border-bottom: 1px solid var(--border); padding: 18px 20px; }.owner-avatar { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 50%; background: #e8f0ff; color: #2563eb; font-size: 14px; font-weight: 700; }.review-owner > div { display: flex; min-width: 0; flex: 1; flex-direction: column; }.review-owner small { color: #8794a8; font-size: 11px; }.review-owner strong { margin-top: 2px; color: #27364f; font-size: 13px; }.change-list { padding: 14px 16px 6px; }.change-item { width: 100%; justify-content: space-between; gap: 10px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 11px 12px; text-align: left; cursor: pointer; }.change-item:hover { border-color: #b9d0fb; }.change-item.active { border-color: #6b9cf0; background: #f3f7ff; box-shadow: 0 0 0 2px #eaf2ff; }.change-item-main { display: flex; min-width: 0; flex: 1; flex-direction: column; }.change-item-main strong { overflow: hidden; color: #334155; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.change-item-main small { margin-top: 4px; color: #8794a8; font-size: 11px; }.change-detail { border-top: 1px solid var(--border); padding: 18px 20px 24px; }.change-detail-heading { align-items: flex-start; justify-content: space-between; gap: 12px; }.change-detail-heading h3 { margin: 0; color: #25344a; font-size: 16px; }.change-detail-heading p { margin: 6px 0 0; color: #718096; font-size: 12px; line-height: 1.6; }.change-meta { display: flex; flex-wrap: wrap; gap: 7px 12px; margin: 11px 0; color: #8794a8; font-size: 11px; }.adopt-hint { margin: 12px 0; color: #718096; font-size: 12px; line-height: 1.6; }.review-actions { gap: 8px; margin: 12px 0; }.drawer-candidate-preview { display: block; width: 100%; height: 280px; margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }.validation-errors { margin: 5px 0 0; padding-left: 16px; line-height: 1.6; }.dialog-tip { color: #718096; font-size: 13px; line-height: 1.7; }.task-code-row { display: flex; align-items: center; gap: 10px; margin-top: 16px; color: #606266; font-size: 13px; }.task-code-row code { padding: 4px 8px; color: #1f2937; background: #f2f6fc; border: 1px solid #dcdfe6; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }.task-prompt { box-sizing: border-box; width: 100%; max-height: 360px; overflow: auto; margin-top: 16px; padding: 14px; color: #e2e8f0; background: #172033; border-radius: 8px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 12px; }
@media (max-width: 760px) { .workbench-context { min-height: 54px; padding: 0 10px; }.context-actions .el-button { padding: 8px 5px; }.context-actions .el-button span:not(.el-icon) { display: none; }.context-breadcrumb { max-width: 43vw; }.workbench-toolbar { overflow-x: auto; padding: 0 8px; }.toolbar-actions { margin-left: auto; }.toolbar-actions > .el-button:not(:last-child) { display: none; }.canvas-stage { padding: 6px; } }
</style>
