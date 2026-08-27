export type TicketPrioridad = 'P1' | 'P2' | 'P3' | 'P4'
export type TicketEstado = 'abierto' | 'asignado' | 'en_proceso' | 'en_espera' | 'resuelto' | 'reabierto' | 'cerrado'
export type TicketArea = 'TI' | 'ST'
export type TicketClasificacion = 'incidente' | 'solicitud' | 'acceso' | 'problema' | 'cambio' | 'consulta' | 'alerta_automatica'
export type TicketImpacto = 'BAJO' | 'MEDIO' | 'ALTO'
export type TicketUrgencia = 'BAJA' | 'MEDIA' | 'ALTA'
export type TicketMotivoEspera = 'usuario' | 'proveedor' | 'autorizacion' | 'refaccion' | 'ventana'

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
  clasificacion: TicketClasificacion | null
  categoria: string | null
  subcategoria: string | null
  sede: string | null
  departamento: string | null
  activoAfectado: string | null
  impacto: TicketImpacto | null
  urgencia: TicketUrgencia | null
  nivelActual: number
  codigoCierre: string | null
  causaRaiz: string | null
  diagnostico: string | null
  accionesRealizadas: string | null
  fechaResolucionPropuesta: string | null
  validadoUsuario: boolean | null
  fechaValidacion: string | null
  reabiertoVeces: number
  articuloKbId: number | null
  motivoEspera: TicketMotivoEspera | null
  fechaInicioEspera: string | null
  minutosTotalEspera: number
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
  P1: 'bg-red-100 text-red-700',
  P2: 'bg-orange-100 text-orange-700',
  P3: 'bg-yellow-100 text-yellow-700',
  P4: 'bg-green-100 text-green-700',
}

export const PRIORIDAD_LABELS: Record<TicketPrioridad, string> = {
  P1: 'P1 - Crítica',
  P2: 'P2 - Alta',
  P3: 'P3 - Media',
  P4: 'P4 - Baja',
}

export const ESTADO_COLORS: Record<TicketEstado, string> = {
  abierto:    'bg-blue-100 text-blue-700',
  asignado:   'bg-purple-100 text-purple-700',
  en_proceso: 'bg-orange-100 text-orange-700',
  en_espera:  'bg-amber-100 text-amber-700',
  resuelto:   'bg-green-100 text-green-700',
  reabierto:  'bg-red-100 text-red-700',
  cerrado:    'bg-gray-100 text-gray-600',
}

export const ESTADO_LABELS: Record<TicketEstado, string> = {
  abierto:    'Abierto',
  asignado:   'Asignado',
  en_proceso: 'En proceso',
  en_espera:  'En espera',
  resuelto:   'Resuelto',
  reabierto:  'Reabierto',
  cerrado:    'Cerrado',
}

export const CLASIFICACION_LABELS: Record<TicketClasificacion, string> = {
  incidente: 'Incidente',
  solicitud: 'Solicitud de servicio',
  acceso: 'Acceso / Permisos',
  problema: 'Problema',
  cambio: 'Cambio',
  consulta: 'Consulta',
  alerta_automatica: 'Alerta automática',
}

export const MOTIVO_ESPERA_LABELS: Record<TicketMotivoEspera, string> = {
  usuario: 'Esperando al usuario',
  proveedor: 'Esperando a proveedor',
  autorizacion: 'Esperando autorización',
  refaccion: 'Esperando refacción',
  ventana: 'Esperando ventana de mantenimiento',
}

export const IMPACTO_URGENCIA_MATRIZ: Record<TicketImpacto, Record<TicketUrgencia, TicketPrioridad>> = {
  ALTO:  { ALTA: 'P1', MEDIA: 'P2', BAJA: 'P3' },
  MEDIO: { ALTA: 'P2', MEDIA: 'P3', BAJA: 'P4' },
  BAJO:  { ALTA: 'P3', MEDIA: 'P4', BAJA: 'P4' },
}

export function calcularPrioridad(impacto: TicketImpacto | '', urgencia: TicketUrgencia | ''): TicketPrioridad | null {
  if (!impacto || !urgencia) return null
  return IMPACTO_URGENCIA_MATRIZ[impacto][urgencia]
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
  const parseBool = (v: unknown): boolean | null => {
    if (v === null || v === undefined) return null
    if (typeof v === 'boolean') return v
    return v === 1 || v === '1' || v === true
  }

  return {
    id: Number(p('ID', 'id') ?? 0),
    titulo: String(p('TITULO', 'titulo') ?? ''),
    descripcion: String(p('DESCRIPCION', 'descripcion') ?? ''),
    prioridad: String(p('PRIORIDAD', 'prioridad') ?? 'P3') as TicketPrioridad,
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
    clasificacion: (String(p('CLASIFICACION', 'clasificacion') ?? '') || null) as TicketClasificacion | null,
    categoria: String(p('CATEGORIA', 'categoria') ?? '') || null,
    subcategoria: String(p('SUBCATEGORIA', 'subcategoria') ?? '') || null,
    sede: String(p('SEDE', 'sede') ?? '') || null,
    departamento: String(p('DEPARTAMENTO', 'departamento') ?? '') || null,
    activoAfectado: String(p('ACTIVO_AFECTADO', 'activoAfectado') ?? '') || null,
    impacto: (String(p('IMPACTO', 'impacto') ?? '') || null) as TicketImpacto | null,
    urgencia: (String(p('URGENCIA', 'urgencia') ?? '') || null) as TicketUrgencia | null,
    nivelActual: Number(p('NIVEL_ACTUAL', 'nivelActual') ?? 1),
    codigoCierre: String(p('CODIGO_CIERRE', 'codigoCierre') ?? '') || null,
    causaRaiz: String(p('CAUSA_RAIZ', 'causaRaiz') ?? '') || null,
    diagnostico: String(p('DIAGNOSTICO', 'diagnostico') ?? '') || null,
    accionesRealizadas: String(p('ACCIONES_REALIZADAS', 'accionesRealizadas') ?? '') || null,
    fechaResolucionPropuesta: parseDate(p('FECHA_RESOLUCION_PROPUESTA', 'fechaResolucionPropuesta')),
    validadoUsuario: parseBool(p('VALIDADO_USUARIO', 'validadoUsuario')),
    fechaValidacion: parseDate(p('FECHA_VALIDACION', 'fechaValidacion')),
    reabiertoVeces: Number(p('REABIERTO_VECES', 'reabiertoVeces') ?? 0),
    articuloKbId: parseNum(p('ARTICULO_KB_ID', 'articuloKbId')),
    motivoEspera: (String(p('MOTIVO_ESPERA', 'motivoEspera') ?? '') || null) as TicketMotivoEspera | null,
    fechaInicioEspera: parseDate(p('FECHA_INICIO_ESPERA', 'fechaInicioEspera')),
    minutosTotalEspera: Number(p('MINUTOS_TOTAL_ESPERA', 'minutosTotalEspera') ?? 0),
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
