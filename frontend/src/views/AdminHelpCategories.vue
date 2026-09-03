<template>
  <div class="management-page help-category-admin">
    <ManagementPageHeader title="手册分类" :count="activeCategoryCount" description="配置分层目录，并把同一份手册分发到多个分类。">
      <el-button @click="loadCategories" :loading="loading">刷新</el-button>
      <el-button @click="startCreate(null)">新建一级分类</el-button>
      <el-button type="primary" :disabled="!selectedCategory" @click="startCreate(selectedCategory.id)">新建子分类</el-button>
    </ManagementPageHeader>

    <div v-loading="loading" class="help-category-layout">
      <section class="management-panel help-category-tree-panel">
        <div class="help-category-panel-heading">
          <div><span class="help-panel-kicker">目录结构</span><h2>{{ categoryRows.length }} 个分类</h2></div>
          <el-icon><Reading /></el-icon>
        </div>
        <div class="help-category-tree-list">
          <button
            v-for="category in categoryRows"
            :key="category.id"
            type="button"
            :class="['help-category-tree-item', { 'is-active': category.id === selectedId, 'is-archived': category.status === 'archived' }]"
            :style="{ '--category-depth': category.depth }"
            @click="selectCategory(category)"
          >
            <span class="help-category-tree-item__name">{{ category.name }}</span>
            <span class="help-category-tree-item__meta">
              <span>{{ category.documentCount }} 篇</span>
              <el-tag v-if="category.status === 'archived'" type="info" effect="plain" size="small">已归档</el-tag>
            </span>
          </button>
          <el-empty v-if="!categoryRows.length && !loading" description="暂无手册分类" :image-size="72" />
        </div>
      </section>

      <section v-if="selectedCategory" class="management-panel help-category-editor-panel">
        <div class="help-category-editor-heading">
          <div>
            <span class="help-panel-kicker">{{ isCreating ? '新建分类' : '分类设置' }}</span>
            <h2>{{ isCreating ? '配置新的帮助目录' : selectedCategory.name }}</h2>
          </div>
          <el-tag :type="selectedCategory.status === 'archived' ? 'info' : 'success'" effect="light">
            {{ selectedCategory.status === 'archived' ? '已归档' : '使用中' }}
          </el-tag>
        </div>

        <el-form ref="formRef" :model="draft" label-position="top" class="help-category-form">
          <div class="help-category-form-row">
            <el-form-item label="分类名称" required><el-input v-model="draft.name" maxlength="80" show-word-limit placeholder="例如：项目协作" /></el-form-item>
            <el-form-item label="分类标识" required><el-input v-model="draft.slug" :disabled="!isCreating" maxlength="80" placeholder="例如：advanced-project" /></el-form-item>
          </div>
          <div class="help-category-form-row">
            <el-form-item label="分类类型">
              <el-select v-model="draft.categoryType" style="width:100%">
                <el-option label="通用分组" value="general" />
                <el-option label="平台操作" value="platform" />
                <el-option label="AI 原型设计" value="ai_prototype" />
              </el-select>
            </el-form-item>
            <el-form-item label="父级分类">
              <el-select v-model="draft.parentId" clearable style="width:100%" placeholder="作为一级分类">
                <el-option v-for="category in parentOptions" :key="category.id" :label="category.path" :value="category.id" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="排序"><el-input-number v-model="draft.sortOrder" :min="0" :max="99999" controls-position="right" /></el-form-item>
          <el-form-item label="分类说明"><el-input v-model="draft.description" maxlength="240" show-word-limit /></el-form-item>

          <div class="help-distribution-heading">
            <div><h3>分发手册</h3><p>一份手册可以同时属于多个分类；这里只维护当前分类下的手册集合。</p></div>
            <el-tag type="info" effect="plain" size="small">已选 {{ draftDocumentSlugs.length }} 篇</el-tag>
          </div>
          <el-checkbox-group v-model="draftDocumentSlugs" class="help-document-check-list">
            <el-checkbox v-for="document in documents" :key="document.slug" :label="document.slug" class="help-document-check">
              <span class="help-document-check__copy"><strong>{{ document.title }}</strong><small>{{ document.summary }}</small></span>
            </el-checkbox>
          </el-checkbox-group>
        </el-form>

        <footer class="help-category-editor-footer">
          <div>
            <el-button v-if="!isCreating && selectedCategory.status === 'active'" type="danger" text @click="archiveSelected">归档分类</el-button>
            <el-button v-if="!isCreating && selectedCategory.status === 'archived'" type="success" text @click="restoreSelected">恢复分类</el-button>
          </div>
          <div>
            <el-button :disabled="!dirty" :loading="saving" @click="saveCategory">保存设置</el-button>
          </div>
        </footer>
      </section>
      <el-empty v-else-if="!loading" class="help-category-empty" description="选择一个分类开始配置" :image-size="96" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Reading } from '@element-plus/icons-vue'
import ManagementPageHeader from '../components/ManagementPageHeader.vue'
import {
  archiveHelpCategory,
  createHelpCategory,
  getHelpCategories,
  restoreHelpCategory,
  updateHelpCategory,
  updateHelpCategoryDocuments
} from '../api/help-categories'
import { getHelpDocuments } from '../api/help-documents'

const categories = ref([])
const documents = ref([])
const selectedId = ref(null)
const selectedCategory = ref(null)
const isCreating = ref(false)
const loading = ref(false)
const saving = ref(false)
const formRef = ref(null)
const draftDocumentSlugs = ref([])
const draft = reactive({ id: 0, name: '', slug: '', description: '', categoryType: 'general', parentId: null, sortOrder: 0 })

const activeCategoryCount = computed(() => categories.value.filter(category => category.status === 'active').length)
const categoryRows = computed(() => {
  const rows = []
  function walk(nodes, depth = 0) {
    nodes.forEach(category => {
      rows.push({ ...category, depth })
      walk(category.children || [], depth + 1)
    })
  }
  const roots = categories.value.filter(category => category.parentId == null)
  const children = new Map()
  categories.value.forEach(category => {
    if (category.parentId == null) return
    const list = children.get(category.parentId) || []
    list.push(category)
    children.set(category.parentId, list)
  })
  function buildTree(category) {
    return { ...category, children: (children.get(category.id) || []).map(buildTree) }
  }
  walk(roots.map(buildTree))
  return rows
})
const descendantIds = computed(() => {
  const children = new Map()
  categories.value.forEach(category => {
    const list = children.get(category.parentId) || []
    list.push(category.id)
    children.set(category.parentId, list)
  })
  const collect = id => [id, ...(children.get(id) || []).flatMap(childId => collect(childId))]
  return collect
})
const parentOptions = computed(() => {
  const excluded = isCreating.value ? [] : descendantIds.value(draft.id)
  return categories.value.filter(category => category.status === 'active' && !excluded.includes(category.id))
})
const dirty = computed(() => {
  if (!selectedCategory.value) return false
  const fieldsDirty = ['name', 'slug', 'description', 'categoryType', 'parentId', 'sortOrder'].some(field => String(draft[field] ?? '') !== String((selectedCategory.value[field] ?? '') ?? ''))
  const currentSlugs = (selectedCategory.value.documents || []).map(document => document.slug).sort().join(',')
  return fieldsDirty || currentSlugs !== [...draftDocumentSlugs.value].sort().join(',')
})

function copyCategory(category, creating = false) {
  isCreating.value = creating
  selectedCategory.value = category
  selectedId.value = category.id
  draft.id = category.id || 0
  draft.name = category.name || ''
  draft.slug = category.slug || ''
  draft.description = category.description || ''
  draft.categoryType = category.categoryType || 'general'
  draft.parentId = category.parentId == null ? null : category.parentId
  draft.sortOrder = category.sortOrder || 0
  draftDocumentSlugs.value = (category.documents || []).map(document => document.slug)
}

async function loadCategories(preferredId = null) {
  loading.value = true
  try {
    const [categoryResponse, documentResponse] = await Promise.all([
      getHelpCategories({ includeArchived: 'true', includeDocuments: 'true' }),
      getHelpDocuments({ includeDrafts: 'true' })
    ])
    categories.value = categoryResponse.data.data?.items || []
    documents.value = documentResponse.data.data || []
    const next = categories.value.find(category => category.id === preferredId)
      || categories.value.find(category => category.id === selectedId.value)
      || categories.value.find(category => category.status === 'active')
      || categories.value[0]
    if (next) copyCategory(next)
    else { selectedCategory.value = null; selectedId.value = null }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '加载手册分类失败')
  } finally {
    loading.value = false
  }
}

async function selectCategory(category) {
  if (!category || category.id === selectedId.value) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('当前分类有未保存修改，切换后将丢失这些修改。', '确认切换分类', { confirmButtonText: '继续切换', cancelButtonText: '留下编辑', type: 'warning' })
    } catch (error) { return }
  }
  copyCategory(category)
}

function startCreate(parentId) {
  const parent = parentId == null ? null : categories.value.find(category => category.id === parentId)
  copyCategory({ id: 0, name: '', slug: '', description: '', categoryType: parent?.categoryType === 'ai_prototype' ? 'ai_prototype' : parent?.categoryType === 'platform' ? 'platform' : 'general', parentId, sortOrder: 0, status: 'active', documents: [] }, true)
}

async function saveCategory() {
  if (!draft.name.trim() || !draft.slug.trim()) { ElMessage.warning('请填写分类名称和分类标识'); return }
  saving.value = true
  try {
    const payload = { name: draft.name, slug: draft.slug, description: draft.description, categoryType: draft.categoryType, parentId: draft.parentId, sortOrder: draft.sortOrder }
    const response = isCreating.value ? await createHelpCategory(payload) : await updateHelpCategory(draft.id, payload)
    const saved = response.data.data
    await updateHelpCategoryDocuments(saved.id, draftDocumentSlugs.value)
    ElMessage.success(isCreating.value ? '分类已创建' : '分类设置已保存')
    await loadCategories(saved.id)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '保存分类失败')
  } finally { saving.value = false }
}

async function archiveSelected() {
  try {
    await ElMessageBox.confirm('归档后用户侧将不再看到该分类，但手册不会被删除。确认继续？', '归档分类', { confirmButtonText: '归档', cancelButtonText: '取消', type: 'warning' })
    await archiveHelpCategory(selectedCategory.value.id)
    ElMessage.success('分类已归档')
    await loadCategories()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error.response?.data?.message || '归档分类失败')
  }
}

async function restoreSelected() {
  try {
    await restoreHelpCategory(selectedCategory.value.id)
    ElMessage.success('分类已恢复')
    await loadCategories(selectedCategory.value.id)
  } catch (error) { ElMessage.error(error.response?.data?.message || '恢复分类失败') }
}

onMounted(loadCategories)
</script>

<style scoped>
.help-category-admin { height:calc(100vh - 110px); min-height:600px; }
.help-category-layout { height:calc(100% - 84px); min-height:0; display:grid; grid-template-columns:310px minmax(0,1fr); gap:16px; }
.help-category-tree-panel, .help-category-editor-panel { min-height:0; overflow:hidden; }
.help-category-panel-heading, .help-category-editor-heading { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 20px 15px; border-bottom:1px solid #edf1f6; }
.help-category-panel-heading h2, .help-category-editor-heading h2 { margin-top:5px; color:#27364a; font-size:18px; }
.help-category-panel-heading > .el-icon { color:#9aa8ba; font-size:20px; }
.help-category-tree-list { height:calc(100% - 72px); overflow:auto; padding:9px; }
.help-category-tree-item { display:flex; align-items:center; justify-content:space-between; width:100%; padding:12px 10px 12px calc(10px + var(--category-depth) * 18px); text-align:left; background:transparent; border:0; border-radius:8px; color:#445267; cursor:pointer; }
.help-category-tree-item:hover { background:#f4f7fb; }
.help-category-tree-item.is-active { background:#edf5ff; color:#2878d8; box-shadow:inset 3px 0 #4facfe; }
.help-category-tree-item.is-archived { opacity:.58; }
.help-category-tree-item__name { overflow:hidden; font-size:13px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
.help-category-tree-item__meta { display:flex; align-items:center; gap:5px; flex-shrink:0; margin-left:8px; color:#9aa8ba; font-size:11px; }
.help-category-editor-panel { display:flex; flex-direction:column; }
.help-category-form { flex:1; min-height:0; overflow:auto; padding:18px 24px 0; }
.help-category-form-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
.help-category-form :deep(.el-form-item) { margin-bottom:14px; }
.help-distribution-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-top:8px; padding:16px 0 10px; border-top:1px solid #edf1f6; }
.help-distribution-heading h3 { color:#27364a; font-size:14px; }
.help-distribution-heading p { margin-top:4px; color:#9aa8ba; font-size:11px; line-height:1.5; }
.help-document-check-list { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px 14px; }
.help-document-check { display:flex; align-items:flex-start; height:auto; margin:0; padding:10px; border:1px solid #edf1f6; border-radius:8px; }
.help-document-check.is-checked { border-color:#b9d9ff; background:#f5faff; }
.help-document-check :deep(.el-checkbox__label) { width:100%; white-space:normal; }
.help-document-check__copy { display:flex; flex-direction:column; gap:3px; }
.help-document-check__copy strong { color:#445267; font-size:12px; line-height:1.4; }
.help-document-check__copy small { overflow:hidden; color:#9aa8ba; font-size:11px; line-height:1.4; text-overflow:ellipsis; white-space:nowrap; }
.help-category-editor-footer { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; padding:12px 18px; border-top:1px solid #edf1f6; background:#fbfdff; }
.help-category-empty { height:100%; }
@media(max-width:900px){.help-category-layout{grid-template-columns:250px minmax(0,1fr)}.help-document-check-list{grid-template-columns:1fr}}
@media(max-width:650px){.help-category-admin{height:auto}.help-category-layout{height:auto;min-height:900px;grid-template-columns:1fr}.help-category-tree-panel{max-height:360px}.help-category-form-row{display:block}}
</style>
