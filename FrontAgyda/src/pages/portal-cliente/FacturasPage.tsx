import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Receipt } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'

const ESTATUS_BADGE: Record<string, string> = {
  pagada: 'bg-emerald-50 text-emerald-600',
  timbrada: 'bg-emerald-50 text-emerald-600',
  pendiente: 'bg-amber-50 text-amber-600',
  'pre-factura': 'bg-amber-50 text-amber-600',
  cancelada: 'bg-surface text-ink-tertiary',
}

export function FacturasPage() {
  const { data: facturas = [], isLoading } = useQuery({ queryKey: ['portal-facturas'], queryFn: () => portalClienteService.getFacturas() })

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink">Facturas</h1>
        <p className="mt-1 text-sm text-ink-tertiary">Consulta tus facturas.</p>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-surface" />
      ) : facturas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center">
          <Receipt className="h-8 w-8 text-ink-tertiary/50" />
          <p className="text-sm font-semibold text-ink">Sin facturas registradas</p>
          <p className="text-xs text-ink-tertiary">Tus facturas aparecerán aquí en cuanto se emitan.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border bg-card shadow-card">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-surface-border text-ink-tertiary">
                <th className="px-4 py-3 font-semibold">Folio</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{f.serie ?? ''}{f.folio ?? f.id}</td>
                  <td className="px-4 py-3 text-ink-tertiary">{f.fecha}</td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {f.total.toLocaleString('es-MX', { style: 'currency', currency: f.moneda || 'MXN' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', ESTATUS_BADGE[f.estatus] ?? 'bg-surface text-ink-tertiary')}>
                      {f.estatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
