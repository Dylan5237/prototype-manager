import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getAnnouncements, markAnnouncementRead } from '../api/announcements'

export const useAnnouncementStore = defineStore('announcements', () => {
  const announcements = ref([])
  const loading = ref(false)
  const loaded = ref(false)
  const openAnnouncementId = ref('')

  const unread = computed(() => announcements.value.filter(item => !item.is_read))
  const unreadCount = computed(() => unread.value.length)

  async function load(force = false) {
    if (loaded.value && !force) return announcements.value
    loading.value = true
    try {
      const res = await getAnnouncements({ limit: 50 })
      announcements.value = res.data.data || []
      loaded.value = true
      return announcements.value
    } finally {
      loading.value = false
    }
  }

  async function markRead(item) {
    if (!item || item.is_read) return item
    const res = await markAnnouncementRead(item.id)
    const updated = res.data.data
    const index = announcements.value.findIndex(row => row.id === item.id)
    if (index >= 0) announcements.value[index] = { ...announcements.value[index], ...updated, is_read: true }
    return updated
  }

  function reset() {
    announcements.value = []
    loaded.value = false
    openAnnouncementId.value = ''
  }

  function requestOpen(id) {
    openAnnouncementId.value = id
  }

  function clearOpenRequest() {
    openAnnouncementId.value = ''
  }

  return { announcements, loading, loaded, unread, unreadCount, openAnnouncementId, load, markRead, requestOpen, clearOpenRequest, reset }
})
