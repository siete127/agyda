import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type BaseLegalRat =
  | 'consentimiento' | 'contrato' | 'obligacion_legal' | 'interes_legitimo'
  | 'interes_vital' | 'funcion_publica' | 'obligacion_laboral'
export type EstatusRat = 'activa' | 'inactiva'
export type EstatusRevisionRat = 'sin_revisar' | 'revision_vencida' | 'revision_proxima' | 'al_dia'
export type TipoAdjuntoRat = 'aviso_privacidad' | 'contrato_encargado' | 'dpia' | 'otro'

export interface ActividadRat {
  id: number
  nombreActividad: string
  areaDuena: string | null
  responsableTratamiento: string
  responsableContacto: string | null
  finalidad: string
  baseLegal: BaseLegalRat
  baseLegalDetalle: string | null
  categoriasDatos: string
  categoriasDatosSensibles: boolean
  categoriasInteresados: string
  destinatarios: string | null
  plazoConservacion: string
  medidasSeguridadTecnicas: string | null
  medidasSeguridadOrganizativas: string | null
  transferenciaInternacional: boolean
  transferenciaPaisDestino: string | null
  transferenciaGarantias: string | null
  estatus: EstatusRat
  estatusRevision: EstatusRevisionRat
  fechaUltimaRevision: string | null
  frecuenciaRevisionMeses: number
  responsableRevisionId: number | null
  responsableRevisionNombre: string | null
  notas: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumenRat {
  activas: number
  revisionVencida: number
  revisionProxima: number
  conTransferenciaInternacional: number
  conDatosSensibles: number
}

export interface AdjuntoRat {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  tipo: TipoAdjuntoRat
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface FiltrosRat {
  estatus?: EstatusRat
  baseLegal?: BaseLegalRat
  estatusRevision?: EstatusRevisionRat
}

export interface ActividadRatInput {
  nombreActividad: string
  areaDuena?: string
  responsableTratamiento: string
  responsableContacto?: string
  finalidad: string
  baseLegal: BaseLegalRat
  baseLegalDetalle?: string
  categoriasDatos: string[]
  categoriasDatosSensibles?: boolean
  categoriasInteresados: string[]
  destinatarios?: string
  plazoConservacion: string
  medidasSeguridadTecnicas?: string
  medidasSeguridadOrganizativas?: string
  transferenciaInternacional?: boolean
  transferenciaPaisDestino?: string
  transferenciaGarantias?: string
  frecuenciaRevisionMeses?: number
  responsableRevisionId?: number
  notas?: string
}

export const proteccionDatosService = {
  async listActividades(filtros?: FiltrosRat): Promise<ActividadRat[]> {
    const { data } = await api.get('/proteccion-datos', { params: filtros })
    return data.data
  },

  async getResumen(): Promise<ResumenRat> {
    const { data } = await api.get('/proteccion-datos/resumen')
    return data.data
  },

  async getActividad(id: number): Promise<ActividadRat> {
    const { data } = await api.get(`/proteccion-datos/${id}`)
    return data.data
  },

  async crearActividad(input: ActividadRatInput): Promise<{ id: number }> {
    const { data } = await api.post('/proteccion-datos', input)
    return data.data
  },

  async actualizarActividad(id: number, input: ActividadRatInput): Promise<void> {
    await api.put(`/proteccion-datos/${id}`, input)
  },

  async marcarRevisada(id: number, fechaRevision?: string): Promise<void> {
    await api.put(`/proteccion-datos/${id}/marcar-revisada`, { fechaRevision })
  },

  async cambiarEstatus(id: number, estatus: EstatusRat): Promise<void> {
    await api.put(`/proteccion-datos/${id}/estatus`, { estatus })
  },

  async eliminarActividad(id: number): Promise<void> {
    await api.delete(`/proteccion-datos/${id}`)
  },

  async listAdjuntos(actividadId: number): Promise<AdjuntoRat[]> {
    const { data } = await api.get(`/proteccion-datos/${actividadId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(actividadId: number, files: File[], tipo: TipoAdjuntoRat): Promise<{ cantidad: number }> {
    const form = new FormData()
    files.forEach((f) => form.append('adjuntos', f))
    form.append('tipo', tipo)
    const { data } = await api.post(`/proteccion-datos/${actividadId}/adjuntos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/proteccion-datos/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/proteccion-datos/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async exportarPdf(): Promise<Blob> {
    const { data } = await api.get('/proteccion-datos/export/pdf', { responseType: 'blob' })
    return data
  },
}
