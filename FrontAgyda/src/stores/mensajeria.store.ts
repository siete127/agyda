import { create } from 'zustand'
import type { MensajeriaCanal } from '@/types/mensajeria.types'

const MAX_CHATS_ABIERTOS = 3

interface MensajeriaState {
  canales: MensajeriaCanal[]
  unreadTotal: number
  unreadByCanal: Record<number, number>
  canalAbiertoId: number | null
  chatsAbiertos: number[]
  minimizados: Record<number, boolean>
  chatsFlotantes: number[]
  minimizadosFlotantes: Record<number, boolean>
  setCanales: (canales: MensajeriaCanal[]) => void
  setUnreadByCanal: (map: Record<number, number>) => void
  incrementUnread: (canalId: number) => void
  clearUnread: (canalId: number) => void
  setCanalAbiertoId: (id: number | null) => void
  abrirChat: (canalId: number) => void
  cerrarChat: (canalId: number) => void
  minimizarChat: (canalId: number) => void
  restaurarChat: (canalId: number) => void
  abrirChatFlotante: (canalId: number) => void
  cerrarChatFlotante: (canalId: number) => void
  minimizarChatFlotante: (canalId: number) => void
  restaurarChatFlotante: (canalId: number) => void
}

function sumUnread(map: Record<number, number>): number {
  return Object.values(map).reduce((acc, n) => acc + n, 0)
}

export const useMensajeriaStore = create<MensajeriaState>()((set) => ({
  canales: [],
  unreadTotal: 0,
  unreadByCanal: {},
  canalAbiertoId: null,
  chatsAbiertos: [],
  minimizados: {},
  chatsFlotantes: [],
  minimizadosFlotantes: {},

  setCanales: (canales) => {
    const unreadByCanal = Object.fromEntries(canales.map((c) => [c.id, c.noLeidos]))
    set({ canales, unreadByCanal, unreadTotal: sumUnread(unreadByCanal) })
  },

  setUnreadByCanal: (map) => set({ unreadByCanal: map, unreadTotal: sumUnread(map) }),

  incrementUnread: (canalId) =>
    set((s) => {
      const unreadByCanal = { ...s.unreadByCanal, [canalId]: (s.unreadByCanal[canalId] ?? 0) + 1 }
      return { unreadByCanal, unreadTotal: sumUnread(unreadByCanal) }
    }),

  clearUnread: (canalId) =>
    set((s) => {
      const unreadByCanal = { ...s.unreadByCanal, [canalId]: 0 }
      return { unreadByCanal, unreadTotal: sumUnread(unreadByCanal) }
    }),

  setCanalAbiertoId: (id) => set({ canalAbiertoId: id }),

  abrirChat: (canalId) =>
    set((s) => {
      const minimizados = { ...s.minimizados, [canalId]: false }
      if (s.chatsAbiertos.includes(canalId)) {
        return { chatsAbiertos: s.chatsAbiertos, minimizados, canalAbiertoId: canalId }
      }
      const chatsAbiertos = [...s.chatsAbiertos, canalId].slice(-MAX_CHATS_ABIERTOS)
      return { chatsAbiertos, minimizados, canalAbiertoId: canalId }
    }),

  cerrarChat: (canalId) =>
    set((s) => {
      const chatsAbiertos = s.chatsAbiertos.filter((id) => id !== canalId)
      const minimizados = { ...s.minimizados }
      delete minimizados[canalId]
      const canalAbiertoId = s.canalAbiertoId === canalId ? (chatsAbiertos[chatsAbiertos.length - 1] ?? null) : s.canalAbiertoId
      return { chatsAbiertos, minimizados, canalAbiertoId }
    }),

  minimizarChat: (canalId) =>
    set((s) => ({ minimizados: { ...s.minimizados, [canalId]: true } })),

  restaurarChat: (canalId) =>
    set((s) => ({ minimizados: { ...s.minimizados, [canalId]: false }, canalAbiertoId: canalId })),

  abrirChatFlotante: (canalId) =>
    set((s) => {
      const minimizadosFlotantes = { ...s.minimizadosFlotantes, [canalId]: false }
      if (s.chatsFlotantes.includes(canalId)) {
        return { minimizadosFlotantes }
      }
      const chatsFlotantes = [...s.chatsFlotantes, canalId].slice(-MAX_CHATS_ABIERTOS)
      return { chatsFlotantes, minimizadosFlotantes }
    }),

  cerrarChatFlotante: (canalId) =>
    set((s) => {
      const chatsFlotantes = s.chatsFlotantes.filter((id) => id !== canalId)
      const minimizadosFlotantes = { ...s.minimizadosFlotantes }
      delete minimizadosFlotantes[canalId]
      return { chatsFlotantes, minimizadosFlotantes }
    }),

  minimizarChatFlotante: (canalId) =>
    set((s) => ({ minimizadosFlotantes: { ...s.minimizadosFlotantes, [canalId]: true } })),

  restaurarChatFlotante: (canalId) =>
    set((s) => ({ minimizadosFlotantes: { ...s.minimizadosFlotantes, [canalId]: false } })),
}))
