import { api } from '@/lib/axios'
import type { AreaPausa, EspacioPausa, PausaTipo, PausaTipoPayload } from '@/types/pausaTipos.types'

export const pausaTiposService = {
  async list(): Promise<PausaTipo[]> {
    const { data } = await api.get('/pausa-tipos')
    return (data?.data ?? []) as PausaTipo[]
  },

  async create(payload: PausaTipoPayload): Promise<PausaTipo> {
    const { data } = await api.post('/pausa-tipos', payload)
    return data.data as PausaTipo
  },

  async update(statusId: number, payload: PausaTipoPayload): Promise<PausaTipo> {
    const { data } = await api.put(`/pausa-tipos/${statusId}`, payload)
    return data.data as PausaTipo
  },

  async remove(statusId: number): Promise<void> {
    await api.delete(`/pausa-tipos/${statusId}`)
  },

  async updateEspacios(statusId: number, espacios: EspacioPausa[]): Promise<PausaTipo> {
    const { data } = await api.put(`/pausa-tipos/${statusId}/espacios`, { espacios })
    return data.data as PausaTipo
  },

  async areas(): Promise<AreaPausa[]> {
    const { data } = await api.get('/pausa-tipos/areas')
    return (data?.data ?? []) as AreaPausa[]
  },
}
