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
import { SoporteTIWidget } from '@/components/ui/SoporteTIWidget'
import { WebphoneFrame } from '@/components/ui/WebphoneFrame'
import { useUIStore } from '@/stores/ui.store'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useAuthStore } from '@/stores/auth.store'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { PersonalizacionProvider } from '@/providers/PersonalizacionProvider'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { useMusicStore } from '@/stores/music.store'

export function AppLayout() {
  const setActiveRoute = useUIStore((s) => s.setActiveRoute)
  const location = useLocation()
  const tipoUsuario = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase())
  const { isAllowed } = useModuleAccess()
  // Las burbujas flotantes solo se montan si el módulo está activo para la
  // empresa — así no disparan llamadas a /api que devolverían 403.
  const musicBubbleVisible = useMusicStore((s) => s.bubbleVisible)
  const puedeMusica = tipoUsuario !== 'CC' && tipoUsuario !== 'CL' && isAllowed('musica')
  const showMusic = puedeMusica && musicBubbleVisible
  const showMensajeria = isAllowed('mensajeria')

  useInactivityTimer()

  useEffect(() => {
    setActiveRoute(location.pathname)
  }, [location.pathname, setActiveRoute])

  return (
    <PersonalizacionProvider>
      <Layout location={location} showMusic={showMusic} showMensajeria={showMensajeria} />
    </PersonalizacionProvider>
  )
}

function Layout({ location, showMusic, showMensajeria }: {
  location: ReturnType<typeof useLocation>
  showMusic: boolean
  showMensajeria: boolean
}) {
  const { branding } = usePersonalizacion()
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
            © {new Date().getFullYear()} {branding.nombreLargo.toUpperCase()}. Todos los derechos reservados.
          </footer>
        </main>
        {showMusic && <MusicBubble />}
      </div>
      <AsistenciaModal />
      <ActaRetardosModal />
      <ActivoTerminosModal />
      <QuejasAlertBubble />
      {showMensajeria && <MensajeriaFloatingBubble />}
      <SoporteTIWidget />
      <WebphoneFrame />
    </div>
  )
}
