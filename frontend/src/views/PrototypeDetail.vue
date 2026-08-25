<template>
  <div class="detail-view" v-if="prototype">
    <div class="detail-header">
      <div class="header-left">
        <el-button text @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h1>{{ prototype.name }}</h1>
        <el-button v-if="previewUrl" type="success" class="preview-btn" @click="openPreview">
          <el-icon><View /></el-icon>
          预览
        </el-button>
        <el-button v-else disabled type="info" class="preview-btn" title="原型文件尚未上传，请通过 Skill 上传">
          <el-icon><View /></el-icon>
          预览
        </el-button>
      </div>
      <div class="header-actions">
        <el-button v-if="!prototype.project_binding && canEdit" text type="primary" @click="openDirectChangeDialog(directChange?.status === 'editing' ? directChange : null)">
          <el-icon><MagicStick /></el-icon>
          让 AI 修改
        </el-button>
        <el-button v-if="canEdit" text @click="openShareDialog">
          <el-icon><Share /></el-icon>
          协作
        </el-button>
        <el-button text :disabled="!previewUrl" @click="copyShareLink">
          <el-icon><Link /></el-icon>
          免登录链接
        </el-button>
        <el-dropdown v-if="canEdit" trigger="click" @command="handleHeaderCommand">
          <el-button text class="header-more-button" aria-label="更多操作">
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit">
                <el-icon><Edit /></el-icon>编辑
              </el-dropdown-item>
              <el-dropdown-item command="download">
                <el-icon><Download /></el-icon>下载 ZIP
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- 让 AI 修改、协作和常用分享操作集中在同一工具区；低频信息编辑与下载收进更多菜单。 -->
      </div>
    </div>

    <div class="info-card">
      <div class="info-row">
        <div class="info-id" @click="copyId(prototype.id)" title="点击复制ID">
          <el-icon><Document /></el-icon>
          <code>{{ prototype.id }}</code>
        </div>
        <div class="info-tags">
          <el-tag v-if="prototype.category_name" size="small" type="info">{{ prototype.category_name }}</el-tag>
          <span class="info-item">
            <el-icon><User /></el-icon>
            {{ prototype.creator_name }}
          </span>
          <span class="info-item" v-if="visitStats.total">
            <el-icon><View /></el-icon>
            {{ visitStats.total }}
          </span>
        </div>
      </div>
      <div class="info-desc">{{ prototype.description || '暂无描述' }}</div>
      <div v-if="prototype.sync_error" class="info-error">
        <el-icon><Warning /></el-icon>
        同步错误：{{ prototype.sync_error }}
      </div>
    </div>

    <el-alert
      v-if="prototype.project_binding"
      class="project-binding-alert"
      type="info"
      :closable="false"
      show-icon
    >
      <template #title>
        已归属项目「{{ prototype.project_binding.project_name }}」
      </template>
      <div class="project-binding-content">
        <span>
          当前原型在项目菜单中有 {{ prototype.project_binding.menu_positions?.length || 0 }} 个展示位置；归属后请在项目内发起修改。
        </span>
        <el-button link type="primary" @click="goToBoundProject">
          前往项目修改
        </el-button>
      </div>
    </el-alert>

    <section v-if="!prototype.project_binding && canEdit && directChange && directChange.status !== 'cancelled'" class="direct-change-card" v-loading="directChangeLoading">
      <div class="direct-change-head">
        <div>
          <h3><el-icon><MagicStick /></el-icon> 让 AI 修改</h3>
          <p>独立原型修改会先完成静态交付检查，通过后直接生成正式版本。</p>
        </div>
      </div>
      <template v-if="directChange && directChange.status !== 'cancelled'">
        <div class="direct-change-meta">
          <span>基线 v{{ directChange.base_version_number }}</span>
          <span>版本策略：{{ directChange.version_strategy_type === 'custom' ? `自定义 v${directChange.version_strategy_value}` : 'AI 决定 major / minor / patch' }}</span>
          <span v-if="directChange.status === 'editing'">修改码：{{ directChange.handoff_status === 'redeemed' ? '已领取' : directCountdownLabel }}</span>
        </div>
        <el-alert v-if="directChange.status === 'editing' && directChange.handoff_status === 'redeemed'" title="AI 已领取修改码，任务内容和基线已锁定，等待候选上传。" type="info" :closable="false" show-icon />
        <el-alert v-else-if="directChange.status === 'preview_pending'" title="候选已上传，正在整理交付状态；如预览无法加载，请让 AI 排查后重新上传。" type="info" :closable="false" show-icon />
        <el-alert v-else-if="directChange.status === 'invalid'" title="候选静态校验失败，正式版本未改变。请让 AI 修正后重新上传。" type="error" :closable="false" show-icon>
          <ul class="validation-errors"><li v-for="error in directChange.validation_errors" :key="error.message || error">{{ error.message || error }}</li></ul>
        </el-alert>
        <el-alert v-else-if="directChange.status === 'stale'" title="基线版本已变化，当前修改未写入正式版本，请重新发起。" type="warning" :closable="false" show-icon />
        <el-alert v-else-if="directChange.status === 'completed'" :title="`修改已完成，正式版本已更新为 v${directChange.current_version_label || directChange.version_label || ''}`" type="success" :closable="false" show-icon />
        <div class="direct-change-actions">
          <el-button v-if="directChangeResult?.prompt" size="small" @click="copyDirectPrompt"><el-icon><DocumentCopy /></el-icon>复制完整提示词</el-button>
          <el-button v-if="directChange.status === 'editing' && directChange.handoff_status !== 'redeemed'" size="small" @click="openDirectChangeDialog(directChange)">编辑并重新生成</el-button>
          <el-button v-if="directChange.status === 'editing' && directChange.handoff_status !== 'redeemed'" size="small" type="danger" plain @click="cancelCurrentDirectChange">取消修改</el-button>
        </div>
      </template>
    </section>

    <!-- 左右布局：左侧 Tab 导航 + 右侧内容 -->
    <div class="detail-content">
      <div class="tab-sidebar">
        <div
          v-for="tab in tabs"
          :key="tab.name"
          :class="['tab-item', { active: activeTab === tab.name }]"
          @click="activeTab = tab.name"
        >
          <el-icon><component :is="tab.icon" /></el-icon>
          <span>{{ tab.label }}</span>
        </div>
      </div>

      <div class="tab-content">
        <!-- 设计文档 -->
        <div v-if="activeTab === 'readme'" class="readme-container">
          <div v-if="readmeHtml" class="readme-content" v-html="readmeHtml"></div>
          <el-empty v-else description="暂无设计文档（未找到README.md）" />
        </div>

        <!-- 版本历史 -->
        <div v-if="activeTab === 'versions'" class="versions-container">
          <el-table :data="versions" v-loading="versionLoading" size="small" style="width: 100%">
            <el-table-column prop="version_number" label="版本号" width="80">
              <template #default="{ row }">
                <el-tag size="small" type="primary">{{ row.version_label ? 'v' + row.version_label : 'v' + row.version_number }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.created_at) }}
              </template>
            </el-table-column>
            <el-table-column prop="sync_source" label="来源" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.sync_source === 'github' ? 'info' : 'success'">
                  {{ row.sync_source === 'github' ? 'GitHub' : '上传' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="creator_name" label="操作人" width="100" />
            <el-table-column prop="note" label="备注" min-width="200">
              <template #default="{ row }">
                <el-tooltip :content="row.note || ''" placement="top" :show-after="300" popper-class="version-note-tooltip">
                  <span class="note-cell">{{ row.note || '-' }}</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <div class="version-actions">
                  <el-button size="small" text type="primary" @click="openVersionPreview(row)">
                    <el-icon><View /></el-icon>预览
                  </el-button>
                  <el-button
                    v-if="canEdit"
                    size="small"
                    text
                    type="primary"
                    @click="openVersionNoteEdit(row)"
                  >
                    <el-icon><Edit /></el-icon>编辑
                  </el-button>
                  <el-dropdown v-if="canEdit" trigger="click" @command="(cmd) => handleVersionCommand(cmd, row)">
                    <el-button size="small" text type="info">
                      更多<el-icon style="margin-left:2px"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="rollback">
                          <el-icon><RefreshLeft /></el-icon>回滚
                        </el-dropdown-item>
                        <el-dropdown-item command="delete" class="danger-item">
                          <el-icon><Delete /></el-icon>删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="versions.length === 0 && !versionLoading" description="暂无历史版本" />
        </div>

        <!-- 评论反馈 -->
        <div v-if="activeTab === 'comments'" class="comments-container">
          <div class="comment-input-area">
            <el-input
              v-model="commentContent"
              type="textarea"
              :rows="3"
              placeholder="输入评论内容，支持 Ctrl+V 粘贴图片..."
              @paste="handlePaste"
            />
            <div class="comment-toolbar">
              <div class="comment-image-list" v-if="commentImages.length > 0">
                <div v-for="(img, idx) in commentImages" :key="idx" class="comment-image-item">
                  <img :src="img.url" />
                  <el-icon class="comment-image-remove" @click="removeCommentImage(idx)"><Delete /></el-icon>
                </div>
              </div>
              <div class="comment-hint">支持 Ctrl+V 粘贴图片（最多9张）</div>
              <el-button type="primary" size="small" @click="handleCommentSubmit" :loading="submittingComment">
                发表评论
              </el-button>
            </div>
          </div>
          <div class="comment-list" v-loading="commentLoading">
            <div v-for="comment in comments" :key="comment.id" class="comment-item">
              <div class="comment-header">
                <span class="comment-author">{{ comment.nickname || comment.username }}</span>
                <span class="comment-time">{{ formatDateTime(comment.created_at) }}</span>
                <el-button
                  v-if="authStore.isAdmin || comment.user_id === authStore.user?.id"
                  size="small"
                  text
                  type="danger"
                  @click="handleCommentDelete(comment)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
              <div class="comment-body">{{ comment.content }}</div>
              <div class="comment-images" v-if="comment.images && comment.images.length > 0">
                <el-image
                  v-for="(img, idx) in comment.images"
                  :key="idx"
                  :src="img.url"
                  :preview-src-list="comment.images.map(i => i.url)"
                  :style="{ width: '120px', height: '120px', borderRadius: '8px', border: '1px solid #e4e7ed', cursor: 'pointer' }"
                  fit="cover"
                  hide-on-click-modal
                />
              </div>
            </div>
            <el-empty v-if="comments.length === 0 && !commentLoading" description="暂无评论，快来发表第一条评论吧" />
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑原型对话框 -->
    <el-dialog v-model="showEditDialog" title="编辑原型信息" width="500px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" placeholder="请输入原型名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" placeholder="请输入原型描述" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="editForm.categoryId" placeholder="请选择分类" clearable style="width: 100%">
            <el-option
              v-for="cat in categories"
              :key="cat.id"
              :label="cat.name"
              :value="cat.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="savingEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="directChangeDialogVisible" :title="directChangeEditingId ? '编辑并重新生成提示词' : '让 AI 修改'" width="720px" destroy-on-close>
      <template v-if="!directChangeResult">
        <el-alert title="任务码有效期 10 分钟只用于首次领取；AI 领取后修改时间不受此限制。" type="info" :closable="false" show-icon />
        <el-form label-position="top" class="direct-change-form">
          <el-form-item label="修改要求" required>
            <el-input v-model="directRequirement" type="textarea" :rows="7" maxlength="4000" show-word-limit placeholder="描述要修改的页面、交互、数据和验收结果。" />
          </el-form-item>
          <el-form-item label="版本号策略" required>
            <el-radio-group v-model="directVersionStrategyType">
              <el-radio label="auto">让 AI 决定版本号</el-radio>
              <el-radio label="custom">自定义版本号</el-radio>
            </el-radio-group>
            <p class="form-help">AI 只能选择 major、minor 或 patch，平台负责计算准确版本号。</p>
          </el-form-item>
          <el-form-item v-if="directVersionStrategyType === 'custom'" label="自定义 SemVer" required>
            <el-input v-model="directVersionStrategyValue" placeholder="例如 1.2.0" />
            <p class="form-help">必须高于当前版本，且不能与历史版本重复。</p>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-alert title="修改提示词已生成" type="success" :closable="false" show-icon>
          <p>请复制完整提示词发送给已经接入伏羲的 AI 助手。领取后平台会锁定基线和版本策略。</p>
        </el-alert>
        <div class="task-code-row"><span>修改码</span><code>{{ directChangeResult.handoffCode }}</code></div>
        <pre class="task-prompt">{{ directChangeResult.prompt }}</pre>
      </template>
      <template #footer>
        <el-button @click="directChangeDialogVisible = false">{{ directChangeResult ? '关闭' : '取消' }}</el-button>
        <el-button v-if="directChangeResult" @click="returnDirectChangeEdit">返回编辑</el-button>
        <el-button v-if="directChangeResult" type="primary" @click="copyDirectPrompt">复制完整提示词</el-button>
        <el-button v-else type="primary" :loading="directChangeSubmitting" @click="submitDirectChange">生成修改提示词</el-button>
      </template>
    </el-dialog>

    <!-- 编辑版本描述对话框 -->
    <el-dialog v-model="showVersionNoteDialog" title="编辑版本描述" width="500px">
      <el-form label-width="80px">
        <el-form-item label="版本">
          <span>v{{ editingVersion?.version_number }}</span>
        </el-form-item>
        <el-form-item label="描述" required>
          <el-input
            v-model="editingVersionNote"
            type="textarea"
            :rows="4"
            placeholder="请输入版本描述（必填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showVersionNoteDialog = false">取消</el-button>
        <el-button type="primary" @click="handleVersionNoteSubmit" :loading="savingVersionNote">保存</el-button>
      </template>
    </el-dialog>

    <!-- 协作者对话框 -->
    <el-dialog v-model="showShareDialog" title="协作成员" width="500px">
      <el-form label-width="90px">
        <el-form-item label="添加用户">
          <el-select
            v-model="shareUsername"
            filterable
            remote
            reserve-keyword
            placeholder="输入用户名搜索"
            :remote-method="handleShareUserSearch"
            :loading="shareLoading"
            style="width: 100%"
          >
            <el-option
              v-for="u in shareUserOptions"
              :key="u.id"
              :label="`${u.nickname || u.username} (${u.username})`"
              :value="u.username"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="或用户组">
          <el-select
            v-model="shareGroupId"
            clearable
            placeholder="选择用户组"
            :loading="groupsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="g in groupOptions"
              :key="g.id"
              :label="`${g.name} (${g.member_count || 0}人)`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <div style="margin-top: 16px;">
        <div v-loading="sharesLoading">
          <p v-if="sharesList.length === 0" class="share-empty">暂无协作者</p>
          <el-tag
            v-for="s in sharesList"
            :key="s.user_id"
            closable
            type="info"
            style="margin: 0 8px 8px 0;"
            @close="handleUnshare(s.user_id)"
          >
            {{ s.nickname || s.username }}
          </el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="showShareDialog = false">关闭</el-button>
        <el-button type="primary" @click="handleShare" :loading="shareLoading" :disabled="!shareUsername && !shareGroupId">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, computed, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Clock, ChatDotSquare, ArrowDown, Link, Download, MagicStick, DocumentCopy, Edit, Share, MoreFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { searchUsers } from '../api/auth'
import { getGroups } from '../api/groups'
import {
  getPrototype, downloadPrototype, getReadme, updatePrototype, getCategories,
  getVersions, rollbackVersion, deleteVersion, updateVersionNote,
  getPrototypeShares, sharePrototype, unsharePrototype, getPublicShareLink,
  getComments, createComment, deleteComment, uploadCommentImage,
  getStats, recordVisit
  , getCurrentDirectChange, createDirectChange, updateDirectChange, cancelDirectChange
} from '../api/prototypes'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const prototype = ref(null)
const loading = ref(false)
const activeTab = ref('readme')
const readmeHtml = ref('')

const tabs = [
  { name: 'readme', label: '设计文档', icon: markRaw(Document) },
  { name: 'versions', label: '版本历史', icon: markRaw(Clock) },
  { name: 'comments', label: '评论反馈', icon: markRaw(ChatDotSquare) },
]

// 版本管理
const versions = ref([])
const versionLoading = ref(false)

// 编辑原型
const showEditDialog = ref(false)
const editForm = ref({ name: '', description: '', categoryId: '' })
const categories = ref([])
const savingEdit = ref(false)

// 编辑版本描述
const showVersionNoteDialog = ref(false)
const editingVersion = ref(null)
const editingVersionNote = ref('')
const savingVersionNote = ref(false)

// 协作者管理
const showShareDialog = ref(false)
const shareUsername = ref('')
const shareUserOptions = ref([])
const shareLoading = ref(false)
const shareGroupId = ref(null)
const groupOptions = ref([])
const groupsLoading = ref(false)
const sharesList = ref([])
const sharesLoading = ref(false)

// 访问统计
const visitStats = ref({ total: 0, recent7: 0, recent30: 0 })

// 评论反馈
const comments = ref([])
const commentLoading = ref(false)
const commentContent = ref('')
const commentImages = ref([])
const submittingComment = ref(false)

// 独立原型 AI 修改
const directChange = ref(null)
const directChangeLoading = ref(false)
const directChangeDialogVisible = ref(false)
const directChangeEditingId = ref(null)
const directChangeResult = ref(null)
const directRequirement = ref('')
const directVersionStrategyType = ref('auto')
const directVersionStrategyValue = ref('')
const directChangeSubmitting = ref(false)
const directCountdownNow = ref(Date.now())
let directCountdownTimer = null
let directChangePollTimer = null

const canEdit = computed(() => {
  if (!prototype.value || !authStore.user) return false
  if (authStore.isAdmin || prototype.value.created_by === authStore.user.id) return true
  const sharedIds = prototype.value.shared_user_ids || []
  return sharedIds.includes(authStore.user.id)
})

const previewUrl = computed(() => {
  if (!prototype.value || !prototype.value.entry_file) return null
  const token = authStore.token || ''
  return `/preview/${prototype.value.id}/${prototype.value.entry_file}?token=${token}`
})

const directCountdownLabel = computed(() => {
  if (!directChange.value?.handoff_expires_at) return '已过期'
  const remaining = Math.max(0, new Date(directChange.value.handoff_expires_at).getTime() - directCountdownNow.value)
  if (!remaining) return '已过期，请重新生成'
  const seconds = Math.ceil(remaining / 1000)
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`
})

function goToBoundProject() {
  const binding = prototype.value?.project_binding
  if (!binding?.project_id) return

  const firstMenuPosition = binding.menu_positions?.[0]
  router.push({
    name: 'project',
    params: { id: binding.project_id },
    query: {
      prototypeId: prototype.value.id,
      ...(firstMenuPosition?.menu_path ? { menuPath: firstMenuPosition.menu_path } : {})
    }
  })
}

async function loadData() {
  loading.value = true
  try {
    const res = await getPrototype(route.params.id)
    prototype.value = res.data.data
    loadReadme()
    loadVersions()
    await loadDirectChange()
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function loadDirectChange() {
  clearDirectChangePollTimer()
  if (!prototype.value || prototype.value.project_binding || !canEdit.value) {
    directChange.value = null
    return
  }
  directChangeLoading.value = true
  try {
    const res = await getCurrentDirectChange(prototype.value.id)
    directChange.value = res.data.data || null
    scheduleDirectChangePoll()
  } catch (err) {
    if (err.response?.status !== 409) directChange.value = null
  } finally {
    directChangeLoading.value = false
  }
}

function openDirectChangeDialog(existing = null) {
  if (prototype.value?.project_binding) return
  directChangeEditingId.value = existing?.id || null
  directRequirement.value = existing?.requirement || ''
  directVersionStrategyType.value = existing?.version_strategy_type || 'auto'
  directVersionStrategyValue.value = existing?.version_strategy_value || ''
  directChangeResult.value = null
  directChangeDialogVisible.value = true
}

function returnDirectChangeEdit() {
  const result = directChangeResult.value
  directRequirement.value = result?.change?.requirement || directRequirement.value
  directVersionStrategyType.value = result?.change?.version_strategy_type || directVersionStrategyType.value
  directVersionStrategyValue.value = result?.change?.version_strategy_value || directVersionStrategyValue.value
  directChangeResult.value = null
}

async function submitDirectChange() {
  if (!directRequirement.value.trim()) {
    ElMessage.warning('请描述修改要求')
    return
  }
  if (directVersionStrategyType.value === 'custom' && !directVersionStrategyValue.value.trim()) {
    ElMessage.warning('请输入自定义版本号')
    return
  }
  directChangeSubmitting.value = true
  try {
    const payload = {
      requirement: directRequirement.value.trim(),
      versionStrategy: {
        type: directVersionStrategyType.value,
        value: directVersionStrategyType.value === 'custom' ? directVersionStrategyValue.value.trim() : null
      }
    }
    const res = directChangeEditingId.value
      ? await updateDirectChange(prototype.value.id, directChangeEditingId.value, payload)
      : await createDirectChange(prototype.value.id, payload)
    directChangeResult.value = res.data.data
    directChange.value = res.data.data.change
    ElMessage.success(directChangeEditingId.value ? '提示词已重新生成' : '修改提示词已生成')
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '生成修改提示词失败')
  } finally {
    directChangeSubmitting.value = false
  }
}

async function cancelCurrentDirectChange() {
  if (!directChange.value) return
  try {
    await ElMessageBox.confirm('确定取消这次独立修改吗？未领取的修改码将立即失效。', '取消修改', { type: 'warning' })
    await cancelDirectChange(prototype.value.id, directChange.value.id)
    directChange.value = null
    directChangeResult.value = null
    ElMessage.success('已取消修改')
  } catch (err) {
    if (err !== 'cancel') ElMessage.error(err.response?.data?.message || '取消失败')
  }
}

function copyDirectPrompt() {
  if (!directChangeResult.value?.prompt) return
  fallbackCopy(directChangeResult.value.prompt, '完整提示词已复制')
}

function clearDirectChangePollTimer() {
  if (directChangePollTimer) {
    window.clearTimeout(directChangePollTimer)
    directChangePollTimer = null
  }
}

function scheduleDirectChangePoll() {
  clearDirectChangePollTimer()
  const current = directChange.value
  const waitingForUpload = current?.status === 'editing' && current.handoff_status === 'redeemed'
  if (!current || (!waitingForUpload && current.status !== 'preview_pending')) return
  directChangePollTimer = window.setTimeout(async () => {
    directChangePollTimer = null
    if (!prototype.value) return
    try {
      const res = await getCurrentDirectChange(prototype.value.id)
      const next = res.data.data || null
      const previousStatus = directChange.value?.status
      directChange.value = next
      if (previousStatus !== 'completed' && next?.status === 'completed') {
        await loadData()
        return
      }
    } catch (err) {
      // 状态刷新是辅助能力，失败时保留当前内容，下一轮继续尝试。
    }
    scheduleDirectChangePoll()
  }, 3000)
}

async function loadReadme() {
  try {
    const res = await getReadme(route.params.id)
    if (res.data.data && res.data.data.html) {
      readmeHtml.value = res.data.data.html
    } else {
      readmeHtml.value = ''
    }
  } catch (err) {
    readmeHtml.value = ''
  }
}

async function loadVersions() {
  versionLoading.value = true
  try {
    const res = await getVersions(route.params.id)
    versions.value = res.data.data || []
    // 同步当前版本标签到原型信息
    if (versions.value.length > 0 && versions.value[0].version_label) {
      prototype.value.version_label = versions.value[0].version_label;
    }
  } catch (err) {
    versions.value = []
  } finally {
    versionLoading.value = false
  }
}

function openPreview() {
  if (previewUrl.value) {
    window.open(previewUrl.value, '_blank')
  }
}

async function handleDownload() {
  try {
    const res = await downloadPrototype(prototype.value.id)
    const blob = new Blob([res.data], { type: 'application/zip' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${prototype.value.name || prototype.value.id}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('开始下载')
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '下载失败')
  }
}

function handleHeaderCommand(command) {
  if (command === 'edit') openEditDialog()
  if (command === 'download') handleDownload()
}

async function handleEditSubmit() {
  if (!editForm.value.name.trim()) {
    ElMessage.warning('请输入原型名称')
    return
  }
  savingEdit.value = true
  try {
    const res = await updatePrototype(prototype.value.id, {
      name: editForm.value.name,
      description: editForm.value.description,
      categoryId: editForm.value.categoryId
    })
    prototype.value = { ...prototype.value, ...res.data.data }
    ElMessage.success('更新成功')
    showEditDialog.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '更新失败')
  } finally {
    savingEdit.value = false
  }
}

async function openEditDialog() {
  editForm.value = {
    name: prototype.value.name,
    description: prototype.value.description || '',
    categoryId: prototype.value.category_id || ''
  }
  try {
    const res = await getCategories()
    categories.value = res.data.data || []
  } catch (e) {
    categories.value = []
  }
  showEditDialog.value = true
}

function openVersionNoteEdit(row) {
  editingVersion.value = row
  editingVersionNote.value = row.note || ''
  showVersionNoteDialog.value = true
}

async function handleVersionNoteSubmit() {
  if (!editingVersionNote.value.trim()) {
    ElMessage.warning('请输入版本描述')
    return
  }
  savingVersionNote.value = true
  try {
    const res = await updateVersionNote(
      prototype.value.id,
      editingVersion.value.id,
      editingVersionNote.value
    )
    const updated = res.data.data
    const idx = versions.value.findIndex(v => v.id === updated.id)
    if (idx !== -1) {
      versions.value[idx] = { ...versions.value[idx], ...updated }
    }
    ElMessage.success('版本描述已更新')
    showVersionNoteDialog.value = false
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '更新失败')
  } finally {
    savingVersionNote.value = false
  }
}

function openVersionPreview(row) {
  const token = authStore.token || ''
  const url = `/preview/${prototype.value.id}/versions/v${row.version_number}/${row.entry_file || 'index.html'}?token=${token}`
  window.open(url, '_blank')
}

async function handleRollback(row) {
  try {
    await ElMessageBox.confirm(
      `确定回滚到 v${row.version_number} 吗？当前版本将自动保存为新的历史版本。`,
      '确认回滚',
      { type: 'warning' }
    )
    const res = await rollbackVersion(prototype.value.id, row.version_number)
    prototype.value = res.data.data
    ElMessage.success('回滚成功')
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '回滚失败')
    }
  }
}

async function handleDeleteVersion(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除 v${row.version_number} 吗？此操作不可恢复。`,
      '确认删除版本',
      { type: 'danger' }
    )
    await deleteVersion(prototype.value.id, row.id)
    ElMessage.success('删除成功')
    loadVersions()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

function handleVersionCommand(cmd, row) {
  if (cmd === 'rollback') {
    handleRollback(row)
  } else if (cmd === 'delete') {
    handleDeleteVersion(row)
  }
}

async function loadStats() {
  try {
    const res = await getStats(route.params.id)
    visitStats.value = res.data.data || { total: 0, recent7: 0, recent30: 0 }
  } catch (err) {
    visitStats.value = { total: 0, recent7: 0, recent30: 0 }
  }
}

async function loadComments() {
  commentLoading.value = true
  try {
    const res = await getComments(route.params.id)
    comments.value = res.data.data || []
  } catch (err) {
    comments.value = []
  } finally {
    commentLoading.value = false
  }
}

async function handleCommentSubmit() {
  if (!commentContent.value.trim() && commentImages.value.length === 0) {
    ElMessage.warning('请输入评论内容或上传图片')
    return
  }
  submittingComment.value = true
  try {
    await createComment(route.params.id, {
      content: commentContent.value.trim(),
      images: JSON.stringify(commentImages.value)
    })
    ElMessage.success('评论发表成功')
    commentContent.value = ''
    commentImages.value = []
    loadComments()
    loadStats()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '评论发表失败')
  } finally {
    submittingComment.value = false
  }
}

async function handleCommentDelete(comment) {
  try {
    await ElMessageBox.confirm('确定删除这条评论吗？', '确认删除', { type: 'warning' })
    await deleteComment(route.params.id, comment.id)
    ElMessage.success('删除成功')
    loadComments()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

async function handlePaste(e) {
  const items = e.clipboardData.files
  for (const file of items) {
    if (file.type.startsWith('image/')) {
      if (commentImages.value.length >= 9) {
        ElMessage.warning('最多上传9张图片')
        break
      }
      try {
        const res = await uploadCommentImage(route.params.id, file)
        commentImages.value.push(res.data.data)
      } catch (err) {
        ElMessage.error('图片上传失败')
      }
    }
  }
}

function removeCommentImage(index) {
  commentImages.value.splice(index, 1)
}

function openImage(url) {
  window.open(url, '_blank')
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

async function copyShareLink() {
  if (!prototype.value) return
  try {
    const res = await getPublicShareLink(prototype.value.id)
    const link = res.data.data?.url
    if (!link) {
      ElMessage.error('生成链接失败')
      return
    }
    const fullUrl = `${window.location.origin}${link}`
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl).then(() => {
        ElMessage.success('免登录查看链接已复制')
      }).catch(() => {
        fallbackCopy(fullUrl, '免登录查看链接已复制')
      })
    } else {
      fallbackCopy(fullUrl, '免登录查看链接已复制')
    }
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '生成链接失败')
  }
}

function copyId(id) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(id).then(() => {
      ElMessage.success('ID 已复制到剪贴板')
    }).catch(() => {
      fallbackCopy(id, 'ID 已复制到剪贴板')
    })
  } else {
    fallbackCopy(id, 'ID 已复制到剪贴板')
  }
}

function fallbackCopy(text, successMsg) {
  const input = document.createElement('input')
  input.value = text
  document.body.appendChild(input)
  input.select()
  document.execCommand('copy')
  document.body.removeChild(input)
  ElMessage.success(successMsg)
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// =================== 协作者管理 ===================
async function openShareDialog() {
  showShareDialog.value = true
  shareUsername.value = ''
  shareGroupId.value = null
  shareUserOptions.value = []
  loadAllShareUsers()
  loadGroups()
  sharesLoading.value = true
  try {
    const res = await getPrototypeShares(route.params.id)
    if (res.data.success) {
      sharesList.value = res.data.data || []
    }
  } catch (e) {
    console.error('加载分享列表失败:', e)
  } finally {
    sharesLoading.value = false
  }
}

async function handleShareUserSearch(keyword) {
  shareLoading.value = true
  try {
    const res = await searchUsers(keyword || '')
    if (res.data.success) {
      shareUserOptions.value = (res.data.data || []).filter(u => u.id !== authStore.user.id)
    }
  } catch (e) {
    console.error('搜索用户失败:', e)
  } finally {
    shareLoading.value = false
  }
}

// Load all users when dialog opens
async function loadAllShareUsers() {
  shareLoading.value = true
  try {
    const res = await searchUsers('')
    if (res.data.success) {
      shareUserOptions.value = (res.data.data || []).filter(u => u.id !== authStore.user.id)
    }
  } catch (e) {
    console.error('加载用户列表失败:', e)
  } finally {
    shareLoading.value = false
  }
}

async function loadGroups() {
  groupsLoading.value = true
  try {
    const res = await getGroups()
    if (res.data.success) {
      groupOptions.value = res.data.data || []
    }
  } catch (e) {
    console.error('加载用户组失败:', e)
  } finally {
    groupsLoading.value = false
  }
}

async function handleShare() {
  if (!shareUsername.value && !shareGroupId.value) {
    ElMessage.warning('请选择要添加的用户或用户组')
    return
  }
  shareLoading.value = true
  try {
    const payload = shareGroupId.value ? { groupId: shareGroupId.value } : shareUsername.value
    const res = await sharePrototype(route.params.id, payload)
    if (res.data.success) {
      ElMessage.success('添加成功')
      shareUsername.value = ''
      shareGroupId.value = null
      shareUserOptions.value = []
      const sharesRes = await getPrototypeShares(route.params.id)
      if (sharesRes.data.success) {
        sharesList.value = sharesRes.data.data || []
      }
    } else {
      ElMessage.error(res.data.message || '添加失败')
    }
  } catch (e) {
    ElMessage.error('添加失败')
  } finally {
    shareLoading.value = false
  }
}

async function handleUnshare(userId) {
  try {
    const res = await unsharePrototype(route.params.id, userId)
    if (res.data.success) {
      ElMessage.success('已移除协作者')
      sharesList.value = sharesList.value.filter(s => s.user_id !== userId)
    } else {
      ElMessage.error(res.data.message || '移除失败')
    }
  } catch (e) {
    ElMessage.error('移除失败')
  }
}

onMounted(async () => {
  directCountdownTimer = window.setInterval(() => { directCountdownNow.value = Date.now() }, 1000)
  await loadData()
  await loadStats()
  await loadComments()
  try { await recordVisit(route.params.id) } catch (e) {}
})

onBeforeUnmount(() => {
  if (directCountdownTimer) window.clearInterval(directCountdownTimer)
  clearDirectChangePollTimer()
})
</script><style scoped>
.detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px 24px;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ========================================
   顶部 Header 区域
   ======================================== */
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left :deep(.el-button) {
  color: #4a5568;
  font-size: 14px;
}

.preview-btn {
  font-weight: 600;
  padding: 8px 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(103, 194, 58, 0.3);
}

.preview-btn:hover {
  box-shadow: 0 4px 12px rgba(103, 194, 58, 0.4);
  transform: translateY(-1px);
}

.header-left h1 {
  font-size: 20px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.header-left :deep(.el-tag) {
  border-radius: 6px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-actions :deep(.el-button) {
  border-radius: 8px;
  font-weight: 500;
}

/* ========================================
   信息卡片 - 简约白色风格
   ======================================== */
.info-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 16px 24px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.info-id {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 6px;
  transition: background 0.2s;
}

.info-id:hover {
  background: #edf2f7;
}

.info-id code {
  font-size: 12px;
  color: #4a5568;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.info-tags {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #718096;
}

.info-desc {
  font-size: 14px;
  color: #4a5568;
  line-height: 1.6;
}

.info-error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  background: #fff5f5;
  border-radius: 6px;
  color: #c53030;
  font-size: 13px;
}

.project-binding-alert {
  margin-bottom: 16px;
}

.project-binding-content {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.direct-change-card {
  margin-bottom: 16px;
  padding: 18px 22px;
  border: 1px solid #dbe5f1;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .04);
}

.direct-change-head,
.direct-change-meta,
.direct-change-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.direct-change-head h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 16px;
  color: #1f2937;
}

.direct-change-head p {
  margin: 5px 0 0;
  color: #718096;
  font-size: 13px;
}

.direct-change-meta {
  justify-content: flex-start;
  margin: 14px 0;
  color: #64748b;
  font-size: 13px;
}

.direct-change-meta span {
  padding-right: 12px;
  border-right: 1px solid #e2e8f0;
}

.direct-change-meta span:last-child {
  border-right: 0;
}

.direct-candidate-preview {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.direct-candidate-preview .candidate-preview {
  width: 100%;
  min-height: 460px;
  display: block;
  border: 0;
}

.direct-change-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.direct-change-form {
  margin-top: 18px;
}

.direct-change-form .form-help {
  margin: 6px 0 0;
  color: #718096;
  font-size: 12px;
}

/* 长提示词必须在弹窗内换行滚动，不能把正文撑出对话框边界。 */
.task-prompt {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: min(52vh, 560px);
  margin: 16px 0 0;
  padding: 14px;
  overflow: auto;
  color: #e2e8f0;
  background: #172033;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* ========================================
   左右布局：Tab 侧边栏 + 内容区
   ======================================== */
.version-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.detail-content {
  display: flex;
  gap: 20px;
  min-height: 500px;
}

.tab-sidebar {
  width: 180px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  position: sticky;
  top: 80px;
  align-self: flex-start;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #4a5568;
  transition: all 0.2s ease;
  margin-bottom: 4px;
}

.tab-item:hover {
  background: #edf2f7;
  color: #2d3748;
}

.tab-item.active {
  background: #e8f0fe;
  color: #3b82f6;
  font-weight: 600;
}

.tab-item .el-icon {
  font-size: 16px;
}

.tab-content {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 24px 28px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

/* ========================================
   设计文档
   ======================================== */
.readme-container {
  line-height: 1.7;
}

.readme-content :deep(h1),
.readme-content :deep(h2),
.readme-content :deep(h3) {
  color: #1a202c;
  margin-top: 1.2em;
  margin-bottom: 0.6em;
}

.readme-content :deep(p) {
  color: #4a5568;
}

.readme-content :deep(code) {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}

.readme-content :deep(pre) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

.readme-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

/* ========================================
   版本历史
   ======================================== */
.versions-container :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

.versions-container :deep(.el-table th) {
  background: #f8fafc;
  color: #4a5568;
  font-weight: 600;
}

/* ========================================
   评论反馈
   ======================================== */
.comment-input-area {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #edf2f7;
}

.comment-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.comment-hint {
  font-size: 12px;
  color: #a0aec0;
}

.comment-image-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.comment-image-item {
  position: relative;
  width: 60px;
  height: 60px;
}

.comment-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.comment-image-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  color: #e53e3e;
  font-size: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.comment-item {
  padding: 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #edf2f7;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.comment-author {
  font-weight: 600;
  color: #2d3748;
  font-size: 14px;
}

.comment-time {
  font-size: 12px;
  color: #a0aec0;
}

.comment-body {
  font-size: 14px;
  color: #4a5568;
  line-height: 1.6;
  white-space: pre-wrap;
}

.comment-images {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

/* ========================================
   弹窗统一风格
   ======================================== */
:deep(.el-dialog) {
  border-radius: 12px;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 16px;
}

/* ========================================
   版本备注 tooltip
   ======================================== */
.note-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  font-size: 13px;
  color: #4a5568;
}

.version-note-tooltip {
  max-width: 300px !important;
}

/* ========================================
   版本操作下拉菜单
   ======================================== */
.versions-container :deep(.el-dropdown-menu__item.danger-item) {
  color: #e53e3e;
}

.versions-container :deep(.el-dropdown-menu__item.danger-item:hover) {
  background: #fff5f5;
  color: #c53030;
}

/* ========================================
   响应式
   ======================================== */
@media (max-width: 768px) {
  .detail-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .detail-content {
    flex-direction: column;
  }

  .tab-sidebar {
    width: 100%;
    position: static;
    display: flex;
    gap: 4px;
    padding: 8px;
  }

  .tab-item {
    flex: 1;
    justify-content: center;
    margin-bottom: 0;
  }
}
</style>
