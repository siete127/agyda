import { useQuery } from '@tanstack/react-query'
import { Headset, Users, UserCheck, Coffee, Clock, ListChecks } from 'lucide-react'
import { operacionesService } from '@/services/operaciones.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'

export function KpisOperacionesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['operaciones-kpis'],
    queryFn: () => operacionesService.getKpis(),
    refetchInterval: 30_000,
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-brand" /> KPIs
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Indicadores clave de Operaciones / Call Center</p>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <DashboardStatRow
          stats={[
            { key: 'campanias', icon: Headset, label: 'Campañas activas', value: data.campaniasActivas, tone: 'brand' },
            { key: 'asignado', icon: Users, label: 'Total asignado (mes)', value: data.totalAsignado, tone: 'brand' },
            { key: 'agentes-activos', icon: UserCheck, label: 'Agentes disponibles', value: data.agentesActivos, tone: 'success' },
            { key: 'agentes-pausa', icon: Coffee, label: 'Agentes en pausa', value: data.agentesEnPausa, tone: 'warn' },
            { key: 'total-agentes', icon: Users, label: 'Total de agentes CC', value: data.totalAgentes, tone: 'brand' },
            { key: 'promedio-pausa', icon: Clock, label: 'Promedio en pausa hoy', value: `${data.minutosPromedioPausa} min`, tone: 'warn' },
          ]}
        />
      )}
    </div>
  )
}
