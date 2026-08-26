export type IncapacidadTipo = 'enfermedad_general' | 'maternidad' | 'riesgo_trabajo' | 'otro'
export type IncapacidadEstado = 'pendiente' | 'aprobada' | 'rechazada'

export interface IncapacidadDocumento {
  id: number
  incapacidadId: number
  nombre: string
  mime: string | null
  tamanoBytes: number
}

export interface Incapacidad {
  id: number
  usuarioId: number
  usuarioNombre: string
  tipo: IncapacidadTipo
  motivo: string | null
  fechaInicio: string
  fechaFin: string
  dias: number
  estado: IncapacidadEstado
  comentarioAdmin: string | null
  fechaSolicitud: string
  fechaRespuesta: string | null
  documentos: IncapacidadDocumento[]
}

export const INCAPACIDAD_TIPOS: { value: IncapacidadTipo; label: string }[] = [
  { value: 'enfermedad_general', label: 'Enfermedad general' },
  { value: 'maternidad', label: 'Maternidad' },
  { value: 'riesgo_trabajo', label: 'Riesgo de trabajo' },
  { value: 'otro', label: 'Otro' },
]

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  }
  return undefined
}

export function parseIncapacidadDocumento(raw: Record<string, unknown>): IncapacidadDocumento {
  return {
    id: Number(pick(raw, 'id') ?? 0),
    incapacidadId: Number(pick(raw, 'incapacidadId') ?? 0),
    nombre: String(pick(raw, 'nombre') ?? ''),
    mime: pick(raw, 'mime') ? String(pick(raw, 'mime')) : null,
    tamanoBytes: Number(pick(raw, 'tamanoBytes') ?? 0),
  }
}

export function parseIncapacidad(raw: Record<string, unknown>): Incapacidad {
  const tipoRaw = String(pick(raw, 'tipo') ?? 'otro')
  const tipo = INCAPACIDAD_TIPOS.some((t) => t.value === tipoRaw) ? (tipoRaw as IncapacidadTipo) : 'otro'
  const estadoRaw = String(pick(raw, 'estado') ?? 'pendiente')
  const estado = (['pendiente', 'aprobada', 'rechazada'].includes(estadoRaw) ? estadoRaw : 'pendiente') as IncapacidadEstado

  return {
    id: Number(pick(raw, 'id') ?? 0),
    usuarioId: Number(pick(raw, 'usuarioId') ?? 0),
    usuarioNombre: String(pick(raw, 'usuarioNombre') ?? ''),
    tipo,
    motivo: pick(raw, 'motivo') ? String(pick(raw, 'motivo')) : null,
    fechaInicio: String(pick(raw, 'fechaInicio') ?? ''),
    fechaFin: String(pick(raw, 'fechaFin') ?? ''),
    dias: Number(pick(raw, 'dias') ?? 0),
    estado,
    comentarioAdmin: pick(raw, 'comentarioAdmin') ? String(pick(raw, 'comentarioAdmin')) : null,
    fechaSolicitud: String(pick(raw, 'fechaSolicitud') ?? ''),
    fechaRespuesta: pick(raw, 'fechaRespuesta') ? String(pick(raw, 'fechaRespuesta')) : null,
    documentos: Array.isArray(raw['documentos']) ? (raw['documentos'] as Record<string, unknown>[]).map(parseIncapacidadDocumento) : [],
  }
}
