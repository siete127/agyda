import { useQuery } from '@tanstack/react-query'
import { UserPlus, Users } from 'lucide-react'
import { rhAreaService } from '@/services/rhArea.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { StatusBar } from '@/components/ui/StatusBar'

const ETAPA_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706']

export function RHPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['rh-area-dashboard'],
    queryFn: () => rhAreaService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <UserPlus className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Recursos Humanos — Reclutamiento</h1>
            <p className="text-xs text-blue-200/70">Vacantes abiertas y candidatos en proceso</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'vacantes', icon: UserPlus, label: 'Vacantes abiertas', value: data.vacantesAbiertas, tone: 'brand' },
              { key: 'candidatos', icon: Users, label: 'Candidatos activos', value: data.candidatosActivos, tone: 'success' },
            ]}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Candidatos por etapa</h2>
            <StatusBar
              segments={data.porEtapa.map((e, i) => ({
                label: e.etapa,
                count: e.count,
                color: ETAPA_COLORS[i % ETAPA_COLORS.length],
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}
