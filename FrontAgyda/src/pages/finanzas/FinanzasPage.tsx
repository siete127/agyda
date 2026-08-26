import { useQuery } from '@tanstack/react-query'
import { Wallet, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { finanzasService } from '@/services/finanzas.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

export function FinanzasPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['finanzas-dashboard'],
    queryFn: () => finanzasService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Finanzas y Administración</h1>
            <p className="text-xs text-blue-200/70">Ingresos, cuentas por cobrar y por pagar</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <DashboardStatRow
          stats={[
            { key: 'ingresos', icon: TrendingUp, label: 'Ingresos del mes', value: data.ingresosMes, tone: 'success' },
            { key: 'egresos', icon: TrendingDown, label: 'Egresos del mes', value: data.egresosMes, tone: 'warn' },
            { key: 'cxc', icon: Wallet, label: 'CxC pendiente', value: data.cxcPendiente, tone: 'brand' },
            { key: 'cxp', icon: TrendingDown, label: 'CxP pendiente', value: data.cxpPendiente, tone: 'brand' },
            {
              key: 'cxcVencidas',
              icon: AlertTriangle,
              label: 'CxC vencidas',
              value: data.cxcVencidas,
              tone: data.cxcVencidas > 0 ? 'critical' : 'brand',
            },
          ]}
        />
      )}

      {/* El resto de sub-módulos de Finanzas ya están en el sidebar; solo se deja aquí
          lo que aún no tiene página propia (Facturación). */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Pendientes</h2>
        <AreaSubItemsGrid areaPath="/finanzas" items={AREA_SUB_ITEMS['finanzas'].filter((i) => i.slug === 'facturacion')} />
      </div>
    </div>
  )
}
