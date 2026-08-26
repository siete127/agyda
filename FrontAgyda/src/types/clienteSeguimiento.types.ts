export type TipoContacto = 'llamada' | 'whatsapp' | 'correo' | 'reunion' | 'visita' | 'otro'
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type EstatusTarea = 'pendiente' | 'en_proceso' | 'completada' | 'cancelada'

// Catálogo de tipos de actividad (punto 4 del flujo del documento).
export type TipoTarea =
  | 'llamar_cliente' | 'solicitar_documentacion' | 'confirmar_recepcion_documentos'
  | 'dar_seguimiento_solicitud' | 'recordar_fecha_pago' | 'confirmar_pago'
  | 'renovacion_servicio' | 'encuesta_satisfaccion' | 'seguimiento_incidencia' | 'otro'

export const TIPO_TAREA_LABEL: Record<TipoTarea, string> = {
  llamar_cliente: 'Llamar al cliente',
  solicitar_documentacion: 'Solicitar documentación',
  confirmar_recepcion_documentos: 'Confirmar recepción de documentos',
  dar_seguimiento_solicitud: 'Dar seguimiento a una solicitud',
  recordar_fecha_pago: 'Recordar fecha de pago',
  confirmar_pago: 'Confirmar pago',
  renovacion_servicio: 'Renovación de servicio',
  encuesta_satisfaccion: 'Encuesta de satisfacción',
  seguimiento_incidencia: 'Seguimiento de incidencia',
  otro: 'Otro',
}

export const TIPO_CONTACTO_LABEL: Record<TipoContacto, string> = {
  llamada: 'Llamada', whatsapp: 'WhatsApp', correo: 'Correo', reunion: 'Reunión', visita: 'Visita', otro: 'Otro',
}

export const PRIORIDAD_CONFIG: Record<Prioridad, { label: string; bg: string; text: string }> = {
  baja:   { label: 'Baja',   bg: 'bg-gray-100',   text: 'text-gray-600' },
  media:  { label: 'Media',  bg: 'bg-blue-50',    text: 'text-blue-700' },
  alta:   { label: 'Alta',   bg: 'bg-amber-100',  text: 'text-amber-700' },
  urgente:{ label: 'Urgente',bg: 'bg-red-100',    text: 'text-red-700' },
}

export const ESTATUS_TAREA_CONFIG: Record<EstatusTarea, { label: string; bg: string; text: string; dot: string }> = {
  pendiente:   { label: 'Pendiente',   bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
  en_proceso:  { label: 'En proceso',  bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500' },
  completada:  { label: 'Completada',  bg: 'bg-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-500' },
  cancelada:   { label: 'Cancelada',   bg: 'bg-red-50',     text: 'text-red-600',    dot: 'bg-red-400' },
}

export interface CliSeguimiento {
  id: number
  contactoId: number
  tipoContacto: TipoContacto
  estatusColor: string
  motivo: string | null
  nota: string | null
  acuerdos: string | null
  proximaFecha: string | null
  usuarioId: number | null
  usuarioNombre: string | null
  fecha: string
}

export interface CliTarea {
  id: number
  contactoId: number
  contactoNombre?: string
  tipo: TipoTarea
  titulo: string
  descripcion: string | null
  prioridad: Prioridad
  asignadoA: number | null
  asignadoNombre: string | null
  fechaVencimiento: string | null
  estatus: EstatusTarea
  creadoPor: number | null
  fechaCreacion: string
  fechaCompletada: string | null
}

export type HistorialTipo = 'seguimiento' | 'tarea' | 'pago' | 'encuesta' | 'incidencia' | 'renovacion' | 'documento'

export const HISTORIAL_TIPO_LABEL: Record<HistorialTipo, string> = {
  seguimiento: 'Seguimiento', tarea: 'Tarea', pago: 'Pago', encuesta: 'Encuesta',
  incidencia: 'Incidencia', renovacion: 'Renovación', documento: 'Documento',
}

export interface HistorialEvento {
  tipo: HistorialTipo
  id: number
  fecha: string
  titulo: string
  detalle: string | null
  color: string | null
  usuarioId: number | null
  usuarioNombre: string | null
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseHistorialEvento(raw: Record<string, unknown>): HistorialEvento {
  return {
    tipo:          (pick(raw, 'tipo') as HistorialTipo) ?? 'seguimiento',
    id:            Number(pick(raw, 'id')),
    fecha:         String(pick(raw, 'fecha') ?? ''),
    titulo:        String(pick(raw, 'titulo') ?? ''),
    detalle:       pick(raw, 'detalle') as string | null,
    color:         pick(raw, 'color') as string | null,
    usuarioId:     pick(raw, 'usuarioId') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre') as string | null,
  }
}

export function parseCliSeguimiento(raw: Record<string, unknown>): CliSeguimiento {
  return {
    id:            Number(pick(raw, 'id')),
    contactoId:    Number(pick(raw, 'contactoId')),
    tipoContacto:  (pick(raw, 'tipoContacto') as TipoContacto) ?? 'otro',
    estatusColor:  String(pick(raw, 'estatusColor') ?? 'verde'),
    motivo:        pick(raw, 'motivo') as string | null,
    nota:          pick(raw, 'nota') as string | null,
    acuerdos:      pick(raw, 'acuerdos') as string | null,
    proximaFecha:  pick(raw, 'proximaFecha') as string | null,
    usuarioId:     pick(raw, 'usuarioId') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre') as string | null,
    fecha:         String(pick(raw, 'fecha') ?? ''),
  }
}

export function parseCliTarea(raw: Record<string, unknown>): CliTarea {
  return {
    id:               Number(pick(raw, 'id')),
    contactoId:       Number(pick(raw, 'contactoId')),
    contactoNombre:   pick(raw, 'contactoNombre') as string | undefined,
    tipo:             (pick(raw, 'tipo') as TipoTarea) ?? 'otro',
    titulo:           String(pick(raw, 'titulo') ?? ''),
    descripcion:      pick(raw, 'descripcion') as string | null,
    prioridad:        (pick(raw, 'prioridad') as Prioridad) ?? 'media',
    asignadoA:        pick(raw, 'asignadoA') as number | null,
    asignadoNombre:   pick(raw, 'asignadoNombre') as string | null,
    fechaVencimiento: pick(raw, 'fechaVencimiento') as string | null,
    estatus:          (pick(raw, 'estatus') as EstatusTarea) ?? 'pendiente',
    creadoPor:        pick(raw, 'creadoPor') as number | null,
    fechaCreacion:    String(pick(raw, 'fechaCreacion') ?? ''),
    fechaCompletada:  pick(raw, 'fechaCompletada') as string | null,
  }
}
