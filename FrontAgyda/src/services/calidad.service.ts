import { api } from '@/lib/axios'

export interface CalidadPorAgente {
  agenteId: number
  promedio: number
  count: number
}

export interface CalidadDashboard {
  evaluacionesMes: number
  promedioQa: number
  porAgente: CalidadPorAgente[]
}

export interface Evaluacion {
  id: number
  agenteId: number
  puntaje: number
  comentarios: string | null
  fecha: string
}

export const calidadService = {
  async getDashboard(): Promise<CalidadDashboard> {
    const { data } = await api.get('/calidad/dashboard')
    return data.data
  },

  async getEvaluaciones(): Promise<Evaluacion[]> {
    const { data } = await api.get('/calidad/evaluaciones')
    return data.data
  },

  async createEvaluacion(payload: Partial<Evaluacion>): Promise<Evaluacion> {
    const { data } = await api.post('/calidad/evaluaciones', payload)
    return data.data
  },
}
