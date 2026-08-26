import { api } from '@/lib/axios'

export interface RHPorEtapa {
  etapa: string
  count: number
}

export interface RHAreaDashboard {
  vacantesAbiertas: number
  candidatosActivos: number
  porEtapa: RHPorEtapa[]
}

export interface Vacante {
  id: number
  puesto: string
  area: string
  estado: string
}

export interface Candidato {
  id: number
  nombre: string
  vacanteId: number
  etapa: string
}

export const rhAreaService = {
  async getDashboard(): Promise<RHAreaDashboard> {
    const { data } = await api.get('/rh-area/dashboard')
    return data.data
  },

  async getVacantes(): Promise<Vacante[]> {
    const { data } = await api.get('/rh-area/vacantes')
    return data.data
  },

  async createVacante(payload: Partial<Vacante>): Promise<Vacante> {
    const { data } = await api.post('/rh-area/vacantes', payload)
    return data.data
  },

  async getCandidatos(): Promise<Candidato[]> {
    const { data } = await api.get('/rh-area/candidatos')
    return data.data
  },

  async createCandidato(payload: Partial<Candidato>): Promise<Candidato> {
    const { data } = await api.post('/rh-area/candidatos', payload)
    return data.data
  },
}
