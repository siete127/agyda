import type { Factura } from '@/services/facturacion.service'

// El estatus fiscal (pre-factura/timbrada/cancelada/error) y si ya se cobró
// (pagada/saldo) son dos datos separados en BD — se combinan en un solo
// estatus visual. Una pre-factura también se cobra, así que muestra
// Pagada/Pendiente de cobro y "Pre-factura" va aparte como etiqueta.
export type EstatusVisual = 'Pagada' | 'Pendiente de cobro' | 'Cancelada' | 'Error'

export function estatusVisual(f: Factura): EstatusVisual {
  if (f.estatus === 'cancelada') return 'Cancelada'
  if (f.estatus === 'error') return 'Error'
  return f.pagada ? 'Pagada' : 'Pendiente de cobro'
}

export const ESTATUS_BADGE: Record<EstatusVisual, string> = {
  Pagada: 'bg-emerald-100 text-emerald-700',
  'Pendiente de cobro': 'bg-amber-100 text-amber-700',
  Cancelada: 'bg-red-100 text-red-700',
  Error: 'bg-red-100 text-red-700',
}

export const formatMonto = (monto: number | null | undefined, moneda = 'MXN') =>
  (monto ?? 0).toLocaleString('es-MX', { style: 'currency', currency: moneda || 'MXN' })

export const folioFactura = (f: Pick<Factura, 'serie' | 'folio' | 'id'>) => `${f.serie ?? ''}${f.folio ?? f.id}`
