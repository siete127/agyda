import { Outlet } from 'react-router-dom'
import { PortalClienteSidebar } from '@/pages/portal-cliente/components/PortalClienteSidebar'
import { PortalClienteHeader } from '@/pages/portal-cliente/components/PortalClienteHeader'

/**
 * Layout del Portal de Cliente — deliberadamente independiente de AppLayout
 * (el layout del panel interno de AGYDA). No comparte Sidebar/Topbar/estilos
 * con el resto de la intranet: es una experiencia aparte para el rol CL,
 * aunque reutiliza el mismo login/auth/backend.
 */
export function PortalClienteLayout() {
  return (
    <div className="flex min-h-screen bg-surface">
      <PortalClienteSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalClienteHeader />
        <main className="flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
