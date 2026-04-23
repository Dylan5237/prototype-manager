<template>
  <div class="app">
    <el-container>
      <el-header class="app-header">
        <div class="header-content">
          <div class="logo">
            <img src="/favicon.svg" class="logo-img" alt="logo" />
            <div class="logo-text">
              <span class="logo-main">伏羲元构</span>
              <span class="logo-sub">AI产出原型管理平台</span>
            </div>
          </div>
          <div class="nav" v-if="authStore.isLoggedIn">
            <router-link to="/">原型列表</router-link>
            <router-link v-if="authStore.isAdmin" to="/admin/users">用户管理</router-link>
          </div>
          <div class="user-info" v-if="authStore.isLoggedIn && authStore.user">
            <el-tag size="small" :type="roleTagType">{{ roleLabel }}</el-tag>
            <span class="nickname">{{ authStore.user.nickname || authStore.user.username }}</span>
            <el-button text size="small" @click="authStore.logout">
              <el-icon><SwitchButton /></el-icon>
              退出
            </el-button>
          </div>
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()

const roleLabel = computed(() => {
  const map = { admin: '管理员', uploader: '上传者', viewer: '查看者' }
  return map[authStore.user?.role] || authStore.user?.role
})

const roleTagType = computed(() => {
  const map = { admin: 'danger', uploader: 'success', viewer: 'info' }
  return map[authStore.user?.role] || 'info'
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f7fa;
}

.app {
  min-height: 100vh;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 24px;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-img {
  width: 32px;
  height: 32px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.logo-main {
  font-size: 18px;
  font-weight: 700;
  color: #303133;
  letter-spacing: 1px;
}

.logo-sub {
  font-size: 11px;
  color: #909399;
  font-weight: 400;
}

.nav {
  display: flex;
  gap: 24px;
  flex: 1;
  margin-left: 40px;
}

.nav a {
  color: #606266;
  text-decoration: none;
  font-size: 14px;
}

.nav a:hover,
.nav a.router-link-active {
  color: #409eff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info .nickname {
  font-size: 14px;
  color: #303133;
}

.app-main {
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 24px;
}
</style>
