<template>
  <el-dialog :model-value="visible" @update:model-value="$emit('update:visible',$event)" :title="isEdit?'编辑项目':'创建项目'" width="780px" :close-on-click-modal="false" @close="handleClose">
    <el-form :model="form" label-width="82px" ref="formRef" :rules="rules">
      <el-form-item label="项目名称" prop="name"><el-input v-model="form.name" placeholder="例如：建模开发平台" /></el-form-item>
      <el-form-item label="项目描述"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="简要描述项目范围" /></el-form-item>
      <el-form-item label="菜单结构">
        <div class="menu-editor">
          <div class="editor-tip"><strong>最多三级</strong><span>只有没有下级菜单的叶子节点可以绑定原型。</span></div>
          <ProjectMenuEditorNode v-for="node in form.menuConfig.items" :key="node.key" :node="node" :binding-for="bindingFor" @add-child="addChild" @remove="removeNode" />
          <el-button text type="primary" @click="addRoot">+ 添加一级菜单</el-button>
          <el-alert v-if="bindingMigrations.length" type="info" :closable="false" show-icon title="保存时将同步迁移原型绑定">
            <div v-for="migration in bindingMigrations" :key="migration.bindingId">{{ migration.fromLabel }} → {{ migration.toLabel }}</div>
          </el-alert>
        </div>
      </el-form-item>
    </el-form>
    <template #footer><el-button @click="$emit('update:visible',false)">取消</el-button><el-button type="primary" @click="handleSubmit" :loading="saving">保存</el-button></template>
  </el-dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createProject, updateProject } from '../api/projects'
import ProjectMenuEditorNode from './project/ProjectMenuEditorNode.vue'
import { menuNodeLabelPath, menuNodePath, walkProjectMenu } from '../utils/project-menu'

const props=defineProps({visible:Boolean,project:Object})
const emit=defineEmits(['update:visible','saved'])
const formRef=ref(null),saving=ref(false),isEdit=ref(false),bindingMigrations=ref([])
const form=ref({name:'',description:'',menuConfig:{items:[]}})
const rules={name:[{required:true,message:'请输入项目名称',trigger:'blur'}]}
const clone=value=>JSON.parse(JSON.stringify(value))
watch(()=>props.project,val=>{isEdit.value=Boolean(val);form.value=val?{name:val.name||'',description:val.description||'',menuConfig:clone(val.menu_config||{items:[]})}:{name:'',description:'',menuConfig:{items:[]}};bindingMigrations.value=[]},{immediate:true})
function key(prefix){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`}
function addRoot(){form.value.menuConfig.items.push({key:key('group'),label:'',children:[]})}
function bindingFor(path){return props.project?.prototypes?.find(item=>item.menu_path===path)||null}
function childrenOf(ancestors){return ancestors.length?ancestors[ancestors.length-1].children:form.value.menuConfig.items}
async function addChild({node,ancestors,depth}){
  if(depth>=3)return
  const fromPath=menuNodePath(ancestors,node),existing=bindingFor(fromPath)
  let label=''
  if(existing){
    try{
      const result=await ElMessageBox.prompt(`「${node.label}」已绑定原型。新增下级后，它将变为分组节点；请输入承接现有原型的新${depth===1?'二':'三'}级菜单名称。`,'迁移已有绑定',{confirmButtonText:'创建并迁移',cancelButtonText:'取消',inputValue:`${node.label}页面`,inputValidator:value=>Boolean(value?.trim())||'请输入菜单名称'})
      label=result.value.trim()
    }catch{return}
  }
  node.children=Array.isArray(node.children)?node.children:[]
  const child={key:key(depth===1?'item':'leaf'),label,children:[]};node.children.push(child)
  if(existing){
    const toPath=`${fromPath}/${child.key}`
    bindingMigrations.value=bindingMigrations.value.filter(item=>item.bindingId!==existing.id)
    bindingMigrations.value.push({bindingId:existing.id,fromPath,toPath,fromLabel:menuNodeLabelPath(ancestors,node),toLabel:`${menuNodeLabelPath(ancestors,node)} / ${label}`})
  }
}
function subtreeHasBinding(node,ancestors){let found=false;walkProjectMenu([node],(child,relative)=>{if(bindingFor(menuNodePath([...ancestors,...relative],child)))found=true});return found}
async function removeNode({node,ancestors}){
  if(subtreeHasBinding(node,ancestors)){ElMessage.warning('该菜单下仍有原型绑定，请先解除绑定或完成迁移');return}
  const siblings=childrenOf(ancestors),index=siblings.indexOf(node);if(index>=0)siblings.splice(index,1)
}
function validateMenu(){let error='';walkProjectMenu(form.value.menuConfig.items,(node,ancestors)=>{if(error)return;if(ancestors.length>=3)error='菜单最多支持三级';else if(!node.label?.trim())error=`${ancestors.length+1}级菜单名称不能为空`});return error}
function handleClose(){formRef.value?.resetFields();bindingMigrations.value=[]}
async function handleSubmit(){
  if(!await formRef.value.validate().catch(()=>false))return
  const menuError=validateMenu();if(menuError){ElMessage.warning(menuError);return}
  saving.value=true
  try{
    const payload={name:form.value.name.trim(),description:form.value.description,menuConfig:form.value.menuConfig,bindingMigrations:bindingMigrations.value.map(({bindingId,fromPath,toPath})=>({bindingId,fromPath,toPath}))}
    if(isEdit.value)await updateProject(props.project.id,payload);else await createProject(payload)
    ElMessage.success(isEdit.value?'更新成功':'创建成功');emit('saved');emit('update:visible',false)
  }catch(err){ElMessage.error(err.response?.data?.message||'保存失败')}finally{saving.value=false}
}
</script>
<style scoped>
.menu-editor{width:100%;padding:13px;border:1px solid #e4e7ed;border-radius:9px;background:#fafbfe}.editor-tip{display:flex;gap:10px;margin-bottom:12px;color:#7a879c;font-size:12px}.editor-tip strong{color:#315fd7}.menu-editor :deep(.el-alert){margin-top:12px}
</style>
