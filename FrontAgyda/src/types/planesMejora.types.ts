export type EstatusPlanMejora = 'pendiente' | 'en_progreso' | 'completado'

export interface PlanMejora {
  id: number
  evaluacionId: number
  agenteId: number
  agenteNombre: string | null
  titulo: string
  descripcion: string | null
  fechaLimite: string | null
  estatus: EstatusPlanMejora
  fechaCreacion: string
  fechaCompletado: string | null
  puntajeEvaluacion: number
}

export interface MiPlanMejora {
  id: number
  evaluacionId: number
  titulo: string
  descripcion: string | null
  fechaLimite: string | null
  estatus: EstatusPlanMejora
  fechaCreacion: string
  fechaCompletado: string | null
  puntajeEvaluacion: number
}

export interface CrearPlanMejoraPayload {
  evaluacionId: number
  titulo: string
  descripcion?: string
  fechaLimite?: string
}

export const ESTATUS_LABELS: Record<EstatusPlanMejora, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completado: 'Completado',
}
