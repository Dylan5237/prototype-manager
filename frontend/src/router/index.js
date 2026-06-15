import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import HomeView from '../views/HomeView.vue'
import PrototypeDetail from '../views/PrototypeDetail.vue'
import LoginView from '../views/LoginView.vue'
import AdminUsers from '../views/AdminUsers.vue'
import AdminDistribution from '../views/AdminDistribution.vue'
import AdminCategories from '../views/AdminCategories.vue'
import RecycleBinView from '../views/RecycleBinView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'home', component: HomeView },
  { path: '/prototype/:id', name: 'prototype', component: PrototypeDetail },
  { path: '/admin/users', name: 'admin-users', component: AdminUsers, meta: { requireAdmin: true } },
  { path: '/admin/distribution', name: 'admin-distribution', component: AdminDistribution, meta: { requireAdmin: true } },
  { path: '/admin/categories', name: 'admin-categories', component: AdminCategories, meta: { requireAdmin: true } },
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
      next('/login')
      return
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
