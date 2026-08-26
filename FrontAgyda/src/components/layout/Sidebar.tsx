import { X, LogOut, ChevronRight, Rocket } from 'lucide-react'
import * as Icons from 'lucide-react'
import { useState } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { useAuthStore } from '@/stores/auth.store'
import { useCurrentUser } from '@/hooks/useAuth'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { useNotificationStore } from '@/stores/notification.store'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { SidebarItem } from './SidebarItem'
import { SidebarFlyout, type FlyoutPosition } from './SidebarFlyout'
import { Avatar } from '@/components/ui/Avatar'
import { ROUTES } from '@/router/routes.config'
import { disconnectSocket } from '@/lib/socket'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'

// Burbujas del efecto de agua: posición horizontal (%), tamaño (px), opacidad,
// duración del ascenso (s) y retraso inicial (s) — variados para que no suban en fila.
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

// El sidebar se organiza por área de negocio (ver plan "Expansión de la Intranet a las 10 Áreas").
// El ícono de cada grupo es el del primer moduleKey listado — por eso cada área empieza
// con su propio moduleKey de área (direccion-general, rh-area, etc.) antes de sus módulos.
const GROUPS = [
  {
    label: 'Principal',
    keys: ['*', 'noticias', 'mensajeria'],
  },
  {
    label: 'Dirección General',
    keys: ['direccion-general', 'areas-portal', 'reports'],
  },
  {
    label: 'Recursos Humanos',
    keys: ['rh-area', 'expedientes', 'nomina', 'vacaciones', 'asistencia-personal', 'asistencia', 'mi-area', 'vacantes', 'encuestas', 'capacitacion', 'incapacidades', 'evaluacion-desempeno'],
  },
  {
    label: 'Finanzas y Administración',
    keys: ['finanzas', 'gastos'],
  },
  {
    label: 'Ventas',
    keys: ['ventas-area', 'clientes', 'crm', 'email-marketing'],
  },
  {
    label: 'Contact Center',
    keys: ['operaciones', 'webphone', 'livechat', 'checklists'],
  },
  {
    label: 'Calidad',
    keys: ['calidad', 'evaluacion', 'auditoria'],
  },
  {
    label: 'Marketing',
    keys: ['marketing', 'organigrama', 'chatbot'],
  },
  {
    label: 'Tecnología / TI',
    keys: ['tecnologia', 'tickets', 'activos', 'staff-ti', 'usuarios'],
  },
  {
    label: 'Atención al Cliente',
    keys: ['atencion-cliente', 'quejas'],
  },
  {
    label: 'Legal y Cumplimiento',
    keys: ['legal', 'reglamento'],
  },
  {
    label: 'Otros',
    keys: ['drive', 'musica', 'calendario', 'proyectos'],
  },
  {
    label: 'Configuración',
    keys: ['configuracion'],
  },
]

export function Sidebar() {
  const { sidebarCollapsed, isMobileMenuOpen, setMobileMenuOpen } = useUIStore()
  const clearSession  = useAuthStore((s) => s.clearSession)
  const user          = useCurrentUser()
  const userRole      = user?.tipoUsuario?.toUpperCase() ?? ''
  const { isAllowed } = useModuleAccess()
  const unreadCount   = useNotificationStore((s) => s.unreadCount)

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
          'relative flex h-screen flex-col overflow-hidden transition-[width] duration-300 ease-in-out flex-shrink-0',
          sidebarCollapsed ? 'w-[76px]' : 'w-[240px]',
          'fixed left-0 top-0 z-40 md:relative md:z-auto',
          isMobileMenuOpen ? 'flex' : 'hidden md:flex',
        )}
        style={{ background: 'linear-gradient(180deg, #14225C 0%, #1E3D8F 55%, #2C57C4 100%)' }}
      >
        {/* ── Efecto de flujo de agua: blobs de luz + burbujas ascendentes ── */}
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
              className="animate-bubble-rise absolute rounded-full bg-white"
              style={{
                left: `${b.left}%`,
                bottom: `-${b.size}px`,
                width: b.size,
                height: b.size,
                opacity: b.opacity,
                animationDuration: `${b.duration}s`,
                animationDelay: `${b.delay}s`,
              }}
            />
          ))}
        </div>

        {isMobileMenuOpen && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-gray-500 hover:bg-white/5 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* ── Logo — solo visible en modo colapsado, para no perder identidad ── */}
        {sidebarCollapsed && (
          <div className="relative z-10 flex h-[64px] flex-shrink-0 items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 1 L23 13 L13 23" />
              </svg>
            </div>
          </div>
        )}

        {/* ── Navegación: items grandes tipo botón ── */}
        <nav className="relative z-10 flex-1 overflow-y-auto px-3 pt-5 pb-3 space-y-1.5">
          {GROUPS.map((group) => {
            const routes = getGroupRoutes(group.keys)
            if (routes.length === 0) return null
            const isOpen = openGroup === group.label
            const GroupIcon = routes[0].icon
              ? (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[routes[0].icon]
              : undefined

            const isFlyoutOpen = flyoutGroup === group.label

            return (
              <div key={group.label}>
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
                    'group flex w-full items-center gap-3 rounded-xl transition-colors',
                    sidebarCollapsed ? 'justify-center px-0 py-3.5' : 'px-3.5 py-3',
                    (isOpen || isFlyoutOpen) ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]',
                  )}
                >
                  <span className={clsx(
                    'flex flex-shrink-0 items-center justify-center rounded-full',
                    sidebarCollapsed ? 'h-11 w-11' : 'h-9 w-9',
                    (isOpen || isFlyoutOpen) ? 'bg-brand/25 text-brand-muted' : 'text-[#B8C2E0] group-hover:text-white',
                  )}>
                    {GroupIcon && <GroupIcon className={sidebarCollapsed ? 'h-5 w-5' : 'h-[1.1rem] w-[1.1rem]'} />}
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className={clsx('flex-1 text-left text-[0.9rem] font-medium', isOpen ? 'text-white' : 'text-[#DCE3F5]')}>
                        {group.label}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 flex-shrink-0 text-[#8E9FD4] transition-transform duration-200"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}
                      />
                    </>
                  )}
                </button>

                {!sidebarCollapsed && (
                  <div
                    className="space-y-0.5 overflow-hidden pl-4 transition-all duration-200"
                    style={{ maxHeight: isOpen ? '999px' : '0px', opacity: isOpen ? 1 : 0, marginTop: isOpen ? '0.25rem' : 0 }}
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
          })}
        </nav>

        {/* ── Tarjeta de tagline ── */}
        {!sidebarCollapsed && (
          <div className="relative z-10 flex-shrink-0 px-3 pb-4">
            <div className="flex items-start gap-2.5 rounded-2xl p-4" style={{ background: 'rgba(47,111,237,0.14)' }}>
              <Rocket className="h-4 w-4 flex-shrink-0 mt-0.5 text-brand-muted" />
              <p className="text-[0.78rem] leading-snug text-[#DCE3F5]">
                Conectados hoy, resolvemos el mañana.
              </p>
            </div>
          </div>
        )}

        {/* ── Footer: perfil + logout ── */}
        <div className="relative z-10 flex-shrink-0 px-3 pb-4">
          <div className="h-px bg-white/[0.06] mb-3" />

          {user && (
            <Link
              to="/perfil"
              title={sidebarCollapsed ? (user.perfilAlias ?? user.nombres) : undefined}
              className={clsx(
                'group mb-1 flex items-center gap-3 rounded-xl transition-colors hover:bg-white/[0.05]',
                sidebarCollapsed ? 'justify-center px-2 py-2' : 'px-2 py-2',
              )}
            >
              <Avatar src={user.perfilFotoUrl} name={user.nombres} size="sm" />
              {!sidebarCollapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.78rem] font-semibold text-white leading-none">
                      {user.perfilAlias ?? user.nombres.split(' ')[0]}
                    </p>
                    <p className="text-[0.65rem] text-[#A9B4DE] mt-0.5 capitalize">{user.tipoUsuario}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-[#8E9FD4] group-hover:text-[#DCE3F5] transition-colors" />
                </>
              )}
            </Link>
          )}

          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[0.78rem] font-medium transition-colors',
              'text-[#A9B4DE] hover:bg-red-500/10 hover:text-red-400',
              sidebarCollapsed && 'justify-center px-2',
            )}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Cerrar sesión</span>}
          </button>

          {!sidebarCollapsed && (
            <p className="mt-3 px-2 text-[0.6rem] text-[#6B79AD]">
              © {new Date().getFullYear()} ArdaBytec · Todos los derechos reservados · AGYDA v20.11.0
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
