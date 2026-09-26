import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, Receipt, Plus, FileSignature, ArrowUpRight, Package } from 'lucide-react'
import { finanzasService } from '@/services/finanzas.service'
import { facturacionService, type CotizacionPorFacturar } from '@/services/facturacion.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { NuevaFacturaModal } from '@/pages/facturacion/NuevaFacturaModal'
import { estatusVisual, ESTATUS_BADGE, formatMonto, folioFactura } from '@/pages/facturacion/estatusFactura'

// Finanzas arranca en la facturación: facturar productos/servicios o
// cotizaciones aprobadas, lo que falta por facturar y lo último emitido.
export function FinanzasPage() {
  const { can } = useActionAccess()
  const puedeFacturar = can('crm', 'facturar')
  // undefined = cerrado; null = abierto sin cotización elegida.
  const [nueva, setNueva] = useState<CotizacionPorFacturar | null | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ['finanzas-dashboard'],
    queryFn: () => finanzasService.getDashboard(),
    staleTime: 30_000,
  })
  const { data: facturas = [] } = useQuery({
    queryKey: ['facturas-todas'],
    queryFn: () => facturacionService.list(),
  })
  const { data: pendientes } = useQuery({
    queryKey: ['facturas-por-facturar'],
    queryFn: () => facturacionService.porFacturar(),
  })
  const cotizaciones = pendientes?.cotizaciones ?? []

  const mes = new Date().toISOString().slice(0, 7)
  const facturadoMes = facturas
    .filter((f) => f.estatus !== 'cancelada' && String(f.fecha).slice(0, 7) === mes)
    .reduce((s, f) => s + (f.total ?? 0), 0)
  const recientes = facturas.slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Receipt className="h-6 w-6 text-blue-300" />
            <div>
              <h1 className="text-lg font-bold">Facturación</h1>
              <p className="text-xs text-blue-200/70">Factura productos, servicios y cotizaciones; controla ingresos y cobranza</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/finanzas/facturacion" className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10">
              Ver facturas
            </Link>
            {puedeFacturar && (
              <button onClick={() => setNueva(null)} className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-[#0D1B3E] hover:bg-blue-50">
                <Plus className="h-3.5 w-3.5" /> Nueva factura
              </button>
            )}
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <DashboardStatRow
          stats={[
            { key: 'facturado', icon: Receipt, label: 'Facturado del mes', value: formatMonto(facturadoMes), tone: 'brand' },
            { key: 'ingresos', icon: TrendingUp, label: 'Ingresos del mes', value: formatMonto(data.ingresosMes), tone: 'success' },
            { key: 'cxc', icon: Wallet, label: 'Por cobrar', value: formatMonto(data.cxcPendiente), tone: 'warn' },
            {
              key: 'cxcVencidas', icon: AlertTriangle, label: 'CxC vencidas', value: data.cxcVencidas,
              tone: data.cxcVencidas > 0 ? 'critical' : 'brand',
            },
            { key: 'egresos', icon: TrendingDown, label: 'Egresos del mes', value: formatMonto(data.egresosMes), tone: 'warn' },
            { key: 'cxp', icon: TrendingDown, label: 'Por pagar', value: formatMonto(data.cxpPendiente), tone: 'brand' },
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Por facturar */}
        <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <FileSignature className="h-4 w-4 text-brand" /> Cotizaciones por facturar
              {cotizaciones.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold text-amber-700">{cotizaciones.length}</span>}
            </h2>
            {puedeFacturar && (
              <button onClick={() => setNueva(null)} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:underline">
                <Package className="h-3.5 w-3.5" /> Facturar productos o servicios
              </button>
            )}
          </div>
          {cotizaciones.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-gray-400">
              <FileSignature className="h-7 w-7 opacity-40" />
              <p className="text-xs">No hay cotizaciones aprobadas pendientes de facturar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cotizaciones.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.82rem] font-semibold text-gray-900">{c.folio || `#${c.id}`}{c.titulo ? ` · ${c.titulo}` : ''}</p>
                    <p className="truncate text-[0.7rem] text-gray-400">{c.cliente ?? 'Sin cliente'} · {new Date(c.fecha).toLocaleDateString('es-MX')}</p>
                  </div>
                  <span className="text-[0.82rem] font-bold tabular-nums text-gray-900">{formatMonto(c.total)}</span>
                  {puedeFacturar && (
                    <button onClick={() => setNueva(c)} className="rounded-lg bg-brand px-2.5 py-1 text-[0.7rem] font-bold text-white hover:bg-brand/90">Facturar</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recientes */}
        <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Receipt className="h-4 w-4 text-brand" /> Facturas recientes</h2>
            <Link to="/finanzas/facturacion" className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:underline">
              Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recientes.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-8 text-gray-400">
              <Receipt className="h-7 w-7 opacity-40" />
              <p className="text-xs">Sin facturas emitidas todavía</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recientes.map((f) => {
                const ev = estatusVisual(f)
                return (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.82rem] font-semibold text-gray-900">
                        {folioFactura(f)} · {f.receptorNombre ?? '—'}
                      </p>
                      <p className="truncate text-[0.7rem] text-gray-400">
                        {f.concepto ?? new Date(f.fecha).toLocaleDateString('es-MX')}{f.estatus === 'pre-factura' ? ' · Pre-factura' : ''}
                      </p>
                    </div>
                    <span className="text-[0.82rem] font-bold tabular-nums text-gray-900">{formatMonto(f.total, f.moneda)}</span>
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', ESTATUS_BADGE[ev])}>{ev}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {nueva !== undefined && <NuevaFacturaModal cotizacionInicial={nueva} onClose={() => setNueva(undefined)} />}
    </div>
  )
}
