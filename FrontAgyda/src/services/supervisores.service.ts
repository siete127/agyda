import { api } from '@/lib/axios'
import type { SupervisorAsignacion, PanelSupervisor, ProductividadAgente } from '@/types/supervisores.types'

export const supervisoresService = {
  async getAsignaciones(): Promise<SupervisorAsignacion[]> {
    const { data } = await api.get('/operaciones/supervisores')
    return (data?.data ?? []) as SupervisorAsignacion[]
  },

  async asignar(campaniaId: number, supervisorId: number): Promise<void> {
    await api.post('/operaciones/supervisores', { campaniaId, supervisorId })
  },

  async quitar(id: number): Promise<void> {
    await api.delete(`/operaciones/supervisores/${id}`)
  },

  async getMiPanel(): Promise<PanelSupervisor> {
    const { data } = await api.get('/operaciones/supervisores/mi-panel')
    return data?.data ?? { campanias: [], agentes: [] }
  },

  async getProductividad(fecha?: string): Promise<ProductividadAgente[]> {
    const { data } = await api.get('/operaciones/supervisores/productividad', { params: fecha ? { fecha } : {} })
    return (data?.data ?? []) as ProductividadAgente[]
  },
}
