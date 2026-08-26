export interface Retroalimentacion {
  id: number
  evaluacionId: number
  agenteId: number
  agenteNombre: string | null
  autorId: number | null
  comentario: string
  planMejora: string | null
  vista: boolean
  fecha: string
  puntajeEvaluacion: number
  fechaEvaluacion: string
}

export interface MiRetroalimentacion {
  id: number
  evaluacionId: number
  comentario: string
  planMejora: string | null
  vista: boolean
  fecha: string
  puntajeEvaluacion: number
  fechaEvaluacion: string
}

export interface CrearRetroalimentacionPayload {
  evaluacionId: number
  comentario: string
  planMejora?: string
}
