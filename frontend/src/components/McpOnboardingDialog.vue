<template>
  <el-dialog v-model="visible" title="接入平台 MCP" width="760px" @closed="resetDialog">
    <div class="mcp-dialog-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="先选择当前正在使用的 AI 工具，平台会生成绑定该 Host 的接入提示词。"
      />

      <section class="host-section" aria-labelledby="mcp-host-title">
        <div class="section-heading">
          <div>
            <h3 id="mcp-host-title">选择 AI 工具</h3>
            <p>由你的选择决定安装路径；平台不会扫描本机自动判断。</p>
          </div>
          <el-tag v-if="selectedHostOption?.recommended" type="primary" effect="light">推荐</el-tag>
        </div>

        <div v-loading="hostsLoading" class="host-grid" role="radiogroup" aria-label="AI 工具">
          <button
            v-for="host in hostOptions"
            :key="host.id"
            type="button"
            class="host-card"
            :class="{ selected: selectedHost === host.id }"
            role="radio"
            :aria-checked="selectedHost === host.id"
            @click="selectHost(host.id)"
          >
            <span class="host-name">
              {{ host.label }}
              <el-tag v-if="host.recommended" size="small" type="primary">推荐</el-tag>
            </span>
            <span class="host-description">{{ host.description }}</span>
          </button>
        </div>
      </section>

      <el-alert
        v-if="selectedHostOption && selectedHostOption.mode !== 'install' && !prompt"
        :type="selectedHostOption.mode === 'discovery' ? 'warning' : 'info'"
        :closable="false"
        show-icon
        :title="selectedHostOption.description"
      />

      <template v-if="prompt">
        <el-alert
          v-if="responseMode === 'install'"
          type="success"
          :closable="false"
          show-icon
          :title="`已生成 ${selectedHostOption?.label || ''} 专用入口，有效至 ${bootstrapSessionExpiresLocal}。`"
        />
        <el-alert
          v-else
          type="warning"
          :closable="false"
          show-icon
          title="当前不会执行自动安装；复制说明给 AI 后，它应只报告兼容性或安全停止。"
        />
        <el-input
          v-model="prompt"
          type="textarea"
          :rows="12"
          readonly
          class="mcp-prompt"
        />
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        v-if="!prompt"
        type="primary"
        :loading="loading"
        :disabled="!selectedHost"
        @click="loadPrompt"
      >
        生成接入提示词
      </el-button>
      <el-button v-else type="primary" :loading="loading" @click="copyPrompt">
        <el-icon><DocumentCopy /></el-icon>复制提示词
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { DocumentCopy } from '@element-plus/icons-vue'
import { getAgentBootstrap, getOnboardingHosts } from '../api/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'

const visible = ref(false)
const loading = ref(false)
const hostsLoading = ref(false)
const hostOptions = ref([])
const selectedHost = ref('')
const prompt = ref('')
const responseMode = ref('')
const bootstrapSessionExpiresAt = ref('')

const selectedHostOption = computed(() => hostOptions.value.find(host => host.id === selectedHost.value) || null)
const bootstrapSessionExpiresLocal = computed(() => formatExpiresAt(bootstrapSessionExpiresAt.value))

function formatExpiresAt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function resetGeneratedPrompt() {
  prompt.value = ''
  responseMode.value = ''
  bootstrapSessionExpiresAt.value = ''
}

function resetDialog() {
  resetGeneratedPrompt()
  selectedHost.value = ''
}

function selectHost(hostId) {
  if (selectedHost.value === hostId) return
  selectedHost.value = hostId
  resetGeneratedPrompt()
}

async function loadHosts() {
  hostsLoading.value = true
  try {
    const res = await getOnboardingHosts()
    hostOptions.value = Array.isArray(res.data.data) ? res.data.data : []
  } catch (error) {
    hostOptions.value = []
    ElMessage.error(error.response?.data?.message || '加载 AI 工具列表失败')
  } finally {
    hostsLoading.value = false
  }
}

async function loadPrompt() {
  if (!selectedHost.value) return
  loading.value = true
  resetGeneratedPrompt()
  try {
    const res = await getAgentBootstrap(selectedHost.value)
    const data = res.data.data
    prompt.value = data.prompt || ''
    responseMode.value = data.mode || ''
    bootstrapSessionExpiresAt.value = data.bootstrapSession?.expiresAt || ''
  } catch (error) {
    resetGeneratedPrompt()
    ElMessage.error(error.response?.data?.message || '生成 MCP 接入提示词失败')
  } finally {
    loading.value = false
  }
}

async function openDialog() {
  resetDialog()
  visible.value = true
  await loadHosts()
}

function copyPrompt() {
  copyClipboardText(prompt.value)
    .then(() => ElMessage.success('MCP 接入提示词已复制'))
    .catch(() => ElMessage.warning('复制失败，请手工选择提示词'))
}

onMounted(() => window.addEventListener('fuxi:open-mcp', openDialog))
onBeforeUnmount(() => window.removeEventListener('fuxi:open-mcp', openDialog))
</script>

<style scoped>
.mcp-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.host-section {
  padding: 2px 0;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-heading h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 15px;
}

.section-heading p {
  margin: 5px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.host-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-height: 84px;
}

.host-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 84px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s;
}

.host-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.host-card.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}

.host-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.host-description {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.mcp-prompt :deep(textarea) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  line-height: 1.55;
}

@media (max-width: 680px) {
  .host-grid {
    grid-template-columns: 1fr;
  }
}
</style>
