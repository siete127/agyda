import { useQuery } from '@tanstack/react-query'
import { Contact, Users, CheckCircle2, CircleDashed } from 'lucide-react'
import { prospeccionService } from '@/services/prospeccion.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'

export function ProspeccionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ventas-area-prospeccion'],
    queryFn: () => prospeccionService.get(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Contact className="h-5 w-5 text-brand" /> Prospección
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Seguimiento de prospectos cargados en campañas</p>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'total', icon: Users, label: 'Total de prospectos', value: data.totales.totalProspectos, tone: 'brand' },
              { key: 'gestionados', icon: CheckCircle2, label: 'Gestionados', value: data.totales.gestionados, tone: 'success' },
              { key: 'sin-gestionar', icon: CircleDashed, label: 'Sin gestionar', value: data.totales.sinGestionar, tone: 'warn' },
              { key: 'gestiones-30d', icon: CheckCircle2, label: 'Gestiones (30 días)', value: data.totales.gestiones30d, tone: 'brand' },
            ]}
          />

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">Seguimiento por campaña</h2>
            {data.porCampania.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-6 text-center">Sin prospectos cargados todavía</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="px-4 py-2.5 font-semibold">Campaña</th>
                      <th className="px-4 py-2.5 font-semibold">Total</th>
                      <th className="px-4 py-2.5 font-semibold">Gestionados</th>
                      <th className="px-4 py-2.5 font-semibold">Sin gestionar</th>
                      <th className="px-4 py-2.5 font-semibold">% Gestionado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porCampania.map((c) => (
                      <tr key={c.campaniaId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{c.campaniaNombre}</td>
                        <td className="px-4 py-2.5 text-gray-600">{c.totalProspectos}</td>
                        <td className="px-4 py-2.5 text-emerald-600 font-semibold">{c.gestionados}</td>
                        <td className="px-4 py-2.5 text-amber-600">{c.sinGestionar}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, c.pctGestionado)}%` }} />
                            </div>
                            <span className="font-semibold text-gray-800">{c.pctGestionado}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.porTipoGestion.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Tipos de gestión más comunes (últimos 30 días)</h2>
              <div className="flex flex-wrap gap-2">
                {data.porTipoGestion.map((t) => (
                  <span key={t.tipo} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {t.tipo} <span className="rounded-full bg-card px-1.5 py-0.5 text-[0.65rem] font-bold text-gray-500">{t.total}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
