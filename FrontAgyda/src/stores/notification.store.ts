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
    set((s) => ({
      notifications: [item, ...s.notifications],
      unreadCount: !item.leida ? s.unreadCount + 1 : s.unreadCount,
    })),

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
