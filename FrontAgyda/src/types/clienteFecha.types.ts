export type FechaTipo = 'contrato' | 'servicio' | 'mantenimiento' | 'cumpleanos' | 'personalizada'
export type FechaEstatus = 'vigente' | 'renovada' | 'vencida' | 'cancelada'

export const TIPO_FECHA_LABEL: Record<FechaTipo, string> = {
  contrato: 'Contrato', servicio: 'Servicio', mantenimiento: 'Mantenimiento', cumpleanos: 'Cumpleaños', personalizada: 'Personalizada',
}

export const ESTATUS_FECHA_CONFIG: Record<FechaEstatus, { label: string; bg: string; text: string }> = {
  vigente:  { label: 'Vigente',  bg: 'bg-blue-50',    text: 'text-blue-700' },
  renovada: { label: 'Renovada', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  vencida:  { label: 'Vencida',  bg: 'bg-red-100',    text: 'text-red-700' },
  cancelada:{ label: 'Cancelada',bg: 'bg-gray-100',   text: 'text-gray-500' },
}

export interface CliFechaImportante {
  id: number
  contactoId: number
  tipo: FechaTipo
  descripcion: string
  fecha: string
  recurrenteAnual: boolean
  diasAlerta: string
  estatus: FechaEstatus
  creadoPor: number | null
  fechaCreacion: string
}

const pick = (raw: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null) return raw[k]
  return null
}

export function parseCliFechaImportante(raw: Record<string, unknown>): CliFechaImportante {
  return {
    id:              Number(pick(raw, 'id')),
    contactoId:      Number(pick(raw, 'contactoId')),
    tipo:            (pick(raw, 'tipo') as FechaTipo) ?? 'personalizada',
    descripcion:     String(pick(raw, 'descripcion') ?? ''),
    fecha:           String(pick(raw, 'fecha') ?? ''),
    recurrenteAnual: Boolean(pick(raw, 'recurrenteAnual') ?? false),
    diasAlerta:      String(pick(raw, 'diasAlerta') ?? '30,15,7'),
    estatus:         (pick(raw, 'estatus') as FechaEstatus) ?? 'vigente',
    creadoPor:       pick(raw, 'creadoPor') as number | null,
    fechaCreacion:   String(pick(raw, 'fechaCreacion') ?? ''),
  }
}
