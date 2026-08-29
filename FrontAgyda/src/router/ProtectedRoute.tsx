import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

import { Spinner } from '@/components/ui/Spinner'
import { useSocketInit } from '@/hooks/useSocket'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { BanioAlertWatcher } from '@/components/ui/BanioAlertWatcher'
import { TicketAlertModal } from '@/components/ui/TicketAlertModal'
import { ReglamentoAlertModal } from '@/components/ui/ReglamentoAlertModal'
import { VentaAlertWatcher } from '@/components/ventas/VentaAlertWatcher'

// Componente separado: los hooks de socket solo corren cuando hay sesión activa.
// Recibe children para poder renderizar el Outlet desde el padre.
function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  useSocketInit()
  const tipoUsuario = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase())
  const isCL = tipoUsuario === 'CL'
  const { isAllowed } = useModuleAccess()
  return (
    <>
      {children}
      <BanioAlertWatcher />
      <TicketAlertModal />
      {!isCL && <ReglamentoAlertModal />}
      {isAllowed('ventas') && <VentaAlertWatcher />}
    </>
  )
}

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isInitialized   = useAuthStore((s) => s.isInitialized)
  const location        = useLocation()

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <AuthenticatedShell><Outlet /></AuthenticatedShell>
}
