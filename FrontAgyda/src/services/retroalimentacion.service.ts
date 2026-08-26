import { api } from '@/lib/axios'
import type { Retroalimentacion, MiRetroalimentacion, CrearRetroalimentacionPayload } from '@/types/retroalimentacion.types'

export const retroalimentacionService = {
  async listAll(): Promise<Retroalimentacion[]> {
    const { data } = await api.get('/calidad/retroalimentacion')
    return (data?.data ?? []) as Retroalimentacion[]
  },

  async getMias(): Promise<MiRetroalimentacion[]> {
    const { data } = await api.get('/calidad/retroalimentacion/mias')
    return (data?.data ?? []) as MiRetroalimentacion[]
  },

  async crear(payload: CrearRetroalimentacionPayload): Promise<void> {
    await api.post('/calidad/retroalimentacion', payload)
  },

  async marcarVista(id: number): Promise<void> {
    await api.patch(`/calidad/retroalimentacion/${id}/vista`)
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/calidad/retroalimentacion/${id}`)
  },
}
