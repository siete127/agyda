import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Venta } from '@/types/ventas.types'

/* Notificaciones de ventas nuevas (aprobadas / rechazadas). El watcher global
   hace polling y empuja aquí las que no habíamos visto; VentaAlertWatcher las
   muestra (con sonido) y el panel del topbar las lista. */

export interface VentaNotif {
  id: number            // id de la venta
  venta: Venta
  recibidaEn: number    // Date.now() cuando la detectamos
  leida: boolean
}

interface VentasNotifState {
  /** IDs de ventas ya notificadas — evita re-notificar tras un refresh. */
  vistos: number[]
  /** Cola de notificaciones para el panel (más reciente primero). */
  items: VentaNotif[]
  /** true la primera vez que corre el watcher: sembramos `vistos` sin notificar. */
  sembrado: boolean

  sembrar: (ids: number[]) => void
  push: (ventas: Venta[]) => VentaNotif[]   // devuelve las realmente nuevas
  marcarLeidas: () => void
  marcarLeida: (id: number) => void
  limpiar: () => void
}

const MAX_ITEMS = 40
const MAX_VISTOS = 400

export const useVentasNotifStore = create<VentasNotifState>()(
  persist(
    (set, get) => ({
      vistos: [],
      items: [],
      sembrado: false,

      sembrar: (ids) => set({
        vistos: ids.slice(-MAX_VISTOS),
        sembrado: true,
      }),

      push: (ventas) => {
        const { vistos, items } = get()
        const vistosSet = new Set(vistos)
        const nuevas = ventas.filter((v) => v.id > 0 && !vistosSet.has(v.id))
        if (nuevas.length === 0) return []

        const nuevosItems: VentaNotif[] = nuevas.map((v) => ({
          id: v.id, venta: v, recibidaEn: Date.now(), leida: false,
        }))
        set({
          vistos: [...vistos, ...nuevas.map((v) => v.id)].slice(-MAX_VISTOS),
          items: [...nuevosItems, ...items].slice(0, MAX_ITEMS),
        })
        return nuevosItems
      },

      marcarLeidas: () => set((s) => ({ items: s.items.map((i) => ({ ...i, leida: true })) })),
      marcarLeida: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, leida: true } : i)) })),
      limpiar: () => set({ items: [] }),
    }),
    {
      name: 'ventas-notif-store',
      partialize: (s) => ({ vistos: s.vistos, sembrado: s.sembrado }),
    },
  ),
)
