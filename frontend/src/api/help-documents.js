import { api } from '../stores/auth'

export function getHelpDocuments(params = {}) {
  return api.get('/help-documents', { params })
}

export function getHelpDocument(slug) {
  return api.get(`/help-documents/${encodeURIComponent(slug)}`)
}

export function updateHelpDocument(slug, data) {
  return api.put(`/help-documents/${encodeURIComponent(slug)}`, data)
}

export function updateHelpDocumentCategories(slug, categoryIds) {
  return api.put(`/help-documents/${encodeURIComponent(slug)}/categories`, { categoryIds })
}

export function previewHelpDocument(slug, data) {
  return api.post(`/help-documents/${encodeURIComponent(slug)}/preview`, data)
}

export function publishHelpDocument(slug) {
  return api.post(`/help-documents/${encodeURIComponent(slug)}/publish`)
}

export function archiveHelpDocument(slug) {
  return api.post(`/help-documents/${encodeURIComponent(slug)}/archive`)
}
