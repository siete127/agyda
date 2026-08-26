export type IncidenciaPrioridad = 'baja' | 'media' | 'alta' | 'critica'
// Enum literal del flujo (punto 7): 🟡Pendiente · 🔵En proceso · 🟠En espera
// del cliente · 🟢Resuelto · 🔴Escalado · ⚫Cerrado.
export type IncidenciaEstatus = 'pendiente' | 'en_proceso' | 'en_espera_cliente' | 'resuelto' | 'escalado' | 'cerrado'
export type IncidenciaOrigen = 'manual' | 'encuesta' | 'pago_vencido'

export const PRIORIDAD_INCIDENCIA_CONFIG: Record<IncidenciaPrioridad, { label: string; bg: string; text: string }> = {
  baja:    { label: 'Baja',    bg: 'bg-gray-100',  text: 'text-gray-600' },
  media:   { label: 'Media',   bg: 'bg-blue-50',   text: 'text-blue-700' },
  alta:    { label: 'Alta',    bg: 'bg-amber-100', text: 'text-amber-700' },
  critica: { label: 'Crítica', bg: 'bg-red-100',   text: 'text-red-700' },
}

export const ESTATUS_INCIDENCIA_CONFIG: Record<IncidenciaEstatus, { label: string; bg: string; text: string; dot: string }> = {
  pendiente:         { label: 'Pendiente',            bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  en_proceso:        { label: 'En proceso',            bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500' },
  en_espera_cliente: { label: 'En espera del cliente',  bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500' },
  resuelto:          { label: 'Resuelto',              bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  escalado:          { label: 'Escalado',              bg: 'bg-red-100',     text: 'text-red-700',     dot: 'bg-red-500' },
  cerrado:           { label: 'Cerrado',               bg: 'bg-gray-100',    text: 'text-gray-500',    dot: 'bg-gray-400' },
}

export const ORIGEN_INCIDENCIA_LABEL: Record<IncidenciaOrigen, string> = {
  manual: 'Manual', encuesta: 'Encuesta', pago_vencido: 'Pago vencido',
}

export interface Incidencia {
  id: number
  folio: string
  contactoId: number
  contactoNombre: string
  titulo: string
  descripcion: string | null
  categoria: string | null
  prioridad: IncidenciaPrioridad
  slaHoras: number | null
  fechaLimiteSla: string | null
  estatus: IncidenciaEstatus
  origen: IncidenciaOrigen
  asignadoA: number | null
  asignadoNombre: string | null
  solucionPropuesta: string | null
  fechaCompromiso: string | null
  creadoPor: number | null
  fechaCreacion: string
  fechaResolucion: string | null
}

export interface IncidenciaComentario {
  id: number
  incidenciaId: number
  comentario: string
  usuarioId: number | null
  usuarioNombre: string | null
  fecha: string
}

export interface IncidenciaEvidencia {
  id: number
  incidenciaId: number
  nombreOriginal: string
  mimeType: string | null
  tamanoBytes: number
  descripcion: string | null
  subidoPor: number | null
  fechaSubida: string
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseIncidencia(raw: Record<string, unknown>): Incidencia {
  return {
    id:              Number(pick(raw, 'id')),
    folio:           String(pick(raw, 'folio') ?? ''),
    contactoId:      Number(pick(raw, 'contactoId')),
    contactoNombre:  String(pick(raw, 'contactoNombre') ?? ''),
    titulo:          String(pick(raw, 'titulo') ?? ''),
    descripcion:     pick(raw, 'descripcion') as string | null,
    categoria:       pick(raw, 'categoria') as string | null,
    prioridad:       (pick(raw, 'prioridad') as IncidenciaPrioridad) ?? 'media',
    slaHoras:        pick(raw, 'slaHoras') as number | null,
    fechaLimiteSla:  pick(raw, 'fechaLimiteSla') as string | null,
    estatus:         (pick(raw, 'estatus') as IncidenciaEstatus) ?? 'pendiente',
    origen:          (pick(raw, 'origen') as IncidenciaOrigen) ?? 'manual',
    asignadoA:       pick(raw, 'asignadoA') as number | null,
    asignadoNombre:  pick(raw, 'asignadoNombre') as string | null,
    solucionPropuesta: pick(raw, 'solucionPropuesta') as string | null,
    fechaCompromiso:   pick(raw, 'fechaCompromiso') as string | null,
    creadoPor:       pick(raw, 'creadoPor') as number | null,
    fechaCreacion:   String(pick(raw, 'fechaCreacion') ?? ''),
    fechaResolucion: pick(raw, 'fechaResolucion') as string | null,
  }
}

export function parseIncidenciaComentario(raw: Record<string, unknown>): IncidenciaComentario {
  return {
    id:            Number(pick(raw, 'id')),
    incidenciaId:  Number(pick(raw, 'incidenciaId')),
    comentario:    String(pick(raw, 'comentario') ?? ''),
    usuarioId:     pick(raw, 'usuarioId') as number | null,
    usuarioNombre: pick(raw, 'usuarioNombre') as string | null,
    fecha:         String(pick(raw, 'fecha') ?? ''),
  }
}

export function parseIncidenciaEvidencia(raw: Record<string, unknown>): IncidenciaEvidencia {
  return {
    id:             Number(pick(raw, 'id')),
    incidenciaId:   Number(pick(raw, 'incidenciaId')),
    nombreOriginal: String(pick(raw, 'nombreOriginal') ?? ''),
    mimeType:       pick(raw, 'mimeType') as string | null,
    tamanoBytes:    Number(pick(raw, 'tamanoBytes') ?? 0),
    descripcion:    pick(raw, 'descripcion') as string | null,
    subidoPor:      pick(raw, 'subidoPor') as number | null,
    fechaSubida:    String(pick(raw, 'fechaSubida') ?? ''),
  }
}
