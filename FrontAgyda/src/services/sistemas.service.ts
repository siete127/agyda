import { api } from '@/lib/axios'
import type { Sistema, IncidenteSistema } from '@/types/sistemas.types'

export const sistemasService = {
  async getSistemas(): Promise<Sistema[]> {
    const { data } = await api.get('/tecnologia/sistemas')
    return (data?.data ?? []) as Sistema[]
  },

  async crearSistema(payload: { nombre: string; descripcion?: string; url?: string; notas?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/sistemas', payload)
    return data?.data
  },

  async actualizarSistema(id: number, payload: { nombre: string; descripcion?: string; url?: string; estado?: string; notas?: string }): Promise<void> {
    await api.put(`/tecnologia/sistemas/${id}`, payload)
  },

  async eliminarSistema(id: number): Promise<void> {
    await api.delete(`/tecnologia/sistemas/${id}`)
  },

  async getIncidentes(): Promise<IncidenteSistema[]> {
    const { data } = await api.get('/tecnologia/incidentes-sistema')
    return (data?.data ?? []) as IncidenteSistema[]
  },

  async crearIncidente(payload: { sistemaId?: number; tipo?: string; descripcion?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/tecnologia/incidentes-sistema', payload)
    return data?.data
  },

  async resolverIncidente(id: number): Promise<void> {
    await api.patch(`/tecnologia/incidentes-sistema/${id}/resolver`)
  },
}
