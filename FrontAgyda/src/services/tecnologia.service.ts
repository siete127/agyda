import { api } from '@/lib/axios'

export interface TecnologiaPorSeveridad {
  severidad: string
  count: number
}

export interface TecnologiaDashboard {
  incidentesAbiertos: number
  mantenimientosMes: number
  porSeveridad: TecnologiaPorSeveridad[]
}

export interface Mantenimiento {
  id: number
  equipo: string
  tipo: string
  fecha: string
}

export interface Incidente {
  id: number
  titulo: string
  severidad: string
  estado: string
}

export const tecnologiaService = {
  async getDashboard(): Promise<TecnologiaDashboard> {
    const { data } = await api.get('/tecnologia/dashboard')
    return data.data
  },

  async getMantenimientos(): Promise<Mantenimiento[]> {
    const { data } = await api.get('/tecnologia/mantenimientos')
    return data.data
  },

  async createMantenimiento(payload: Partial<Mantenimiento>): Promise<Mantenimiento> {
    const { data } = await api.post('/tecnologia/mantenimientos', payload)
    return data.data
  },

  async getIncidentes(): Promise<Incidente[]> {
    const { data } = await api.get('/tecnologia/incidentes')
    return data.data
  },

  async createIncidente(payload: Partial<Incidente>): Promise<Incidente> {
    const { data } = await api.post('/tecnologia/incidentes', payload)
    return data.data
  },
}
