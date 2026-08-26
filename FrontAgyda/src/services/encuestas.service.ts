import { api } from '@/lib/axios'
import { parseEncuesta, parseResultadosSeparados, type Encuesta, type ResultadosSeparados, type ResponderPayload } from '@/types/encuesta.types'

function unwrapList(data: unknown): Record<string, unknown>[] {
  const root = data as { data?: unknown; encuestas?: unknown }
  const list = Array.isArray(data) ? data : (root?.data ?? root?.encuestas ?? [])
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : []
}

export const encuestasService = {
  async getAll(): Promise<Encuesta[]> {
    const { data } = await api.get('/encuestas')
    return unwrapList(data).map(parseEncuesta)
  },

  async getById(id: number): Promise<Encuesta> {
    const { data } = await api.get(`/encuestas/${id}`)
    return parseEncuesta((data?.data ?? data) as Record<string, unknown>)
  },

  async create(payload: Record<string, unknown>) {
    const { data } = await api.post('/encuestas', payload)
    return data as { success: boolean; encuestaId: number; tipoAcceso: string; slugPublico: string | null }
  },

  async update(id: number, payload: Record<string, unknown>) {
    const { data } = await api.put(`/encuestas/${id}`, payload)
    return data
  },

  async remove(id: number) {
    const { data } = await api.delete(`/encuestas/${id}`)
    return data
  },

  async duplicar(id: number, titulo?: string) {
    const { data } = await api.post(`/encuestas/${id}/duplicar`, titulo ? { titulo } : {})
    return data as { success: boolean; encuestaId: number; tipoAcceso: string; slugPublico: string | null }
  },

  async asignarPorArea(id: number, area: string, asignadoPor?: number) {
    const { data } = await api.post(`/encuestas/${id}/asignar-area`, { area, asignadoPor })
    return data as { asignados?: number; total?: number }
  },

  async cambiarEstado(id: number, nuevoEstado: string) {
    const { data } = await api.put(`/encuestas/${id}/estado`, { nuevoEstado })
    return data
  },

  async getMisPendientes(usuarioId: number): Promise<Encuesta[]> {
    const { data } = await api.get(`/encuestas/usuario/${usuarioId}`)
    return unwrapList(data).map(parseEncuesta)
  },

  async getMisCompletadas(usuarioId: number): Promise<Encuesta[]> {
    const { data } = await api.get(`/encuestas/completadas/${usuarioId}`)
    return unwrapList(data).map(parseEncuesta)
  },

  async responder(encuestaId: number, asignacionId: number | null, payload: ResponderPayload) {
    const { data } = await api.post('/encuestas/responder', {
      encuestaId,
      asignacionId,
      respuestas: payload.respuestas,
    })
    return data
  },

  async getResultadosSeparados(id: number): Promise<ResultadosSeparados> {
    const { data } = await api.get(`/encuestas/${id}/resultados-separados`)
    return parseResultadosSeparados(data)
  },

  async getDashboardResumen() {
    const { data } = await api.get('/encuestas/dashboard/resumen')
    return data
  },
}
