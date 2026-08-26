import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export interface MarketingPorCanal {
  canal: string
  count: number
}

export interface MarketingDashboard {
  campaniasActivas: number
  presupuestoTotal: number
  porCanal: MarketingPorCanal[]
}

export interface Campania {
  id: number
  nombre: string
  canal: string
  presupuesto: number
  estado: string
}

export type RedSocial = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'tiktok' | 'youtube' | 'otro'
export type EstatusPost = 'borrador' | 'programado' | 'publicado'

export interface CuentaRedSocial {
  id: number
  nombre: string
  red: RedSocial
  handle: string | null
  activa: boolean
}

export interface PostRedSocial {
  id: number
  cuentaId: number
  cuentaNombre: string
  red: RedSocial
  campaniaId: number | null
  titulo: string
  contenido: string | null
  estatus: EstatusPost
  fechaProgramada: string | null
  fechaPublicado: string | null
  imagenArchivo: string | null
  imagenOriginal: string | null
  responsableId: number | null
  responsableNombre: string | null
  createdAt: string
}

export interface MetricasPost {
  alcance: number | null
  interacciones: number | null
  clics: number | null
  capturadoAt: string
}

export interface RedesDashboard {
  postsProgramadosMes: number
  postsPublicadosMes: number
  cuentasActivas: number
  alcanceTotalMes: number
}

export interface FiltrosPosts {
  cuentaId?: number
  estatus?: EstatusPost
  mes?: string
}

export interface CrearPostInput {
  cuentaId: number
  campaniaId?: number
  titulo: string
  contenido?: string
  estatus?: EstatusPost
  fechaProgramada?: string
  responsableId?: number
}

export interface ActualizarPostInput {
  cuentaId: number
  campaniaId?: number | null
  titulo: string
  contenido?: string
  estatus?: EstatusPost
  fechaProgramada?: string | null
  responsableId?: number | null
}

export interface GuardarMetricasInput {
  alcance?: number
  interacciones?: number
  clics?: number
}

export interface SnapshotResultados {
  campaniasActivas: number
  presupuestoTotal: number
  postsPublicadosMes: number
  disenoEnProceso: number
  disenoEntregadasMes: number
  gastoPublicidadMes: number
  piezasPublicadasMes: number
}

export interface TendenciaMes {
  mes: string
  postsPublicados: number
  solicitudesEntregadas: number
  gastoPublicidad: number
  piezasPublicadas: number
}

export interface Resultados {
  snapshot: SnapshotResultados
  tendencia: TendenciaMes[]
}

export const marketingService = {
  async getDashboard(): Promise<MarketingDashboard> {
    const { data } = await api.get('/marketing/dashboard')
    return data.data
  },

  async getResultados(): Promise<Resultados> {
    const { data } = await api.get('/marketing/resultados')
    return data.data
  },

  async getCampanias(): Promise<Campania[]> {
    const { data } = await api.get('/marketing/campanias')
    return data.data
  },

  async createCampania(payload: Partial<Campania>): Promise<Campania> {
    const { data } = await api.post('/marketing/campanias', payload)
    return data.data
  },

  async getDashboardRedes(): Promise<RedesDashboard> {
    const { data } = await api.get('/marketing/redes/dashboard')
    return data.data
  },

  async listCuentas(): Promise<CuentaRedSocial[]> {
    const { data } = await api.get('/marketing/redes/cuentas')
    return data.data
  },

  async crearCuenta(input: { nombre: string; red: RedSocial; handle?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/redes/cuentas', input)
    return data.data
  },

  async actualizarCuenta(id: number, input: { nombre: string; red: RedSocial; handle?: string; activa: boolean }): Promise<void> {
    await api.put(`/marketing/redes/cuentas/${id}`, input)
  },

  async eliminarCuenta(id: number): Promise<void> {
    await api.delete(`/marketing/redes/cuentas/${id}`)
  },

  async listPosts(filtros?: FiltrosPosts): Promise<PostRedSocial[]> {
    const { data } = await api.get('/marketing/redes/posts', { params: filtros })
    return data.data
  },

  async crearPost(input: CrearPostInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/redes/posts', input)
    return data.data
  },

  async actualizarPost(id: number, input: ActualizarPostInput): Promise<void> {
    await api.put(`/marketing/redes/posts/${id}`, input)
  },

  async eliminarPost(id: number): Promise<void> {
    await api.delete(`/marketing/redes/posts/${id}`)
  },

  async subirImagenPost(id: number, file: File): Promise<void> {
    const form = new FormData()
    form.append('imagen', file)
    await api.post(`/marketing/redes/posts/${id}/imagen`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getUrlVerImagen(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/marketing/redes/posts/${id}/imagen/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async getMetricas(id: number): Promise<MetricasPost | null> {
    const { data } = await api.get(`/marketing/redes/posts/${id}/metricas`)
    return data.data
  },

  async guardarMetricas(id: number, input: GuardarMetricasInput): Promise<void> {
    await api.put(`/marketing/redes/posts/${id}/metricas`, input)
  },
}
