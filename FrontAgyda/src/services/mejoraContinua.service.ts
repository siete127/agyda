import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type Severidad = 'baja' | 'media' | 'alta' | 'critica'
export type EstatusHallazgo =
  | 'registrado'
  | 'en_analisis_causa'
  | 'plan_definido'
  | 'en_ejecucion'
  | 'pendiente_verificacion'
  | 'verificado_eficaz'
  | 'cerrado'
  | 'reabierto'
export type TipoHallazgo = 'no_conformidad' | 'oportunidad_mejora' | 'observacion' | 'incidente' | 'queja_cliente'
export type OrigenHallazgo = 'auditoria_interna' | 'auditoria_externa' | 'cliente' | 'proceso' | 'inspeccion' | 'denuncia'
export type NivelImpacto = 'bajo' | 'medio' | 'alto'
export type TipoAccion = 'contencion' | 'correctiva' | 'preventiva'
export type EstatusAccion = 'pendiente' | 'en_proceso' | 'completada'

export interface Hallazgo {
  id: number
  folio: string | null
  titulo: string
  descripcion: string | null
  areaOrigen: string | null
  areaOrigenLabel: string | null
  tipo: TipoHallazgo
  origen: OrigenHallazgo | null
  requisitoIncumplido: string | null
  impactoCosto: NivelImpacto | null
  impactoCliente: NivelImpacto | null
  impactoLegal: NivelImpacto | null
  severidad: Severidad
  estatus: EstatusHallazgo
  porque1: string | null
  porque2: string | null
  porque3: string | null
  porque4: string | null
  porque5: string | null
  causaRaiz: string | null
  responsableId: number | null
  responsableNombre: string | null
  fechaDeteccion: string
  fechaCompromiso: string | null
  verificadoPor: number | null
  fechaVerificacion: string | null
  evidenciaCierre: string | null
  eficaz: boolean | null
  vencido: boolean
  accionesTotal: number
  accionesPendientes: number
  comentariosCount: number
  adjuntosCount: number
  createdAt: string
  updatedAt: string
}

export interface Accion {
  id: number
  hallazgoId: number
  tipo: TipoAccion
  descripcion: string
  responsableId: number | null
  responsableNombre: string | null
  fechaCompromiso: string | null
  fechaRealCierre: string | null
  estatus: EstatusAccion
  createdAt: string
}

export interface ComentarioHallazgo {
  id: number
  usuarioId: number | null
  autorNombre: string | null
  texto: string
  createdAt: string
}

export interface AdjuntoHallazgo {
  id: number
  hallazgoId: number
  usuarioId: number | null
  autorNombre: string | null
  nombreOriginal: string
  mime: string | null
  tamanio: number | null
  createdAt: string
}

export interface HistorialItem {
  id: number
  usuarioId: number | null
  usuarioNombre: string | null
  accion: string
  detalle: string | null
  fecha: string
}

export interface FiltrosHallazgos {
  estatus?: string
  area?: string
  severidad?: string
  responsableId?: number
  fechaDesde?: string
  fechaHasta?: string
}

export interface CrearHallazgoInput {
  titulo: string
  descripcion?: string
  areaOrigen?: string
  tipo?: TipoHallazgo
  origen?: OrigenHallazgo
  requisitoIncumplido?: string
  impactoCosto?: NivelImpacto
  impactoCliente?: NivelImpacto
  impactoLegal?: NivelImpacto
  severidad?: Severidad
  responsableId?: number
  fechaDeteccion?: string
  fechaCompromiso?: string
}

export interface ActualizarHallazgoInput {
  titulo: string
  descripcion?: string
  areaOrigen?: string
  tipo?: TipoHallazgo
  origen?: OrigenHallazgo
  requisitoIncumplido?: string
  impactoCosto?: NivelImpacto
  impactoCliente?: NivelImpacto
  impactoLegal?: NivelImpacto
  severidad?: Severidad
  estatus?: EstatusHallazgo
  porque1?: string
  porque2?: string
  porque3?: string
  porque4?: string
  porque5?: string
  causaRaiz?: string
  responsableId?: number | null
  fechaDeteccion?: string
  fechaCompromiso?: string | null
}

export interface CrearAccionInput {
  tipo?: TipoAccion
  descripcion: string
  responsableId?: number
  fechaCompromiso?: string
}

export interface ActualizarAccionInput {
  tipo?: TipoAccion
  descripcion: string
  responsableId?: number | null
  fechaCompromiso?: string | null
  estatus?: EstatusAccion
}

export const mejoraContinuaService = {
  async listHallazgos(filtros?: FiltrosHallazgos): Promise<Hallazgo[]> {
    const { data } = await api.get('/direccion-general/mejora-continua/hallazgos', { params: filtros })
    return data.data
  },

  async crearHallazgo(input: CrearHallazgoInput): Promise<{ id: number; folio: string }> {
    const { data } = await api.post('/direccion-general/mejora-continua/hallazgos', input)
    return data.data
  },

  async actualizarHallazgo(id: number, input: ActualizarHallazgoInput): Promise<void> {
    await api.put(`/direccion-general/mejora-continua/hallazgos/${id}`, input)
  },

  async verificarCierre(id: number, evidenciaCierre: string, cerrar: boolean, eficaz: boolean): Promise<void> {
    await api.put(`/direccion-general/mejora-continua/hallazgos/${id}/verificar`, { evidenciaCierre, cerrar, eficaz })
  },

  async reabrirHallazgo(id: number, motivoReapertura: string): Promise<void> {
    await api.put(`/direccion-general/mejora-continua/hallazgos/${id}/reabrir`, { motivoReapertura })
  },

  async eliminarHallazgo(id: number): Promise<void> {
    await api.delete(`/direccion-general/mejora-continua/hallazgos/${id}`)
  },

  async listAcciones(hallazgoId: number): Promise<Accion[]> {
    const { data } = await api.get(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/acciones`)
    return data.data
  },

  async crearAccion(hallazgoId: number, input: CrearAccionInput): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/acciones`, input)
    return data.data
  },

  async actualizarAccion(id: number, input: ActualizarAccionInput): Promise<void> {
    await api.put(`/direccion-general/mejora-continua/acciones/${id}`, input)
  },

  async eliminarAccion(id: number): Promise<void> {
    await api.delete(`/direccion-general/mejora-continua/acciones/${id}`)
  },

  async listComentarios(hallazgoId: number): Promise<ComentarioHallazgo[]> {
    const { data } = await api.get(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/comentarios`)
    return data.data
  },

  async crearComentario(hallazgoId: number, texto: string): Promise<{ id: number }> {
    const { data } = await api.post(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/comentarios`, { texto })
    return data.data
  },

  async eliminarComentario(id: number): Promise<void> {
    await api.delete(`/direccion-general/mejora-continua/comentarios/${id}`)
  },

  async listAdjuntos(hallazgoId: number): Promise<AdjuntoHallazgo[]> {
    const { data } = await api.get(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/adjuntos`)
    return data.data
  },

  async subirAdjuntos(hallazgoId: number, files: File[]): Promise<void> {
    const formData = new FormData()
    files.forEach((f) => formData.append('adjuntos', f))
    await api.post(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/adjuntos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  async eliminarAdjunto(id: number): Promise<void> {
    await api.delete(`/direccion-general/mejora-continua/adjuntos/${id}`)
  },

  getUrlVerAdjunto(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/direccion-general/mejora-continua/adjuntos/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async listHistorial(hallazgoId: number): Promise<HistorialItem[]> {
    const { data } = await api.get(`/direccion-general/mejora-continua/hallazgos/${hallazgoId}/historial`)
    return data.data
  },

  async exportarPdf(filtros?: { estatus?: string; area?: string; severidad?: string }): Promise<Blob> {
    const { data } = await api.get('/direccion-general/mejora-continua/export/pdf', { params: filtros, responseType: 'blob' })
    return data
  },
}
