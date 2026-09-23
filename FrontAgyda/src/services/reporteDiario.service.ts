import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import type {
  ReporteDiario, ReportePostulantes, RdlReporte, RdlCarpeta, RdlRol,
  RbCatalogo, RbDefinicion, RbResultado, RbReporteGuardado,
  InteraccionItem, InteraccionesFiltro, ReporteEjecutivoReclutamiento,
} from '@/types/reporteDiario.types'
import { parseRdl } from '@/lib/rdl'

export const reporteDiarioService = {
  async get(fecha?: string): Promise<ReporteDiario> {
    const { data } = await api.get('/operaciones/reportes-diarios', { params: fecha ? { fecha } : {} })
    return data?.data as ReporteDiario
  },

  async getPostulantes(params: { desde?: string; hasta?: string }): Promise<ReportePostulantes> {
    const { data } = await api.get('/operaciones/reportes-postulantes', { params })
    return data?.data as ReportePostulantes
  },

  async getReporteEjecutivoReclutamiento(params: { desde?: string; hasta?: string; campaniaId: number }): Promise<ReporteEjecutivoReclutamiento> {
    const { data } = await api.get('/operaciones/reportes-postulantes/ejecutivo-reclutamiento', { params })
    return data?.data as ReporteEjecutivoReclutamiento
  },

  // Descarga directa (no JSON) — mismo patrón que ccService.tipificacionesExcelUrl:
  // el token va por querystring porque es un <a href> de navegador, no axios.
  excelPostulantesUrl(params: { desde?: string; hasta?: string }): string {
    const token = useAuthStore.getState().token
    const qs = new URLSearchParams()
    if (params.desde) qs.set('desde', params.desde)
    if (params.hasta) qs.set('hasta', params.hasta)
    if (token) qs.set('token', token)
    return `/api/operaciones/reportes-postulantes/excel?${qs.toString()}`
  },

  /* ── Suite de reportes: carpetas ── */

  async listRdlCarpetas(): Promise<RdlCarpeta[]> {
    const { data } = await api.get('/operaciones/suite-reportes/carpetas')
    return (data?.data ?? []) as RdlCarpeta[]
  },

  async crearRdlCarpeta(nombre: string): Promise<RdlCarpeta> {
    const { data } = await api.post('/operaciones/suite-reportes/carpetas', { nombre })
    return data?.data as RdlCarpeta
  },

  async renombrarRdlCarpeta(id: number, nombre: string): Promise<void> {
    await api.patch(`/operaciones/suite-reportes/carpetas/${id}`, { nombre })
  },

  async eliminarRdlCarpeta(id: number): Promise<void> {
    await api.delete(`/operaciones/suite-reportes/carpetas/${id}`)
  },

  /* ── Suite de reportes: listado de interacciones cerradas (buscador) ── */

  async listInteracciones(filtro: InteraccionesFiltro): Promise<InteraccionItem[]> {
    const { data } = await api.get('/operaciones/interacciones', { params: filtro })
    return (data?.data ?? []) as InteraccionItem[]
  },

  interaccionesExcelUrl(filtro: InteraccionesFiltro): string {
    const token = useAuthStore.getState().token
    const qs = new URLSearchParams()
    if (filtro.texto) qs.set('texto', filtro.texto)
    if (filtro.agenteId) qs.set('agenteId', String(filtro.agenteId))
    if (filtro.tipificacionId) qs.set('tipificacionId', String(filtro.tipificacionId))
    if (filtro.campaniaId) qs.set('campaniaId', String(filtro.campaniaId))
    if (filtro.desde) qs.set('desde', filtro.desde)
    if (filtro.hasta) qs.set('hasta', filtro.hasta)
    if (token) qs.set('token', token)
    return `/api/operaciones/interacciones/excel?${qs.toString()}`
  },

  /* ── Suite de reportes: catálogo de definiciones RDL ── */

  async listRdl(): Promise<RdlReporte[]> {
    const { data } = await api.get('/operaciones/suite-reportes/rdl')
    return (data?.data ?? []) as RdlReporte[]
  },

  // Sube el .rdl: lo lee en el navegador, lo parsea con DOMParser y manda el
  // archivo + la metadata extraída (datasets, campos, tablix) + la seguridad de
  // acceso (roles + usuarios) al backend.
  async subirRdl(input: {
    file: File
    nombre: string
    descripcion?: string
    carpetaId?: number | null
    carpeta?: string
    roles?: RdlRol[]
    usuarios?: number[]
  }): Promise<RdlReporte> {
    const xml = await input.file.text()
    const def = parseRdl(xml)
    const form = new FormData()
    form.append('archivo', input.file)
    form.append('nombre', input.nombre)
    if (input.descripcion) form.append('descripcion', input.descripcion)
    if (input.carpetaId != null) form.append('carpetaId', String(input.carpetaId))
    if (input.carpeta) form.append('carpeta', input.carpeta)
    if (input.roles?.length) form.append('roles', input.roles.join(','))
    if (input.usuarios?.length) form.append('usuarios', input.usuarios.join(','))
    form.append('versionRdl', def.rdlVersion ?? '')
    form.append('compatible', String(def.compatible))
    form.append('metadata', JSON.stringify(def))
    const { data } = await api.post('/operaciones/suite-reportes/rdl', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data?.data as RdlReporte
  },

  async actualizarRdl(
    id: number,
    patch: {
      nombre?: string
      descripcion?: string
      carpetaId?: number | null
      carpeta?: string
      roles?: RdlRol[]
      usuarios?: number[]
    },
  ): Promise<void> {
    await api.patch(`/operaciones/suite-reportes/rdl/${id}`, patch)
  },

  async eliminarRdl(id: number): Promise<void> {
    await api.delete(`/operaciones/suite-reportes/rdl/${id}`)
  },

  rdlDescargaUrl(id: number): string {
    const token = useAuthStore.getState().token
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return `/api/operaciones/suite-reportes/rdl/${id}/raw${qs}`
  },

  /* ── Constructor de reportes ── */

  async builderCatalogo(): Promise<RbCatalogo> {
    const { data } = await api.get('/operaciones/suite-reportes/builder/catalogo')
    return data?.data as RbCatalogo
  },

  async builderCatalogoFiltro(catalogo: string): Promise<{ id: number; nombre: string }[]> {
    const { data } = await api.get(`/operaciones/suite-reportes/builder/catalogo-filtro/${catalogo}`)
    return (data?.data ?? []) as { id: number; nombre: string }[]
  },

  async builderEjecutar(definicion: RbDefinicion): Promise<RbResultado> {
    const { data } = await api.post('/operaciones/suite-reportes/builder/ejecutar', { definicion })
    return data?.data as RbResultado
  },

  async builderListReportes(): Promise<RbReporteGuardado[]> {
    const { data } = await api.get('/operaciones/suite-reportes/builder/reportes')
    return (data?.data ?? []) as RbReporteGuardado[]
  },

  async builderGuardarReporte(input: {
    nombre: string
    descripcion?: string
    origen: string
    definicion: RbDefinicion
    carpetaId?: number | null
    carpeta?: string
    roles?: RdlRol[]
    usuarios?: number[]
  }): Promise<RbReporteGuardado> {
    const { data } = await api.post('/operaciones/suite-reportes/builder/reportes', input)
    return data?.data as RbReporteGuardado
  },

  async builderActualizarReporte(
    id: number,
    patch: {
      nombre?: string
      descripcion?: string
      definicion?: RbDefinicion
      carpetaId?: number | null
      carpeta?: string
      roles?: RdlRol[]
      usuarios?: number[]
    },
  ): Promise<void> {
    await api.patch(`/operaciones/suite-reportes/builder/reportes/${id}`, patch)
  },

  async builderEliminarReporte(id: number): Promise<void> {
    await api.delete(`/operaciones/suite-reportes/builder/reportes/${id}`)
  },
}
