export type ProyectoEstado = 'Activo' | 'Pausado' | 'Completado' | 'Cancelado'
export type TareaEstado = string   // dinámico: cualquier nombre de estatus
export type TareaPrioridad = 'baja' | 'media' | 'alta'

export interface EstatusProyecto {
  id: number
  nombre: string
  color: string
  orden: number
}

export interface Proyecto {
  id: number
  nombre: string
  descripcion: string
  fechaInicio: string
  fechaFin: string
  estado: ProyectoEstado
  cliente: string
  creadorId: number | null
}

export interface Tarea {
  id: number
  proyectoId: number
  titulo: string
  descripcion: string
  estado: TareaEstado
  prioridad: TareaPrioridad
  /** Nombres de los participantes asignados (se guardan como texto separado por comas) */
  asignados: string[]
  fechaInicio: string | null
  fechaFin: string | null
  completada: boolean
}

export interface MiembroProyecto {
  id: number
  proyectoId: number
  usuarioId: number
  nombre: string
  rol: string
}

export const PROYECTO_ESTADO_COLORS: Record<ProyectoEstado, string> = {
  Activo:     'bg-green-100 text-green-700',
  Pausado:    'bg-yellow-100 text-yellow-700',
  Completado: 'bg-blue-100 text-blue-700',
  Cancelado:  'bg-red-100 text-red-700',
}

// Mantenidos para compatibilidad, el kanban ahora usa estatus dinámicos desde BD
export const TAREA_ESTADO_LABELS: Record<string, string> = {
  pendiente:   'Pendiente',
  en_progreso: 'En progreso',
  completada:  'Completada',
  cancelada:   'Cancelada',
}

export const TAREA_COLUMNAS: { id: TareaEstado; label: string; color: string }[] = [
  { id: 'pendiente',   label: 'Pendiente',   color: 'bg-gray-50 border-gray-200' },
  { id: 'en_progreso', label: 'En progreso', color: 'bg-blue-50 border-blue-200' },
  { id: 'completada',  label: 'Completada',  color: 'bg-green-50 border-green-200' },
]

const ESTADO_MAP: Record<string, ProyectoEstado> = {
  'activo': 'Activo',
  'en proceso': 'Activo',
  'en_proceso': 'Activo',
  'in_progress': 'Activo',
  'pendiente': 'Activo',
  'pausado': 'Pausado',
  'paused': 'Pausado',
  'on_hold': 'Pausado',
  'completado': 'Completado',
  'terminado': 'Completado',
  'completed': 'Completado',
  'done': 'Completado',
  'cancelado': 'Cancelado',
  'cancelled': 'Cancelado',
  'canceled': 'Cancelado',
}

function normalizeEstado(raw: unknown): ProyectoEstado {
  const key = String(raw ?? '').trim().toLowerCase()
  return ESTADO_MAP[key] ?? 'Activo'
}

export function parseProyecto(raw: Record<string, unknown>): Proyecto {
  const parseId = (v: unknown) => Number(v) || 0
  const id = parseId(raw['id']) || parseId(raw['PROY_ID']) || parseId(raw['proyectoId'])
  const creadorRaw = raw['creadorId'] ?? raw['PROY_CREADOR_ID'] ?? raw['creador_id'] ?? null
  return {
    id,
    nombre: String(raw['name'] ?? raw['PROY_NOMBRE'] ?? raw['nombre'] ?? ''),
    descripcion: String(raw['description'] ?? raw['PROY_DESCRIPCION'] ?? raw['descripcion'] ?? ''),
    fechaInicio: String(raw['startDate'] ?? raw['PROY_FECHA_INICIO'] ?? raw['fechaInicio'] ?? new Date().toISOString()),
    fechaFin: String(raw['endDate'] ?? raw['PROY_FECHA_FIN'] ?? raw['fechaFin'] ?? new Date().toISOString()),
    estado: normalizeEstado(raw['status'] ?? raw['PROY_ESTADO'] ?? raw['estado']),
    cliente: String(raw['clientName'] ?? raw['PROY_CLIENTE'] ?? raw['cliente'] ?? ''),
    creadorId: creadorRaw !== null ? (Number(creadorRaw) || null) : null,
  }
}

const TAREA_ESTADO_MAP: Record<string, TareaEstado> = {
  'pendiente': 'pendiente',
  'todo': 'pendiente',
  'propuesto': 'pendiente',
  'en_progreso': 'en_progreso',
  'en progreso': 'en_progreso',
  'in_progress': 'en_progreso',
  'review': 'en_progreso',
  'completada': 'completada',
  'completado': 'completada',
  'done': 'completada',
  'completed': 'completada',
  'aprobado': 'completada',
  'cancelada': 'cancelada',
  'cancelado': 'cancelada',
  'rechazado': 'cancelada',
  'cancelled': 'cancelada',
  'canceled': 'cancelada',
}

function normalizeTareaEstado(raw: unknown): TareaEstado {
  const original = String(raw ?? '').trim()
  if (!original) return 'Pendiente'
  // Si el valor ya está en el mapa de compatibilidad, devolver el original (puede ser estatus dinámico)
  // Solo normalizar valores legacy en inglés/underscore
  const key = original.toLowerCase()
  const legacy: Record<string, string> = {
    'todo': 'Pendiente', 'propuesto': 'Pendiente',
    'in_progress': 'En progreso',
    'done': 'Completada', 'completed': 'Completada', 'aprobado': 'Completada',
    'cancelled': 'Cancelada', 'canceled': 'Cancelada', 'rechazado': 'Cancelada',
  }
  return legacy[key] ?? original  // preservar el valor tal cual si no es legacy
}

/** "Ana, Luis" → ["Ana", "Luis"] — tolera comas con o sin espacio y descarta vacíos */
export function parseAsignados(raw: unknown): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function joinAsignados(nombres: string[]): string {
  return nombres.map((n) => n.trim()).filter(Boolean).join(', ')
}

export function parseTarea(raw: Record<string, unknown>): Tarea {
  const p = (a: string, b: string) => raw[a] ?? raw[b]
  return {
    id: Number(p('id', 'ID') ?? p('tareaId', 'TAREA_ID') ?? 0),
    proyectoId: Number(p('proyectoId', 'PROYECTO_ID') ?? 0),
    titulo: String(p('titulo', 'TITULO') ?? p('title', 'nombre') ?? ''),
    descripcion: String(p('descripcion', 'DESCRIPCION') ?? p('description', 'detalle') ?? ''),
    estado: normalizeTareaEstado(p('estado', 'ESTADO') ?? p('status', 'STATUS')),
    prioridad: String(p('prioridad', 'PRIORIDAD') ?? 'media') as TareaPrioridad,
    asignados: parseAsignados(p('asignadoA', 'ASIGNADO_A') ?? p('assignedTo', 'ASSIGNED_TO')),
    fechaInicio: String(p('fechaInicio', 'FECHA_INICIO') ?? p('startDate', 'start_date') ?? '') || null,
    fechaFin: String(p('fechaFin', 'FECHA_FIN') ?? p('endDate', 'end_date') ?? '') || null,
    completada: Boolean(p('completada', 'COMPLETADA') ?? p('completed', 'done')),
  }
}
