import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器：自动添加token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401时清除token
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(null)
  const isLoggedIn = computed(() => !!token.value)
  // role 现在是数组，检查是否包含对应角色
  const isAdmin = computed(() => {
    const roles = user.value?.role
    if (!roles) return false
    return Array.isArray(roles) ? roles.includes('admin') : roles === 'admin'
  })
  const isEditor = computed(() => {
    const roles = user.value?.role
    if (!roles) return false
    const roleArr = Array.isArray(roles) ? roles : [roles]
    return roleArr.includes('editor') || roleArr.includes('uploader') || roleArr.includes('admin')
  })

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    if (res.data.success) {
      token.value = res.data.data.token
      user.value = res.data.data.user
      localStorage.setItem('token', token.value)
      return true
    }
    return false
  }

  async function fetchUser() {
    if (!token.value) return false
    try {
      const res = await api.get('/auth/me')
      if (res.data.success) {
        user.value = res.data.data
        return true
      }
    } catch (e) {
      token.value = ''
      user.value = null
      localStorage.removeItem('token')
    }
    return false
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return {
    token, user, isLoggedIn, isAdmin, isEditor,
    login, fetchUser, logout
  }
})

export { api }
