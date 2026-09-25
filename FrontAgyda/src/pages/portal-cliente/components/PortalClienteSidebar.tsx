import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Home, Calendar, Headphones, Megaphone, Receipt, Settings, HelpCircle, LogOut,
  PanelLeftClose, PanelLeftOpen, Users, Box, FileText, FileSpreadsheet,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { usePortalAcciones } from '@/hooks/usePortalAcciones'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  requiereAccion?: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Principal', to: '/portal-cliente', icon: <Home className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Reuniones', to: '/portal-cliente/reuniones', icon: <Calendar className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Atención', to: '/portal-cliente/atencion', icon: <Headphones className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Canales', to: '/portal-cliente/canales', icon: <Megaphone className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Facturas', to: '/portal-cliente/facturas', icon: <Receipt className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Cotizaciones', to: '/portal-cliente/cotizaciones', icon: <FileSpreadsheet className="h-5 w-5 flex-shrink-0" />, requiereAccion: 'ver-cotizaciones' },
  { label: 'Productos', to: '/portal-cliente/productos', icon: <Box className="h-5 w-5 flex-shrink-0" /> },
  { label: 'Documentos', to: '/portal-cliente/documentos', icon: <FileText className="h-5 w-5 flex-shrink-0" />, requiereAccion: 'descargar-documentos' },
  { label: 'Usuarios', to: '/portal-cliente/usuarios', icon: <Users className="h-5 w-5 flex-shrink-0" />, requiereAccion: 'gestionar-usuarios' },
]

// Pill activo: degradado sólido, igual para todos los ítems (nav y footer).
const ACTIVE_PILL = 'bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md'
const INACTIVE_PILL = 'text-white/70 hover:bg-white/10 hover:text-white'

export function PortalClienteSidebar({ className }: { className?: string }) {
  const clearSession = useAuthStore((s) => s.clearSession)
  const [collapsed, setCollapsed] = useState(false)
  const { puede } = usePortalAcciones()
  const navItems = NAV_ITEMS.filter((item) => !item.requiereAccion || puede(item.requiereAccion))

  return (
    <aside
      className={clsx(
        // "Flotante": separado de los bordes de la ventana (my-4 ml-4) y
        // con esquinas redondeadas + sombra propia, en vez de pegado a la
        // izquierda ocupando toda la altura de la pantalla.
        'my-4 ml-4 flex flex-shrink-0 flex-col overflow-hidden rounded-3xl bg-[#0a2f71] py-6 shadow-2xl shadow-black/30 transition-[width,transform,opacity] duration-300',
        collapsed ? 'w-20 px-3' : 'w-[260px] px-4',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
        className={clsx(
          'mb-4 flex items-center gap-2 rounded-full py-2 text-sm font-semibold text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60',
          collapsed ? 'justify-center px-0' : 'px-3'
        )}
      >
        {collapsed ? <PanelLeftOpen className="h-5 w-5 flex-shrink-0" /> : <PanelLeftClose className="h-5 w-5 flex-shrink-0" />}
        {!collapsed && <span>Contraer</span>}
      </button>

      <nav className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-full py-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60',
                collapsed ? 'justify-center px-0' : 'px-4',
                isActive ? ACTIVE_PILL : INACTIVE_PILL
              )
            }
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={clsx('mt-4 flex flex-shrink-0 flex-col gap-2.5 border-t border-white/10 pt-4', collapsed ? 'px-0' : '')}>
        <NavLink
          to="/portal-cliente/configuracion"
          title={collapsed ? 'Configuración' : undefined}
          className={clsx(
            'flex items-center gap-3 rounded-full py-3 text-sm font-semibold text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60',
            collapsed ? 'justify-center px-0' : 'px-4'
          )}
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {!collapsed && 'Configuración'}
        </NavLink>
        <NavLink
          to="/portal-cliente/ayuda"
          title={collapsed ? 'Ayuda y soporte' : undefined}
          className={clsx(
            'flex items-center gap-3 rounded-full py-3 text-sm font-semibold text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60',
            collapsed ? 'justify-center px-0' : 'px-4'
          )}
        >
          <HelpCircle className="h-5 w-5 flex-shrink-0" />
          {!collapsed && 'Ayuda y soporte'}
        </NavLink>
        <button
          type="button"
          onClick={() => clearSession()}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={clsx(
            'flex items-center gap-3 rounded-full py-3 text-left text-sm font-semibold text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60',
            collapsed ? 'justify-center px-0' : 'px-4'
          )}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  )
}
