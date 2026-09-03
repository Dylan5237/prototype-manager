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
              <el-button :loading="previewing" @click="previewTemplate">预览 Mock</el-button>
              <el-button type="primary" :disabled="!dirty" :loading="saving" @click="saveTemplate">保存模板</el-button>
            </div>
          </div>

          <div class="editor-body">
            <div class="editor-pane">
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
                :rows="25"
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

            <div class="preview-pane">
              <div class="section-title-row">
                <div>
                  <h3>Mock 预览</h3>
                  <p>使用平台内置示例数据渲染，不会写入真实业务数据。</p>
                </div>
              </div>
              <el-input v-model="previewText" type="textarea" :rows="25" resize="none" readonly class="preview-textarea" />
              <div class="mock-data-box">
                <div class="mock-data-title">内置 Mock 数据</div>
                <pre>{{ mockDataText }}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <el-empty v-else-if="!loading" description="选择一个提示词模板开始配置" :image-size="96" class="template-empty" />
    </div>
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
const previewText = ref('')
const loading = ref(false)
const saving = ref(false)
const previewing = ref(false)

const selectedTemplate = computed(() => templates.value.find(item => item.key === selectedKey.value) || null)
const dirty = computed(() => Boolean(selectedTemplate.value && draftTemplate.value !== selectedTemplate.value.template))
const mockDataText = computed(() => selectedTemplate.value ? JSON.stringify(selectedTemplate.value.mockData, null, 2) : '')

function formatVariable(variable) {
  return `{{${variable}}}`
}

function setSelected(item) {
  selectedKey.value = item.key
  draftTemplate.value = item.template
  previewText.value = ''
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
    const response = await requestPreview(selectedTemplate.value.key, { template: draftTemplate.value })
    previewText.value = response.data.data.prompt
  } catch (error) {
    previewText.value = ''
    ElMessage.error(error.response?.data?.message || 'Mock 预览失败，请检查模板变量')
  } finally {
    previewing.value = false
  }
}

async function saveTemplate() {
  if (!selectedTemplate.value || !dirty.value) return
  saving.value = true
  try {
    const response = await updatePromptTemplate(selectedTemplate.value.key, { template: draftTemplate.value })
    const saved = response.data.data
    const index = templates.value.findIndex(item => item.key === saved.key)
    if (index >= 0) templates.value.splice(index, 1, saved)
    draftTemplate.value = saved.template
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

onMounted(loadTemplates)
</script>

<style scoped>
.prompt-template-layout {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.template-list-panel {
  min-height: 660px;
  padding: 16px 10px;
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

.editor-panel { overflow: hidden; }
.editor-heading { justify-content: space-between; gap: 18px; padding: 20px 22px 17px; border-bottom: 1px solid #edf2f7; }
.editor-title-block { min-width: 0; }
.editor-title-line { gap: 8px; }
.editor-heading h2 { font-size: 18px; }
.editor-heading p { margin: 5px 0; color: #64748b; font-size: 13px; }
.editor-heading code { color: #94a3b8; font-size: 11px; }
.editor-actions { display: flex; flex: 0 0 auto; gap: 8px; }
.editor-actions .el-button { min-height: 34px; }

.editor-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.editor-pane,
.preview-pane { min-width: 0; padding: 20px 22px 22px; }
.preview-pane { border-left: 1px solid #edf2f7; background: #fbfcfe; }
.section-title-row { align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.section-title-row h3 { font-size: 14px; }
.section-title-row p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.5; }
.section-title-row code { color: #64748b; }
.character-count { flex: 0 0 auto; color: #94a3b8; font-size: 12px; }
.template-textarea :deep(.el-textarea__inner),
.preview-textarea :deep(.el-textarea__inner) {
  padding: 12px;
  border-color: #e2e8f0;
  border-radius: 8px;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
}
.template-textarea :deep(.el-textarea__inner) { background: #fff; }
.preview-textarea :deep(.el-textarea__inner) { background: #f8fafc; }
.variable-list { flex-wrap: wrap; gap: 6px; margin-top: 11px; }
.variable-label { margin-right: 2px; color: #64748b; font-size: 12px; }
.mock-data-box { margin-top: 12px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
.mock-data-title { margin-bottom: 6px; color: #64748b; font-size: 12px; font-weight: 650; }
.mock-data-box pre { max-height: 160px; margin: 0; overflow: auto; color: #64748b; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.template-empty { min-height: 320px; border: 1px dashed #dbe4ef; border-radius: 12px; background: #fff; }

@media (max-width: 1050px) {
  .prompt-template-layout { grid-template-columns: 220px minmax(0, 1fr); }
  .editor-heading { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 780px) {
  .prompt-template-layout,
  .editor-body { grid-template-columns: 1fr; }
  .template-list-panel { min-height: auto; }
  .preview-pane { border-top: 1px solid #edf2f7; border-left: 0; }
  .editor-actions { flex-wrap: wrap; }
}
</style>
