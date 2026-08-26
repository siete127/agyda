import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ClipboardCheck } from 'lucide-react'
import { calidadService } from '@/services/calidad.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

export function CalidadPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['calidad-dashboard'],
    queryFn: () => calidadService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Calidad</h1>
            <p className="text-xs text-blue-200/70">Evaluaciones QA y desempeño por agente</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'evaluaciones', icon: ClipboardCheck, label: 'Evaluaciones del mes', value: data.evaluacionesMes, tone: 'brand' },
              { key: 'promedio', icon: ShieldCheck, label: 'Promedio QA', value: data.promedioQa, tone: 'success' },
            ]}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Promedio por agente</h2>
            <ProgressBarList
              items={data.porAgente.map((a) => ({
                key: String(a.agenteId),
                label: `Agente ${a.agenteId}`,
                value: a.promedio,
                max: 100,
              }))}
            />
          </div>
        </>
      )}

      {/* El resto de sub-módulos de Calidad ya están en el sidebar; solo se deja aquí
          lo que aún no tiene página propia (Monitoreo de llamadas). */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Pendientes</h2>
        <AreaSubItemsGrid areaPath="/calidad" items={AREA_SUB_ITEMS['calidad'].filter((i) => i.slug === 'monitoreo-llamadas')} />
      </div>
    </div>
  )
}
