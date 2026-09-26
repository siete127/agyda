import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ArrowLeft, Receipt, FileText, FileCode, DollarSign, CheckCircle2, Clock, XCircle, Plus } from 'lucide-react'
import { facturacionService, type Factura } from '@/services/facturacion.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { estatusVisual, ESTATUS_BADGE, formatMonto } from './estatusFactura'
import { NuevaFacturaModal } from './NuevaFacturaModal'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

// "Pre-factura" filtra por estatus fiscal; el resto por el estatus visual.
function coincide(f: Factura, filtro: (typeof FILTROS)[number]) {
  if (filtro === 'Todas') return true
  if (filtro === 'Pre-factura') return f.estatus === 'pre-factura'
  return estatusVisual(f) === filtro
}

const FILTROS = ['Todas', 'Pagada', 'Pendiente de cobro', 'Pre-factura', 'Cancelada'] as const

export function FacturacionPage() {
  const { can } = useActionAccess()
  const puedeCancelar = can('crm', 'facturacion-cancelar')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todas')
  const [descargando, setDescargando] = useState<string | null>(null)
  const [nueva, setNueva] = useState(false)
  const puedeFacturar = can('crm', 'facturar')

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['facturas-todas'],
    queryFn: () => facturacionService.list(),
  })

  // Las canceladas no cuentan como facturado.
  const totalFacturado = facturas.filter((f) => f.estatus !== 'cancelada').reduce((sum, f) => sum + (f.total ?? 0), 0)
  const totalPendiente = facturas
    .filter((f) => estatusVisual(f) === 'Pendiente de cobro')
    .reduce((sum, f) => sum + (f.saldo ?? f.total ?? 0), 0)
  const pagadas = facturas.filter((f) => estatusVisual(f) === 'Pagada').length
  const canceladas = facturas.filter((f) => estatusVisual(f) === 'Cancelada').length

  const filtradas = facturas.filter((f) => coincide(f, filtro))

  async function descargar(f: Factura, formato: 'pdf' | 'xml') {
    const key = `${f.id}-${formato}`
    setDescargando(key)
    try {
      window.open(facturacionService.documentoUrl(f.id, formato), '_blank')
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <Link to="/finanzas" className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Finanzas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Receipt className="h-5 w-5 text-brand" /> Facturación
          </h1>
          <p className="mt-0.5 text-xs text-gray-500">Historial de facturas emitidas y su estatus de cobro.</p>
        </div>
        {puedeFacturar && (
          <Button size="sm" onClick={() => setNueva(true)}><Plus className="h-3.5 w-3.5" /> Nueva factura</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card flex items-center gap-2 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><DollarSign className="h-4 w-4" /></div>
              <div><p className="text-base font-bold leading-tight text-gray-900">{formatMonto(totalFacturado, 'MXN')}</p><p className="text-[0.68rem] text-gray-500">Total facturado</p></div>
            </div>
            <div className="card flex items-center gap-2 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Clock className="h-4 w-4" /></div>
              <div><p className="text-base font-bold leading-tight text-gray-900">{formatMonto(totalPendiente, 'MXN')}</p><p className="text-[0.68rem] text-gray-500">Pendiente de cobro</p></div>
            </div>
            <div className="card flex items-center gap-2 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></div>
              <div><p className="text-base font-bold leading-tight text-gray-900">{pagadas}</p><p className="text-[0.68rem] text-gray-500">Pagadas</p></div>
            </div>
            <div className="card flex items-center gap-2 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600"><XCircle className="h-4 w-4" /></div>
              <div><p className="text-base font-bold leading-tight text-gray-900">{canceladas}</p><p className="text-[0.68rem] text-gray-500">Canceladas</p></div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  filtro === f ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Folio</th>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th className="px-4 py-2.5 font-semibold">Total</th>
                  <th className="px-4 py-2.5 font-semibold">Estatus</th>
                  <th className="px-4 py-2.5 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <Receipt className="h-8 w-8" />
                        <p className="text-sm">
                          {facturas.length === 0 ? 'Sin facturas emitidas todavía' : 'Ninguna factura coincide con este filtro'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : filtradas.map((f) => {
                  const ev = estatusVisual(f)
                  // PDF/XML solo existen timbrada (una pre-factura pagada no los tiene).
                  const timbrada = f.estatus === 'timbrada'
                  return (
                    <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {f.serie ?? ''}{f.folio ?? f.id}
                        {f.estatus === 'pre-factura' && (
                          <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-gray-500">Pre-factura</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">
                        <p>{f.receptorNombre ?? '—'}</p>
                        {f.concepto && <p className="text-[0.68rem] text-gray-400">{f.concepto}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{formatFecha(f.fecha)}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">{formatMonto(f.total, f.moneda)}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', ESTATUS_BADGE[ev])}>
                          {ev}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={!timbrada || descargando === `${f.id}-pdf`}
                            title={timbrada ? 'Descargar PDF' : 'Disponible cuando esté timbrada'}
                            onClick={() => descargar(f, 'pdf')}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!timbrada || descargando === `${f.id}-xml`}
                            title={timbrada ? 'Descargar XML' : 'Disponible cuando esté timbrada'}
                            onClick={() => descargar(f, 'xml')}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <FileCode className="h-3.5 w-3.5" />
                          </button>
                          {puedeCancelar && ev !== 'Cancelada' && (
                            <button
                              type="button"
                              title="Cancelar factura"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {nueva && <NuevaFacturaModal onClose={() => setNueva(false)} />}
    </div>
  )
}
