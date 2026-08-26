import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type CategoriaCumplimiento =
  | 'fiscal' | 'laboral' | 'ambiental' | 'proteccion_datos' | 'salud_seguridad' | 'financiero' | 'comercial' | 'otra'
export type FrecuenciaCumplimiento = 'unica_vez' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type NivelRiesgoCumplimiento = 'bajo' | 'medio' | 'alto' | 'critico'
export type EstatusCumplimiento = 'pendiente' | 'vencida' | 'cumplida'
export type TipoAdjuntoCumplimiento = 'evidencia' | 'norma' | 'otro'

export interface ObligacionCumplimiento {
  id: number
  nombre: string
  categoria: CategoriaCumplimiento
  autoridad: string | null
  responsableId: number | null
  responsableNombre: string | null
  baseLegal: string | null
  descripcion: string | null
  frecuencia: FrecuenciaCumplimiento
  fechaLimite: string
  estatus: 'pendiente' | 'cumplida'
  estatusCalculado: EstatusCumplimiento
  nivelRiesgo: NivelRiesgoCumplimiento
  consecuenciaIncumplimiento: string | null
  notas: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumenCumplimiento {
  total: number
  pendientes: number
  vencidas: number
  cumplidas: number
  altoRiesgo: number
  proximas30Dias: number
}

export interface HistorialCumplimientoItem {
  id: number
  fechaCumplimiento: string
  fechaLimiteOriginal: string
  usuarioId: number | null
  usuarioNombre: string | null
  comentario: string | null
  createdAt: string
}

export interface AdjuntoCumplimiento {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  tipo: TipoAdjuntoCumplimiento
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface FiltrosCumplimiento {
  categoria?: CategoriaCumplimiento
  frecuencia?: FrecuenciaCumplimiento
  estatus?: EstatusCumplimiento
  nivelRiesgo?: NivelRiesgoCumplimiento
}

export interface ObligacionCumplimientoInput {
  nombre: string
  categoria: CategoriaCumplimiento
  autoridad?: string
  responsableId?: number
  baseLegal?: string
  descripcion?: string
  frecuencia: FrecuenciaCumplimiento
  fechaLimite: string
  nivelRiesgo: NivelRiesgoCumplimiento
  consecuenciaIncumplimiento?: string
  notas?: string
}

export const cumplimientoNormativoService = {
  async listObligaciones(filtros?: FiltrosCumplimiento): Promise<ObligacionCumplimiento[]> {
    const { data } = await api.get('/cumplimiento-normativo', { params: filtros })
    return data.data
  },

  async getResumen(): Promise<ResumenCumplimiento> {
    const { data } = await api.get('/cumplimiento-normativo/resumen')
    return data.data
  },

  async getObligacion(id: number): Promise<ObligacionCumplimiento> {
    const { data } = await api.get(`/cumplimiento-normativo/${id}`)
    return data.data
  },

  async crearObligacion(input: ObligacionCumplimientoInput): Promise<{ id: number }> {
    const { data } = await api.post('/cumplimiento-normativo', input)
    return data.data
  },

  async actualizarObligacion(id: number, input: ObligacionCumplimientoInput): Promise<void> {
    await api.put(`/cumplimiento-normativo/${id}`, input)
  },

  async marcarCumplida(id: number, payload: { fechaCumplimiento?: string; comentario?: string }): Promise<{ nuevaFechaLimite: string | null; estatus: 'pendiente' | 'cumplida' }> {
    const { data } = await api.put(`/cumplimiento-normativo/${id}/marcar-cumplida`, payload)
    return data.data
  },

  async eliminarObligacion(id: number): Promise<void> {
    await api.delete(`/cumplimiento-normativo/${id}`)
  },

  async listHistorial(obligacionId: number): Promise<HistorialCumplimientoItem[]> {
    const { data } = await api.get(`/cumplimiento-normativo/${obligacionId}/historial`)
    return data.data
  },

  async listAdjuntos(obligacionId: number): Promise<AdjuntoCumplimiento[]> {
    const { data } = await api.get(`/cumplimiento-normativo/${obligacionId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(obligacionId: number, files: File[], tipo: TipoAdjuntoCumplimiento): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    form.append('tipo', tipo)
    const { data } = await api.post(`/cumplimiento-normativo/${obligacionId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/cumplimiento-normativo/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/cumplimiento-normativo/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async exportarPdf(): Promise<Blob> {
    const { data } = await api.get('/cumplimiento-normativo/export/pdf', { responseType: 'blob' })
    return data
  },
}
