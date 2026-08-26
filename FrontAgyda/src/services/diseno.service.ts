import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type EstatusSolicitud = 'pendiente' | 'en_proceso' | 'revision' | 'entregado' | 'cancelada'
export type Prioridad = 'baja' | 'normal' | 'alta' | 'urgente'
export type TipoAdjunto = 'referencia' | 'entregable'

export interface TipoSolicitudDiseno {
  id: number
  nombre: string
  descripcion: string | null
  icono: string | null
  color: string | null
  activo: boolean
  orden: number
}

export interface SolicitudDiseno {
  id: number
  tipoId: number
  tipoNombre: string
  tipoIcono: string | null
  tipoColor: string | null
  titulo: string
  descripcion: string | null
  solicitanteId: number
  solicitanteNombre: string | null
  asignadoId: number | null
  asignadoNombre: string | null
  estatus: EstatusSolicitud
  prioridad: Prioridad
  motivoResolucion: string | null
  fechaLimite: string | null
  resueltaPor: number | null
  resueltaAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumenDiseno {
  disponibles: number
  misEnProceso: number
  enRevision: number
  entregadasMes: number
}

export interface ComentarioSolicitud {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface AdjuntoSolicitud {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  tipo: TipoAdjunto
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface FiltrosSolicitudes {
  bandeja?: 'disponibles' | 'mias' | 'asignadas' | 'todas'
  estatus?: EstatusSolicitud
  tipoId?: number
  q?: string
}

export interface CrearTipoInput {
  nombre: string
  descripcion?: string
  icono?: string
  color?: string
  orden?: number
}

export interface ActualizarTipoInput extends CrearTipoInput {
  activo?: boolean
}

export interface CrearSolicitudInput {
  tipoId: number
  titulo: string
  descripcion?: string
  prioridad?: Prioridad
  fechaLimite?: string
}

export const disenoService = {
  async listTipos(soloActivos = true): Promise<TipoSolicitudDiseno[]> {
    const { data } = await api.get('/marketing/diseno/tipos', { params: { soloActivos } })
    return data.data
  },

  async crearTipo(input: CrearTipoInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/diseno/tipos', input)
    return data.data
  },

  async actualizarTipo(id: number, input: ActualizarTipoInput): Promise<void> {
    await api.put(`/marketing/diseno/tipos/${id}`, input)
  },

  async eliminarTipo(id: number): Promise<void> {
    await api.delete(`/marketing/diseno/tipos/${id}`)
  },

  async getResumen(): Promise<ResumenDiseno> {
    const { data } = await api.get('/marketing/diseno/resumen')
    return data.data
  },

  async listSolicitudes(filtros?: FiltrosSolicitudes): Promise<SolicitudDiseno[]> {
    const { data } = await api.get('/marketing/diseno/solicitudes', { params: filtros })
    return data.data
  },

  async crearSolicitud(input: CrearSolicitudInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/diseno/solicitudes', input)
    return data.data
  },

  async tomarSolicitud(id: number): Promise<void> {
    await api.put(`/marketing/diseno/solicitudes/${id}/tomar`)
  },

  async enviarARevision(id: number): Promise<void> {
    await api.put(`/marketing/diseno/solicitudes/${id}/enviar-revision`)
  },

  async aprobarEntrega(id: number): Promise<void> {
    await api.put(`/marketing/diseno/solicitudes/${id}/aprobar`)
  },

  async solicitarCambios(id: number, motivo: string): Promise<void> {
    await api.put(`/marketing/diseno/solicitudes/${id}/solicitar-cambios`, { motivo })
  },

  async cancelarSolicitud(id: number): Promise<void> {
    await api.put(`/marketing/diseno/solicitudes/${id}/cancelar`)
  },

  async listComentarios(solicitudId: number): Promise<ComentarioSolicitud[]> {
    const { data } = await api.get(`/marketing/diseno/solicitudes/${solicitudId}/comentarios`)
    return data.data
  },

  async crearComentario(solicitudId: number, texto: string): Promise<{ id: number }> {
    const { data } = await api.post(`/marketing/diseno/solicitudes/${solicitudId}/comentarios`, { texto })
    return data.data
  },

  async eliminarComentario(id: number): Promise<void> {
    await api.delete(`/marketing/diseno/comentarios/${id}`)
  },

  async listAdjuntos(solicitudId: number): Promise<AdjuntoSolicitud[]> {
    const { data } = await api.get(`/marketing/diseno/solicitudes/${solicitudId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(solicitudId: number, files: File[], tipo: TipoAdjunto): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    form.append('tipo', tipo)
    const { data } = await api.post(`/marketing/diseno/solicitudes/${solicitudId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/marketing/diseno/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/marketing/diseno/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}
