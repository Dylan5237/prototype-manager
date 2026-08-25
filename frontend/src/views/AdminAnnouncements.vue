<template>
  <div class="management-page admin-announcements">
    <ManagementPageHeader title="平台更新公告" :count="announcements.length" description="发布平台能力、维护窗口和使用影响说明；不用于执行 MCP/Skill 更新。">
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新建公告</el-button>
    </ManagementPageHeader>

    <div class="management-panel">
      <el-table class="management-table" :data="announcements" v-loading="loading" table-layout="fixed">
        <el-table-column prop="title" label="标题" min-width="360" align="left" header-align="left">
          <template #default="{ row }">
            <div class="title-cell management-primary-cell"><strong>{{ row.title || '—' }}</strong><span>{{ row.summary || '—' }}</span></div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120" align="left" header-align="left">
          <template #default="{ row }"><el-tag effect="plain">{{ typeLabel(row.type) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="120" align="left" header-align="left">
          <template #default="{ row }"><span>{{ row.version || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120" align="left" header-align="left">
          <template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="自动提示" width="120" align="left" header-align="left">
          <template #default="{ row }"><el-tag :type="row.auto_popup ? 'success' : 'info'" effect="plain">{{ row.auto_popup ? '自动弹出' : '仅公告中心' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="published_at" label="发布时间" width="210" align="left" header-align="left">
          <template #default="{ row }"><span class="management-time">{{ formatDate(row.published_at || row.updated_at) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" header-align="center">
          <template #default="{ row }">
            <div class="management-table-actions management-table-actions--center">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="row.status === 'draft'" size="small" type="primary" plain @click="publish(row)">发布</el-button>
              <el-button v-else-if="row.status === 'published'" size="small" type="warning" plain @click="archive(row)">归档</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无平台更新公告" :image-size="72">
            <template #description><span>暂无平台更新公告</span><small class="management-empty-support">发布后的公告会显示在这里。</small></template>
          </el-empty>
        </template>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑公告' : '新建公告'" width="680px" class="management-dialog" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="公告标题" prop="title"><el-input v-model="form.title" maxlength="120" show-word-limit placeholder="例如：伏羲平台 v1.8.0 更新" /></el-form-item>
        <div class="form-row">
          <el-form-item label="类型" prop="type"><el-select v-model="form.type" style="width:100%"><el-option label="功能更新" value="feature" /><el-option label="维护通知" value="maintenance" /><el-option label="平台通知" value="notice" /></el-select></el-form-item>
          <el-form-item label="版本号"><el-input v-model="form.version" placeholder="例如：v1.8.0" /></el-form-item>
        </div>
        <el-form-item label="摘要"><el-input v-model="form.summary" maxlength="240" show-word-limit placeholder="列表和首页横幅显示的一句话说明" /></el-form-item>
        <el-form-item label="正文（支持 Markdown）" prop="body"><el-input v-model="form.body" type="textarea" :rows="10" maxlength="10000" show-word-limit placeholder="支持标题、列表、链接、加粗等 Markdown；请按“更新了什么、影响谁、用户要做什么、使用限制”组织内容。" /></el-form-item>
        <el-form-item label="发布后提示方式">
          <el-switch v-model="form.autoPopup" active-text="自动弹出" inactive-text="仅公告中心查看" />
          <p class="form-help">关闭后公告仍会发布，用户可通过顶部公告铃铛查看。</p>
        </el-form-item>
        <el-form-item label="发布状态"><el-radio-group v-model="form.status"><el-radio value="draft">保存草稿</el-radio><el-radio value="published">立即发布</el-radio></el-radio-group></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="submitting" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { archiveAnnouncement, createAnnouncement, getAnnouncements, updateAnnouncement } from '../api/announcements'
import ManagementPageHeader from '../components/ManagementPageHeader.vue'

const announcements = ref([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editing = ref(false)
const formRef = ref(null)
const form = ref({ id: '', title: '', summary: '', body: '', type: 'feature', version: '', status: 'draft', autoPopup: true })
const rules = { title: [{ required: true, message: '请输入公告标题', trigger: 'blur' }], body: [{ required: true, message: '请输入公告正文', trigger: 'blur' }] }

function typeLabel(type) { return ({ feature: '功能更新', maintenance: '维护通知', notice: '平台通知' }[type] || '平台通知') }
function statusLabel(status) { return ({ draft: '草稿', published: '已发布', archived: '已归档' }[status] || status) }
function statusType(status) { return ({ draft: 'info', published: 'success', archived: 'warning' }[status] || 'info') }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }) }

function openCreate() { editing.value = false; form.value = { id: '', title: '', summary: '', body: '', type: 'feature', version: '', status: 'draft', autoPopup: true }; dialogVisible.value = true }
function openEdit(row) { editing.value = true; form.value = { id: row.id, title: row.title, summary: row.summary || '', body: row.body || '', type: row.type, version: row.version || '', status: row.status, autoPopup: row.auto_popup !== false }; dialogVisible.value = true }

async function save() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = { title: form.value.title, summary: form.value.summary, body: form.value.body, type: form.value.type, version: form.value.version, status: form.value.status, autoPopup: form.value.autoPopup }
    if (editing.value) await updateAnnouncement(form.value.id, payload)
    else await createAnnouncement(payload)
    ElMessage.success(editing.value ? '公告已更新' : form.value.status === 'published' ? '公告已发布' : '草稿已保存')
    dialogVisible.value = false
    await load()
  } catch (error) { ElMessage.error(error.response?.data?.message || '保存公告失败') } finally { submitting.value = false }
}

async function publish(row) { await changeStatus(row, 'published', '发布后所有登录用户都可能看到这条公告，确认继续？') }
async function archive(row) { await changeStatus(row, 'archived', '归档后用户侧不再显示，历史记录仍保留，确认继续？') }
async function changeStatus(row, status, message) {
  try {
    await ElMessageBox.confirm(message, status === 'archived' ? '归档公告' : '发布公告', {
      confirmButtonText: status === 'archived' ? '归档' : '发布',
      cancelButtonText: '取消',
      type: status === 'archived' ? 'warning' : 'info',
      customClass: 'management-confirm'
    })
    await updateAnnouncement(row.id, { status })
    ElMessage.success(status === 'published' ? `已发布「${row.title}」` : `已归档「${row.title}」`)
    await load()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.response?.data?.message || '操作失败')
    }
  }
}

async function load() {
  loading.value = true
  try { const res = await getAnnouncements({ includeDrafts: true, limit: 200 }); announcements.value = res.data.data || [] } catch (error) { ElMessage.error('加载公告失败') } finally { loading.value = false }
}

onMounted(load)
</script>

<style scoped>
.title-cell strong,.title-cell span { display:block; }
.title-cell span { margin-top:4px; overflow:hidden; color:#718096; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.form-help { margin: 6px 0 0; color: #718096; font-size: 12px; line-height: 1.5; }
@media(max-width:600px){.form-row{display:block}}
</style>
