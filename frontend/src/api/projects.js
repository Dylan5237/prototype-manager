import { api } from '../stores/auth'

export function getProjects(params) {
  return api.get('/projects', { params })
}

export function createProject(data) {
  return api.post('/projects', data)
}

export function getProject(id) {
  return api.get(`/projects/${id}`)
}

export function updateProject(id, data) {
  return api.put(`/projects/${id}`, data)
}

export function deleteProject(id) {
  return api.delete(`/projects/${id}`)
}

export function bindPrototype(id, data) {
  return api.post(`/projects/${id}/prototypes`, data)
}

export function updateProjectPrototype(id, ppId, data) {
  return api.put(`/projects/${id}/prototypes/${ppId}`, data)
}

export function removeProjectPrototype(id, ppId) {
  return api.delete(`/projects/${id}/prototypes/${ppId}`)
}

export function getProjectMembers(id) {
  return api.get(`/projects/${id}/members`)
}

export function addProjectMember(id, data) {
  return api.post(`/projects/${id}/members`, data)
}

export function removeProjectMember(id, userId) {
  return api.delete(`/projects/${id}/members/${userId}`)
}

export function checkoutPrototype(id, ppId, data) {
  return api.post(`/projects/${id}/prototypes/${ppId}/checkout`, data || {})
}

export function checkinPrototype(id, ppId) {
  return api.post(`/projects/${id}/prototypes/${ppId}/checkin`)
}

export function releaseCheckout(id, ppId) {
  return api.post(`/projects/${id}/prototypes/${ppId}/release`)
}

export function getProjectSnapshots(id) {
  return api.get(`/projects/${id}/snapshots`)
}

export function createProjectSnapshot(id, data) {
  return api.post(`/projects/${id}/snapshots`, data)
}

export function restoreProjectSnapshot(id, snapshotId) {
  return api.post(`/projects/${id}/snapshots/${snapshotId}/restore`)
}

export function deleteProjectSnapshot(id, snapshotId) {
  return api.delete(`/projects/${id}/snapshots/${snapshotId}`)
}
