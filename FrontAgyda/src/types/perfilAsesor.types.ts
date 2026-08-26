import type { PeriodoReporte } from './reporteResultados.types'

export interface AsesorInfo {
  id: number
  nombre: string
  campaignId: number | null
  campaignNombre: string | null
}

export interface ResultadosAsesor {
  aprobadas: number
  rechazadas: number
  pendientes: number
  formalizadas: number
  garantizadas: number
  total: number
}

export interface MetaAsesor {
  metaMonto: number
  metaUnidades: number
  periodoMes: string
  avanceUnidades: number
}

export interface PerfilAsesor {
  asesor: AsesorInfo
  periodo: PeriodoReporte
  fecha: string
  resultados: ResultadosAsesor
  conversion: number
  meta: MetaAsesor | null
}
