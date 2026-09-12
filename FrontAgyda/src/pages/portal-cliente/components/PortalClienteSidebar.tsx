import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Home, Calendar, Headphones, Megaphone, Receipt, Settings, HelpCircle, LogOut,
  ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, resolveTheme } from '@/stores/theme.store'

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
  { label: 'Facturas', to: '/portal-cliente/facturas', icon: <Receipt className="h-5 w-5" /> },
]

function NavItemRow({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false)
  const hasChildren = !!item.children?.length
  const theme = useThemeStore((s) => s.theme)
  const isDark = resolveTheme(theme) === 'dark'
  // Color de fondo "detrás" de la pestaña activa (el mismo que pinta las
  // esquinas cóncavas, ver comentario más abajo) — debe coincidir EXACTO con
  // el bg-surface real del <main> del dashboard (ver PortalClienteLayout),
  // si no la unión se ve con un borde/tono distinto en vez de continua.
  const activeBg = isDark ? 'rgb(15, 19, 27)' : 'rgb(247, 249, 252)'

  // Efecto "pestaña" (referencia eProduct): el ítem activo pierde el
  // border-radius del lado derecho y se extiende con un margen negativo
  // más allá del padding del <nav> (que ahora solo tiene padding
  // izquierdo), como si sobresaliera del borde del sidebar — en vez de
  // quedar contenido dentro del mismo margen que los ítems inactivos.
  // Las "esquinas cóncavas" arriba/abajo son el truco clásico de 2 círculos
  // del color de fondo general posicionados en las esquinas rectas de la
  // pestaña — al superponerse, "muerden" la esquina y crean la curva
  // invertida donde la pestaña conecta con el sidebar azul.
  if (!hasChildren) {
    return (
      <NavLink
        to={item.to}
        end
        style={({ isActive }) =>
          isActive ? { backgroundColor: activeBg, color: '#19b6bc' } : undefined
        }
        className={({ isActive }) =>
          clsx(
            'relative flex items-center gap-3 py-3.5 pl-4 text-sm font-semibold transition-colors',
            isActive
              ? '-mr-4 rounded-l-full pr-6 shadow-md'
              : 'mr-4 rounded-full pr-4 text-white/70 hover:bg-white/10 hover:text-white'
          )
        }
      >
        {({ isActive }) => (
          <>
            {item.icon}
            <span>{item.label}</span>
            {isActive && (
              <>
                {/* Esquina cóncava: cuadrado del color de la pestaña
                   (activeBg) de base, con un cuarto de círculo del azul
                   del sidebar "mordiendo" desde la esquina que toca a la
                   pestaña (radial-gradient con el punto duro justo ahí).
                   El resultado visual es la curva invertida donde la
                   pestaña se junta con el sidebar. */}
                <span
                  className="pointer-events-none absolute -top-6 right-0 h-6 w-6"
                  style={{
                    backgroundColor: activeBg,
                    backgroundImage: `radial-gradient(circle at 0 0, #0a2f71 24px, transparent 24px)`,
                  }}
                />
                <span
                  className="pointer-events-none absolute -bottom-6 right-0 h-6 w-6"
                  style={{
                    backgroundColor: activeBg,
                    backgroundImage: `radial-gradient(circle at 0 100%, #0a2f71 24px, transparent 24px)`,
                  }}
                />
              </>
            )}
          </>
        )}
      </NavLink>
    )
  }

  return (
    <div className="mr-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-full py-3.5 pl-4 pr-4 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
              style={({ isActive }) =>
                isActive ? { background: 'linear-gradient(135deg, #19b6bc 0%, #00537f 100%)' } : undefined
              }
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
    <aside className="flex w-[260px] flex-shrink-0 flex-col overflow-hidden bg-[#0a2f71] py-6 pl-4">
      <nav className="flex flex-1 flex-col gap-2.5">
        {NAV_ITEMS.map((item) => (
          <NavItemRow key={item.to} item={item} />
        ))}
      </nav>

      <div className="mr-4 mt-4 flex flex-col gap-2.5 border-t border-white/10 pt-4">
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
