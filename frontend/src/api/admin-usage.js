import { api } from '../stores/auth'

export function getUsageStats(params = {}) {
  return api.get('/admin/usage-stats', { params })
}
