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

export interface ReportePostulantesPorCampania {
  fecha: string
  campania: string
  total: number
}

export interface ReportePostulantesPorTipificacion {
  tipificacion: string | null
  etiqueta: string
  total: number
}

export interface ReportePostulantesAgente {
  usuarioId: number
  usuarioNombre: string | null
  notas: number
}

export interface ReportePostulantesSinTipificar {
  nombre: string
  telefono: string
  campania: string
  diasEsperando: number
}

export interface ReportePostulantes {
  desde: string
  hasta: string
  porCampania: ReportePostulantesPorCampania[]
  porTipificacion: ReportePostulantesPorTipificacion[]
  productividadAgentes: ReportePostulantesAgente[]
  sinTipificar: { total: number; masAntiguos: ReportePostulantesSinTipificar[] }
}
