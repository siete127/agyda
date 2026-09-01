import { api } from '@/lib/axios'

export interface VentasAreaDashboard {
  metasDefinidas: number
  metaMontoTotal: number
}

export type MetaTipo = 'mensual' | 'diaria'
export type MetaAlcance = 'asesor' | 'campana'

export interface MetaVenta {
  id: number
  asesorId: number
  asesorNombre: string | null
  periodo: string
  metaMonto: number
  metaUnidades: number
  avanceUnidades: number
  campanaId: number | null
  campanaNombre: string | null
  tipo: MetaTipo
  alcance: MetaAlcance
}

/** Metas de HOY del usuario autenticado — para la card del Inicio. */
export interface MiMeta {
  id: number
  alcance: MetaAlcance
  campanaId: number | null
  campanaNombre: string | null
  metaUnidades: number
  avanceUnidades: number
}

export interface AsesorVentas {
  id: number
  nombre: string
}

export interface CampanaVentas {
  id: number
  nombre: string
}

export interface CrearMetaVentaPayload {
  asesorId?: number
  campanaId?: number
  periodo: string
  /** Solo para tipo 'diaria': si viene, la meta se replica en cada día de [periodo..periodoFin]. */
  periodoFin?: string
  tipo: MetaTipo
  alcance: MetaAlcance
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

  async getCampanas(): Promise<CampanaVentas[]> {
    const { data } = await api.get('/ventas-area/campanas')
    return data.data
  },

  async getMisMetas(): Promise<MiMeta[]> {
    const { data } = await api.get('/ventas-area/mis-metas')
    return data.data ?? []
  },
}
