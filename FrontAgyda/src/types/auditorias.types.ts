export type VeredictoAuditoria = 'en_curso' | 'aprobada' | 'observaciones' | 'no_aprobada'

export interface Auditoria {
  id: number
  titulo: string
  alcance: string | null
  periodoInicio: string | null
  periodoFin: string | null
  auditorId: number | null
  veredicto: VeredictoAuditoria
  hallazgos: string | null
  fechaCierre: string | null
  fechaCreacion: string
  totalRegistros: number
  promedioCumplimiento: number | null
}

export interface RegistroEnAuditoria {
  vinculoId: number
  registroId: number
  agenteId: number
  agenteNombre: string | null
  procesoNombre: string
  pctCumplimiento: number
  fecha: string
}

export interface AuditoriaDetalle extends Omit<Auditoria, 'totalRegistros' | 'promedioCumplimiento'> {
  registros: RegistroEnAuditoria[]
}

export interface CrearAuditoriaPayload {
  titulo: string
  alcance?: string
  periodoInicio?: string
  periodoFin?: string
  registroIds?: number[]
}

export const VEREDICTO_LABELS: Record<VeredictoAuditoria, string> = {
  en_curso: 'En curso',
  aprobada: 'Aprobada',
  observaciones: 'Con observaciones',
  no_aprobada: 'No aprobada',
}
