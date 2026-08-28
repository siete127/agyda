import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, CheckCircle2, Circle } from 'lucide-react'
import { direccionGeneralService } from '@/services/direccionGeneral.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

export function DireccionGeneralPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['direccion-general-resumen'],
    queryFn: () => direccionGeneralService.getResumen(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Dirección General</h1>
            <p className="text-xs text-blue-200/70">Panorama ejecutivo de las áreas de la empresa</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'total', icon: LayoutDashboard, label: 'Áreas totales', value: data.totalAreas, tone: 'brand' },
              { key: 'reportando', icon: CheckCircle2, label: 'Reportando este periodo', value: data.areasReportando, tone: 'success' },
              { key: 'pendientes', icon: Circle, label: 'Sin datos aún', value: data.totalAreas - data.areasReportando, tone: 'warn' },
            ]}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.areas.map((a) => (
              <div key={a.areaKey} className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{a.label}</span>
                  {a.reportando ? (
                    <span className="chip bg-emerald-100 text-emerald-700">Activo</span>
                  ) : (
                    <span className="chip bg-gray-100 text-gray-500">Sin datos</span>
                  )}
                </div>
                {a.reportando ? (
                  <ul className="space-y-1.5">
                    {a.kpis.map((k) => (
                      <li key={k.kpiKey} className="flex items-center justify-between text-xs">
                        <span className="text-ink-secondary">{k.label}</span>
                        <span className="font-semibold text-ink">
                          {k.valor}
                          {k.unidad ? ` ${k.unidad}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-tertiary">Esta área aún no reporta KPIs para el periodo actual.</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Módulos de Dirección General</h2>
        <AreaSubItemsGrid areaPath="/direccion-general" items={AREA_SUB_ITEMS['direccion-general']} />
      </div>
    </div>
  )
}
