import { api } from '../stores/auth'

export function getPromptTemplates() {
  return api.get('/prompt-templates')
}

export function updatePromptTemplate(key, data) {
  return api.put(`/prompt-templates/${encodeURIComponent(key)}`, data)
}

export function previewPromptTemplate(key, data = {}) {
  return api.post(`/prompt-templates/${encodeURIComponent(key)}/preview`, data)
}

export function resetPromptTemplate(key) {
  return api.post(`/prompt-templates/${encodeURIComponent(key)}/reset`)
}

export function renderPromptTemplate(key, variables) {
  return api.post('/prompt-templates/render', { key, variables })
}
