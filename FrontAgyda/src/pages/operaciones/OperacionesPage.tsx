import { useQuery } from '@tanstack/react-query'
import { Headset, Users } from 'lucide-react'
import { operacionesService } from '@/services/operaciones.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'

export function OperacionesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['operaciones-dashboard'],
    queryFn: () => operacionesService.getDashboard(),
    staleTime: 30_000,
  })

  const maxCount = data ? Math.max(1, ...data.porCampania.map((c) => c.count)) : 1

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Headset className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Contact Center</h1>
            <p className="text-xs text-blue-200/70">Campañas activas y asignación de bases</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'campanias', icon: Headset, label: 'Campañas activas', value: data.campaniasActivas, tone: 'brand' },
              { key: 'asignado', icon: Users, label: 'Total asignado', value: data.totalAsignado, tone: 'success' },
            ]}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Asignación por campaña</h2>
            <ProgressBarList
              items={data.porCampania.map((c) => ({
                key: c.campania,
                label: c.campania,
                value: c.count,
                max: maxCount,
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}
