export interface ReporteDiarioPorCampania {
  campania: string
  count: number
}

export interface ReporteDiarioRankingAgente {
  agenteId: number
  nombre: string
  minutosPausa: number
}

export interface ReporteDiario {
  fecha: string
  totalAsignado: number
  agentesConAsignacion: number
  agentesTrabajaron: number
  porCampania: ReporteDiarioPorCampania[]
  minutosPorTipo: {
    banio: number
    comida: number
    capacitacion: number
    permiso: number
  }
  rankingPausas: ReporteDiarioRankingAgente[]
}
