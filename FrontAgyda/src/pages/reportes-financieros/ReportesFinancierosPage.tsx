import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { BarChart3, TrendingUp, TrendingDown, Wallet, Landmark } from 'lucide-react'
import { reporteFinancieroService } from '@/services/reporteFinanciero.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'

function formatMonto(monto: number) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
}

const RANGOS = [3, 6, 12]

export function ReportesFinancierosPage() {
  const [meses, setMeses] = useState(6)

  const { data, isLoading } = useQuery({
    queryKey: ['finanzas-reporte-consolidado', meses],
    queryFn: () => reporteFinancieroService.get(meses),
  })

  const maxValor = data ? Math.max(1, ...data.serieMensual.flatMap((m) => [m.ingresos, m.egresos])) : 1

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand" /> Reportes financieros
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Reportes financieros consolidados</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-200 p-1">
          {RANGOS.map((r) => (
            <button
              key={r}
              onClick={() => setMeses(r)}
              className={clsx('rounded-lg px-3 py-1 text-xs font-semibold transition-colors', meses === r ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              {r} meses
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'ingresos', icon: TrendingUp, label: `Ingresos (${meses}m)`, value: formatMonto(data.totales.ingresos), tone: 'success' },
              { key: 'egresos', icon: TrendingDown, label: `Egresos (${meses}m)`, value: formatMonto(data.totales.egresos), tone: 'warn' },
              { key: 'balance', icon: BarChart3, label: 'Balance', value: formatMonto(data.totales.balance), tone: data.totales.balance >= 0 ? 'success' : 'critical' },
              { key: 'bancos', icon: Landmark, label: 'Saldo en bancos', value: formatMonto(data.saldoBancos), tone: 'brand' },
              { key: 'cxc', icon: Wallet, label: 'CxC pendiente', value: formatMonto(data.cxcPendiente), tone: 'brand' },
              { key: 'cxp', icon: Wallet, label: 'CxP pendiente', value: formatMonto(data.cxpPendiente), tone: 'warn' },
            ]}
          />

          <div className="card p-4">
            <h2 className="mb-4 text-sm font-bold text-ink">Ingresos vs. egresos por mes</h2>
            {data.serieMensual.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-6 text-center">Sin movimientos registrados en este periodo</p>
            ) : (
              <div className="flex items-end gap-3 overflow-x-auto pb-2">
                {data.serieMensual.map((m) => (
                  <div key={m.mes} className="flex flex-col items-center gap-1.5 min-w-[52px]">
                    <div className="flex h-40 items-end gap-1">
                      <div
                        className="w-4 rounded-t bg-emerald-400"
                        style={{ height: `${Math.max(2, (m.ingresos / maxValor) * 100)}%` }}
                        title={`Ingresos: ${formatMonto(m.ingresos)}`}
                      />
                      <div
                        className="w-4 rounded-t bg-red-400"
                        style={{ height: `${Math.max(2, (m.egresos / maxValor) * 100)}%` }}
                        title={`Egresos: ${formatMonto(m.egresos)}`}
                      />
                    </div>
                    <span className="text-[0.65rem] font-medium text-gray-500">{formatMes(m.mes)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 text-[0.68rem] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Ingresos</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Egresos</span>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Mes</th>
                  <th className="px-4 py-2.5 font-semibold">Ingresos</th>
                  <th className="px-4 py-2.5 font-semibold">Egresos</th>
                  <th className="px-4 py-2.5 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.serieMensual.map((m) => (
                  <tr key={m.mes} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{formatMes(m.mes)}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-semibold">{formatMonto(m.ingresos)}</td>
                    <td className="px-4 py-2.5 text-red-600 font-semibold">{formatMonto(m.egresos)}</td>
                    <td className={clsx('px-4 py-2.5 font-bold', m.balance >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatMonto(m.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
