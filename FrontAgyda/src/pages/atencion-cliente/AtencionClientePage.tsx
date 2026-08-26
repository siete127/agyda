import { useQuery } from '@tanstack/react-query'
import { Headphones, Users } from 'lucide-react'
import { atencionClienteService } from '@/services/atencionCliente.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

export function AtencionClientePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['atencion-cliente-dashboard'],
    queryFn: () => atencionClienteService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Headphones className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Atención al Cliente</h1>
            <p className="text-xs text-blue-200/70">Retención y clientes en riesgo</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <DashboardStatRow
          stats={[
            {
              key: 'riesgo',
              icon: Headphones,
              label: 'Clientes en riesgo',
              value: data.clientesEnRiesgo,
              tone: data.clientesEnRiesgo > 0 ? 'warn' : 'success',
            },
            { key: 'evaluados', icon: Users, label: 'Total evaluados', value: data.totalEvaluados, tone: 'brand' },
          ]}
        />
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Módulos de Atención al Cliente</h2>
        <AreaSubItemsGrid areaPath="/atencion-cliente" items={AREA_SUB_ITEMS['atencion-cliente']} />
      </div>
    </div>
  )
}
