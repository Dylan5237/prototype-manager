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
  function normalizeRoles(value) {
    if (Array.isArray(value)) return value
    if (!value) return []
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed
        if (typeof parsed === 'string') return [parsed]
      } catch (e) {
        return [value]
      }
    }
    return []
  }

  const isAdmin = computed(() => {
    const roles = normalizeRoles(user.value?.role)
    return roles.includes('admin') || roles.includes('platform_admin')
  })
  const isEditor = computed(() => {
    const roles = normalizeRoles(user.value?.role)
    return roles.includes('editor') || roles.includes('uploader') || roles.includes('admin') || roles.includes('platform_admin')
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

  async function register(data) {
    const res = await api.post('/auth/register', data)
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
    login, register, fetchUser, logout
  }
})

export { api }
