export type EvaluacionEstado = 'borrador' | 'finalizada'

export interface Criterio {
  key: string
  label: string
}

export interface CriterioCalificado {
  criterio: string
  calificacion: number
}

export interface Meta {
  id?: number
  descripcion: string
  cumplimiento: number | null
}

export interface Ciclo {
  id: number
  nombre: string
  fechaInicio: string
  fechaFin: string
  activo: boolean
}

export interface Evaluacion {
  id: number
  cicloId: number
  cicloNombre: string
  empleadoId: number
  empleadoNombre: string
  evaluadorId: number | null
  evaluadorNombre: string | null
  estado: EvaluacionEstado
  calificacion: number | null
  fortalezas: string | null
  areasMejora: string | null
  planAccion: string | null
  fechaCreacion: string
  fechaFinalizada: string | null
  criterios: CriterioCalificado[]
  metas: Meta[]
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  }
  return undefined
}

export function parseCiclo(raw: Record<string, unknown>): Ciclo {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    fechaInicio: String(pick(raw, 'fechaInicio') ?? ''),
    fechaFin: String(pick(raw, 'fechaFin') ?? ''),
    activo: Boolean(pick(raw, 'activo') ?? true),
  }
}

export function parseEvaluacion(raw: Record<string, unknown>): Evaluacion {
  const estadoRaw = String(pick(raw, 'estado') ?? 'borrador')
  const estado = (estadoRaw === 'finalizada' ? 'finalizada' : 'borrador') as EvaluacionEstado

  return {
    id: Number(pick(raw, 'id') ?? 0),
    cicloId: Number(pick(raw, 'cicloId') ?? 0),
    cicloNombre: String(pick(raw, 'cicloNombre') ?? ''),
    empleadoId: Number(pick(raw, 'empleadoId') ?? 0),
    empleadoNombre: String(pick(raw, 'empleadoNombre') ?? ''),
    evaluadorId: pick(raw, 'evaluadorId') != null ? Number(pick(raw, 'evaluadorId')) : null,
    evaluadorNombre: pick(raw, 'evaluadorNombre') ? String(pick(raw, 'evaluadorNombre')) : null,
    estado,
    calificacion: pick(raw, 'calificacion') != null ? Number(pick(raw, 'calificacion')) : null,
    fortalezas: pick(raw, 'fortalezas') ? String(pick(raw, 'fortalezas')) : null,
    areasMejora: pick(raw, 'areasMejora') ? String(pick(raw, 'areasMejora')) : null,
    planAccion: pick(raw, 'planAccion') ? String(pick(raw, 'planAccion')) : null,
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? ''),
    fechaFinalizada: pick(raw, 'fechaFinalizada') ? String(pick(raw, 'fechaFinalizada')) : null,
    criterios: Array.isArray(raw['criterios']) ? (raw['criterios'] as CriterioCalificado[]) : [],
    metas: Array.isArray(raw['metas']) ? (raw['metas'] as Meta[]) : [],
  }
}
