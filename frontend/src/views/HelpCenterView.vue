<template>
  <div class="help-center-page">
    <header class="help-center-header">
      <div>
        <div class="help-eyebrow"><el-icon><QuestionFilled /></el-icon>帮助中心</div>
        <div class="help-title-row">
          <h1>{{ manageMode ? '手册维护' : '使用手册' }}</h1>
          <el-tag v-if="manageMode" type="warning" effect="light" size="small">管理员</el-tag>
        </div>
        <p>{{ manageMode ? '维护已发布的使用手册，先保存草稿和预览，确认后再发布。' : '从接入 AI 工具开始，快速完成原型创建、修改、发布和分享。' }}</p>
      </div>
      <div class="help-header-actions">
        <el-input v-model="searchText" clearable :prefix-icon="Search" placeholder="搜索手册" class="help-search" />
        <el-button v-if="manageMode" @click="goReader">返回阅读</el-button>
        <el-button v-else-if="authStore.isAdmin" type="primary" plain @click="goManager">维护手册</el-button>
        <el-button :loading="loading" @click="loadDocuments">刷新</el-button>
      </div>
    </header>

    <div v-loading="loading" class="help-workspace">
      <aside class="help-panel help-catalog-panel">
        <div class="help-panel-heading">
          <div>
            <span class="help-panel-kicker">目录</span>
            <h2>{{ filteredDocuments.length }} 篇手册</h2>
          </div>
          <el-icon class="help-catalog-icon"><Menu /></el-icon>
        </div>
        <div class="help-catalog-list">
          <button
            v-for="document in filteredDocuments"
            :key="document.slug"
            type="button"
            :class="['help-catalog-item', { 'is-active': document.slug === selectedSlug }]"
            @click="selectDocument(document)"
          >
            <span class="help-catalog-item__title">{{ document.title }}</span>
            <span class="help-catalog-item__summary">{{ document.summary }}</span>
            <span v-if="manageMode" class="help-catalog-item__meta">
              <el-tag :type="statusType(document.status)" effect="light" size="small">{{ statusLabel(document.status) }}</el-tag>
              <span>v{{ document.version }}</span>
            </span>
          </button>
          <el-empty v-if="!filteredDocuments.length && !loading" description="没有匹配的手册" :image-size="64" />
        </div>
      </aside>

      <main v-if="selectedDocument" class="help-panel help-main-panel">
        <template v-if="!manageMode">
          <article class="help-reader" aria-labelledby="help-document-title">
            <div class="help-reader-meta">
              <span>伏羲平台使用手册</span>
              <span>v{{ selectedDocument.version }}</span>
              <span>更新于 {{ formatDate(selectedDocument.updatedAt) }}</span>
            </div>
            <h2 id="help-document-title">{{ selectedDocument.title }}</h2>
            <p class="help-reader-summary">{{ selectedDocument.summary }}</p>
            <div class="help-article" v-html="selectedDocument.contentHtml"></div>
          </article>
        </template>
        <template v-else>
          <div class="help-editor">
            <div class="help-editor-heading">
              <div>
                <span class="help-panel-kicker">编辑草稿</span>
                <h2>{{ selectedDocument.title }}</h2>
              </div>
              <el-tag :type="statusType(selectedDocument.status)" effect="light">{{ statusLabel(selectedDocument.status) }}</el-tag>
            </div>
            <el-form label-position="top" class="help-editor-form">
              <div class="help-editor-fields">
                <el-form-item label="手册标题"><el-input v-model="draft.title" maxlength="120" show-word-limit /></el-form-item>
                <el-form-item label="版本"><el-input v-model="draft.version" maxlength="40" /></el-form-item>
              </div>
              <el-form-item label="摘要"><el-input v-model="draft.summary" maxlength="240" show-word-limit /></el-form-item>
              <el-form-item label="正文（支持 Markdown）" class="help-content-form-item">
                <el-input v-model="draft.contentMarkdown" type="textarea" resize="none" class="help-editor-textarea" spellcheck="false" />
              </el-form-item>
            </el-form>
          </div>
        </template>
      </main>
      <el-empty v-else-if="!loading" description="暂无可用手册" :image-size="96" class="help-empty" />

      <aside v-if="selectedDocument" class="help-panel help-context-panel">
        <template v-if="!manageMode">
          <div class="help-context-card help-context-card--accent">
            <div class="help-context-icon"><el-icon><Promotion /></el-icon></div>
            <span class="help-panel-kicker">AI 助手</span>
            <h2>让 AI 帮你完成</h2>
            <p>本期先通过帮助中心阅读最新手册。后续接入 MCP 帮助工具后，AI 可按手册标识读取已发布内容。</p>
            <div class="help-reserved-row"><el-icon><Lock /></el-icon> MCP 动态读取：预留</div>
          </div>
          <div class="help-context-card">
            <span class="help-panel-kicker">阅读建议</span>
            <h3>推荐顺序</h3>
            <ol class="help-reading-order">
              <li>先完成一次 MCP 接入</li>
              <li>再创建一个最小原型</li>
              <li>最后学习版本和分享</li>
            </ol>
          </div>
        </template>
        <template v-else>
          <div class="help-context-card help-context-card--accent">
            <div class="help-context-icon"><el-icon><View /></el-icon></div>
            <span class="help-panel-kicker">实时预览</span>
            <h2>发布前确认</h2>
            <p>预览只使用当前草稿，不会写入公开版本。确认标题、步骤和链接无误后再发布。</p>
            <div class="help-status-line">
              <span>当前状态</span>
              <el-tag :type="statusType(selectedDocument.status)" effect="light" size="small">{{ statusLabel(selectedDocument.status) }}</el-tag>
            </div>
            <div v-if="dirty" class="help-dirty-tip"><el-icon><WarningFilled /></el-icon>有未保存修改</div>
          </div>
          <div class="help-preview-card">
            <div class="help-preview-toolbar">
              <span>预览内容</span>
              <el-button size="small" :loading="previewing" @click="refreshPreview">刷新</el-button>
            </div>
            <div class="help-preview-scroll">
              <h3>{{ previewTitle }}</h3>
              <p class="help-preview-summary">{{ previewSummary }}</p>
              <div class="help-article help-article--preview" v-html="previewHtml"></div>
            </div>
          </div>
          <div class="help-extension-note">
            <el-icon><Connection /></el-icon>
            <span>稳定扩展点：slug / version 将供后续提示词快照和 MCP 帮助工具引用。</span>
          </div>
        </template>
      </aside>
    </div>

    <footer v-if="manageMode && selectedDocument" class="help-editor-footer">
      <span class="help-footer-hint">{{ dirty ? '修改尚未保存' : '草稿与当前内容一致' }}</span>
      <div>
        <el-button :disabled="!dirty" :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button type="primary" :loading="saving || publishing" @click="publishDocument">发布手册</el-button>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Lock, Menu, Promotion, QuestionFilled, Search, View, WarningFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import {
  getHelpDocuments,
  previewHelpDocument as requestPreview,
  publishHelpDocument as requestPublish,
  updateHelpDocument
} from '../api/help-documents'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const documents = ref([])
const selectedSlug = ref('')
const searchText = ref('')
const previewHtml = ref('')
const previewTitle = ref('')
const previewSummary = ref('')
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const previewing = ref(false)
const draft = reactive({ title: '', summary: '', contentMarkdown: '', version: '', sortOrder: 0 })

const manageMode = computed(() => route.path === '/admin/help')
const selectedDocument = computed(() => documents.value.find(document => document.slug === selectedSlug.value) || null)
const filteredDocuments = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  if (!keyword) return documents.value
  return documents.value.filter(document => [document.title, document.summary, document.slug].some(value => String(value || '').toLowerCase().includes(keyword)))
})
const dirty = computed(() => {
  if (!selectedDocument.value || !manageMode.value) return false
  return ['title', 'summary', 'contentMarkdown', 'version', 'sortOrder'].some(field => String(draft[field] ?? '') !== String(selectedDocument.value[field] ?? ''))
})

function statusLabel(status) { return ({ draft: '草稿', published: '已发布', archived: '已归档' }[status] || status) }
function statusType(status) { return ({ draft: 'warning', published: 'success', archived: 'info' }[status] || 'info') }
function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN')
}

function syncDraft(document) {
  draft.title = document.title || ''
  draft.summary = document.summary || ''
  draft.contentMarkdown = document.contentMarkdown || ''
  draft.version = document.version || ''
  draft.sortOrder = document.sortOrder || 0
  previewHtml.value = document.contentHtml || ''
  previewTitle.value = document.title || ''
  previewSummary.value = document.summary || ''
}

function selectDocument(document) {
  if (!document || document.slug === selectedSlug.value) return
  if (manageMode.value && dirty.value) {
    ElMessageBox.confirm('当前手册有未保存修改，切换后将丢失这些修改。', '确认切换手册', {
      confirmButtonText: '继续切换', cancelButtonText: '留下编辑', type: 'warning'
    }).then(() => {
      selectedSlug.value = document.slug
      syncDraft(document)
    }).catch(() => {})
    return
  }
  selectedSlug.value = document.slug
  syncDraft(document)
}

async function loadDocuments() {
  loading.value = true
  try {
    const response = await getHelpDocuments({ includeDrafts: manageMode.value ? 'true' : undefined })
    documents.value = response.data.data || []
    const querySlug = String(route.query.slug || '')
    const next = documents.value.find(document => document.slug === querySlug)
      || documents.value.find(document => document.slug === selectedSlug.value)
      || documents.value[0]
    if (next) {
      selectedSlug.value = next.slug
      syncDraft(next)
    } else {
      selectedSlug.value = ''
      previewHtml.value = ''
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载帮助文档失败')
  } finally {
    loading.value = false
  }
}

async function refreshPreview() {
  if (!selectedDocument.value || !manageMode.value) return
  previewing.value = true
  try {
    const response = await requestPreview(selectedDocument.value.slug, { ...draft })
    const data = response.data.data
    previewHtml.value = data.contentHtml || ''
    previewTitle.value = data.title || ''
    previewSummary.value = data.summary || ''
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '预览帮助文档失败')
  } finally {
    previewing.value = false
  }
}

async function saveDraft({ quiet = false } = {}) {
  if (!selectedDocument.value || !manageMode.value || !dirty.value) return true
  saving.value = true
  try {
    const response = await updateHelpDocument(selectedDocument.value.slug, { ...draft })
    const saved = response.data.data
    const index = documents.value.findIndex(document => document.slug === saved.slug)
    if (index >= 0) documents.value.splice(index, 1, saved)
    syncDraft(saved)
    if (!quiet) ElMessage.success('手册草稿已保存')
    return true
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '保存手册失败')
    return false
  } finally {
    saving.value = false
  }
}

async function publishDocument() {
  if (!selectedDocument.value || !manageMode.value) return
  try {
    await ElMessageBox.confirm('发布后所有登录用户都能看到这份手册，确认继续？', '发布手册', {
      confirmButtonText: '发布', cancelButtonText: '取消', type: 'info'
    })
  } catch (error) {
    return
  }
  publishing.value = true
  try {
    if (!(await saveDraft({ quiet: true }))) return
    const response = await requestPublish(selectedDocument.value.slug)
    const published = response.data.data
    const index = documents.value.findIndex(document => document.slug === published.slug)
    if (index >= 0) documents.value.splice(index, 1, published)
    syncDraft(published)
    ElMessage.success(`已发布「${published.title}」`)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '发布手册失败')
  } finally {
    publishing.value = false
  }
}

function goReader() { router.push({ path: '/help', query: { slug: selectedSlug.value } }) }
function goManager() { router.push({ path: '/admin/help', query: { slug: selectedSlug.value } }) }

watch(() => route.query.slug, slug => {
  if (!slug) return
  const next = documents.value.find(document => document.slug === String(slug))
  if (next && next.slug !== selectedSlug.value) {
    selectedSlug.value = next.slug
    syncDraft(next)
  }
})

onMounted(loadDocuments)
</script>

<style scoped>
.help-center-page {
  width: min(1480px, 100%);
  height: calc(100vh - 110px);
  min-height: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
:global(.admin-content .help-center-page) { height: calc(100vh - 145px); }

.help-center-header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; flex-shrink:0; }
.help-eyebrow { display:flex; align-items:center; gap:7px; color:#718096; font-size:13px; font-weight:600; margin-bottom:5px; }
.help-eyebrow .el-icon { color:#4facfe; }
.help-title-row { display:flex; align-items:center; gap:10px; }
.help-title-row h1 { color:#1a202c; font-size:28px; line-height:1.2; letter-spacing:-.4px; }
.help-center-header p { margin-top:8px; color:#718096; font-size:14px; }
.help-header-actions { display:flex; align-items:center; gap:10px; }
.help-search { width:230px; }

.help-workspace { flex:1; min-height:0; display:grid; grid-template-columns:240px minmax(0,1fr) 286px; gap:16px; }
.help-panel { min-height:0; overflow:hidden; background:rgba(255,255,255,.84); border:1px solid rgba(222,230,240,.9); border-radius:14px; box-shadow:0 8px 28px rgba(51,65,85,.045); }
.help-catalog-panel { display:flex; flex-direction:column; }
.help-panel-heading { display:flex; justify-content:space-between; align-items:flex-start; padding:20px 18px 15px; border-bottom:1px solid #edf1f6; }
.help-panel-kicker { display:block; color:#9aa8ba; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; }
.help-panel-heading h2 { margin-top:4px; color:#1f2937; font-size:17px; }
.help-catalog-icon { color:#9aa8ba; font-size:19px; }
.help-catalog-list { flex:1; min-height:0; overflow:auto; padding:8px; }
.help-catalog-item { display:block; width:100%; padding:14px 11px; text-align:left; background:transparent; border:0; border-radius:10px; cursor:pointer; color:inherit; transition:background .16s ease, transform .16s ease; }
.help-catalog-item:hover { background:#f4f7fb; }
.help-catalog-item.is-active { background:#edf5ff; box-shadow:inset 3px 0 #4facfe; }
.help-catalog-item__title { display:block; color:#27364a; font-size:13px; font-weight:700; line-height:1.4; }
.help-catalog-item.is-active .help-catalog-item__title { color:#2878d8; }
.help-catalog-item__summary { display:-webkit-box; margin-top:5px; overflow:hidden; color:#8b99aa; font-size:12px; line-height:1.5; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.help-catalog-item__meta { display:flex; align-items:center; gap:7px; margin-top:8px; color:#9aa8ba; font-size:11px; }

.help-main-panel { overflow:auto; }
.help-reader { max-width:780px; margin:0 auto; padding:34px 46px 46px; }
.help-reader-meta { display:flex; flex-wrap:wrap; gap:12px; color:#9aa8ba; font-size:12px; }
.help-reader-meta span + span { position:relative; padding-left:12px; }
.help-reader-meta span + span::before { position:absolute; left:0; top:4px; width:3px; height:3px; content:''; border-radius:50%; background:#c4cfdd; }
.help-reader h2 { margin-top:16px; color:#1f2937; font-size:27px; letter-spacing:-.3px; }
.help-reader-summary { margin-top:9px; color:#718096; font-size:14px; line-height:1.7; }
.help-article { margin-top:28px; color:#445267; font-size:14px; line-height:1.85; }
.help-article :deep(h2) { margin:28px 0 9px; color:#27364a; font-size:17px; line-height:1.35; }
.help-article :deep(h2:first-child) { margin-top:0; }
.help-article :deep(p) { margin:8px 0; }
.help-article :deep(ol), .help-article :deep(ul) { margin:9px 0 15px; padding-left:24px; }
.help-article :deep(li) { margin:5px 0; padding-left:3px; }
.help-article :deep(code) { padding:2px 5px; border-radius:4px; background:#f1f5f9; color:#365c85; font-size:12px; }
.help-article :deep(strong) { color:#27364a; }
.help-article :deep(a) { color:#2878d8; }

.help-context-panel { display:flex; flex-direction:column; gap:12px; overflow:auto; padding:12px; background:rgba(249,251,254,.9); }
.help-context-card, .help-preview-card { padding:18px; border:1px solid #e7edf5; border-radius:11px; background:rgba(255,255,255,.86); }
.help-context-card--accent { background:linear-gradient(145deg, #f0f7ff, #fff); border-color:#d9eaff; }
.help-context-icon { display:grid; width:34px; height:34px; margin-bottom:14px; place-items:center; border-radius:10px; background:#e5f2ff; color:#3087e8; font-size:18px; }
.help-context-card h2 { margin-top:6px; color:#27364a; font-size:17px; }
.help-context-card h3 { margin-top:6px; color:#27364a; font-size:15px; }
.help-context-card p { margin-top:9px; color:#718096; font-size:12px; line-height:1.7; }
.help-reserved-row, .help-dirty-tip { display:flex; align-items:center; gap:6px; margin-top:14px; color:#6f87a2; font-size:12px; }
.help-reading-order { margin:12px 0 0; padding-left:20px; color:#718096; font-size:12px; line-height:2; }
.help-status-line { display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding-top:13px; border-top:1px solid #e8eef6; color:#718096; font-size:12px; }
.help-preview-card { flex:1; min-height:280px; display:flex; flex-direction:column; padding:14px; }
.help-preview-toolbar { display:flex; align-items:center; justify-content:space-between; color:#445267; font-size:13px; font-weight:700; }
.help-preview-scroll { min-height:0; overflow:auto; margin-top:14px; padding:3px 5px; }
.help-preview-scroll h3 { color:#27364a; font-size:16px; line-height:1.4; }
.help-preview-summary { margin-top:5px; color:#8b99aa; font-size:12px; line-height:1.5; }
.help-article--preview { margin-top:16px; font-size:12px; line-height:1.7; }
.help-article--preview :deep(h2) { margin:20px 0 6px; font-size:14px; }
.help-extension-note { display:flex; align-items:flex-start; gap:8px; padding:4px 5px 6px; color:#8b99aa; font-size:11px; line-height:1.6; }
.help-extension-note .el-icon { flex-shrink:0; margin-top:2px; color:#86a9ce; }

.help-editor { height:100%; display:flex; flex-direction:column; padding:25px 30px 22px; }
.help-editor-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:18px; border-bottom:1px solid #edf1f6; }
.help-editor-heading h2 { margin-top:5px; color:#27364a; font-size:20px; }
.help-editor-form { flex:1; min-height:0; display:flex; flex-direction:column; padding-top:18px; }
.help-editor-fields { display:grid; grid-template-columns:minmax(0,1fr) 150px; gap:14px; }
.help-editor-form :deep(.el-form-item) { margin-bottom:13px; }
.help-content-form-item { flex:1; min-height:0; }
.help-content-form-item :deep(.el-form-item__content) { min-height:0; height:100%; }
.help-editor-textarea { height:100%; }
.help-editor-textarea :deep(.el-textarea__inner) { height:100%; min-height:280px !important; padding:13px 14px; color:#445267; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; font-size:13px; line-height:1.7; }
.help-empty { height:100%; }
.help-editor-footer { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; padding:12px 15px; border:1px solid #dfe8f3; border-radius:11px; background:rgba(255,255,255,.8); }
.help-footer-hint { color:#9aa8ba; font-size:12px; }

@media (max-width: 1100px) {
  .help-workspace { grid-template-columns:220px minmax(0,1fr); }
  .help-context-panel { display:none; }
}
@media (max-width: 760px) {
  .help-center-page { height:auto; min-height:calc(100vh - 90px); }
  .help-center-header { display:block; }
  .help-header-actions { margin-top:15px; flex-wrap:wrap; }
  .help-search { width:100%; }
  .help-workspace { min-height:720px; grid-template-columns:1fr; }
  .help-catalog-panel { max-height:250px; }
  .help-reader { padding:25px 22px 35px; }
  .help-editor { min-height:700px; padding:22px 18px; }
  .help-editor-fields { grid-template-columns:1fr; gap:0; }
  .help-editor-footer { margin-top:2px; }
}
</style>
