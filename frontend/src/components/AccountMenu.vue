<template>
  <el-popover v-model:visible="visible" placement="bottom-end" :width="248" trigger="click" popper-class="account-menu-popper">
    <template #reference>
      <button class="account-trigger" type="button" aria-label="打开用户菜单">
        <span class="account-avatar">{{ avatarText }}</span>
        <span class="account-name">{{ authStore.user?.nickname || authStore.user?.username }}</span>
        <span class="account-arrow">⌄</span>
      </button>
    </template>
    <div class="account-menu">
      <div class="account-summary"><strong>{{ authStore.user?.nickname || authStore.user?.username }}</strong><small>{{ authStore.user?.username }}</small></div>
      <el-popover placement="left-start" trigger="hover" :width="260">
        <template #reference><button type="button" class="menu-button">◉ 查看权限</button></template>
        <div class="permission-card"><strong>当前权限</strong><p v-for="role in roles" :key="role">{{ roleLabel(role) }}<span>{{ roleDescription(role) }}</span></p></div>
      </el-popover>
      <button type="button" class="menu-button" @click="openMcp">⌁ 接入平台 MCP</button>
      <button type="button" class="menu-button danger" @click="logout">↪ 注销</button>
    </div>
  </el-popover>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const visible = ref(false)
const roles = computed(() => {
  const value = authStore.user?.role
  return Array.isArray(value) ? value : value ? [value] : []
})
const avatarText = computed(() => (authStore.user?.nickname || authStore.user?.username || '示').slice(0, 1))

function roleLabel(role) { return ({ admin: '平台管理员', uploader: '普通编辑者', editor: '普通编辑者', viewer: '查看者' }[role] || role) }
function roleDescription(role) { return role === 'admin' ? '系统配置与用户管理' : role === 'viewer' ? '按授权查看原型' : '创建、修改和交付原型' }
function openMcp() { visible.value = false; window.dispatchEvent(new CustomEvent('fuxi:open-mcp')) }
function logout() { visible.value = false; authStore.logout() }
</script>

<style scoped>
.account-trigger { display:flex; align-items:center; gap:8px; padding:5px 9px 5px 5px; border:1px solid transparent; border-radius:999px; background:transparent; color:#1a202c; }
.account-trigger:hover { border-color:rgba(0,0,0,.08); background:rgba(255,255,255,.8); }
.account-avatar { width:30px; height:30px; display:grid; place-items:center; color:#1d4ed8; border-radius:50%; background:#dbeafe; font-size:12px; font-weight:800; }
.account-name { max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.account-arrow { color:#64748b; font-size:16px; }
.account-menu { display:grid; gap:3px; }
.account-summary { padding:5px 9px 10px; border-bottom:1px solid #edf2f7; margin-bottom:3px; }
.account-summary strong,.account-summary small { display:block; }
.account-summary small { color:#64748b; margin-top:2px; }
.menu-button { width:100%; padding:9px; border:0; border-radius:7px; background:transparent; color:#334155; text-align:left; }
.menu-button:hover { background:#f1f5f9; }
.menu-button.danger { color:#dc2626; }
.permission-card strong { display:block; margin-bottom:8px; }
.permission-card p { display:flex; justify-content:space-between; gap:12px; margin:6px 0; color:#334155; }
.permission-card span { color:#64748b; text-align:right; }
</style>
