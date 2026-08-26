import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type EstatusDecision = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada'
export type Prioridad = 'baja' | 'normal' | 'alta' | 'urgente'
export type BandejaDecision = 'mias' | 'por-aprobar' | 'todas'

export interface TipoDecision {
  id: number
  nombre: string
  descripcion: string | null
  icono: string | null
  color: string | null
  aprobadorDefaultId: number | null
  requiereAdjunto: boolean
  activo: boolean
  orden: number
}

export interface Decision {
  id: number
  tipoId: number
  tipoNombre: string
  tipoIcono: string | null
  tipoColor: string | null
  titulo: string
  descripcion: string | null
  solicitanteId: number
  solicitanteNombre: string | null
  aprobadorId: number
  aprobadorNombre: string | null
  estatus: EstatusDecision
  prioridad: Prioridad
  motivoResolucion: string | null
  fechaLimite: string | null
  resueltaPor: number | null
  resueltaAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ComentarioDecision {
  id: number
  decisionId: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface AdjuntoDecision {
  id: number
  decisionId: number
  usuarioId: number | null
  autorNombre: string | null
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface ResumenDecisiones {
  pendientesPorAprobar: number
  misPendientes: number
  resueltasMes: number
  totalActivas: number
}

export interface CrearTipoInput {
  nombre: string
  descripcion?: string
  icono?: string
  color?: string
  aprobadorDefaultId?: number
  requiereAdjunto?: boolean
  orden?: number
}

export interface ActualizarTipoInput extends CrearTipoInput {
  activo?: boolean
}

export interface CrearDecisionInput {
  tipoId: number
  titulo: string
  descripcion?: string
  aprobadorId?: number
  prioridad?: Prioridad
  fechaLimite?: string
}

export interface ListDecisionesParams {
  bandeja?: BandejaDecision
  estatus?: EstatusDecision
  tipoId?: number
  desde?: string
  hasta?: string
  q?: string
}

export const decisionesService = {
  async listTipos(soloActivos = true): Promise<TipoDecision[]> {
    const { data } = await api.get('/direccion-general/decisiones/tipos', { params: { soloActivos } })
    return data.data
  },

  async crearTipo(input: CrearTipoInput): Promise<{ id: number }> {
    const { data } = await api.post('/direccion-general/decisiones/tipos', input)
    return data.data
  },

  async actualizarTipo(id: number, input: ActualizarTipoInput): Promise<void> {
    await api.put(`/direccion-general/decisiones/tipos/${id}`, input)
  },

  async eliminarTipo(id: number): Promise<void> {
    await api.delete(`/direccion-general/decisiones/tipos/${id}`)
  },

  async listDecisiones(params?: ListDecisionesParams): Promise<Decision[]> {
    const { data } = await api.get('/direccion-general/decisiones', { params })
    return data.data
  },

  async getResumen(): Promise<ResumenDecisiones> {
    const { data } = await api.get('/direccion-general/decisiones/resumen')
    return data.data
  },

  async getDecision(id: number): Promise<Decision> {
    const { data } = await api.get(`/direccion-general/decisiones/${id}`)
    return data.data
  },

  async crearDecision(input: CrearDecisionInput): Promise<{ id: number }> {
    const { data } = await api.post('/direccion-general/decisiones', input)
    return data.data
  },

  async cancelarDecision(id: number): Promise<void> {
    await api.put(`/direccion-general/decisiones/${id}/cancelar`)
  },

  async aprobarDecision(id: number, comentario?: string): Promise<void> {
    await api.put(`/direccion-general/decisiones/${id}/aprobar`, { motivoResolucion: comentario })
  },

  async rechazarDecision(id: number, motivoResolucion: string): Promise<void> {
    await api.put(`/direccion-general/decisiones/${id}/rechazar`, { motivoResolucion })
  },

  async eliminarDecision(id: number): Promise<void> {
    await api.delete(`/direccion-general/decisiones/${id}`)
  },

  async listComentarios(decisionId: number): Promise<ComentarioDecision[]> {
    const { data } = await api.get(`/direccion-general/decisiones/${decisionId}/comentarios`)
    return data.data
  },

  async crearComentario(decisionId: number, texto: string): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/decisiones/${decisionId}/comentarios`, { texto })
    return data.data
  },

  async eliminarComentario(id: number): Promise<void> {
    await api.delete(`/direccion-general/decisiones/comentarios/${id}`)
  },

  async listAdjuntos(decisionId: number): Promise<AdjuntoDecision[]> {
    const { data } = await api.get(`/direccion-general/decisiones/${decisionId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(decisionId: number, files: File[]): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    const { data } = await api.post(`/direccion-general/decisiones/${decisionId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/direccion-general/decisiones/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/direccion-general/decisiones/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async exportarPdf(params?: ListDecisionesParams): Promise<Blob> {
    const { data } = await api.get('/direccion-general/decisiones/export/pdf', {
      params,
      responseType: 'blob',
    })
    return data
  },
}
