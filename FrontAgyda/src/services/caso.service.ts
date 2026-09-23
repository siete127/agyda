import { api } from '@/lib/axios'
import {
  type Caso, type CasoComentario, type CasoEvidencia, type CasoAccionCorrectiva,
  type CasoTipo, type CasoPrioridad, type CasoEstatus,
  parseCaso, parseCasoComentario, parseCasoEvidencia, parseCasoAccionCorrectiva,
} from '@/types/caso.types'

const norm = <T>(data: unknown, parse: (r: Record<string, unknown>) => T): T[] => {
  const arr = Array.isArray(data) ? data : ((data as any)?.data ?? [])
  return (arr as Record<string, unknown>[]).map(parse)
}

export interface NuevoCasoBody {
  tipo: CasoTipo
  titulo: string
  descripcion?: string
  contactoId?: number
  clienteNombreLibre?: string
  categoria?: string
  referencia?: string
  prioridad?: CasoPrioridad
  asignadoA?: number
  origen?: string
}

export const casoService = {
  getAll: async (filtros?: { tipo?: CasoTipo; estatus?: CasoEstatus; prioridad?: CasoPrioridad; contactoId?: number }): Promise<Caso[]> => {
    const { data } = await api.get('/atencion-cliente/casos', { params: filtros })
    return norm(data?.data ?? data, parseCaso)
  },
  getByContacto: async (contactoId: number): Promise<Caso[]> => {
    const { data } = await api.get(`/atencion-cliente/clientes/${contactoId}/casos`)
    return norm(data?.data ?? data, parseCaso)
  },
  getById: async (id: number): Promise<Caso> => {
    const { data } = await api.get(`/atencion-cliente/casos/${id}`)
    return parseCaso(data?.data ?? data)
  },
  create: (body: NuevoCasoBody) => api.post('/atencion-cliente/casos', body).then((r) => r.data),
  updateEstatus: (id: number, estatus: CasoEstatus) =>
    api.patch(`/atencion-cliente/casos/${id}/estatus`, { estatus }).then((r) => r.data),
  updateSolucion: (id: number, body: { solucionPropuesta?: string; fechaCompromiso?: string }) =>
    api.patch(`/atencion-cliente/casos/${id}/solucion`, body).then((r) => r.data),
  remove: (id: number) => api.delete(`/atencion-cliente/casos/${id}`).then((r) => r.data),

  getComentarios: async (casoId: number): Promise<CasoComentario[]> => {
    const { data } = await api.get(`/atencion-cliente/casos/${casoId}/comentarios`)
    return norm(data?.data ?? data, parseCasoComentario)
  },
  addComentario: (casoId: number, comentario: string) =>
    api.post(`/atencion-cliente/casos/${casoId}/comentarios`, { comentario }).then((r) => r.data),

  getEvidencias: async (casoId: number): Promise<CasoEvidencia[]> => {
    const { data } = await api.get(`/atencion-cliente/casos/${casoId}/evidencias`)
    return norm(data?.data ?? data, parseCasoEvidencia)
  },
  subirEvidencia: (casoId: number, file: File, descripcion?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (descripcion) form.append('descripcion', descripcion)
    return api.post(`/atencion-cliente/casos/${casoId}/evidencias`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  downloadEvidencia: async (evidenciaId: number, filename: string) => {
    const { data } = await api.get(`/atencion-cliente/casos/evidencias/${evidenciaId}/download`, { responseType: 'blob' })
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
    api.delete(`/atencion-cliente/casos/evidencias/${evidenciaId}`).then((r) => r.data),

  getAccionCorrectiva: async (casoId: number): Promise<CasoAccionCorrectiva | null> => {
    const { data } = await api.get(`/atencion-cliente/casos/${casoId}/accion-correctiva`)
    const raw = data?.data ?? data
    return raw ? parseCasoAccionCorrectiva(raw) : null
  },
  createAccionCorrectiva: (casoId: number, body: { descripcion: string; responsable: string; fechaCompromiso: string; estado?: string }) =>
    api.post(`/atencion-cliente/casos/${casoId}/accion-correctiva`, body).then((r) => r.data),
}
