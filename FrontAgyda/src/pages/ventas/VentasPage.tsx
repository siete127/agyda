import { useVentasSession } from '@/hooks/useVentasSession'
import { useVentasStore } from '@/stores/ventas.store'
import { Spinner } from '@/components/ui/Spinner'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { AgenteTabs } from './tabs/AgenteTabs'
import { AdminTabs } from './tabs/AdminTabs'

export function VentasPage() {
  const { isReady, error, retry } = useVentasSession()

  if (!isReady) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-gray-500">Conectando con sistema de Ventas...</p>
    </div>
  )

  if (error) return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <AlertCircle className="h-7 w-7 text-red-400" />
      </div>
      <p className="text-sm text-gray-600 text-center max-w-xs">{error}</p>
      <button
        onClick={retry}
        className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors"
      >
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )

  return <VentasRouter />
}

function VentasRouter() {
  const { ventasRole } = useVentasStore()
  const isAdmin = ventasRole === 'admin' || ventasRole === 'superadmin' || ventasRole === 'supervisor'
  return isAdmin ? <AdminTabs /> : <AgenteTabs />
}
