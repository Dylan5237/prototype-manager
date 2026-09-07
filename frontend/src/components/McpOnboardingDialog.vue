<template>
  <el-dialog v-model="visible" title="接入平台MCP" width="720px" @closed="resetPrompt">
    <div class="mcp-dialog-body">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="复制下面的提示词发给你的 AI 助手，它会自动完成 MCP 接入和连通验证。"
      />
      <el-alert
        v-if="prompt"
        type="success"
        :closable="false"
        show-icon
        :title="`标准接入会话至 ${bootstrapSessionExpiresLocal} 有效。请尽快复制提示词给 AI 助手完成首次接入。`"
      />
      <el-alert
        v-else
        type="warning"
        :closable="false"
        show-icon
        title="完整接入包暂不可用，请确认平台已配置 Skill 分发目录后重试。"
      />
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="14"
        readonly
        class="mcp-prompt"
      />
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="loading" :disabled="!prompt" @click="copyPrompt">
        <el-icon><DocumentCopy /></el-icon>复制提示词
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import { DocumentCopy } from '@element-plus/icons-vue'
import { getAgentBootstrap } from '../api/auth'
import { copyText as copyClipboardText } from '../utils/clipboard'

const visible = ref(false)
const loading = ref(false)
const prompt = ref('')
const bootstrapSessionExpiresAt = ref('')

const bootstrapSessionExpiresLocal = computed(() => formatExpiresAt(bootstrapSessionExpiresAt.value))

function formatExpiresAt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function resetPrompt() {
  prompt.value = ''
  bootstrapSessionExpiresAt.value = ''
}

async function loadPrompt() {
  loading.value = true
  try {
    const res = await getAgentBootstrap()
    prompt.value = res.data.data.prompt
    bootstrapSessionExpiresAt.value = res.data.data.bootstrapSession?.expiresAt || ''
  } catch (error) {
    resetPrompt()
    ElMessage.error(error.response?.data?.message || '生成 Skill + MCP 接入提示词失败')
  } finally {
    loading.value = false
  }
}

async function openDialog() {
  visible.value = true
  await loadPrompt()
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

.mcp-prompt :deep(textarea) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  line-height: 1.55;
}
</style>
