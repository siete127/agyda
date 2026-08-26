import { api } from '@/lib/axios'
import {
  type Incidencia, type IncidenciaComentario, type IncidenciaEvidencia, type IncidenciaPrioridad,
  type IncidenciaEstatus, type IncidenciaOrigen,
  parseIncidencia, parseIncidenciaComentario, parseIncidenciaEvidencia,
} from '@/types/incidencia.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as any)?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export const incidenciaService = {
  getAll: async (filtros?: { estatus?: IncidenciaEstatus; prioridad?: IncidenciaPrioridad; contactoId?: number }): Promise<Incidencia[]> => {
    const { data } = await api.get('/atencion-cliente/incidencias', { params: filtros })
    return norm(data?.data ?? data, parseIncidencia)
  },
  getByContacto: async (contactoId: number): Promise<Incidencia[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/incidencias`)
    return norm(data?.data ?? data, parseIncidencia)
  },
  getById: async (id: number): Promise<Incidencia> => {
    const { data } = await api.get(`/atencion-cliente/incidencias/${id}`)
    return parseIncidencia(data?.data ?? data)
  },
  create: (body: { contactoId: number; titulo: string; descripcion?: string; categoria?: string; prioridad?: IncidenciaPrioridad; asignadoA?: number; origen?: IncidenciaOrigen }) =>
    api.post('/atencion-cliente/incidencias', body).then((r) => r.data),
  updateEstatus: (id: number, estatus: IncidenciaEstatus) =>
    api.patch(`/atencion-cliente/incidencias/${id}/estatus`, { estatus }).then((r) => r.data),
  updateSolucion: (id: number, body: { solucionPropuesta?: string; fechaCompromiso?: string }) =>
    api.patch(`/atencion-cliente/incidencias/${id}/solucion`, body).then((r) => r.data),
  getComentarios: async (incidenciaId: number): Promise<IncidenciaComentario[]> => {
    const { data } = await api.get(`/atencion-cliente/incidencias/${incidenciaId}/comentarios`)
    return norm(data?.data ?? data, parseIncidenciaComentario)
  },
  addComentario: (incidenciaId: number, comentario: string) =>
    api.post(`/atencion-cliente/incidencias/${incidenciaId}/comentarios`, { comentario }).then((r) => r.data),

  // ── Evidencias (adjuntos) ──
  getEvidencias: async (incidenciaId: number): Promise<IncidenciaEvidencia[]> => {
    const { data } = await api.get(`/atencion-cliente/incidencias/${incidenciaId}/evidencias`)
    return norm(data?.data ?? data, parseIncidenciaEvidencia)
  },
  subirEvidencia: (incidenciaId: number, file: File, descripcion?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (descripcion) form.append('descripcion', descripcion)
    return api.post(`/atencion-cliente/incidencias/${incidenciaId}/evidencias`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  downloadEvidencia: async (evidenciaId: number, filename: string) => {
    const { data } = await api.get(`/atencion-cliente/incidencias/evidencias/${evidenciaId}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
  deleteEvidencia: (evidenciaId: number) =>
    api.delete(`/atencion-cliente/incidencias/evidencias/${evidenciaId}`).then((r) => r.data),
}
