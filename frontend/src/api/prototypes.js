import { api } from '../stores/auth'

export function getPrototypes(params) {
  return api.get('/prototypes', { params })
}

export function getPrototype(id) {
  return api.get(`/prototypes/${id}`)
}

export function createPrototype(data) {
  return api.post('/prototypes', data)
}

export function updatePrototype(id, data) {
  return api.put(`/prototypes/${id}`, data)
}

export function deletePrototype(id) {
  return api.delete(`/prototypes/${id}`)
}

export function uploadZip(id, file, versionNote = '') {
  const formData = new FormData()
  formData.append('file', file)
  if (versionNote) {
    formData.append('versionNote', versionNote)
  }
  return api.post(`/prototypes/${id}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export function syncGitHub(id, versionNote = '') {
  return api.post(`/prototypes/${id}/sync`, { versionNote })
}

export function getFileContent(id, path) {
  return api.get(`/prototypes/${id}/content/${path}`)
}

export function getReadme(id) {
  return api.get(`/prototypes/${id}/readme`)
}

export function getCategories() {
  return api.get('/prototypes/categories/list')
}

export function createCategory(data) {
  return api.post('/prototypes/categories', data)
}

// 版本管理API
export function getVersions(id) {
  return api.get(`/prototypes/${id}/versions`)
}

export function rollbackVersion(id, versionId) {
  return api.post(`/prototypes/${id}/versions/${versionId}/rollback`)
}

export function deleteVersion(id, versionId) {
  return api.delete(`/prototypes/${id}/versions/${versionId}`)
}

// 评论反馈 API
export function getComments(id) {
  return api.get(`/prototypes/${id}/comments`)
}

export function createComment(id, data) {
  return api.post(`/prototypes/${id}/comments`, data)
}

export function deleteComment(id, commentId) {
  return api.delete(`/prototypes/${id}/comments/${commentId}`)
}

export function uploadCommentImage(id, file) {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/prototypes/${id}/comments/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 访问统计 API
export function getStats(id) {
  return api.get(`/prototypes/${id}/stats`)
}

export function recordVisit(id) {
  return api.post(`/prototypes/${id}/visit`)
}
