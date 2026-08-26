import { api } from '@/lib/axios'
import type { PlanMejora, MiPlanMejora, CrearPlanMejoraPayload, EstatusPlanMejora } from '@/types/planesMejora.types'

export const planesMejoraService = {
  async listAll(estatus?: EstatusPlanMejora): Promise<PlanMejora[]> {
    const { data } = await api.get('/calidad/planes-mejora', { params: estatus ? { estatus } : {} })
    return (data?.data ?? []) as PlanMejora[]
  },

  async getMios(): Promise<MiPlanMejora[]> {
    const { data } = await api.get('/calidad/planes-mejora/mios')
    return (data?.data ?? []) as MiPlanMejora[]
  },

  async crear(payload: CrearPlanMejoraPayload): Promise<void> {
    await api.post('/calidad/planes-mejora', payload)
  },

  async actualizarEstatus(id: number, estatus: EstatusPlanMejora): Promise<void> {
    await api.patch(`/calidad/planes-mejora/${id}/estatus`, { estatus })
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/calidad/planes-mejora/${id}`)
  },
}
