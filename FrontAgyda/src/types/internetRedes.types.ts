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

/* ── Monitoreo de red en vivo ── */

export interface MedicionRed {
  fecha: string
  haceSeg?: number
  hhmm?: string        // hora HH:mm ya en zona del servidor
  online: boolean
  latenciaMs: number | null
  jitterMs: number | null
  perdidaPct: number | null
  downMbps: number | null
  upMbps: number | null
  linkMbps: number | null
  dispOnline: number | null
}

export interface DispositivoRed {
  id: number
  mac: string
  ip: string | null
  hostname: string | null
  fabricante: string | null
  alias: string | null
  origen: string | null
  primeraVez: string
  ultimaVez: string
  vistoHaceSeg?: number
  online: boolean
  bloqueado: boolean
}

export interface AgenteRed {
  id: number
  nombre: string
  enlaceId: number | null
  version: string | null
  ultimaSenal: string | null
  haceSeg?: number
  gateway: string | null
  routerEstado: string | null
  routerMarca: string | null
  routerModelo: string | null
  routerMetodo: string | null
  vivo: 0 | 1
}

export interface EstadoActualRed {
  ultima: (MedicionRed & { origen: string | null; adaptadorUp: boolean | null }) | null
  ultimaVelocidad: { fecha: string; haceSeg?: number; downMbps: number | null; upMbps: number | null } | null
  dispositivos: { total: number; online: number }
  agentes: AgenteRed[]
  enlaces: { id: number; nombre: string; estado: EnlaceEstado; proveedor: string | null }[]
}
