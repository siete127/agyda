import { useQuery } from '@tanstack/react-query'
import { Cpu, Wrench } from 'lucide-react'
import { tecnologiaService } from '@/services/tecnologia.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { StatusBar } from '@/components/ui/StatusBar'

const SEVERIDAD_COLORS: Record<string, string> = {
  baja: '#059669',
  media: '#d97706',
  alta: '#dc2626',
  critica: '#7c2d12',
}

export function TecnologiaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['tecnologia-dashboard'],
    queryFn: () => tecnologiaService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Cpu className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Tecnología / TI</h1>
            <p className="text-xs text-blue-200/70">Incidentes y mantenimientos</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              {
                key: 'incidentes',
                icon: Cpu,
                label: 'Incidentes abiertos',
                value: data.incidentesAbiertos,
                tone: data.incidentesAbiertos > 0 ? 'critical' : 'success',
              },
              { key: 'mantenimientos', icon: Wrench, label: 'Mantenimientos del mes', value: data.mantenimientosMes, tone: 'brand' },
            ]}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Incidentes por severidad</h2>
            <StatusBar
              segments={data.porSeveridad.map((s) => ({
                label: s.severidad,
                count: s.count,
                color: SEVERIDAD_COLORS[s.severidad] ?? '#9ca3af',
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}
