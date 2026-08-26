/* ── Tipos compartidos del módulo de Encuestas ──
   Usados tanto por la vista privada (/mis-encuestas, /encuestas admin)
   como por la vista pública (/encuesta/:slug). */

export type PreguntaTipo = 'opcion_multiple' | 'texto' | 'escala' | 'abierta' | 'cerrada'

export interface Pregunta {
  id: number
  texto: string
  tipo: PreguntaTipo
  opciones: string[]
}

export type TipoAcceso = 'privada' | 'publica'

export interface Encuesta {
  id: number
  titulo: string
  descripcion: string
  estado: 'activa' | 'cerrada' | 'borrador'
  respondida: boolean
  asignacionId: number | null
  preguntas: Pregunta[]
  fechaInicio?: string
  fechaFin?: string
  totalPreguntas?: number
  totalAsignados?: number
  publicarEn?: string
  visibilidad?: string
  tipoAcceso?: TipoAcceso
  slugPublico?: string | null
  categoria?: string | null
}

/** Normaliza el tipo de pregunta legado a la clasificación simple abierta/cerrada
 *  usada por el nuevo form builder. 'escala' se conserva solo por compatibilidad
 *  de datos viejos, no se ofrece como opción nueva en el builder. */
export function esTipoCerrado(tipo: PreguntaTipo): boolean {
  return tipo === 'opcion_multiple' || tipo === 'cerrada'
}

export function esTipoAbierto(tipo: PreguntaTipo): boolean {
  return tipo === 'texto' || tipo === 'abierta' || tipo === 'escala'
}

/* ── Parsers ── */
function parseOpciones(opts: unknown): string[] {
  try { return typeof opts === 'string' ? JSON.parse(opts) : (Array.isArray(opts) ? opts : []) } catch { return [] }
}

export function parsePregunta(r: Record<string, unknown>): Pregunta {
  const opciones = parseOpciones(r['opciones'] ?? r['options'] ?? r['OPCIONES'] ?? '[]')
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['preguntaId'] ?? 0),
    texto: String(r['texto'] ?? r['TEXTO'] ?? r['pregunta'] ?? r['question'] ?? ''),
    tipo: (String(r['tipo'] ?? r['TIPO'] ?? r['type'] ?? 'texto')) as Pregunta['tipo'],
    opciones,
  }
}

export function parseEncuesta(r: Record<string, unknown>): Encuesta {
  const pregs = Array.isArray(r['preguntas']) ? r['preguntas'] : []
  const estadoRaw = String(r['estado'] ?? r['ESTADO'] ?? r['status'] ?? 'borrador').toLowerCase()
  // EAS_ESTADO viene como 'completada', ENC_ESTADO como 'activa'/'cerrada'/'FINALIZADA'
  const estadoAsignacion = String(r['EAS_ESTADO'] ?? r['estadoAsignacion'] ?? '').toLowerCase()
  const respondida = estadoAsignacion === 'completada' || Boolean(r['respondida'] ?? r['RESPONDIDA'] ?? r['answered'])
  // Normalizar: FINALIZADA/finalizada → cerrada
  const estadoNorm = (estadoRaw === 'finalizada' ? 'cerrada' : estadoRaw) as Encuesta['estado']
  return {
    // encuestaId existe en vista usuario; id en vista admin
    id: Number(r['encuestaId'] ?? r['id'] ?? r['ID'] ?? 0),
    titulo: String(r['titulo'] ?? r['TITULO'] ?? r['title'] ?? r['nombre'] ?? ''),
    descripcion: String(r['descripcion'] ?? r['DESCRIPCION'] ?? r['description'] ?? ''),
    estado: estadoNorm,
    respondida,
    asignacionId: Number(r['asignacionId'] ?? r['EAS_ID'] ?? r['asignacion_id'] ?? null) || null,
    preguntas: (pregs as Record<string, unknown>[]).map(parsePregunta),
    fechaInicio: r['fechaInicio'] ? String(r['fechaInicio']).slice(0, 10) : undefined,
    fechaFin: r['fechaFin'] ? String(r['fechaFin']).slice(0, 10) : undefined,
    totalPreguntas: r['totalPreguntas'] !== undefined ? Number(r['totalPreguntas']) : undefined,
    publicarEn: r['publicarEn'] ? String(r['publicarEn']) : 'encuestas',
    visibilidad: r['visibilidad'] ? String(r['visibilidad']) : 'general',
    totalAsignados: r['totalAsignados'] !== undefined ? Number(r['totalAsignados']) : undefined,
    tipoAcceso: (r['tipoAcceso'] ? String(r['tipoAcceso']) : 'privada') as TipoAcceso,
    slugPublico: r['slugPublico'] != null ? String(r['slugPublico']) : null,
    categoria: r['categoria'] != null ? String(r['categoria']) : null,
  }
}

/* ── Resultados separados (dashboard con recharts) ── */
export interface OpcionResultado {
  opcion: string
  total: number
}

export interface PreguntaCerradaResultado {
  preguntaId: number
  pregunta: string
  opciones: OpcionResultado[]
}

export interface RespuestaAbiertaItem {
  respondiente: string
  esPublico: boolean
  respuesta: string
  fecha: string
}

export interface PreguntaAbiertaResultado {
  preguntaId: number
  pregunta: string
  respuestas: RespuestaAbiertaItem[]
}

export interface ResultadosSeparados {
  cerradas: PreguntaCerradaResultado[]
  abiertas: PreguntaAbiertaResultado[]
}

export function parseResultadosSeparados(data: unknown): ResultadosSeparados {
  const root = (data as Record<string, unknown>)?.['data'] ?? data
  const r = (root ?? {}) as Record<string, unknown>
  const cerradas = (Array.isArray(r['cerradas']) ? r['cerradas'] : []) as Record<string, unknown>[]
  const abiertas = (Array.isArray(r['abiertas']) ? r['abiertas'] : []) as Record<string, unknown>[]
  return {
    cerradas: cerradas.map((c) => ({
      preguntaId: Number(c['preguntaId'] ?? 0),
      pregunta: String(c['pregunta'] ?? ''),
      opciones: (Array.isArray(c['opciones']) ? c['opciones'] : []) as OpcionResultado[],
    })),
    abiertas: abiertas.map((a) => ({
      preguntaId: Number(a['preguntaId'] ?? 0),
      pregunta: String(a['pregunta'] ?? ''),
      respuestas: (Array.isArray(a['respuestas']) ? a['respuestas'] : []) as RespuestaAbiertaItem[],
    })),
  }
}

/* ── Payload de respuesta (privada y pública) ── */
export interface RespuestaPayloadItem {
  preguntaId: number
  respuesta: string
}

export interface ResponderPayload {
  respuestas: RespuestaPayloadItem[]
}
