// Citas y tratamientos del cliente (CRM Cliente — Fase 3). Molde de caso.types.ts.

export type CitaModalidad = 'videollamada' | 'telefonica' | 'generica'
export type CitaEstatus = 'agendada' | 'confirmada' | 'reprogramada' | 'cancelada' | 'asistio' | 'no_asistio'
export type TratamientoEstatus = 'activo' | 'pausado' | 'completado' | 'cancelado'
export type SolicitudCitaTipo = 'reprogramar' | 'cancelar'

export const CITA_MODALIDAD_CONFIG: Record<CitaModalidad, { label: string; bg: string; text: string }> = {
  videollamada: { label: 'Videollamada', bg: 'bg-violet-100', text: 'text-violet-700' },
  telefonica:   { label: 'Telefónica',   bg: 'bg-teal-100',   text: 'text-teal-700' },
  generica:     { label: 'Cita',         bg: 'bg-gray-100',   text: 'text-gray-600' },
}

export const ESTATUS_CITA_CONFIG: Record<CitaEstatus, { label: string; bg: string; text: string; dot: string }> = {
  agendada:     { label: 'Agendada',       bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  confirmada:   { label: 'Confirmada',     bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  reprogramada: { label: 'Reprogramada',   bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500' },
  cancelada:    { label: 'Cancelada',      bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
  asistio:      { label: 'Asistió',        bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  no_asistio:   { label: 'No asistió',     bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
}

export const TRATAMIENTO_ESTATUS_CONFIG: Record<TratamientoEstatus, { label: string; bg: string; text: string }> = {
  activo:     { label: 'Activo',     bg: 'bg-blue-50',     text: 'text-blue-700' },
  pausado:    { label: 'Pausado',    bg: 'bg-amber-100',   text: 'text-amber-700' },
  completado: { label: 'Completado', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  cancelado:  { label: 'Cancelado',  bg: 'bg-gray-100',    text: 'text-gray-500' },
}

// Minutos de anticipación que puede elegir el agente (deben coincidir con
// RECORDAR_MIN_VALIDOS del backend).
export const RECORDAR_OPCIONES: { min: number; label: string }[] = [
  { min: 2880, label: '2 días antes' },
  { min: 1440, label: '1 día antes' },
  { min: 120, label: '2 horas antes' },
  { min: 60, label: '1 hora antes' },
  { min: 30, label: '30 min antes' },
  { min: 15, label: '15 min antes' },
]

export interface Cita {
  id: number
  contactoId: number
  contactoNombre: string | null
  contactoCorreo: string | null
  contactoTelefono: string | null
  tratamientoId: number | null
  tratamientoNombre: string | null
  tratamientoTotalSesiones: number | null
  numeroSesion: number | null
  modalidad: CitaModalidad
  titulo: string
  motivo: string | null
  fechaHora: string
  duracionMin: number
  enlace: string | null
  telefono: string | null
  estatus: CitaEstatus
  confirmadaPorCliente: boolean
  fechaConfirmacion: string | null
  recordarMinAntes: string | null
  asignadoA: number | null
  asignadoNombre: string | null
  creadoPor: number | null
  fechaCreacion: string
  notaResultado: string | null
  solicitudPendiente?: {
    id: number
    tipo: SolicitudCitaTipo
    fechaPropuesta: string | null
    motivo: string | null
    fecha: string
  } | null
}

export interface Tratamiento {
  id: number
  contactoId: number
  contactoNombre: string | null
  nombre: string
  descripcion: string | null
  totalSesiones: number | null
  estatus: TratamientoEstatus
  asignadoA: number | null
  asignadoNombre: string | null
  creadoPor: number | null
  fechaInicio: string | null
  fechaCreacion: string
  sesionesCompletadas: number
  citas?: Cita[]
}

export interface CitaSolicitud {
  id: number
  citaId: number
  tipo: SolicitudCitaTipo
  fechaPropuesta: string | null
  motivo: string | null
  estatus: string
  fecha: string
  citaTitulo: string
  citaFechaHora: string
  contactoNombre: string | null
  asignadoA: number | null
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseCita(raw: Record<string, unknown>): Cita {
  return {
    id:                       Number(pick(raw, 'id')),
    contactoId:               Number(pick(raw, 'contactoId') ?? 0),
    contactoNombre:           pick(raw, 'contactoNombre') as string | null,
    contactoCorreo:           pick(raw, 'contactoCorreo') as string | null,
    contactoTelefono:         pick(raw, 'contactoTelefono') as string | null,
    tratamientoId:            pick(raw, 'tratamientoId') as number | null,
    tratamientoNombre:        pick(raw, 'tratamientoNombre') as string | null,
    tratamientoTotalSesiones: pick(raw, 'tratamientoTotalSesiones') as number | null,
    numeroSesion:             pick(raw, 'numeroSesion') as number | null,
    modalidad:                (pick(raw, 'modalidad') as CitaModalidad) ?? 'generica',
    titulo:                   String(pick(raw, 'titulo') ?? ''),
    motivo:                   pick(raw, 'motivo') as string | null,
    fechaHora:                String(pick(raw, 'fechaHora') ?? ''),
    duracionMin:              Number(pick(raw, 'duracionMin') ?? 30),
    enlace:                   pick(raw, 'enlace') as string | null,
    telefono:                 pick(raw, 'telefono') as string | null,
    estatus:                  (pick(raw, 'estatus') as CitaEstatus) ?? 'agendada',
    confirmadaPorCliente:     Boolean(pick(raw, 'confirmadaPorCliente')),
    fechaConfirmacion:        pick(raw, 'fechaConfirmacion') as string | null,
    recordarMinAntes:         pick(raw, 'recordarMinAntes') as string | null,
    asignadoA:                pick(raw, 'asignadoA') as number | null,
    asignadoNombre:           pick(raw, 'asignadoNombre') as string | null,
    creadoPor:                pick(raw, 'creadoPor') as number | null,
    fechaCreacion:            String(pick(raw, 'fechaCreacion') ?? ''),
    notaResultado:            pick(raw, 'notaResultado') as string | null,
    solicitudPendiente:       (raw.solicitudPendiente ?? null) as Cita['solicitudPendiente'],
  }
}

export function parseTratamiento(raw: Record<string, unknown>): Tratamiento {
  return {
    id:                 Number(pick(raw, 'id')),
    contactoId:         Number(pick(raw, 'contactoId') ?? 0),
    contactoNombre:     pick(raw, 'contactoNombre') as string | null,
    nombre:             String(pick(raw, 'nombre') ?? ''),
    descripcion:        pick(raw, 'descripcion') as string | null,
    totalSesiones:      pick(raw, 'totalSesiones') as number | null,
    estatus:            (pick(raw, 'estatus') as TratamientoEstatus) ?? 'activo',
    asignadoA:          pick(raw, 'asignadoA') as number | null,
    asignadoNombre:     pick(raw, 'asignadoNombre') as string | null,
    creadoPor:          pick(raw, 'creadoPor') as number | null,
    fechaInicio:        pick(raw, 'fechaInicio') as string | null,
    fechaCreacion:      String(pick(raw, 'fechaCreacion') ?? ''),
    sesionesCompletadas: Number(pick(raw, 'sesionesCompletadas') ?? 0),
    citas:             Array.isArray(raw.citas) ? (raw.citas as Record<string, unknown>[]).map(parseCita) : undefined,
  }
}

export function parseCitaSolicitud(raw: Record<string, unknown>): CitaSolicitud {
  return {
    id:            Number(pick(raw, 'id')),
    citaId:        Number(pick(raw, 'citaId') ?? 0),
    tipo:          (pick(raw, 'tipo') as SolicitudCitaTipo) ?? 'reprogramar',
    fechaPropuesta: pick(raw, 'fechaPropuesta') as string | null,
    motivo:        pick(raw, 'motivo') as string | null,
    estatus:       String(pick(raw, 'estatus') ?? 'pendiente'),
    fecha:         String(pick(raw, 'fecha') ?? ''),
    citaTitulo:    String(pick(raw, 'citaTitulo') ?? ''),
    citaFechaHora: String(pick(raw, 'citaFechaHora') ?? ''),
    contactoNombre: pick(raw, 'contactoNombre') as string | null,
    asignadoA:     pick(raw, 'asignadoA') as number | null,
  }
}
