import { api } from '@/lib/axios'
import type { NotificationItem } from '@/stores/notification.store'

const getUserId = () => {
  try {
    const raw = localStorage.getItem('auth-store')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.user?.id ?? null
  } catch {
    return null
  }
}

export const notificationService = {
  async getNotifications(usuarioId: number): Promise<NotificationItem[]> {
    const { data } = await api.get(`/notificaciones/user/${usuarioId}`, { params: { limit: 30 } })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return list as NotificationItem[]
  },

  async markAsRead(id: number): Promise<void> {
    await api.post(`/notificaciones/mark/${id}`)
  },

  async markAllAsRead(): Promise<void> {
    const uid = getUserId()
    if (uid) await api.post(`/notificaciones/mark-all/${uid}`)
  },
}
