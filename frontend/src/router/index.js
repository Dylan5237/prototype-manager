import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const HomeView = () => import('../views/HomeView.vue')
const PrototypeDetail = () => import('../views/PrototypeDetail.vue')
const LoginView = () => import('../views/LoginView.vue')
const AdminUsers = () => import('../views/AdminUsers.vue')
const AdminDistribution = () => import('../views/AdminDistribution.vue')
const AdminCategories = () => import('../views/AdminCategories.vue')
const AdminGroups = () => import('../views/AdminGroups.vue')
const AdminAnnouncements = () => import('../views/AdminAnnouncements.vue')
const AdminUsageDashboard = () => import('../views/AdminUsageDashboard.vue')
const RecycleBinView = () => import('../views/RecycleBinView.vue')
const ProjectsView = () => import('../views/ProjectsView.vue')
const ProjectView = () => import('../views/ProjectView.vue')
const ProjectPreview = () => import('../views/ProjectPreview.vue')

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'home', component: HomeView },
  { path: '/prototype/:id', name: 'prototype', component: PrototypeDetail, meta: { allowGuest: true } },
  { path: '/projects', name: 'projects', component: ProjectsView },
  {
    path: '/project/:id',
    alias: '/projects/:id',
    name: 'project',
    component: ProjectView,
    meta: { allowGuest: true }
  },
  { path: '/project/:id/preview', name: 'project-preview', component: ProjectPreview, meta: { allowGuest: true } },
  { path: '/admin/users', name: 'admin-users', component: AdminUsers, meta: { requireAdmin: true } },
  { path: '/admin/usage', name: 'admin-usage', component: AdminUsageDashboard, meta: { requireAdmin: true } },
  { path: '/admin/distribution', name: 'admin-distribution', component: AdminDistribution, meta: { requireAdmin: true } },
  { path: '/admin/categories', name: 'admin-categories', component: AdminCategories, meta: { requireAdmin: true } },
  { path: '/admin/groups', name: 'admin-groups', component: AdminGroups, meta: { requireAdmin: true } },
  { path: '/admin/announcements', name: 'admin-announcements', component: AdminAnnouncements, meta: { requireAdmin: true } },
  { path: '/recycle-bin', name: 'recycle-bin', component: RecycleBinView, meta: { requireAdmin: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // 公开页面直接放行
  if (to.meta.public) {
    next()
    return
  }
  
  // 未登录或已登录但用户信息未加载，尝试获取用户信息
  if (!authStore.isLoggedIn || !authStore.user) {
    const success = await authStore.fetchUser()
    if (!success) {
      // 免登录分享链接：允许匿名访问原型详情，自动以 guest 账号登录
      if (to.meta.allowGuest) {
        const guestLoginSuccess = await authStore.login('user', '111111')
        if (!guestLoginSuccess) {
          next('/login')
          return
        }
      } else {
        next('/login')
        return
      }
    }
  }
  
  // 需要admin权限
  if (to.meta.requireAdmin && !authStore.isAdmin) {
    next('/')
    return
  }
  
  next()
})

export default router
