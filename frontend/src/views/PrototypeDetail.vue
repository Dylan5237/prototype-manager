<template>
  <div class="detail-view" v-if="prototype">
    <div class="detail-header">
      <div class="header-left">
        <el-button text @click="$router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h1>{{ prototype.name }}</h1>
        <el-tag :type="getStatusType(prototype.sync_status)" size="small">
          {{ getStatusText(prototype.sync_status) }}
        </el-tag>
      </div>
      <div class="header-actions">
        <el-button v-if="canEdit && prototype.github_url" @click="handleSync" :loading="syncing">
          <el-icon><Refresh /></el-icon>
          同步GitHub
        </el-button>
        <el-button v-if="canEdit" type="primary" @click="showUploadDialog = true">
          <el-icon><Upload /></el-icon>
          上传ZIP
        </el-button>
        <el-button v-if="previewUrl" type="success" @click="openPreview">
          <el-icon><View /></el-icon>
          预览
        </el-button>
      </div>
    </div>

    <div class="detail-meta">
      <span v-if="prototype.category_name" class="meta-item">
        <el-tag size="small">{{ prototype.category_name }}</el-tag>
      </span>
      <span class="meta-item">创建人：{{ prototype.creator_name }}</span>
      <span class="meta-item">{{ prototype.description || '暂无描述' }}</span>
    </div>

    <el-row :gutter="16" class="detail-content">
      <el-col :span="6">
        <el-card class="file-tree-card">
          <template #header>
            <span>项目文件</span>
          </template>
          <el-tree
            v-if="prototype.files && prototype.files.length > 0"
            :data="prototype.files"
            :props="{ label: 'name', children: 'children' }"
            @node-click="handleNodeClick"
            highlight-current
          />
          <el-empty v-else description="暂无文件" />
        </el-card>
      </el-col>
      <el-col :span="18">
        <el-card class="preview-card">
          <template #header>
            <div class="preview-header">
              <el-radio-group v-model="activeTab" size="small">
                <el-radio-button label="code">源码查看</el-radio-button>
                <el-radio-button label="readme">设计文档</el-radio-button>
                <el-radio-button label="versions">版本历史</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          
          <div v-if="activeTab === 'code'" class="code-container">
            <div v-if="selectedFile" class="code-block">
              <div class="code-path">{{ selectedFile.path }}</div>
              <pre><code>{{ fileContent }}</code></pre>
            </div>
            <el-empty v-else description="点击左侧文件查看源码" />
          </div>
          
          <div v-else-if="activeTab === 'readme'" class="readme-container">
            <div v-if="readmeHtml" class="readme-content" v-html="readmeHtml"></div>
            <el-empty v-else description="暂无设计文档（未找到README.md）" />
          </div>

          <div v-else class="versions-container">
            <el-table :data="versions" v-loading="versionLoading" size="small" style="width: 100%">
              <el-table-column prop="version_number" label="版本号" width="80">
                <template #default="{ row }">
                  <el-tag size="small" type="primary">v{{ row.version_number }}</el-tag>
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
              <el-table-column prop="size_kb" label="大小" width="90">
                <template #default="{ row }">
                  {{ row.size_kb }} KB
                </template>
              </el-table-column>
              <el-table-column prop="note" label="备注" show-overflow-tooltip />
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="openVersionPreview(row)">
                    <el-icon><View /></el-icon>预览
                  </el-button>
                  <el-button size="small" text type="warning" @click="handleRollback(row)">
                    <el-icon><RefreshLeft /></el-icon>回滚
                  </el-button>
                  <el-button
                    v-if="canEdit"
                    size="small"
                    text
                    type="danger"
                    @click="handleDeleteVersion(row)"
                  >
                    <el-icon><Delete /></el-icon>删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty v-if="versions.length === 0 && !versionLoading" description="暂无历史版本" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 上传弹窗 -->
    <el-dialog v-model="showUploadDialog" title="上传ZIP包" width="500px">
      <el-upload
        drag
        action="#"
        :auto-upload="false"
        :on-change="handleFileChange"
        :limit="1"
        accept=".zip"
        ref="uploadRef"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">拖拽文件到此处或 <em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">只支持zip格式，最大100MB。上传前当前版本将自动保存为历史版本。</div>
        </template>
      </el-upload>
      <el-form-item label="版本备注" style="margin-top: 16px;">
        <el-input v-model="versionNote" placeholder="描述本次变更内容（可选）" />
      </el-form-item>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" @click="handleUpload" :loading="uploading">上传</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import {
  getPrototype, syncGitHub, uploadZip, getFileContent, getReadme,
  getVersions, rollbackVersion, deleteVersion
} from '../api/prototypes'

const route = useRoute()
const authStore = useAuthStore()
const prototype = ref(null)
const loading = ref(false)
const syncing = ref(false)
const showUploadDialog = ref(false)
const uploading = ref(false)
const uploadRef = ref(null)
const uploadFile = ref(null)
const activeTab = ref('code')
const selectedFile = ref(null)
const fileContent = ref('')
const readmeHtml = ref('')

// 版本管理
const versions = ref([])
const versionLoading = ref(false)
const versionNote = ref('')

const canEdit = computed(() => {
  if (!prototype.value || !authStore.user) return false
  return authStore.isAdmin || prototype.value.created_by === authStore.user.id
})

const previewUrl = computed(() => {
  if (!prototype.value || !prototype.value.entry_file) return null
  return `/preview/${prototype.value.id}/${prototype.value.entry_file}`
})

async function loadData() {
  loading.value = true
  try {
    const res = await getPrototype(route.params.id)
    prototype.value = res.data.data
    loadReadme()
    loadVersions()
  } catch (err) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
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

async function handleSync() {
  try {
    const { value } = await ElMessageBox.prompt(
      '同步前当前版本将自动保存为历史版本。如需添加备注，请在下方输入（可选）：',
      '同步GitHub',
      {
        confirmButtonText: '确认同步',
        cancelButtonText: '取消',
        inputPlaceholder: '版本备注（可选）',
        inputValue: ''
      }
    )
    syncing.value = true
    const res = await syncGitHub(prototype.value.id, value)
    prototype.value = res.data.data
    ElMessage.success('同步成功')
    loadData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '同步失败')
    }
  } finally {
    syncing.value = false
  }
}

function handleFileChange(file) {
  uploadFile.value = file.raw
}

async function handleUpload() {
  if (!uploadFile.value) {
    ElMessage.warning('请选择文件')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', uploadFile.value)
    formData.append('versionNote', versionNote.value)
    const res = await uploadZip(prototype.value.id, uploadFile.value, versionNote.value)
    prototype.value = res.data.data
    ElMessage.success('上传成功')
    showUploadDialog.value = false
    uploadRef.value?.clearFiles()
    uploadFile.value = null
    versionNote.value = ''
    loadData()
  } catch (err) {
    ElMessage.error(err.response?.data?.message || '上传失败')
  } finally {
    uploading.value = false
  }
}

async function handleNodeClick(data) {
  if (data.type === 'directory') return
  selectedFile.value = data
  activeTab.value = 'code'
  try {
    const res = await getFileContent(prototype.value.id, data.path)
    fileContent.value = res.data.data.content
  } catch (err) {
    fileContent.value = '无法读取文件内容'
  }
}

function openVersionPreview(row) {
  const url = `/preview/${prototype.value.id}/versions/v${row.version_number}/${row.entry_file || 'index.html'}`
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

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

onMounted(loadData)
</script>

<style scoped>
.detail-view {
  height: calc(100vh - 100px);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h1 {
  font-size: 20px;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #606266;
}

.meta-item {
  display: flex;
  align-items: center;
}

.detail-content {
  height: calc(100% - 100px);
}

.file-tree-card,
.preview-card {
  height: 100%;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.code-container,
.readme-container {
  height: calc(100vh - 240px);
  overflow: auto;
}

.code-block {
  background: #f5f7fa;
  border-radius: 4px;
  padding: 16px;
}

.code-path {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e4e7ed;
}

.code-block pre {
  margin: 0;
  overflow: auto;
}

.code-block code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.readme-content {
  padding: 8px;
  line-height: 1.8;
  color: #303133;
}

.readme-content h1,
.readme-content h2,
.readme-content h3,
.readme-content h4 {
  margin-top: 16px;
  margin-bottom: 8px;
  color: #303133;
}

.readme-content p {
  margin-bottom: 12px;
}

.readme-content code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.readme-content pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  overflow: auto;
}

.readme-content blockquote {
  border-left: 4px solid #409eff;
  padding-left: 12px;
  margin-left: 0;
  color: #606266;
}

.readme-content ul,
.readme-content ol {
  padding-left: 24px;
  margin-bottom: 12px;
}

.readme-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
}

.readme-content th,
.readme-content td {
  border: 1px solid #e4e7ed;
  padding: 8px 12px;
  text-align: left;
}

.readme-content th {
  background: #f5f7fa;
}

.versions-container {
  height: calc(100vh - 240px);
  overflow: auto;
}
</style>
