import { api } from '@/lib/axios'

export interface AtencionClienteDashboard {
  clientesEnRiesgo: number
  totalEvaluados: number
}

export interface Retencion {
  id: number
  clienteId: number
  riesgo: string
  accion: string | null
  fecha: string
}

export const atencionClienteService = {
  async getDashboard(): Promise<AtencionClienteDashboard> {
    const { data } = await api.get('/atencion-cliente/dashboard')
    return data.data
  },

  async getRetencion(): Promise<Retencion[]> {
    const { data } = await api.get('/atencion-cliente/retencion')
    return data.data
  },

  async createRetencion(payload: Partial<Retencion>): Promise<Retencion> {
    const { data } = await api.post('/atencion-cliente/retencion', payload)
    return data.data
  },
}
