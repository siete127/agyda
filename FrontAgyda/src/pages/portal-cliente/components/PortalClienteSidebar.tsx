import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Home, Calendar, Headphones, Megaphone, Settings, HelpCircle, LogOut,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  children?: { label: string; to: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Principal', to: '/portal-cliente', icon: <Home className="h-5 w-5" /> },
  {
    label: 'Reuniones', to: '/portal-cliente/reuniones', icon: <Calendar className="h-5 w-5" />,
    children: [
      { label: 'Próximas reuniones', to: '/portal-cliente/reuniones' },
      { label: 'Historial', to: '/portal-cliente/reuniones/historial' },
    ],
  },
  {
    label: 'Atención', to: '/portal-cliente/atencion', icon: <Headphones className="h-5 w-5" />,
    children: [
      { label: 'Mis solicitudes', to: '/portal-cliente/atencion' },
      { label: 'Nueva solicitud', to: '/portal-cliente/atencion/nueva' },
    ],
  },
  {
    label: 'Canales', to: '/portal-cliente/canales', icon: <Megaphone className="h-5 w-5" />,
    children: [
      { label: 'Mis campañas', to: '/portal-cliente/canales' },
    ],
  },
]

function NavItemRow({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const hasChildren = !!item.children?.length

  // El degradado del ítem activo (#19b6bc → #00537f) es un valor de marca
  // específico del portal de cliente, sin token en tailwind.config.ts — se
  // aplica inline en vez de agregar una utilidad de una sola vez.
  const activeGradient = { background: 'linear-gradient(135deg, #19b6bc 0%, #00537f 100%)' }

  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end
        style={({ isActive }) => (isActive ? activeGradient : undefined)}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 rounded-full px-4 py-3.5 text-sm font-semibold transition-colors',
            isActive
              ? 'text-white shadow-md'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )
        }
      >
        {item.icon}
        <span>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-full px-4 py-3.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight className={clsx('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="ml-4 mt-1.5 flex flex-col gap-1.5 border-l border-white/10 pl-4">
          {item.children!.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              end
              style={({ isActive }) => (isActive ? activeGradient : undefined)}
              className={({ isActive }) =>
                clsx(
                  'rounded-full px-3 py-2 text-sm transition-colors',
                  isActive ? 'font-semibold text-white' : 'text-white/60 hover:text-white'
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function PortalClienteSidebar() {
  const clearSession = useAuthStore((s) => s.clearSession)

  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col bg-[#0a2f71] px-4 py-6">
      <nav className="flex flex-1 flex-col gap-2.5">
        {NAV_ITEMS.map((item) => (
          <NavItemRow key={item.to} item={item} />
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-2.5 border-t border-white/10 pt-4">
        <NavLink
          to="/portal-cliente/configuracion"
          className="flex items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-5 w-5" />
          Configuración
        </NavLink>
        <NavLink
          to="/portal-cliente/ayuda"
          className="flex items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <HelpCircle className="h-5 w-5" />
          Ayuda y soporte
        </NavLink>
        <button
          type="button"
          onClick={() => clearSession()}
          className="flex items-center gap-3 rounded-full px-4 py-3 text-left text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
