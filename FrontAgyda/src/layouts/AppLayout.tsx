import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { MusicBubble } from '@/components/ui/MusicBubble'
import { AsistenciaModal } from '@/components/ui/AsistenciaModal'
import { ActaRetardosModal } from '@/components/ui/ActaRetardosModal'
import { ActivoTerminosModal } from '@/components/ui/ActivoTerminosModal'
import { QuejasAlertBubble } from '@/components/ui/QuejasAlertBubble'
import { MensajeriaFloatingBubble } from '@/components/ui/MensajeriaFloatingBubble'
import { WebphoneFrame } from '@/components/ui/WebphoneFrame'
import { useUIStore } from '@/stores/ui.store'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useAuthStore } from '@/stores/auth.store'

export function AppLayout() {
  const setActiveRoute = useUIStore((s) => s.setActiveRoute)
  const location = useLocation()
  const tipoUsuario = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase())
  const showMusic = tipoUsuario !== 'CC' && tipoUsuario !== 'CL'

  useInactivityTimer()

  useEffect(() => {
    setActiveRoute(location.pathname)
  }, [location.pathname, setActiveRoute])

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-5 lg:p-7">
          <div key={location.key} className="page-enter">
            <Outlet />
          </div>
          <footer className="mt-8 pb-2 text-center text-[0.68rem] text-ink-tertiary">
            © {new Date().getFullYear()} ARDABYTEC. Todos los derechos reservados.
          </footer>
        </main>
        {showMusic && <MusicBubble />}
      </div>
      <AsistenciaModal />
      <ActaRetardosModal />
      <ActivoTerminosModal />
      <QuejasAlertBubble />
      <MensajeriaFloatingBubble />
      <WebphoneFrame />
    </div>
  )
}
