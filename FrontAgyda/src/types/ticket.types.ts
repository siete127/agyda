export type TicketPrioridad = 'baja' | 'media' | 'alta'
export type TicketEstado = 'abierto' | 'asignado' | 'en_proceso' | 'resuelto' | 'cerrado'
export type TicketArea = 'TI' | 'ST'

export interface Ticket {
  id: number
  titulo: string
  descripcion: string
  prioridad: TicketPrioridad
  area: TicketArea
  estado: TicketEstado
  solicitanteId: number
  solicitanteNombre: string | null
  asignadoA: number | null
  asignadoNombre: string | null
  fechaCreacion: string
  fechaAsignacion: string | null
  fechaPrimeraRespuesta: string | null
  fechaCierre: string | null
  rating: number | null
  ratingComentario: string | null
  tiempoAtencionMinutos: number | null
  slaRespuesta: SlaEstado | null
  slaResolucion: SlaEstado | null
}

export type SlaEstado = 'cumplido' | 'incumplido' | 'en_riesgo' | 'en_tiempo'

export const SLA_LABELS: Record<SlaEstado, string> = {
  cumplido: 'SLA cumplido',
  incumplido: 'SLA incumplido',
  en_riesgo: 'Por vencer',
  en_tiempo: 'En tiempo',
}

export const SLA_COLORS: Record<SlaEstado, string> = {
  cumplido: 'bg-green-100 text-green-700',
  incumplido: 'bg-red-100 text-red-700',
  en_riesgo: 'bg-amber-100 text-amber-700',
  en_tiempo: 'bg-blue-100 text-blue-700',
}

export interface TicketComment {
  id: number
  ticketId: number
  autorId: number
  autorNombre: string | null
  comentario: string
  fecha: string
}

export const PRIORIDAD_COLORS: Record<TicketPrioridad, string> = {
  baja:  'bg-green-100 text-green-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta:  'bg-red-100 text-red-700',
}

export const ESTADO_COLORS: Record<TicketEstado, string> = {
  abierto:    'bg-blue-100 text-blue-700',
  asignado:   'bg-purple-100 text-purple-700',
  en_proceso: 'bg-orange-100 text-orange-700',
  resuelto:   'bg-green-100 text-green-700',
  cerrado:    'bg-gray-100 text-gray-600',
}

export const ESTADO_LABELS: Record<TicketEstado, string> = {
  abierto:    'Abierto',
  asignado:   'Asignado',
  en_proceso: 'En proceso',
  resuelto:   'Resuelto',
  cerrado:    'Cerrado',
}

export function parseTicket(raw: Record<string, unknown>): Ticket {
  const p = (a: string, b: string) => raw[a] ?? raw[b]
  const parseDate = (v: unknown): string | null => {
    if (!v) return null
    if (typeof v === 'number') return new Date(v).toISOString()
    if (typeof v === 'string' && v) return v
    return null
  }
  const parseNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null
    return Number(v) || null
  }

  return {
    id: Number(p('ID', 'id') ?? 0),
    titulo: String(p('TITULO', 'titulo') ?? ''),
    descripcion: String(p('DESCRIPCION', 'descripcion') ?? ''),
    prioridad: String(p('PRIORIDAD', 'prioridad') ?? 'media') as TicketPrioridad,
    area: String(p('AREA', 'area') ?? 'TI') as TicketArea,
    estado: String(p('ESTADO', 'estado') ?? 'abierto') as TicketEstado,
    solicitanteId: Number(p('SOLICITANTE_ID', 'solicitanteId') ?? 0),
    solicitanteNombre: String(p('SOLICITANTE_NOMBRE', 'solicitanteNombre') ?? '') || null,
    asignadoA: parseNum(p('ASIGNADO_A', 'asignadoA')),
    asignadoNombre: String(p('ASIGNADO_NOMBRE', 'asignadoNombre') ?? '') || null,
    fechaCreacion: parseDate(p('FECHA_CREACION', 'fechaCreacion')) ?? new Date().toISOString(),
    fechaAsignacion: parseDate(p('FECHA_ASIGNACION', 'fechaAsignacion')),
    fechaPrimeraRespuesta: parseDate(p('FECHA_PRIMERA_RESPUESTA', 'fechaPrimeraRespuesta')),
    fechaCierre: parseDate(p('FECHA_CIERRE', 'fechaCierre')),
    rating: parseNum(p('RATING', 'rating') ?? p('SAT_RATING', 'satisfaccionRating')),
    ratingComentario: String(p('COMENTARIO_SATISFACCION', 'satisfaccionComentario') ?? '') || null,
    tiempoAtencionMinutos: parseNum(p('tiempoAtencionMinutos', 'TIEMPO_ATENCION_MINUTOS')),
    slaRespuesta: (p('slaRespuesta', 'SLA_RESPUESTA') as SlaEstado | undefined) ?? null,
    slaResolucion: (p('slaResolucion', 'SLA_RESOLUCION') as SlaEstado | undefined) ?? null,
  }
}

export function parseTicketComment(raw: Record<string, unknown>): TicketComment {
  const parseDate = (v: unknown): string => {
    if (!v) return new Date().toISOString()
    if (typeof v === 'number') return new Date(v).toISOString()
    return String(v)
  }
  return {
    id: Number(raw['id'] ?? raw['COM_ID'] ?? raw['ID'] ?? 0),
    ticketId: Number(raw['ticketId'] ?? raw['TICKET_ID'] ?? 0),
    autorId: Number(raw['autorId'] ?? raw['userId'] ?? raw['USER_ID'] ?? raw['AUTOR_ID'] ?? 0),
    // backend devuelve userNombre o autorNombre
    autorNombre: String(raw['userNombre'] ?? raw['autorNombre'] ?? raw['AUTOR_NOMBRE'] ?? raw['USER_NOMBRE'] ?? '') || null,
    // backend devuelve contenido o comentario
    comentario: String(raw['contenido'] ?? raw['comentario'] ?? raw['CONTENIDO'] ?? raw['COMENTARIO'] ?? ''),
    // backend devuelve createdAt o fecha
    fecha: parseDate(raw['createdAt'] ?? raw['fecha'] ?? raw['CREATED_AT'] ?? raw['FECHA']),
  }
}
