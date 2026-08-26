export type PreguntaExamenTipo = 'abierta' | 'cerrada'
export type TipoAccesoExamen = 'privado' | 'publico'

export interface OpcionExamen {
  id: number
  texto: string
  esCorrecta?: boolean
  orden: number
}

export interface PreguntaExamen {
  id: number
  texto: string
  tipo: PreguntaExamenTipo
  puntos: number
  orden: number
  opciones: OpcionExamen[]
}

export interface Examen {
  id: number
  cursoId: number
  titulo: string
  descripcion: string | null
  tipoAcceso: TipoAccesoExamen
  slugPublico: string | null
  puntajeMinimo: number
  fechaCreacion: string
  activo: boolean
}

export interface ExamenDetalle extends Examen {
  preguntas: PreguntaExamen[]
}

export interface ExamenResultado {
  intentoId: number
  puntajeObtenido: number
  puntajeTotal: number
  porcentaje: number
  aprobado: boolean
}

export interface ExamenIntento {
  id: number
  usuarioId: number | null
  usuarioNombre: string | null
  respondienteId: number | null
  respondienteNombre: string | null
  respondienteEmail: string | null
  puntajeObtenido: number
  puntajeTotal: number
  porcentaje: number
  aprobado: boolean
  fecha: string
}

export interface RespuestaExamenItem {
  preguntaId: number
  opcionId?: number
  texto?: string
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseOpcionExamen(raw: Record<string, unknown>): OpcionExamen {
  return {
    id: Number(pick(raw, 'id')),
    texto: String(pick(raw, 'texto') ?? ''),
    esCorrecta: pick(raw, 'esCorrecta') != null ? Boolean(pick(raw, 'esCorrecta')) : undefined,
    orden: Number(pick(raw, 'orden') ?? 0),
  }
}

export function parsePreguntaExamen(raw: Record<string, unknown>): PreguntaExamen {
  const opciones = Array.isArray(raw['opciones']) ? (raw['opciones'] as Record<string, unknown>[]) : []
  return {
    id: Number(pick(raw, 'id')),
    texto: String(pick(raw, 'texto') ?? ''),
    tipo: (pick(raw, 'tipo') as PreguntaExamenTipo) ?? 'abierta',
    puntos: Number(pick(raw, 'puntos') ?? 1),
    orden: Number(pick(raw, 'orden') ?? 0),
    opciones: opciones.map(parseOpcionExamen),
  }
}

export function parseExamen(raw: Record<string, unknown>): Examen {
  return {
    id: Number(pick(raw, 'id')),
    cursoId: Number(pick(raw, 'cursoId')),
    titulo: String(pick(raw, 'titulo') ?? ''),
    descripcion: pick(raw, 'descripcion') as string | null,
    tipoAcceso: (pick(raw, 'tipoAcceso') as TipoAccesoExamen) ?? 'privado',
    slugPublico: pick(raw, 'slugPublico') as string | null,
    puntajeMinimo: Number(pick(raw, 'puntajeMinimo') ?? 70),
    fechaCreacion: String(pick(raw, 'fechaCreacion') ?? ''),
    activo: Boolean(pick(raw, 'activo') ?? true),
  }
}

export function parseExamenDetalle(raw: Record<string, unknown>): ExamenDetalle {
  const preguntas = Array.isArray(raw['preguntas']) ? (raw['preguntas'] as Record<string, unknown>[]) : []
  return { ...parseExamen(raw), preguntas: preguntas.map(parsePreguntaExamen) }
}

export function parseExamenIntento(raw: Record<string, unknown>): ExamenIntento {
  return {
    id: Number(pick(raw, 'id')),
    usuarioId: pick(raw, 'usuarioId') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre') as string | null,
    respondienteId: pick(raw, 'respondienteId') as number | null,
    respondienteNombre: pick(raw, 'respondienteNombre') as string | null,
    respondienteEmail: pick(raw, 'respondienteEmail') as string | null,
    puntajeObtenido: Number(pick(raw, 'puntajeObtenido') ?? 0),
    puntajeTotal: Number(pick(raw, 'puntajeTotal') ?? 0),
    porcentaje: Number(pick(raw, 'porcentaje') ?? 0),
    aprobado: Boolean(pick(raw, 'aprobado')),
    fecha: String(pick(raw, 'fecha') ?? ''),
  }
}
