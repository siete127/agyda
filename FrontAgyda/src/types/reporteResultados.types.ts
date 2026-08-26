export type PeriodoReporte = 'day' | 'week' | 'month'

export interface ResultadosPorAgente {
  agentId: number
  nombreAgente: string
  campaignId: number | null
  campaignNombre: string | null
  aprobadas: number
  rechazadas: number
  pendientes: number
  formalizadas: number
  garantizadas: number
  total: number
}

export interface ResultadosPorCampania {
  campaniaId: number
  campaniaNombre: string
  aprobadas: number
  rechazadas: number
  pendientes: number
  formalizadas: number
  garantizadas: number
  total: number
}

export interface ReporteResultadosTotales {
  aprobadas: number
  rechazadas: number
  pendientes: number
  formalizadas: number
  garantizadas: number
  total: number
}

export interface ReporteResultados {
  periodo: PeriodoReporte
  fecha: string
  totales: ReporteResultadosTotales
  porAgente: ResultadosPorAgente[]
  porCampania: ResultadosPorCampania[]
}
