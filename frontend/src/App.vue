<template>
  <div class="app">
    <div class="app-bg"></div>
    <el-container>
      <el-header v-if="!isLoginPage && !isProjectPreview" class="app-header">
        <div class="header-content">
          <div class="logo">
            <img src="/favicon.svg" class="logo-img" alt="logo" />
            <div class="logo-text">
              <div class="logo-title-row">
                <span class="logo-main">伏羲平台</span>
                <span class="beta-tag">beta</span>
              </div>
              <span class="logo-sub">AI 原型管理平台</span>
            </div>
          </div>
          <div class="nav" v-if="authStore.isLoggedIn">
            <router-link to="/" :class="{ active: isHomePage }">
              <el-icon><Files /></el-icon>
              原型列表
            </router-link>
            <router-link to="/projects" :class="{ active: isProjectPage }">
              <el-icon><FolderOpened /></el-icon>
              项目
            </router-link>
            <router-link v-if="authStore.isAdmin" to="/admin/usage" :class="{ active: isAdminPage }">
              <el-icon><Setting /></el-icon>
              系统管理
            </router-link>
            <router-link to="/help" :class="{ active: isHelpPage }">
              <el-icon><Reading /></el-icon>
              帮助
            </router-link>
          </div>
          <div class="user-info" v-if="authStore.isLoggedIn && authStore.user">
            <AnnouncementCenter />
            <AccountMenu />
          </div>
        </div>
      </el-header>
      <McpOnboardingDialog v-if="authStore.isLoggedIn && !isLoginPage && !isProjectPreview" />
      <el-main :class="['app-main', { 'app-main--login': isLoginPage || isProjectPreview }]">
        <!-- 登录页 -->
        <router-view v-if="isLoginPage" />
        <!-- 系统管理页 -->
        <AdminLayout v-else-if="isAdminPage">
          <div class="content-wrapper">
            <router-view />
          </div>
        </AdminLayout>
        <!-- 原型列表页（含子菜单布局） -->
        <PrototypeLayout v-else-if="isHomePage">
          <router-view />
        </PrototypeLayout>
        <!-- 项目页（含项目列表与项目门户） -->
        <ProjectLayout v-else-if="isProjectPage && !isProjectPreview">
          <router-view />
        </ProjectLayout>
        <!-- 原型详情页 -->
        <router-view v-else />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import AdminLayout from './components/AdminLayout.vue'
import PrototypeLayout from './components/PrototypeLayout.vue'
import ProjectLayout from './components/ProjectLayout.vue'
import AnnouncementCenter from './components/AnnouncementCenter.vue'
import AccountMenu from './components/AccountMenu.vue'
import McpOnboardingDialog from './components/McpOnboardingDialog.vue'
import { Files, FolderOpened, Reading, Setting } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const route = useRoute()
const isLoginPage = computed(() => route.path === '/login')
const isAdminPage = computed(() => route.path.startsWith('/admin'))
const isHomePage = computed(() => route.path === '/')
const isProjectPage = computed(() => route.path.startsWith('/projects') || route.path.startsWith('/project/'))
const isProjectPreview = computed(() => /^\/project\/[^/]+\/preview$/.test(route.path))
const isHelpPage = computed(() => route.path === '/help' || route.path === '/admin/help')

</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f5f7fa;
  overflow-x: hidden;
}

.app {
  min-height: 100vh;
  position: relative;
}

/* ========================================
   全局渐变背景 - 清新蓝灰色系
   ======================================== */
.app-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #e8f0fe 0%, #f0f4f8 50%, #e6eef7 100%);
  z-index: -1;
}

/* ========================================
   顶部导航栏 - 简约玻璃风格
   ======================================== */
.app-header {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding: 0 24px;
  height: 56px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  max-width: 1600px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-img {
  width: 32px;
  height: 32px;
}

.logo-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.logo-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-main {
  font-size: 16px;
  font-weight: 700;
  color: #1a202c;
  letter-spacing: 0.5px;
}

.beta-tag {
  font-size: 10px;
  font-weight: 500;
  color: #4facfe;
  background: rgba(79, 172, 254, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(79, 172, 254, 0.2);
  text-transform: lowercase;
  letter-spacing: 0.5px;
}

.logo-sub {
  font-size: 10px;
  color: #718096;
  font-weight: 400;
}

/* 导航链接 - 简约胶囊 */
.nav {
  display: flex;
  gap: 6px;
  flex: 1;
  margin-left: 48px;
}

.nav a {
  color: #4a5568;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.nav a:hover {
  color: #1a202c;
  background: rgba(0, 0, 0, 0.04);
}

.nav a.active {
  color: #1a202c;
  background: rgba(0, 0, 0, 0.06);
  font-weight: 600;
}

.nav a .el-icon {
  font-size: 16px;
}

/* 用户操作区 */
.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ========================================
   主内容区 - 移除 max-width 限制，让侧边栏贴边
   ======================================== */
.app-main {
  width: 100%;
  padding: 0;
  /* Element Plus 默认 overflow:auto 会把主区变成滚动上下文，导致页面侧栏无法随页面 sticky。 */
  overflow: visible;
}

.app-main--login {
  padding: 0;
}

/* ========================================
   响应式
   ======================================== */
@media (max-width: 768px) {
  .app-header {
    padding: 0 16px;
  }
  
  .header-content {
    flex-wrap: wrap;
    gap: 12px;
  }
  
  .nav {
    margin-left: 0;
    order: 3;
    width: 100%;
    justify-content: center;
  }
  
  .user-info {
    gap: 4px;
  }
}
</style>
