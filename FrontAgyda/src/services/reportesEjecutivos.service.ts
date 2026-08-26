import { api } from '@/lib/axios'

export type FuenteReporte = 'okr' | 'kpis' | 'decisiones'
export type FormatoCampo = 'entero' | 'porcentaje' | 'moneda' | 'fecha' | 'texto'

export interface CatalogoCampo {
  key: string
  label: string
  tipo: 'metrica' | 'dimension'
  agregacion?: string
  agrupable?: boolean
  formato: FormatoCampo
}

export interface CatalogoFiltro {
  key: string
  label: string
  tipo: 'texto' | 'select' | 'fecha'
}

export interface CatalogoFuente {
  metricas: CatalogoCampo[]
  dimensiones: CatalogoCampo[]
  filtros: CatalogoFiltro[]
}

export interface Catalogo {
  fuentes: { key: FuenteReporte; label: string }[]
  porFuente: Record<FuenteReporte, CatalogoFuente>
}

export interface EjecutarReporteInput {
  fuente: FuenteReporte
  metricas: string[]
  dimensiones: string[]
  agruparPor?: string
  filtros?: Record<string, string>
}

export interface ColumnaResultado {
  key: string
  label: string
  tipo: 'metrica' | 'dimension'
  formato: FormatoCampo
}

export interface ResultadoReporte {
  columnas: ColumnaResultado[]
  filas: Record<string, unknown>[]
  totalFilas: number
  generadoAt: string
}

export interface PlantillaReporte {
  id: number
  nombre: string
  descripcion: string | null
  fuente: FuenteReporte
  creadoPor: number | null
  creadoPorNombre: string | null
  createdAt: string
  updatedAt: string
}

export interface PlantillaReporteDetalle {
  id: number
  nombre: string
  descripcion: string | null
  fuente: FuenteReporte
  config: EjecutarReporteInput
}

export interface GuardarPlantillaInput {
  nombre: string
  descripcion?: string
  fuente: FuenteReporte
  metricas: string[]
  dimensiones: string[]
  agruparPor?: string
  filtros?: Record<string, string>
}

export const reportesEjecutivosService = {
  async getCatalogo(): Promise<Catalogo> {
    const { data } = await api.get('/direccion-general/reportes-ejecutivos/catalogo')
    return data.data
  },

  async getOpcionesFiltro(fuente: FuenteReporte, filtro: string): Promise<string[]> {
    const { data } = await api.get('/direccion-general/reportes-ejecutivos/filtro-opciones', { params: { fuente, filtro } })
    return data.data
  },

  async ejecutarReporte(input: EjecutarReporteInput): Promise<ResultadoReporte> {
    const { data } = await api.post('/direccion-general/reportes-ejecutivos/ejecutar', input)
    return data.data
  },

  async exportarPdf(input: EjecutarReporteInput): Promise<Blob> {
    const { data } = await api.post('/direccion-general/reportes-ejecutivos/export/pdf', input, {
      responseType: 'blob',
    })
    return data
  },

  async listPlantillas(): Promise<PlantillaReporte[]> {
    const { data } = await api.get('/direccion-general/reportes-ejecutivos/plantillas')
    return data.data
  },

  async getPlantilla(id: number): Promise<PlantillaReporteDetalle> {
    const { data } = await api.get(`/direccion-general/reportes-ejecutivos/plantillas/${id}`)
    return data.data
  },

  async crearPlantilla(input: GuardarPlantillaInput): Promise<{ id: number }> {
    const { data } = await api.post('/direccion-general/reportes-ejecutivos/plantillas', input)
    return data.data
  },

  async actualizarPlantilla(id: number, input: GuardarPlantillaInput): Promise<void> {
    await api.put(`/direccion-general/reportes-ejecutivos/plantillas/${id}`, input)
  },

  async eliminarPlantilla(id: number): Promise<void> {
    await api.delete(`/direccion-general/reportes-ejecutivos/plantillas/${id}`)
  },

  async ejecutarPlantilla(id: number, filtrosOverride?: Record<string, string>): Promise<ResultadoReporte> {
    const { data } = await api.post(`/direccion-general/reportes-ejecutivos/plantillas/${id}/ejecutar`, { filtrosOverride })
    return data.data
  },
}
