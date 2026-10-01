import { X, LogOut, ChevronRight, PanelLeftClose, PanelLeftOpen, LifeBuoy } from 'lucide-react'
import * as Icons from 'lucide-react'
import { useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'
import { useCurrentUser } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useActionAccess } from '@/hooks/useActionAccess'
import { puedeVerModulo } from '@/router/accionVer'
import { useNotificationStore } from '@/stores/notification.store'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { SidebarItem } from './SidebarItem'
import { SidebarFlyout, type FlyoutPosition } from './SidebarFlyout'
import { ROUTES } from '@/router/routes.config'
import { NAV_GROUPS } from '@/router/navGroups'
import { disconnectSocket } from '@/lib/socket'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { clsx } from 'clsx'
import { useNavigate, useLocation } from 'react-router-dom'

// Burbujas del efecto de agua (opcional, ver branding.sidebarBurbujas):
// posición horizontal (%), tamaño (px), opacidad, duración del ascenso (s) y
// retraso inicial (s) — variados para que no suban en fila.
const BUBBLES = [
  { left: 8,  size: 10, opacity: 0.35, duration: 10, delay: 0    },
  { left: 22, size: 16, opacity: 0.25, duration: 13, delay: 2.5  },
  { left: 38, size: 7,  opacity: 0.4,  duration: 8,  delay: 1    },
  { left: 52, size: 20, opacity: 0.18, duration: 16, delay: 4    },
  { left: 66, size: 12, opacity: 0.3,  duration: 11, delay: 6    },
  { left: 78, size: 8,  opacity: 0.35, duration: 9,  delay: 3    },
  { left: 90, size: 14, opacity: 0.22, duration: 14, delay: 7.5  },
  { left: 15, size: 6,  opacity: 0.4,  duration: 7,  delay: 5    },
  { left: 60, size: 9,  opacity: 0.3,  duration: 10, delay: 8.5  },
  { left: 33, size: 18, opacity: 0.2,  duration: 15, delay: 0.8  },
]

// El sidebar se organiza por área de negocio. Las secciones viven en
// router/navGroups.ts, compartidas con el árbol de Configuración.
const GROUPS = NAV_GROUPS

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar, isMobileMenuOpen, setMobileMenuOpen } = useUIStore()
  const clearSession  = useAuthStore((s) => s.clearSession)
  const user          = useCurrentUser()
  const userRole      = user?.tipoUsuario?.toUpperCase() ?? ''
  const { isAllowed } = useModuleAccess()
  const { isLoading: cargandoAcciones, can } = useActionAccess()
  const unreadCount   = useNotificationStore((s) => s.unreadCount)
  const { branding }  = usePersonalizacion()

  // ── Estilo del sidebar (preset por empresa). Los 5 presets son oscuros para
  //    que el texto claro del menú (text-[#B8C2E0]…) siga legible. Default
  //    actual: mismo azul sólido del sidebar del Portal de Cliente. ──
  const estilo = branding.sidebarEstilo ?? 'solido-portal'
  const sidebarBg: React.CSSProperties =
    estilo === 'solido-oscuro'    ? { background: '#0B1730' }
    : estilo === 'color-marca'    ? { background: 'rgb(var(--color-brand-dark))' }
    : estilo === 'gradiente-marca' ? { background: 'linear-gradient(180deg, rgb(var(--color-brand-dark)) 0%, rgb(var(--color-brand)) 100%)' }
    : estilo === 'degradado-azul'  ? { background: 'linear-gradient(180deg, #14225C 0%, #1E3D8F 55%, #2C57C4 100%)' }
    : /* solido-portal */            { background: '#0a2f71' }
  const mostrarBurbujas = branding.sidebarBurbujas ?? false

  const ticketsPendientes = 0

  const { data: permisosPendientes = 0 } = useQuery({
    queryKey: ['sidebar-permisos-badge'],
    queryFn: async () => {
      const { data } = await api.get('/permisos', {
        headers: { tipousuario: 'admin', usuarioid: String(user?.id ?? '') },
      })
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).filter((p) =>
        String(p['estatus'] ?? p['ESTATUS'] ?? '').toLowerCase() === 'pendiente'
      ).length
    },
    enabled: ['AD', 'TI'].includes(userRole),
    staleTime: 60_000,
  })

  const BADGES: Record<string, number> = {
    '/tickets':        ticketsPendientes,
    '/permisos':       permisosPendientes,
    '/notificaciones': unreadCount,
  }

  const visibleRoutes = ROUTES.filter((r) => {
    if (!r.showInSidebar) return false
    if (r.roles.length > 0 && !r.roles.includes(userRole)) return false
    if (!isAllowed(r.moduleKey)) return false
    if (!cargandoAcciones && !puedeVerModulo(r.moduleKey, can)) return false
    return true
  })

  const getGroupRoutes = (keys: string[]) => visibleRoutes.filter((r) => keys.includes(r.moduleKey))

  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('sidebar-open-group')
      return saved ? JSON.parse(saved) : 'Principal'
    } catch {
      return 'Principal'
    }
  })

  const toggleGroup = (label: string) => {
    setOpenGroup((prev) => {
      const next = prev === label ? null : label
      try { localStorage.setItem('sidebar-open-group', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Flyout de grupo en modo colapsado ──
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null)
  const [flyoutPosition, setFlyoutPosition] = useState<FlyoutPosition | null>(null)

  const openFlyout = (label: string, buttonEl: HTMLButtonElement) => {
    // Leer el rect de forma síncrona AHORA — nunca dentro del callback funcional de
    // setState, porque React recicla el SyntheticEvent y currentTarget llega null.
    const rect = buttonEl.getBoundingClientRect()
    const MARGIN = 12
    // El panel se ancla siempre dentro del viewport: top no baja de MARGIN, y su alto
    // máximo se calcula con el espacio real disponible hasta el borde inferior — el
    // contenido interno tiene su propio scroll (max-h-[70vh] overflow-y-auto), así que
    // nunca se corta contra la pantalla, sin depender de una altura estimada.
    const top = Math.max(MARGIN, Math.min(rect.top, window.innerHeight - MARGIN))
    const maxHeight = window.innerHeight - top - MARGIN
    setFlyoutPosition({ top, left: rect.right + 10, maxHeight })
    setFlyoutGroup(label)
  }

  const closeFlyout = () => {
    setFlyoutGroup(null)
    setFlyoutPosition(null)
  }

  // El flyout solo tiene sentido con el sidebar colapsado — si se expande, se
  // deja de mostrar sin necesidad de un efecto que sincronice estado aparte.
  const flyoutVisible = sidebarCollapsed && flyoutGroup !== null && flyoutPosition !== null

  const handleLogout = () => {
    disconnectSocket()
    clearSession()
    window.location.replace('/login')
  }

  return (
    <>
      {/* Overlay mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={clsx(
          // "Flotante": separado de los bordes de la ventana (my-4 ml-4) y con
          // esquinas redondeadas + sombra propia, igual que el sidebar del
          // Portal de Cliente — en vez de pegado a la izquierda ocupando toda
          // la altura de la pantalla.
          'relative my-4 ml-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/30 transition-[width] duration-300 ease-in-out flex-shrink-0',
          sidebarCollapsed ? 'w-[76px]' : 'w-[240px]',
          'fixed left-0 top-0 z-40 md:relative md:z-auto',
          isMobileMenuOpen ? 'flex' : 'hidden md:flex',
        )}
        style={sidebarBg}
      >
        {/* ── Efecto de flujo de agua: blobs de luz + burbujas ascendentes ── */}
        {mostrarBurbujas && (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <div
              className="animate-water-a absolute -left-1/4 -top-1/4 h-[85%] w-[85%] rounded-full opacity-60 blur-2xl"
              style={{ background: 'radial-gradient(circle, rgba(140,190,255,0.7) 0%, transparent 65%)' }}
            />
            <div
              className="animate-water-b absolute -bottom-1/4 -right-1/4 h-[80%] w-[80%] rounded-full opacity-50 blur-2xl"
              style={{ background: 'radial-gradient(circle, rgba(110,165,255,0.65) 0%, transparent 65%)' }}
            />
            {/* Burbujas — suben flotando de abajo hacia arriba en bucle */}
            {BUBBLES.map((b, i) => (
              <span
                key={i}
                className="animate-bubble-rise absolute rounded-full"
                style={{
                  left: `${b.left}%`,
                  bottom: `-${b.size}px`,
                  width: b.size,
                  height: b.size,
                  opacity: b.opacity,
                  background: 'rgba(255,255,255,0.9)',
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                }}
              />
            ))}
          </div>
        )}

        {isMobileMenuOpen && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-gray-500 hover:bg-white/5 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* ── Contraer/expandir — mismo botón que el sidebar del Portal de Cliente ── */}
        <button
          type="button"
          onClick={() => toggleSidebar()}
          title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
          className={clsx(
            'relative z-20 mt-3 flex w-full flex-shrink-0 cursor-pointer items-center gap-2 py-3 text-sm font-semibold text-white/60 outline-none transition-colors hover:bg-white/10 hover:text-white',
            sidebarCollapsed ? 'justify-center px-0' : 'mx-3 w-[calc(100%-1.5rem)] rounded-full px-3'
          )}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5 flex-shrink-0" /> : <PanelLeftClose className="h-5 w-5 flex-shrink-0" />}
          {!sidebarCollapsed && <span>Contraer</span>}
        </button>

        {/* ── Navegación: items grandes tipo botón ── */}
        <nav className="relative z-10 flex-1 overflow-y-auto px-3 pt-3 pb-3 space-y-2.5">
          {(() => {
            let moduleLabelShown = false
            return GROUPS.map((group) => {
            const routes = getGroupRoutes(group.keys)
            if (routes.length === 0) return null
            const GroupIcon = routes[0].icon
              ? (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[routes[0].icon]
              : undefined

            // Separador de texto "MÓDULOS" antes del primer grupo con
            // acordeón/link (Dirección General en adelante) — no se repite
            // en modo colapsado, donde no hay espacio para texto.
            const showModuleLabel = !group.suelto && !moduleLabelShown && !sidebarCollapsed
            if (!group.suelto) moduleLabelShown = true

            // Grupo "suelto" (ej. Principal: Inicio/Noticias/Mensajería) —
            // cada ruta es su propio acceso directo de nivel raíz, sin botón
            // padre ni acordeón que desplegar.
            if (group.suelto) {
              return (
                <div key={group.label} className="space-y-2.5">
                  {routes.map((route) => (
                    <SidebarItem
                      key={route.path}
                      to={route.path}
                      label={route.label}
                      icon={route.icon}
                      isCollapsed={sidebarCollapsed}
                      badge={BADGES[route.path]}
                      onClick={() => setMobileMenuOpen(false)}
                      size="lg"
                    />
                  ))}
                </div>
              )
            }

            // Separador propio del grupo (ej. "Herramientas" antes de
            // Configuración), independiente del "Módulos" automático.
            const separadorPropio = !sidebarCollapsed && group.separadorAntes

            const moduleLabel = (showModuleLabel || separadorPropio) && (
              <p className="px-4 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-wider text-[#19b6bc]">
                {separadorPropio || 'Módulos'}
              </p>
            )

            // Grupo con un solo módulo (ej. Configuración) — link directo, sin
            // toggle ni submenú duplicando la misma etiqueta. Mismo estilo
            // visual que un grupo normal (círculo grande, sin chevron).
            if (routes.length === 1) {
              const isActive = location.pathname === routes[0].path || location.pathname.startsWith(routes[0].path + '/')
              return (
                <div key={group.label}>
                  {moduleLabel}
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false)
                      navigate(routes[0].path)
                    }}
                    title={sidebarCollapsed ? group.label : undefined}
                    className={clsx(
                      'group flex w-full items-center gap-3 rounded-full font-semibold transition-colors',
                      sidebarCollapsed ? 'justify-center px-0 py-3.5' : 'px-4 py-3.5',
                      isActive
                        ? 'bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {GroupIcon && <GroupIcon className={clsx('flex-shrink-0', sidebarCollapsed ? 'h-5 w-5' : 'h-[1.1rem] w-[1.1rem]')} />}
                    {!sidebarCollapsed && (
                      <span className="flex-1 text-left text-sm">
                        {group.label}
                      </span>
                    )}
                    {!sidebarCollapsed && !!BADGES[routes[0].path] && BADGES[routes[0].path] > 0 && (
                      <span className="flex-shrink-0 rounded-full bg-white/90 px-1.5 py-0.5 text-[0.6rem] font-bold text-[#00537f] leading-none">
                        {BADGES[routes[0].path] > 99 ? '99+' : BADGES[routes[0].path]}
                      </span>
                    )}
                  </button>
                </div>
              )
            }

            const isOpen = openGroup === group.label
            const isFlyoutOpen = flyoutGroup === group.label

            return (
              <div key={group.label}>
                {moduleLabel}
                <button
                  onClick={(e) => {
                    if (sidebarCollapsed) {
                      // Toggle: un segundo clic sobre el mismo grupo cierra el flyout.
                      if (isFlyoutOpen) closeFlyout()
                      else openFlyout(group.label, e.currentTarget)
                    } else {
                      toggleGroup(group.label)
                    }
                  }}
                  className={clsx(
                    'group flex w-full items-center gap-3 rounded-full font-semibold transition-colors',
                    sidebarCollapsed ? 'justify-center px-0 py-3.5' : 'px-4 py-3.5',
                    (isOpen || isFlyoutOpen) ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {GroupIcon && <GroupIcon className={clsx('flex-shrink-0', sidebarCollapsed ? 'h-5 w-5' : 'h-[1.1rem] w-[1.1rem]')} />}
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 text-left text-sm">
                        {group.label}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 flex-shrink-0 transition-transform duration-200"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      />
                    </>
                  )}
                </button>

                {!sidebarCollapsed && (
                  <div
                    className="space-y-2.5 overflow-hidden pl-4 transition-all duration-200"
                    style={{ maxHeight: isOpen ? '999px' : '0px', opacity: isOpen ? 1 : 0, marginTop: isOpen ? '0.5rem' : 0 }}
                  >
                    {routes.map((route) => (
                      <SidebarItem
                        key={route.path}
                        to={route.path}
                        label={route.label}
                        icon={route.icon}
                        isCollapsed={false}
                        badge={BADGES[route.path]}
                        onClick={() => setMobileMenuOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
            })
          })()}
        </nav>

        {/* ── Footer: ayuda + logout ── */}
        <div className={clsx('relative z-10 mt-4 flex flex-shrink-0 flex-col gap-2.5 border-t border-white/10 pb-4 pt-4', sidebarCollapsed ? 'px-0' : 'px-3')}>
          <button
            onClick={() => { setMobileMenuOpen(false); navigate('/tickets') }}
            title={sidebarCollapsed ? 'Ayuda y soporte' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-full py-3 text-left text-sm font-semibold text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white',
              sidebarCollapsed ? 'justify-center px-0' : 'px-4'
            )}
          >
            <LifeBuoy className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>Ayuda y soporte</span>}
          </button>

          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
            className={clsx(
              'flex items-center gap-3 rounded-full py-3 text-left text-sm font-semibold text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white',
              sidebarCollapsed ? 'justify-center px-0' : 'px-4'
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>Cerrar sesión</span>}
          </button>

          {!sidebarCollapsed && (
            <p className="px-2 text-[0.6rem] text-white/40">
              © {new Date().getFullYear()} {branding.nombreLargo} · Todos los derechos reservados
            </p>
          )}
        </div>
      </aside>

      {/* ── Flyout de sub-módulos (solo en modo colapsado) ── */}
      {flyoutVisible && (() => {
        const group = GROUPS.find((g) => g.label === flyoutGroup)
        if (!group) return null
        const routes = getGroupRoutes(group.keys)
        if (routes.length === 0) return null
        return (
          <SidebarFlyout
            groupLabel={group.label}
            groupIcon={routes[0].icon}
            routes={routes}
            position={flyoutPosition!}
            onClose={closeFlyout}
          />
        )
      })()}
    </>
  )
}
