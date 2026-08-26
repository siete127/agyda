import { api } from '@/lib/axios'

export interface OperacionesPorCampania {
  campania: string
  count: number
}

export interface OperacionesDashboard {
  campaniasActivas: number
  totalAsignado: number
  porCampania: OperacionesPorCampania[]
}

export interface CampaniaOperaciones {
  id: number
  nombre: string
  estado: string
}

export interface Asignacion {
  id: number
  campaniaId: number
  agenteId: number
  cantidad: number
}

export interface OperacionesKpis {
  campaniasActivas: number
  totalAsignado: number
  totalAgentes: number
  agentesActivos: number
  agentesEnPausa: number
  minutosPromedioPausa: number
}

export const operacionesService = {
  async getDashboard(): Promise<OperacionesDashboard> {
    const { data } = await api.get('/operaciones/dashboard')
    return data.data
  },

  async getKpis(): Promise<OperacionesKpis> {
    const { data } = await api.get('/operaciones/kpis')
    return data.data
  },

  async getCampanias(): Promise<CampaniaOperaciones[]> {
    const { data } = await api.get('/operaciones/campanias')
    return data.data
  },

  async createCampania(payload: Partial<CampaniaOperaciones>): Promise<CampaniaOperaciones> {
    const { data } = await api.post('/operaciones/campanias', payload)
    return data.data
  },

  async getAsignaciones(): Promise<Asignacion[]> {
    const { data } = await api.get('/operaciones/asignaciones')
    return data.data
  },

  async createAsignacion(payload: Partial<Asignacion>): Promise<Asignacion> {
    const { data } = await api.post('/operaciones/asignaciones', payload)
    return data.data
  },
}
