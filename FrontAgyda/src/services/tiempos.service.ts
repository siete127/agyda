import { api } from '@/lib/axios'
import type { TiemposAgente, AgenteOpcion } from '@/types/tiempos.types'

export const tiemposService = {
  async getMisAgentes(): Promise<AgenteOpcion[]> {
    const { data } = await api.get('/operaciones/tiempos/mis-agentes')
    return (data?.data ?? []) as AgenteOpcion[]
  },

  async getTiempos(agenteId: number, fecha?: string): Promise<TiemposAgente> {
    const { data } = await api.get('/operaciones/tiempos', { params: { agenteId, ...(fecha ? { fecha } : {}) } })
    return data?.data as TiemposAgente
  },
}
