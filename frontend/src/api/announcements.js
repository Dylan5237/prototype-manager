import { api } from '../stores/auth'

export function getAnnouncements(params) {
  return api.get('/announcements', { params })
}

export function getAnnouncement(id) {
  return api.get(`/announcements/${encodeURIComponent(id)}`)
}

export function markAnnouncementRead(id) {
  return api.post(`/announcements/${encodeURIComponent(id)}/read`)
}

export function createAnnouncement(data) {
  return api.post('/announcements', data)
}

export function updateAnnouncement(id, data) {
  return api.put(`/announcements/${encodeURIComponent(id)}`, data)
}

export function archiveAnnouncement(id) {
  return api.delete(`/announcements/${encodeURIComponent(id)}`)
}
