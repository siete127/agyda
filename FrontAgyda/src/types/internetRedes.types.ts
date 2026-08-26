export type EnlaceEstado = 'activo' | 'caido' | 'mantenimiento'

export interface Enlace {
  id: number
  nombre: string
  proveedor: string | null
  ubicacion: string | null
  velocidad: string | null
  estado: EnlaceEstado
  notas: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
}

export interface IncidenteRed {
  id: number
  enlaceId: number | null
  enlaceNombre: string | null
  tipo: string
  fechaInicio: string
  fechaFin: string | null
  descripcion: string | null
  reportadoPor: number | null
}

export const ESTADO_LABELS: Record<EnlaceEstado, string> = {
  activo: 'Activo',
  caido: 'Caído',
  mantenimiento: 'En mantenimiento',
}

export const ESTADO_COLORS: Record<EnlaceEstado, string> = {
  activo: 'bg-emerald-50 text-emerald-700',
  caido: 'bg-red-50 text-red-600',
  mantenimiento: 'bg-amber-50 text-amber-700',
}
