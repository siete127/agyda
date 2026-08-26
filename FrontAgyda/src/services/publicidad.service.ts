import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type Plataforma = 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'linkedin_ads' | 'otro'
export type EstatusCampaniaPublicidad = 'planeada' | 'activa' | 'pausada' | 'finalizada'
export type EstatusAnuncio = 'activo' | 'pausado' | 'finalizado'

export interface CampaniaPublicidad {
  id: number
  nombre: string
  plataforma: Plataforma
  objetivo: string | null
  presupuesto: number | null
  fechaInicio: string | null
  fechaFin: string | null
  estatus: EstatusCampaniaPublicidad
  responsableId: number | null
  responsableNombre: string | null
  campaniaId: number | null
  anunciosTotal: number
  gastoTotal: number
  createdAt: string
}

export interface AnuncioPublicidad {
  id: number
  campaniaId: number
  titulo: string
  copy: string | null
  presupuesto: number | null
  estatus: EstatusAnuncio
  imagenArchivo: string | null
  imagenOriginal: string | null
  createdAt: string
}

export interface MetricasAnuncio {
  impresiones: number | null
  clics: number | null
  conversiones: number | null
  gasto: number | null
  capturadoAt: string
}

export interface DashboardPublicidad {
  campaniasActivas: number
  presupuestoTotal: number
  gastoMes: number
  ctrPromedio: number
}

export interface CrearCampaniaInput {
  nombre: string
  plataforma: Plataforma
  objetivo?: string
  presupuesto?: number
  fechaInicio?: string
  fechaFin?: string
  responsableId?: number
  campaniaId?: number
}

export interface ActualizarCampaniaInput extends CrearCampaniaInput {
  estatus?: EstatusCampaniaPublicidad
}

export interface CrearAnuncioInput {
  titulo: string
  copy?: string
  presupuesto?: number
}

export interface ActualizarAnuncioInput extends CrearAnuncioInput {
  estatus?: EstatusAnuncio
}

export interface GuardarMetricasInput {
  impresiones?: number
  clics?: number
  conversiones?: number
  gasto?: number
}

export const publicidadService = {
  async getDashboard(): Promise<DashboardPublicidad> {
    const { data } = await api.get('/marketing/publicidad/dashboard')
    return data.data
  },

  async listCampanias(): Promise<CampaniaPublicidad[]> {
    const { data } = await api.get('/marketing/publicidad/campanias')
    return data.data
  },

  async crearCampania(input: CrearCampaniaInput): Promise<{ id: number }> {
    const { data } = await api.post('/marketing/publicidad/campanias', input)
    return data.data
  },

  async actualizarCampania(id: number, input: ActualizarCampaniaInput): Promise<void> {
    await api.put(`/marketing/publicidad/campanias/${id}`, input)
  },

  async eliminarCampania(id: number): Promise<void> {
    await api.delete(`/marketing/publicidad/campanias/${id}`)
  },

  async listAnuncios(campaniaId: number): Promise<AnuncioPublicidad[]> {
    const { data } = await api.get(`/marketing/publicidad/campanias/${campaniaId}/anuncios`)
    return data.data
  },

  async crearAnuncio(campaniaId: number, input: CrearAnuncioInput): Promise<{ id: number }> {
    const { data } = await api.post(`/marketing/publicidad/campanias/${campaniaId}/anuncios`, input)
    return data.data
  },

  async actualizarAnuncio(id: number, input: ActualizarAnuncioInput): Promise<void> {
    await api.put(`/marketing/publicidad/anuncios/${id}`, input)
  },

  async eliminarAnuncio(id: number): Promise<void> {
    await api.delete(`/marketing/publicidad/anuncios/${id}`)
  },

  async subirImagenAnuncio(id: number, file: File): Promise<void> {
    const form = new FormData()
    form.append('imagen', file)
    await api.post(`/marketing/publicidad/anuncios/${id}/imagen`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getUrlVerImagen(id: number): string {
    const token = useAuthStore.getState().token
    return `/api/marketing/publicidad/anuncios/${id}/imagen/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  async getMetricas(id: number): Promise<MetricasAnuncio | null> {
    const { data } = await api.get(`/marketing/publicidad/anuncios/${id}/metricas`)
    return data.data
  },

  async guardarMetricas(id: number, input: GuardarMetricasInput): Promise<void> {
    await api.put(`/marketing/publicidad/anuncios/${id}/metricas`, input)
  },
}
