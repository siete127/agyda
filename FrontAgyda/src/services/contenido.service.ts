import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type EstatusPieza = 'idea' | 'en_redaccion' | 'en_revision' | 'aprobado' | 'publicado'
export type TipoAdjuntoContenido = 'borrador' | 'final'

export interface TipoContenido {
  id: number
  nombre: string
  descripcion: string | null
  icono: string | null
  color: string | null
  activo: boolean
  orden: number
}

export interface PiezaContenido {
  id: number
  tipoId: number
  tipoNombre: string
  tipoIcono: string | null
  tipoColor: string | null
  titulo: string
  brief: string | null
  contenido: string | null
  autorId: number | null
  autorNombre: string | null
  revisorId: number | null
  revisorNombre: string | null
  estatus: EstatusPieza
  fechaProgramada: string | null
  fechaPublicado: string | null
  campaniaId: number | null
  postId: number | null
  createdAt: string
}

export interface ResumenContenido {
  enRedaccion: number
  enRevision: number
  aprobadas: number
  publicadasMes: number
}

export interface ComentarioPieza {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface AdjuntoPieza {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  tipo: TipoAdjuntoContenido
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface FiltrosPiezas {
  tipoId?: number
  estatus?: EstatusPieza
  autorId?: number
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

export interface CrearPiezaInput {
  tipoId: number
  titulo: string
  brief?: string
  contenido?: string
  revisorId?: number
  fechaProgramada?: string
  campaniaId?: number
  postId?: number
}

export interface ActualizarPiezaInput {
  tipoId: number
  titulo: string
  brief?: string
  contenido?: string
  estatus?: EstatusPieza
  autorId?: number
  revisorId?: number
  fechaProgramada?: string
  campaniaId?: number
  postId?: number
}

export const contenidoService = {
  async listTipos(soloActivos = true): Promise<TipoContenido[]> {
    const { data } = await api.get('/marketing/contenido/tipos', { params: { soloActivos } })
    return data.data
  },

  async crearTipo(input: CrearTipoInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/contenido/tipos', input)
    return data.data
  },

  async actualizarTipo(id: number, input: ActualizarTipoInput): Promise<void> {
    await api.put(`/marketing/contenido/tipos/${id}`, input)
  },

  async eliminarTipo(id: number): Promise<void> {
    await api.delete(`/marketing/contenido/tipos/${id}`)
  },

  async getResumen(): Promise<ResumenContenido> {
    const { data } = await api.get('/marketing/contenido/resumen')
    return data.data
  },

  async listPiezas(filtros?: FiltrosPiezas): Promise<PiezaContenido[]> {
    const { data } = await api.get('/marketing/contenido/piezas', { params: filtros })
    return data.data
  },

  async crearPieza(input: CrearPiezaInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/contenido/piezas', input)
    return data.data
  },

  async actualizarPieza(id: number, input: ActualizarPiezaInput): Promise<void> {
    await api.put(`/marketing/contenido/piezas/${id}`, input)
  },

  async eliminarPieza(id: number): Promise<void> {
    await api.delete(`/marketing/contenido/piezas/${id}`)
  },

  async enviarARevision(id: number): Promise<void> {
    await api.put(`/marketing/contenido/piezas/${id}/enviar-revision`)
  },

  async aprobarPieza(id: number): Promise<void> {
    await api.put(`/marketing/contenido/piezas/${id}/aprobar`)
  },

  async solicitarCambios(id: number, motivo: string): Promise<void> {
    await api.put(`/marketing/contenido/piezas/${id}/solicitar-cambios`, { motivo })
  },

  async listComentarios(piezaId: number): Promise<ComentarioPieza[]> {
    const { data } = await api.get(`/marketing/contenido/piezas/${piezaId}/comentarios`)
    return data.data
  },

  async crearComentario(piezaId: number, texto: string): Promise<{ id: number }> {
    const { data } = await api.post(`/marketing/contenido/piezas/${piezaId}/comentarios`, { texto })
    return data.data
  },

  async eliminarComentario(id: number): Promise<void> {
    await api.delete(`/marketing/contenido/comentarios/${id}`)
  },

  async listAdjuntos(piezaId: number): Promise<AdjuntoPieza[]> {
    const { data } = await api.get(`/marketing/contenido/piezas/${piezaId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(piezaId: number, files: File[], tipo: TipoAdjuntoContenido): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    form.append('tipo', tipo)
    const { data } = await api.post(`/marketing/contenido/piezas/${piezaId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/marketing/contenido/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/marketing/contenido/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}
