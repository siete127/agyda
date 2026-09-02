import { create } from 'zustand'

export interface NotificationItem {
  id: number
  usuarioId: number
  mensaje: string
  tipo: string | null
  leida: boolean
  fecha: string | null
  dataExtra?: Record<string, unknown> | null
}

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number
  isLoading: boolean
  ticketAlerts: NotificationItem[]
  setNotifications: (items: NotificationItem[]) => void
  addNotification: (item: NotificationItem) => void
  markAsRead: (id: number) => void
  markAllAsRead: () => void
  setLoading: (v: boolean) => void
  pushTicketAlert: (item: NotificationItem) => void
  dismissTicketAlert: (id: number) => void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  ticketAlerts: [],

  setNotifications: (items) =>
    set({ notifications: items, unreadCount: items.filter((n) => !n.leida).length }),

  addNotification: (item) =>
    set((s) => {
      const key = (item.dataExtra as { dedupeKey?: string } | null)?.dedupeKey
      // Si llega una actualización de una notificación agrupada (mismo id, o
      // mismo dedupeKey de una conversación aún sin leer), se reemplaza en su
      // lugar en vez de apilar otra — una notificación por conversación.
      const idx = s.notifications.findIndex((n) =>
        n.id === item.id ||
        (!!key && !n.leida && (n.dataExtra as { dedupeKey?: string } | null)?.dedupeKey === key),
      )
      if (idx !== -1) {
        const anterior = s.notifications[idx]
        const notifications = [...s.notifications]
        notifications.splice(idx, 1)
        // La conversación actualizada sube al principio de la lista.
        return {
          notifications: [{ ...item, id: anterior.id }, ...notifications],
          // el contador no cambia: seguía sin leer y sigue sin leer
          unreadCount: !anterior.leida ? s.unreadCount : (!item.leida ? s.unreadCount + 1 : s.unreadCount),
        }
      }
      return {
        notifications: [item, ...s.notifications],
        unreadCount: !item.leida ? s.unreadCount + 1 : s.unreadCount,
      }
    }),

  markAsRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, leida: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),

  markAllAsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, leida: true })),
      unreadCount: 0,
    })),

  setLoading: (v) => set({ isLoading: v }),

  pushTicketAlert: (item) =>
    set((s) => ({ ticketAlerts: [...s.ticketAlerts, item] })),

  dismissTicketAlert: (id) =>
    set((s) => ({ ticketAlerts: s.ticketAlerts.filter((a) => a.id !== id) })),
}))
