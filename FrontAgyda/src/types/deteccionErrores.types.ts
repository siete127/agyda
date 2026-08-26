export type SeveridadError = 'leve' | 'moderado' | 'grave'
export type EstatusError = 'abierto' | 'resuelto'

export interface ErrorDetectado {
  id: number
  agenteId: number
  agenteNombre: string | null
  evaluacionId: number | null
  categoria: string
  severidad: SeveridadError
  descripcion: string
  estatus: EstatusError
  detectadoPor: number | null
  resueltoPor: number | null
  fechaResolucion: string | null
  notasResolucion: string | null
  fecha: string
}

export interface CrearErrorPayload {
  agenteId: number
  evaluacionId?: number
  categoria: string
  severidad: SeveridadError
  descripcion: string
}

export interface ResumenErrores {
  abiertos: number
  resueltos: number
  porSeveridad: { severidad: SeveridadError; total: number }[]
  porCategoria: { categoria: string; total: number }[]
}

export const SEVERIDAD_LABELS: Record<SeveridadError, string> = {
  leve: 'Leve',
  moderado: 'Moderado',
  grave: 'Grave',
}
