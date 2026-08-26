import { api } from '@/lib/axios'

export interface VentasAreaDashboard {
  metasDefinidas: number
  metaMontoTotal: number
}

export interface MetaVenta {
  id: number
  asesorId: number
  asesorNombre: string
  periodo: string
  metaMonto: number
  metaUnidades: number
  avanceUnidades: number
}

export interface AsesorVentas {
  id: number
  nombre: string
}

export interface CrearMetaVentaPayload {
  asesorId: number
  periodo: string
  metaMonto?: number
  metaUnidades?: number
}

export const ventasAreaService = {
  async getDashboard(periodo?: string): Promise<VentasAreaDashboard> {
    const { data } = await api.get('/ventas-area/dashboard', { params: periodo ? { periodo } : {} })
    return data.data
  },

  async getMetas(periodo?: string): Promise<MetaVenta[]> {
    const { data } = await api.get('/ventas-area/metas', { params: periodo ? { periodo } : {} })
    return data.data
  },

  async createMeta(payload: CrearMetaVentaPayload): Promise<void> {
    await api.post('/ventas-area/metas', payload)
  },

  async eliminarMeta(id: number): Promise<void> {
    await api.delete(`/ventas-area/metas/${id}`)
  },

  async getAsesores(): Promise<AsesorVentas[]> {
    const { data } = await api.get('/ventas-area/asesores')
    return data.data
  },
}
