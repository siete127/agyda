import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
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

function isItemActive(item: NavItem, pathname: string) {
  if (pathname === item.to) return true
  return !!item.children?.some((c) => pathname === c.to)
}

interface NavItemRowProps {
  item: NavItem
  itemRef: (el: HTMLElement | null) => void
  isSectionActive: boolean
}

function NavItemRow({ item, itemRef, isSectionActive }: NavItemRowProps) {
  const [open, setOpen] = useState(isSectionActive)
  const hasChildren = !!item.children?.length

  if (!hasChildren) {
    return (
      <NavLink
        ref={itemRef}
        to={item.to}
        end
        className={({ isActive }) =>
          clsx(
            'relative z-10 flex items-center gap-3 py-3.5 pl-4 text-sm font-semibold transition-colors',
            isActive
              ? '-mr-4 rounded-l-full pr-6 text-[#19b6bc]'
              : 'mr-4 rounded-full pr-4 text-white/70 hover:bg-white/10 hover:text-white'
          )
        }
      >
        {item.icon}
        <span>{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className="relative z-10 mr-4">
      <button
        ref={itemRef as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex w-full items-center gap-3 rounded-full py-3.5 pl-4 pr-4 text-sm font-semibold transition-colors',
          isSectionActive ? 'text-[#19b6bc]' : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
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

/**
 * Indicador deslizante: un único <span> absoluto (no uno por ítem) cuya
 * posición/alto se mide con refs del elemento activo real vía
 * getBoundingClientRect — así funciona sin importar cuántos ítems haya
 * arriba abiertos/cerrados, y se anima con transición CSS al cambiar de
 * ruta en vez de aparecer/desaparecer de golpe.
 */
function SlidingIndicator({ navRef, activeEl }: { navRef: React.RefObject<HTMLElement>; activeEl: HTMLElement | null }) {
  const [rect, setRect] = useState<{ top: number; height: number; right: number } | null>(null)
  const theme = useThemeStore((s) => s.theme)
  const isDark = resolveTheme(theme) === 'dark'
  // Debe coincidir EXACTO con el bg-surface real del <main> del dashboard
  // (ver PortalClienteLayout) para que la unión entre pestaña y contenido
  // se vea continua en vez de un borde/tono distinto.
  const bg = isDark ? 'rgb(15, 19, 27)' : 'rgb(247, 249, 252)'

  useLayoutEffect(() => {
    function measure() {
      if (!activeEl || !navRef.current) {
        setRect(null)
        return
      }
      const navBox = navRef.current.getBoundingClientRect()
      const itemBox = activeEl.getBoundingClientRect()
      // El item activo real (NavLink con -mr-4/pr-6) se extiende más allá
      // del borde derecho del <nav> — el indicador debe llegar exactamente
      // hasta ahí (no usar un valor fijo tipo "right-4"), si no queda más
      // angosto que el texto/ícono y se ve "despegado" del contenido real.
      setRect({
        top: itemBox.top - navBox.top,
        height: itemBox.height,
        right: navBox.right - itemBox.right,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [activeEl, navRef])

  if (!rect) return null

  const cornerSize = 32

  return (
    <span
      className="pointer-events-none absolute z-0 rounded-l-full"
      style={{
        top: rect.top,
        height: rect.height,
        left: 0,
        right: rect.right,
        backgroundColor: bg,
        transition: 'top 350ms cubic-bezier(0.4, 0, 0.2, 1), height 350ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Esquinas cóncavas: cuadrado de base azul (color del sidebar) con
         un cuarto de círculo del color de la pestaña "creciendo" desde la
         esquina opuesta — el resultado es la curva invertida donde la
         pestaña blanca se junta con el azul del sidebar arriba/abajo. */}
      <span
        className="pointer-events-none absolute right-0"
        style={{
          top: -cornerSize,
          height: cornerSize,
          width: cornerSize,
          backgroundColor: '#0a2f71',
          backgroundImage: `radial-gradient(circle at 0 0, transparent ${cornerSize}px, ${bg} ${cornerSize}px)`,
        }}
      />
      <span
        className="pointer-events-none absolute right-0"
        style={{
          bottom: -cornerSize,
          height: cornerSize,
          width: cornerSize,
          backgroundColor: '#0a2f71',
          backgroundImage: `radial-gradient(circle at 0 100%, transparent ${cornerSize}px, ${bg} ${cornerSize}px)`,
        }}
      />
    </span>
  )
}

export function PortalClienteSidebar() {
  const clearSession = useAuthStore((s) => s.clearSession)
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null)

  const activeItem = NAV_ITEMS.find((item) => isItemActive(item, location.pathname))

  useEffect(() => {
    setActiveEl(activeItem ? itemRefs.current.get(activeItem.to) ?? null : null)
  }, [activeItem, location.pathname])

  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col overflow-hidden bg-[#0a2f71] py-6 pl-4">
      <nav ref={navRef} className="relative flex flex-1 flex-col gap-2.5">
        <SlidingIndicator navRef={navRef} activeEl={activeEl} />
        {NAV_ITEMS.map((item) => (
          <NavItemRow
            key={item.to}
            item={item}
            isSectionActive={activeItem?.to === item.to}
            itemRef={(el) => {
              if (el) itemRefs.current.set(item.to, el)
              else itemRefs.current.delete(item.to)
            }}
          />
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
