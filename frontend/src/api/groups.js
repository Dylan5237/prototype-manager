import { api } from '../stores/auth'

export function getGroups() {
  return api.get('/groups')
}

export function getGroup(id) {
  return api.get(`/groups/${id}`)
}

export function createGroup(data) {
  return api.post('/groups', data)
}

export function updateGroup(id, data) {
  return api.put(`/groups/${id}`, data)
}

export function deleteGroup(id) {
  return api.delete(`/groups/${id}`)
}
