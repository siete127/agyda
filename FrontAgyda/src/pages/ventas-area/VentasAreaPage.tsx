import { useQuery } from '@tanstack/react-query'
import { Target, Coins } from 'lucide-react'
import { ventasAreaService } from '@/services/ventasArea.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'

export function VentasAreaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ventas-area-dashboard'],
    queryFn: () => ventasAreaService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Ventas — Metas y Resultados</h1>
            <p className="text-xs text-blue-200/70">Seguimiento de metas comerciales</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <DashboardStatRow
          stats={[
            { key: 'metas', icon: Target, label: 'Metas definidas', value: data.metasDefinidas, tone: 'brand' },
            { key: 'monto', icon: Coins, label: 'Meta monto total', value: data.metaMontoTotal, tone: 'success' },
          ]}
        />
      )}
    </div>
  )
}
