export interface ReglaSla {
  id: number
  prioridad: string
  area: string | null
  servicio: string | null
  minPrimeraRespuestaDesde: number | null
  minPrimeraRespuesta: number
  minResolucionDesde: number | null
  minResolucion: number
  activa: boolean
}

export interface CrearReglaSlaPayload {
  prioridad: string
  area?: string
  servicio?: string
  minPrimeraRespuestaDesde?: number
  minPrimeraRespuesta: number
  minResolucionDesde?: number
  minResolucion: number
}

export interface ActualizarReglaSlaPayload {
  prioridad: string
  area?: string
  servicio?: string
  minPrimeraRespuestaDesde?: number
  minPrimeraRespuesta: number
  minResolucionDesde?: number
  minResolucion: number
  activa: boolean
}

export interface ReporteSlaGrupo {
  key: string
  total: number
  cumplidos: number
  pctCumplimiento: number
}

export interface ReporteSla {
  totalEvaluados: number
  cumplidos: number
  pctCumplimiento: number | null
  porArea: ReporteSlaGrupo[]
  porPrioridad: ReporteSlaGrupo[]
}
