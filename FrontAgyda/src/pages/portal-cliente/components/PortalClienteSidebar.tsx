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
  wrapperRef?: (el: HTMLElement | null) => void
  childRef?: (to: string, el: HTMLElement | null) => void
}

function NavItemRow({ item, itemRef, isSectionActive, wrapperRef, childRef }: NavItemRowProps) {
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
    <div className="relative z-10 mr-4" ref={wrapperRef}>
      <button
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
      {/* Despliegue animado con la técnica grid-template-rows 0fr→1fr: el
         submenú siempre está montado (no se agrega/quita del DOM de golpe),
         así que su alto real crece/decrece de forma suave en vez de saltar
         instantáneo. El overflow-hidden interior es imprescindible — sin él
         el contenido no se puede "clipear" mientras la fila crece desde 0. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="ml-4 mt-1.5 flex flex-col gap-1.5 border-l border-white/10 pl-3">
            {item.children!.map((child) => (
              <NavLink
                key={child.to}
                ref={(el) => childRef?.(child.to, el)}
                to={child.to}
                end
                className={({ isActive }) =>
                  clsx(
                    'relative z-10 py-2 pl-3 text-sm transition-colors',
                    isActive
                      ? '-mr-4 rounded-l-full pr-6 font-semibold text-[#19b6bc]'
                      : 'mr-4 rounded-full pr-3 text-white/60 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Clip-path de la esquina cóncava para un span cuadrado (size × size) —
 * "muerde" el cuarto de círculo pegado a la esquina que toca la pestaña,
 * dejando visible (rellenado con `bg`) solo la porción más alejada de esa
 * esquina. A diferencia del radial-gradient usado antes, lo que queda
 * FUERA del path es transparente de verdad (no una capa pintada con el
 * color del sidebar) — así no depende de conocer/igualar ese color: el
 * fondo real detrás se ve solo, sea cual sea, sin acoplar nada.
 */
function cornerClipPath(size: number, position: 'top' | 'bottom') {
  return position === 'top'
    ? `path('M ${size} 0 A ${size} ${size} 0 0 1 0 ${size} L ${size} ${size} Z')`
    : `path('M 0 0 A ${size} ${size} 0 0 1 ${size} ${size} L ${size} 0 Z')`
}

/**
 * Indicador deslizante: un único <span> absoluto (no uno por ítem) cuya
 * posición/alto se mide con refs del elemento activo real vía
 * getBoundingClientRect — así funciona sin importar cuántos ítems haya
 * arriba abiertos/cerrados, y se anima con transición CSS al cambiar de
 * ruta en vez de aparecer/desaparecer de golpe.
 */
function SlidingIndicator({
  navRef,
  activeEl,
  collapsibleRefs,
}: {
  navRef: React.RefObject<HTMLElement>
  activeEl: HTMLElement | null
  collapsibleRefs: React.RefObject<Set<HTMLElement>>
}) {
  const [rect, setRect] = useState<{ top: number; height: number; right: number } | null>(null)
  // Mientras el indicador se desliza (cambio de ruta, o un hermano que
  // despliega/colapsa su submenú y lo empuja), las esquinas cóncavas de
  // tamaño fijo (48px) dejan de coincidir con una sola fila — se ven como
  // un bloque claro deforme atravesando varios ítems. Se ocultan con un
  // fade mientras `rect` sigue cambiando y solo reaparecen cuando se
  // asienta, una vez transcurrida la transición de top/height (350ms).
  const [settled, setSettled] = useState(true)
  const settleTimer = useRef<number>()
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

    // Si OTRO ítem (arriba del activo) despliega/colapsa su submenú, el
    // ítem activo se corre hacia abajo/arriba — pero como ni `activeEl` ni
    // `navRef` cambian de identidad en ese caso, este efecto no se volvía a
    // ejecutar y el indicador quedaba "flotando" en su posición vieja (un
    // parche de color desprendido). Observar el <nav> no sirve: usa
    // `flex-1`, así que SU PROPIO tamaño nunca cambia aunque el contenido
    // interno se desplace (queda con espacio libre debajo cuando el menú
    // está corto). Lo que sí cambia de alto es cada wrapper con submenú
    // (la animación grid-template-rows), así que se observan esos wrappers
    // directamente — el callback se dispara en cada frame de esa
    // transición, lo que además mantiene el indicador sincronizado en
    // tiempo real mientras el submenú se despliega/colapsa.
    const resizeObserver = new ResizeObserver(measure)
    if (navRef.current) resizeObserver.observe(navRef.current)
    collapsibleRefs.current?.forEach((el) => resizeObserver.observe(el))

    return () => {
      window.removeEventListener('resize', measure)
      resizeObserver.disconnect()
    }
  }, [activeEl, navRef, collapsibleRefs])

  useEffect(() => {
    if (!rect) return
    setSettled(false)
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => setSettled(true), 360)
    return () => window.clearTimeout(settleTimer.current)
  }, [rect?.top, rect?.height])

  if (!rect) return null

  const cornerSize = 48

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
      {/* Esquinas cóncavas — ver cornerClipPath arriba. Ocultas (fade) mientras
         el indicador está en movimiento; ver comentario de `settled`. */}
      <span
        className="pointer-events-none absolute right-0"
        style={{
          top: -cornerSize,
          height: cornerSize,
          width: cornerSize,
          backgroundColor: bg,
          clipPath: cornerClipPath(cornerSize, 'top'),
          opacity: settled ? 1 : 0,
          transition: 'opacity 150ms ease-out',
        }}
      />
      <span
        className="pointer-events-none absolute right-0"
        style={{
          bottom: -cornerSize,
          height: cornerSize,
          width: cornerSize,
          backgroundColor: bg,
          clipPath: cornerClipPath(cornerSize, 'bottom'),
          opacity: settled ? 1 : 0,
          transition: 'opacity 150ms ease-out',
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
  const collapsibleRefs = useRef<Set<HTMLElement>>(new Set())
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null)

  const activeItem = NAV_ITEMS.find((item) => isItemActive(item, location.pathname))

  useEffect(() => {
    if (!activeItem) {
      setActiveEl(null)
      return
    }
    // Un item padre con submenú comparte su `to` con su primer hijo (ej.
    // "Reuniones" y "Próximas reuniones" son la misma ruta) — el indicador
    // debe apuntar siempre al HIJO real cuando hay uno activo (mismo diseño
    // que "Principal", pero sobre la fila del hijo), nunca a la fila del
    // padre — si no, quedan dos "activos" superpuestos.
    const activeChild = activeItem.children?.find((c) => c.to === location.pathname)
    const key = activeChild ? activeChild.to : activeItem.to
    setActiveEl(itemRefs.current.get(key) ?? null)
  }, [activeItem, location.pathname])

  return (
    <aside className="flex w-[260px] flex-shrink-0 flex-col overflow-hidden bg-[#0a2f71] py-6 pl-4">
      <nav ref={navRef} className="relative flex flex-1 flex-col gap-2.5">
        <SlidingIndicator navRef={navRef} activeEl={activeEl} collapsibleRefs={collapsibleRefs} />
        {NAV_ITEMS.map((item) => (
          <NavItemRow
            key={item.to}
            item={item}
            isSectionActive={activeItem?.to === item.to}
            itemRef={(el) => {
              if (el) itemRefs.current.set(item.to, el)
              else itemRefs.current.delete(item.to)
            }}
            wrapperRef={
              item.children?.length
                ? (el) => {
                    if (el) collapsibleRefs.current.add(el)
                  }
                : undefined
            }
            childRef={(to, el) => {
              if (el) itemRefs.current.set(to, el)
              else itemRefs.current.delete(to)
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
