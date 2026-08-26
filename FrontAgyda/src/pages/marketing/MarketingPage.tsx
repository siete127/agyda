import { useQuery } from '@tanstack/react-query'
import { Megaphone, Wallet } from 'lucide-react'
import { marketingService } from '@/services/marketing.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { StatusBar } from '@/components/ui/StatusBar'
import { AreaSubItemsGrid } from '@/components/ui/AreaSubItemsGrid'
import { AREA_SUB_ITEMS } from '@/config/areaSubItems'

const CANAL_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706']

export function MarketingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['marketing-dashboard'],
    queryFn: () => marketingService.getDashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Marketing</h1>
            <p className="text-xs text-blue-200/70">Campañas activas y distribución por canal</p>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'campanias', icon: Megaphone, label: 'Campañas activas', value: data.campaniasActivas, tone: 'brand' },
              { key: 'presupuesto', icon: Wallet, label: 'Presupuesto total', value: data.presupuestoTotal, tone: 'success' },
            ]}
          />

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 text-sm font-bold text-ink">Campañas por canal</h2>
            <StatusBar
              segments={data.porCanal.map((c, i) => ({
                label: c.canal,
                count: c.count,
                color: CANAL_COLORS[i % CANAL_COLORS.length],
              }))}
            />
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">Módulos de Marketing</h2>
        <AreaSubItemsGrid areaPath="/marketing" items={AREA_SUB_ITEMS['marketing']} />
      </div>
    </div>
  )
}
