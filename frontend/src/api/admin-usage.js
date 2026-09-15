import { api } from '../stores/auth'

export function getUsageStats(params = {}) {
  return api.get('/admin/usage-stats', { params })
}

export function getUsageEffectiveness(params = {}) {
  return api.get('/admin/usage-effectiveness', { params })
}

export function getUsageEfficiency(params = {}) {
  return api.get('/admin/usage-efficiency', { params })
}

export function createEfficiencyComparison(payload) {
  return api.post('/admin/usage-efficiency/comparisons', payload)
}

export function updateEfficiencyComparison(id, payload) {
  return api.put(`/admin/usage-efficiency/comparisons/${id}`, payload)
}
