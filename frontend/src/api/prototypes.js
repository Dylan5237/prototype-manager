import { api } from '../stores/auth'

export function getPrototypes(params) {
  return api.get('/prototypes', { params })
}

export function getMyPrototypes(params) {
  return api.get('/prototypes', { params: { ...params, scope: 'my' } })
}

export function getSharedPrototypes(params) {
  return api.get('/prototypes', { params: { ...params, scope: 'shared' } })
}

export function getPrototype(id) {
  return api.get(`/prototypes/${id}`)
}

export function downloadPrototype(id) {
  return api.get(`/prototypes/${id}/download`, { responseType: 'blob' })
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

// 回收站相关
export function getRecycleBin() {
  return api.get('/prototypes/recycle-bin')
}

export function restorePrototype(id) {
  return api.put(`/prototypes/recycle-bin/${id}/restore`)
}

export function hardDeletePrototype(id) {
  return api.delete(`/prototypes/recycle-bin/${id}`)
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

export function updateCategory(id, data) {
  return api.put(`/prototypes/categories/${id}`, data)
}

export function deleteCategory(id) {
  return api.delete(`/prototypes/categories/${id}`)
}

// 转移原型归属者（仅admin）
export function transferPrototype(id, newOwnerId) {
  return api.put(`/prototypes/${id}/transfer`, { new_owner_id: newOwnerId })
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

export function updateVersionNote(id, versionId, note) {
  return api.put(`/prototypes/${id}/versions/${versionId}/note`, { note })
}

// 分享相关
export function getPrototypeShares(id) {
  return api.get(`/prototypes/${id}/shares`)
}

export function sharePrototype(id, payload) {
  // 兼容旧用法：sharePrototype(id, username)
  if (typeof payload === 'string') {
    return api.post(`/prototypes/${id}/shares`, { username: payload })
  }
  return api.post(`/prototypes/${id}/shares`, payload)
}

export function unsharePrototype(id, userId) {
  return api.delete(`/prototypes/${id}/shares/${userId}`)
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
