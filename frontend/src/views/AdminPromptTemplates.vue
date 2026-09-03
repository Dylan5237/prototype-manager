<template>
  <div class="management-page prompt-template-page">
    <ManagementPageHeader
      title="提示词模板"
      :count="templates.length"
      description="统一管理创建、修改和 MCP 接入提示词；修改后作用于后续生成。"
    >
      <el-button :loading="loading" @click="loadTemplates">刷新</el-button>
    </ManagementPageHeader>

    <div v-loading="loading" class="prompt-template-layout">
      <section class="management-panel template-list-panel">
        <div class="panel-heading">
          <div>
            <span class="panel-kicker">AI 工作流</span>
            <h2>可配置场景</h2>
          </div>
          <el-tag type="info" effect="plain" size="small">{{ templates.length }} 个</el-tag>
        </div>
        <button
          v-for="item in templates"
          :key="item.key"
          type="button"
          :class="['template-list-item', { 'is-active': item.key === selectedKey }]"
          @click="selectTemplate(item)"
        >
          <span class="template-list-item__title">{{ item.name }}</span>
          <span class="template-list-item__description">{{ item.description }}</span>
          <el-tag v-if="item.isCustomized" size="small" type="warning" effect="light">已修改</el-tag>
        </button>
        <el-empty v-if="!templates.length && !loading" description="暂无提示词模板" :image-size="72" />
      </section>

      <section v-if="selectedTemplate" class="template-editor-column">
        <div class="management-panel editor-panel">
          <div class="editor-heading">
            <div class="editor-title-block">
              <div class="editor-title-line">
                <h2>{{ selectedTemplate.name }}</h2>
                <el-tag v-if="dirty" type="warning" effect="light" size="small">未保存</el-tag>
                <el-tag v-else-if="selectedTemplate.isCustomized" type="warning" effect="plain" size="small">已修改默认值</el-tag>
              </div>
              <p>{{ selectedTemplate.description }}</p>
              <code>{{ selectedTemplate.key }}</code>
            </div>
            <div class="editor-actions">
              <el-button :disabled="!dirty" :loading="saving" @click="resetTemplate">恢复默认</el-button>
              <el-button type="primary" :disabled="!dirty" :loading="saving" @click="saveTemplate">保存模板</el-button>
            </div>
          </div>

          <el-tabs v-model="activeTab" class="editor-tabs">
            <el-tab-pane label="模板正文" name="template">
              <div class="tab-pane-content template-tab-content">
                <div class="section-title-row">
                  <div>
                    <h3>模板正文</h3>
                    <p>只允许使用下方变量，使用 <code v-pre>{{变量名}}</code> 插入动态内容。</p>
                  </div>
                  <span class="character-count">{{ draftTemplate.length }} / 60000</span>
                </div>
                <el-input
                  v-model="draftTemplate"
                  type="textarea"
                  resize="none"
                  class="template-textarea"
                  spellcheck="false"
                />
                <div class="variable-list">
                  <span class="variable-label">可用变量</span>
                  <el-tag v-for="variable in selectedTemplate.variables" :key="variable" size="small" effect="plain">
                    {{ formatVariable(variable) }}
                  </el-tag>
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="Mock 预览" name="preview">
              <div class="tab-pane-content preview-tab-content">
                <div class="section-title-row">
                  <div>
                    <h3>Mock 预览</h3>
                    <p>使用当前 Mock 数据渲染提示词，不会写入真实业务数据。</p>
                  </div>
                  <el-button size="small" :loading="previewing" @click="previewTemplate">刷新预览</el-button>
                </div>
                <el-input v-model="previewText" type="textarea" resize="none" readonly class="preview-textarea" />
                <div class="mock-data-box">
                  <div>
                    <div class="mock-data-title">当前 Mock 数据</div>
                    <p class="mock-data-summary">已配置 {{ mockDataFieldCount }} 个变量，可在弹窗中编辑 JSON 数据。</p>
                  </div>
                  <el-button size="small" @click="openMockDataDialog">配置 Mock 数据</el-button>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </section>

      <el-empty v-else-if="!loading" description="选择一个提示词模板开始配置" :image-size="96" class="template-empty" />
    </div>

    <el-dialog v-model="mockDialogVisible" title="配置 Mock 数据" width="680px" destroy-on-close class="management-dialog">
      <el-alert type="info" :closable="false" show-icon>
        <template #title>用 JSON 为模板变量提供预览值</template>
        <p>只允许配置当前模板的变量；点击“应用 Mock 数据”后先更新当前草稿，最后点击页面右上角“保存模板”才会持久化。</p>
      </el-alert>
      <el-input
        v-model="mockDialogDraftText"
        type="textarea"
        :rows="18"
        resize="none"
        class="mock-data-editor"
        spellcheck="false"
        placeholder='请输入 JSON 对象，例如：{ "requirementBlock": "示例需求" }'
      />
      <el-alert v-if="mockDataError" class="mock-data-error" type="error" :closable="false" show-icon :title="mockDataError" />
      <template #footer>
        <el-button @click="mockDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyMockData">应用 Mock 数据</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ManagementPageHeader from '../components/ManagementPageHeader.vue'
import {
  getPromptTemplates,
  previewPromptTemplate as requestPreview,
  resetPromptTemplate as requestReset,
  updatePromptTemplate
} from '../api/prompt-templates'

const templates = ref([])
const selectedKey = ref('')
const draftTemplate = ref('')
const draftMockDataText = ref('{}')
const previewText = ref('')
const activeTab = ref('template')
const loading = ref(false)
const saving = ref(false)
const previewing = ref(false)
const mockDialogVisible = ref(false)
const mockDialogDraftText = ref('{}')
const mockDataError = ref('')

const selectedTemplate = computed(() => templates.value.find(item => item.key === selectedKey.value) || null)
const mockDataFieldCount = computed(() => {
  try {
    const value = JSON.parse(draftMockDataText.value)
    return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
  } catch (error) {
    return 0
  }
})
const mockDataDirty = computed(() => Boolean(
  selectedTemplate.value && draftMockDataText.value !== JSON.stringify(selectedTemplate.value.mockData, null, 2)
))
const dirty = computed(() => Boolean(
  selectedTemplate.value && (draftTemplate.value !== selectedTemplate.value.template || mockDataDirty.value)
))

function formatVariable(variable) {
  return `{{${variable}}}`
}

function parseMockData(text = draftMockDataText.value) {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error('Mock 数据不是有效的 JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Mock 数据必须是 JSON 对象')
  }
  return value
}

function setSelected(item) {
  selectedKey.value = item.key
  draftTemplate.value = item.template
  draftMockDataText.value = JSON.stringify(item.mockData || {}, null, 2)
  previewText.value = ''
  activeTab.value = 'template'
  previewTemplate()
}

async function selectTemplate(item) {
  if (!item || item.key === selectedKey.value) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前模板有未保存修改，切换后将丢失这些修改。', '确认切换模板', {
        type: 'warning',
        confirmButtonText: '继续切换',
        cancelButtonText: '留下编辑'
      })
    } catch (error) {
      return
    }
  }
  setSelected(item)
}

async function loadTemplates() {
  loading.value = true
  try {
    const response = await getPromptTemplates()
    templates.value = response.data.data || []
    const next = templates.value.find(item => item.key === selectedKey.value) || templates.value[0]
    if (next) setSelected(next)
    else {
      selectedKey.value = ''
      draftTemplate.value = ''
      draftMockDataText.value = '{}'
      previewText.value = ''
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载提示词模板失败')
  } finally {
    loading.value = false
  }
}

async function previewTemplate() {
  if (!selectedTemplate.value) return
  previewing.value = true
  try {
    const response = await requestPreview(selectedTemplate.value.key, {
      template: draftTemplate.value,
      mockData: parseMockData()
    })
    previewText.value = response.data.data.prompt
  } catch (error) {
    previewText.value = ''
    const message = error.response?.data?.message || error.message || 'Mock 预览失败，请检查模板变量'
    ElMessage.error(message)
  } finally {
    previewing.value = false
  }
}

async function saveTemplate() {
  if (!selectedTemplate.value || !dirty.value) return
  saving.value = true
  try {
    const response = await updatePromptTemplate(selectedTemplate.value.key, {
      template: draftTemplate.value,
      mockData: parseMockData()
    })
    const saved = response.data.data
    const index = templates.value.findIndex(item => item.key === saved.key)
    if (index >= 0) templates.value.splice(index, 1, saved)
    draftTemplate.value = saved.template
    draftMockDataText.value = JSON.stringify(saved.mockData || {}, null, 2)
    ElMessage.success('提示词模板已保存，后续生成将使用新模板')
    await previewTemplate()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '保存提示词模板失败')
  } finally {
    saving.value = false
  }
}

async function resetTemplate() {
  if (!selectedTemplate.value || !dirty.value) return
  try {
    await ElMessageBox.confirm('恢复默认模板后，当前自定义正文将被覆盖。', '恢复默认模板', {
      type: 'warning',
      confirmButtonText: '恢复默认',
      cancelButtonText: '取消'
    })
    saving.value = true
    const response = await requestReset(selectedTemplate.value.key)
    const restored = response.data.data
    const index = templates.value.findIndex(item => item.key === restored.key)
    if (index >= 0) templates.value.splice(index, 1, restored)
    draftTemplate.value = restored.template
    draftMockDataText.value = JSON.stringify(restored.mockData || {}, null, 2)
    ElMessage.success('已恢复默认模板')
    await previewTemplate()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.response?.data?.message || '恢复默认模板失败')
    }
  } finally {
    saving.value = false
  }
}

function openMockDataDialog() {
  mockDataError.value = ''
  mockDialogDraftText.value = draftMockDataText.value
  mockDialogVisible.value = true
}

function applyMockData() {
  try {
    const value = parseMockData(mockDialogDraftText.value)
    draftMockDataText.value = JSON.stringify(value, null, 2)
    mockDataError.value = ''
    mockDialogVisible.value = false
    previewTemplate()
  } catch (error) {
    mockDataError.value = error.message
  }
}

onMounted(loadTemplates)
</script>

<style scoped>
.prompt-template-page {
  height: calc(100vh - 136px);
  min-height: 540px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.prompt-template-layout {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  gap: 18px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  overflow: hidden;
}

.template-list-panel {
  min-height: 0;
  height: 100%;
  padding: 16px 10px;
  overflow: auto;
}

.panel-heading,
.editor-heading,
.section-title-row,
.editor-title-line,
.variable-list {
  display: flex;
  align-items: center;
}

.panel-heading {
  justify-content: space-between;
  padding: 0 8px 12px;
  border-bottom: 1px solid #edf2f7;
}

.panel-kicker {
  display: block;
  margin-bottom: 3px;
  color: #94a3b8;
  font-size: 11px;
  letter-spacing: .08em;
}

.panel-heading h2,
.editor-heading h2,
.section-title-row h3 {
  margin: 0;
  color: #172033;
  font-weight: 700;
}

.panel-heading h2 { font-size: 15px; }

.template-list-item {
  display: block;
  width: 100%;
  padding: 13px 10px 12px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color .16s ease, color .16s ease;
}

.template-list-item:hover { background: #f8fbff; }
.template-list-item.is-active { border-radius: 8px; background: #eef6ff; }

.template-list-item__title,
.template-list-item__description {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-list-item__title { color: #334155; font-size: 14px; font-weight: 650; }
.is-active .template-list-item__title { color: #1677ff; }
.template-list-item__description { margin: 5px 0 8px; color: #94a3b8; font-size: 12px; }

.template-editor-column { min-width: 0; height: 100%; min-height: 0; }
.editor-panel { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.editor-heading { justify-content: space-between; gap: 18px; padding: 20px 22px 17px; border-bottom: 1px solid #edf2f7; }
.editor-title-block { min-width: 0; }
.editor-title-line { gap: 8px; }
.editor-heading h2 { font-size: 18px; }
.editor-heading p { margin: 5px 0; color: #64748b; font-size: 13px; }
.editor-heading code { color: #94a3b8; font-size: 11px; }
.editor-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.editor-actions .el-button { min-height: 34px; }

.editor-tabs { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.editor-tabs :deep(.el-tabs__header) { flex: 0 0 auto; margin: 0; padding: 0 22px; }
.editor-tabs :deep(.el-tabs__nav-wrap::after) { background-color: #edf2f7; }
.editor-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: hidden; }
.editor-tabs :deep(.el-tab-pane) { height: 100%; }
.tab-pane-content { display: flex; height: 100%; min-height: 0; flex-direction: column; padding: 18px 22px 22px; }
.preview-tab-content { background: #fbfcfe; }
.section-title-row { align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-title-row h3 { font-size: 14px; }
.section-title-row p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5; }
.section-title-row code { color: #64748b; }
.character-count { flex: 0 0 auto; color: #94a3b8; font-size: 12px; }
.template-textarea :deep(.el-textarea__inner),
.preview-textarea :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 0 !important;
  padding: 12px;
  border-color: #e2e8f0;
  border-radius: 8px;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
}
.template-textarea,
.preview-textarea { display: flex; flex: 1; min-height: 0; }
.template-textarea :deep(.el-textarea),
.preview-textarea :deep(.el-textarea) { height: 100%; }
.template-textarea :deep(.el-textarea__inner) { background: #fff; }
.preview-textarea :deep(.el-textarea__inner) { background: #f8fafc; }
.variable-list { flex: 0 0 auto; flex-wrap: wrap; gap: 6px; margin-top: 11px; }
.variable-label { margin-right: 2px; color: #64748b; font-size: 12px; }
.mock-data-box { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex: 0 0 auto; margin-top: 12px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
.mock-data-title { margin-bottom: 6px; color: #64748b; font-size: 12px; font-weight: 650; }
.mock-data-summary { margin: 0; color: #94a3b8; font-size: 12px; }
.mock-data-editor :deep(.el-textarea__inner) { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.6; }
.mock-data-error { margin-top: 12px; }
.template-empty { min-height: 320px; border: 1px dashed #dbe4ef; border-radius: 12px; background: #fff; }

@media (max-width: 1050px) {
  .prompt-template-layout { grid-template-columns: 220px minmax(0, 1fr); }
  .editor-heading { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 780px) {
  .prompt-template-page { height: auto; min-height: 0; overflow: visible; }
  .prompt-template-layout { display: block; overflow: visible; }
  .template-list-panel { height: auto; max-height: 300px; }
  .template-editor-column { height: 760px; margin-top: 14px; }
  .editor-actions { flex-wrap: wrap; }
}
</style>
