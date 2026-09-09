<template>
  <div class="editor-node" :class="`depth-${depth}`">
    <div class="node-row">
      <span class="drag">⠿</span>
      <el-input v-model="node.label" :placeholder="`${depthName}名称`" />
      <el-tag v-if="binding" size="small" type="success" effect="plain">已绑定</el-tag>
      <el-button v-if="depth < 3" text type="primary" size="small" @click="$emit('add-child', { node, ancestors, depth })">+ 下一级</el-button>
      <el-button text type="danger" size="small" @click="$emit('remove', { node, ancestors })">删除</el-button>
    </div>
    <div v-if="node.children?.length" class="node-children">
      <ProjectMenuEditorNode v-for="child in node.children" :key="child.key" :node="child" :ancestors="[...ancestors,node]" :depth="depth+1" :binding-for="bindingFor" @add-child="$emit('add-child',$event)" @remove="$emit('remove',$event)" />
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { menuNodePath } from '../../utils/project-menu'
defineOptions({name:'ProjectMenuEditorNode'})
const props=defineProps({node:{type:Object,required:true},ancestors:{type:Array,default:()=>[]},depth:{type:Number,default:1},bindingFor:{type:Function,required:true}})
defineEmits(['add-child','remove'])
const binding=computed(()=>props.bindingFor(menuNodePath(props.ancestors,props.node)))
const depthName=computed(()=>['一级菜单','二级菜单','三级菜单'][props.depth-1])
</script>
<style scoped>
.editor-node{margin-bottom:9px;padding:10px;border:1px solid #e6eaf1;border-radius:9px;background:#fff}.node-row{display:flex;align-items:center;gap:8px}.drag{color:#a0aabc}.node-children{margin:10px 0 0 26px;padding-left:12px;border-left:2px solid #e9edf6}.depth-2{background:#fbfcff}.depth-3{background:#f7f9fd}
</style>
