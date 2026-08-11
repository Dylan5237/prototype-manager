import { api } from '../stores/auth'

export function login(username, password) {
  return api.post('/auth/login', { username, password })
}

export function getMe() {
  return api.get('/auth/me')
}

export function getMcpToken() {
  return api.get('/auth/mcp-token')
}

export function getUsers() {
  return api.get('/auth/users')
}

export function searchUsers(keyword) {
  return api.get('/auth/users/search', { params: { keyword } })
}

export function registerUser(data) {
  return api.post('/auth/register', data)
}

export function updateUser(id, data) {
  return api.put(`/auth/users/${id}`, data)
}

export function deleteUser(id) {
  return api.delete(`/auth/users/${id}`)
}
