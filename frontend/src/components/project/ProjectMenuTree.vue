<template>
  <div v-for="node in nodes" :key="node.key" class="tree-node" :class="`depth-${depth}`">
    <div v-if="node.children?.length" class="branch-label"><span class="branch-chevron">⌄</span><span>{{ node.label }}</span></div>
    <button v-else type="button" :class="['leaf-button', { active: activePath === pathFor(node) }]" :aria-current="activePath === pathFor(node) ? 'page' : undefined" @click="selectNode(node)">
      <span class="leaf-label"><i></i>{{ node.label }}</span>
      <span v-if="stateFor(pathFor(node))" class="leaf-state" :class="stateFor(pathFor(node)).tone">{{ stateFor(pathFor(node)).text }}</span>
    </button>
    <ProjectMenuTree v-if="node.children?.length" :nodes="node.children" :ancestors="[...ancestors, node]" :depth="depth + 1" :active-path="activePath" :state-for="stateFor" @select="$emit('select', $event)" />
  </div>
</template>
<script setup>
import { menuNodePath } from '../../utils/project-menu'
defineOptions({ name: 'ProjectMenuTree' })
const props = defineProps({ nodes:{type:Array,default:()=>[]}, ancestors:{type:Array,default:()=>[]}, depth:{type:Number,default:1}, activePath:{type:String,default:''}, stateFor:{type:Function,default:()=>null} })
const emit = defineEmits(['select'])
function pathFor(node){return menuNodePath(props.ancestors,node)}
function selectNode(node){emit('select',{node,ancestors:props.ancestors,path:pathFor(node)})}
</script>
<style scoped>
.tree-node{margin:3px 0}.branch-label{display:flex;align-items:center;gap:6px;padding:9px 10px 5px;color:#66738a;font-size:12px;font-weight:750}.branch-chevron{color:#9aa8be}.depth-2>.branch-label{padding-left:22px;color:#34435b;font-size:13px}.depth-3>.branch-label{padding-left:34px}.leaf-button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;border:0;border-radius:9px;padding:9px 10px;color:#66738a;background:transparent;text-align:left;cursor:pointer}.depth-2>.leaf-button{padding-left:28px}.depth-3>.leaf-button{padding-left:42px}.leaf-button:hover,.leaf-button.active{color:#2958d5;background:#edf2ff}.leaf-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.leaf-label i{display:inline-block;width:7px;height:7px;margin-right:9px;border:2px solid #91a9ec;border-radius:50%}.leaf-button.active i{border-color:#3970ef;background:#3970ef}.leaf-state{flex:none;border-radius:99px;padding:2px 7px;font-size:10px}.leaf-state.ok,.leaf-state.stable{color:#479b4f;background:#edf8ef}.leaf-state.warn{color:#b57918;background:#fff4dc}.leaf-state.empty{color:#8c97aa;background:#f0f2f6}
</style>
