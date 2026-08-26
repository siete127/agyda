import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Campana } from '@/types/ventas.types'

interface VentasState {
  ventasToken: string | null
  ventasRole: string | null
  ventasUserId: string | null
  ventasNombre: string | null
  ventasCampaigns: Campana[]
  activeCampaignId: number | null
  setVentasSession: (token: string, role: string, userId: string, campaigns: Campana[], nombre?: string) => void
  setActiveCampaign: (id: number) => void
  clearVentasSession: () => void
}

// Sin persist — el SSO es instantáneo, no necesitamos guardar el token entre sesiones
export const useVentasStore = create<VentasState>()((set) => ({
  ventasToken: null,
  ventasRole: null,
  ventasUserId: null,
  ventasNombre: null,
  ventasCampaigns: [],
  activeCampaignId: null,

  setVentasSession: (token, role, userId, campaigns, nombre) =>
    set({
      ventasToken: token,
      ventasRole: role,
      ventasUserId: userId,
      ventasNombre: nombre ?? null,
      ventasCampaigns: campaigns,
      activeCampaignId: campaigns[0]?.id ?? null,
    }),

  setActiveCampaign: (id) => set({ activeCampaignId: id }),

  clearVentasSession: () =>
    set({ ventasToken: null, ventasRole: null, ventasUserId: null, ventasNombre: null, ventasCampaigns: [], activeCampaignId: null }),
}))
