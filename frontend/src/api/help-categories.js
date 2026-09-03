import { api } from '../stores/auth'

export function getHelpCategories(params = {}) {
  return api.get('/help-categories', { params })
}

export function createHelpCategory(data) {
  return api.post('/help-categories', data)
}

export function updateHelpCategory(id, data) {
  return api.put(`/help-categories/${id}`, data)
}

export function updateHelpCategoryDocuments(id, documentSlugs) {
  return api.put(`/help-categories/${id}/documents`, { documentSlugs })
}

export function archiveHelpCategory(id) {
  return api.post(`/help-categories/${id}/archive`)
}

export function restoreHelpCategory(id) {
  return api.post(`/help-categories/${id}/restore`)
}
