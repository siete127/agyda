import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type EstatusManual = 'on_track' | 'at_risk' | 'off_track'
export type TipoKr = 'numerico' | 'porcentaje' | 'moneda' | 'booleano' | 'milestone'
export type Nivel = 'empresa' | 'departamento' | 'equipo' | 'individual'

export interface Colaborador {
  id: number
  nombre: string
}

export interface Milestone {
  id: number
  titulo: string
  completado: boolean
  orden: number
}

export interface ResultadoClave {
  id: number
  objetivoId: number
  titulo: string
  valorActual: number
  meta: number
  unidad: string | null
  orden: number
  tipo: TipoKr
  peso: number
  responsableId: number | null
  progreso: number
  milestones?: Milestone[]
}

export interface ObjetivoEstrategico {
  id: number
  titulo: string
  descripcion: string | null
  periodo: string
  responsableId: number | null
  estatus: string
  estatusManual: EstatusManual
  nivel: Nivel
  objetivoPadreId: number | null
  objetivoPadreTitulo: string | null
  createdAt: string
  updatedAt: string
  progreso: number
  resultadosClave: ResultadoClave[]
  colaboradores: Colaborador[]
  etiquetas: string[]
}

export interface KrCheckin {
  id: number
  valorAnterior: number
  valorNuevo: number
  comentario: string | null
  autorId: number | null
  autorNombre: string | null
  fecha: string
}

export interface Comentario {
  id: number
  objetivoId: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface Evidencia {
  id: number
  krId: number
  usuarioId: number | null
  autorNombre: string | null
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface CrearObjetivoInput {
  titulo: string
  descripcion?: string
  periodo?: string
  responsableId?: number
  objetivoPadreId?: number | null
  nivel?: Nivel
  colaboradores?: number[]
  etiquetas?: string[]
}

export interface ActualizarObjetivoInput {
  titulo: string
  descripcion?: string
  estatus?: string
  estatusManual?: EstatusManual
  nivel?: Nivel
  responsableId?: number | null
  objetivoPadreId?: number | null
  colaboradores?: number[]
  etiquetas?: string[]
}

export interface CrearResultadoClaveInput {
  titulo: string
  meta: number
  unidad?: string
  orden?: number
  tipo?: TipoKr
  peso?: number
  responsableId?: number
}

export interface ActualizarResultadoClaveInput {
  titulo: string
  valorActual: number
  meta: number
  unidad?: string
  tipo?: TipoKr
  peso?: number
  responsableId?: number | null
  comentario?: string
}

export const planeacionEstrategicaService = {
  async getObjetivos(periodo?: string): Promise<ObjetivoEstrategico[]> {
    const { data } = await api.get('/direccion-general/planeacion/objetivos', { params: { periodo } })
    return data.data
  },

  async crearObjetivo(input: CrearObjetivoInput): Promise<{ id: number }> {
    const { data } = await api.post('/direccion-general/planeacion/objetivos', input)
    return data.data
  },

  async actualizarObjetivo(id: number, input: ActualizarObjetivoInput): Promise<void> {
    await api.put(`/direccion-general/planeacion/objetivos/${id}`, input)
  },

  async actualizarEstatusManual(id: number, estatusManual: EstatusManual): Promise<void> {
    await api.put(`/direccion-general/planeacion/objetivos/${id}/estatus-manual`, { estatusManual })
  },

  async eliminarObjetivo(id: number): Promise<void> {
    await api.delete(`/direccion-general/planeacion/objetivos/${id}`)
  },

  async crearResultadoClave(objetivoId: number, input: CrearResultadoClaveInput): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/planeacion/objetivos/${objetivoId}/resultados`, input)
    return data.data
  },

  async actualizarResultadoClave(id: number, input: ActualizarResultadoClaveInput): Promise<void> {
    await api.put(`/direccion-general/planeacion/resultados/${id}`, input)
  },

  async eliminarResultadoClave(id: number): Promise<void> {
    await api.delete(`/direccion-general/planeacion/resultados/${id}`)
  },

  async getKrCheckins(krId: number): Promise<KrCheckin[]> {
    const { data } = await api.get(`/direccion-general/planeacion/resultados/${krId}/checkins`)
    return data.data
  },

  async listMilestones(krId: number): Promise<Milestone[]> {
    const { data } = await api.get(`/direccion-general/planeacion/resultados/${krId}/milestones`)
    return data.data
  },

  async crearMilestone(krId: number, titulo: string, orden?: number): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/planeacion/resultados/${krId}/milestones`, { titulo, orden })
    return data.data
  },

  async actualizarMilestone(milestoneId: number, titulo: string, completado: boolean): Promise<void> {
    await api.put(`/direccion-general/planeacion/milestones/${milestoneId}`, { titulo, completado })
  },

  async eliminarMilestone(milestoneId: number): Promise<void> {
    await api.delete(`/direccion-general/planeacion/milestones/${milestoneId}`)
  },

  async getComentarios(objetivoId: number): Promise<Comentario[]> {
    const { data } = await api.get(`/direccion-general/planeacion/objetivos/${objetivoId}/comentarios`)
    return data.data
  },

  async crearComentario(objetivoId: number, texto: string): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/planeacion/objetivos/${objetivoId}/comentarios`, { texto })
    return data.data
  },

  async eliminarComentario(id: number): Promise<void> {
    await api.delete(`/direccion-general/planeacion/comentarios/${id}`)
  },

  async getEvidencias(krId: number): Promise<Evidencia[]> {
    const { data } = await api.get(`/direccion-general/planeacion/resultados/${krId}/evidencias`)
    return data.data
  },

  async subirEvidencias(krId: number, files: File[]): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('evidencias', f))
    const { data } = await api.post(`/direccion-general/planeacion/resultados/${krId}/evidencias`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarEvidencia(id: number): Promise<void> {
    await api.delete(`/direccion-general/planeacion/evidencias/${id}`)
  },

  verEvidenciaUrl(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/direccion-general/planeacion/evidencias/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async exportarPdf(periodo?: string): Promise<Blob> {
    const { data } = await api.get('/direccion-general/planeacion/export/pdf', {
      params: { periodo },
      responseType: 'blob',
    })
    return data
  },
}
