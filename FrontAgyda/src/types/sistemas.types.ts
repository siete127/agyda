export type SistemaEstado = 'operativo' | 'caido' | 'con-problemas'

export interface Sistema {
  id: number
  nombre: string
  descripcion: string | null
  url: string | null
  estado: SistemaEstado
  notas: string | null
  fechaCreacion: string
  fechaActualizacion: string | null
}

export interface IncidenteSistema {
  id: number
  sistemaId: number | null
  sistemaNombre: string | null
  tipo: string
  fechaInicio: string
  fechaFin: string | null
  descripcion: string | null
  reportadoPor: number | null
}

export const ESTADO_LABELS: Record<SistemaEstado, string> = {
  operativo: 'Operativo',
  caido: 'Caído',
  'con-problemas': 'Con problemas',
}

export const ESTADO_COLORS: Record<SistemaEstado, string> = {
  operativo: 'bg-emerald-50 text-emerald-700',
  caido: 'bg-red-50 text-red-600',
  'con-problemas': 'bg-amber-50 text-amber-700',
}
