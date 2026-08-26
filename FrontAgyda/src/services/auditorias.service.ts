import { api } from '@/lib/axios'
import type { Auditoria, AuditoriaDetalle, CrearAuditoriaPayload, VeredictoAuditoria } from '@/types/auditorias.types'

export const auditoriasService = {
  async listAll(): Promise<Auditoria[]> {
    const { data } = await api.get('/calidad/auditorias')
    return (data?.data ?? []) as Auditoria[]
  },

  async get(id: number): Promise<AuditoriaDetalle> {
    const { data } = await api.get(`/calidad/auditorias/${id}`)
    return data?.data as AuditoriaDetalle
  },

  async crear(payload: CrearAuditoriaPayload): Promise<number> {
    const { data } = await api.post('/calidad/auditorias', payload)
    return data?.data?.id as number
  },

  async agregarRegistro(auditoriaId: number, registroId: number): Promise<void> {
    await api.post(`/calidad/auditorias/${auditoriaId}/registros`, { registroId })
  },

  async quitarRegistro(auditoriaId: number, registroId: number): Promise<void> {
    await api.delete(`/calidad/auditorias/${auditoriaId}/registros/${registroId}`)
  },

  async cerrar(id: number, veredicto: VeredictoAuditoria, hallazgos?: string): Promise<void> {
    await api.patch(`/calidad/auditorias/${id}/cerrar`, { veredicto, hallazgos })
  },

  async eliminar(id: number): Promise<void> {
    await api.delete(`/calidad/auditorias/${id}`)
  },
}
