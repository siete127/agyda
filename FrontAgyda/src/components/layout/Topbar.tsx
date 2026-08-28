import { useState, useRef, useEffect, useMemo } from 'react'
import { Menu, PanelLeftClose, PanelLeftOpen, Search, LifeBuoy, Newspaper, LayoutDashboard, Headset, HelpCircle, BarChart3, MonitorCog } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '@/stores/ui.store'
import { useCurrentUser } from '@/hooks/useAuth'
import { NotificationBell } from './NotificationBell'
import { MensajeriaBell } from './MensajeriaBell'
import { getRouteLabel, ROUTES } from '@/router/routes.config'
import { type Ticket } from '@/types/ticket.types'
import { type Noticia } from '@/types/noticia.types'
import logoAgyda from '@/assets/Logo_AGYDA.png'

interface SearchResult {
  id: string
  label: string
  sub?: string
  path: string
  type: 'page' | 'ticket' | 'noticia'
}


export function Topbar() {
  const { sidebarCollapsed, toggleSidebar, setMobileMenuOpen, isMobileMenuOpen } = useUIStore()
  const user = useCurrentUser()
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pageTitle = getRouteLabel(location.pathname)

  const handleSwitchSystem = () => {
    navigate('/ventas')
  }

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const canUseMarcador = ['AD', 'CC'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const openMarcador = () => {
    window.open('https://dialer20450.pbxhosting.com.mx/', '_blank', 'noopener,noreferrer')
  }

  const openMarcadorContingencia = () => {
    window.open('https://azul1.ardabytec.vip', '_blank', 'noopener,noreferrer')
  }

  // Acceso a "Gestión MIS" — lista fija de usuarios autorizados (NEUS_USUARIO),
  // mismo criterio que SUPER_ADMIN_IDS en BackAgyda/middleware/moduleAccess.js
  // pero comparado por el campo `usuario` en vez de `id`.
  const GESTION_MIS_USUARIOS = new Set([
    'TI_0117', // Abner Diaz
    'TI_0114', // Alan Gabriel Montoya Garrido
    'TI_0110', // Ines Jessica Ramos Meneses
    'TI_0116', // Cristian Luna Santillan
    'TI_0103', // Eliud Vladimir Mathus Evangelista
    'ADM_0001', // Edgar Montoya
    'ADM_0002', // Jazminn Miranda
  ])
  const canUseGestionMis = GESTION_MIS_USUARIOS.has(user?.usuario ?? '')

  const openGestionMis = () => {
    window.open('https://mis.ardabytec.vip', '_blank', 'noopener,noreferrer')
  }

  const userRoles = user?.tipoUsuario ? [user.tipoUsuario.toUpperCase()] : []

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const out: SearchResult[] = []

    // Rutas del sidebar
    ROUTES.filter((r) =>
      r.showInSidebar &&
      r.label.toLowerCase().includes(q) &&
      (r.roles.length === 0 || r.roles.some((role) => userRoles.includes(role)))
    ).slice(0, 3).forEach((r) => {
      out.push({ id: `page-${r.path}`, label: r.label, path: r.path, type: 'page' })
    })

    // Tickets en caché
    const tickets = qc.getQueryData<Ticket[]>(['tickets']) ?? []
    tickets.filter((t) =>
      t.titulo.toLowerCase().includes(q) || String(t.id).includes(q)
    ).slice(0, 3).forEach((t) => {
      out.push({ id: `ticket-${t.id}`, label: `#${t.id} ${t.titulo}`, sub: t.estado, path: '/tickets', type: 'ticket' })
    })

    // Noticias en caché
    const noticias = qc.getQueryData<Noticia[]>(['noticias']) ?? []
    noticias.filter((n) =>
      n.titulo.toLowerCase().includes(q) || n.categoria.toLowerCase().includes(q)
    ).slice(0, 3).forEach((n) => {
      out.push({ id: `noticia-${n.id}`, label: n.titulo, sub: n.categoria, path: '/noticias', type: 'noticia' })
    })

    return out.slice(0, 8)
  }, [query, userRoles, qc])

  const ICONS = {
    page:    LayoutDashboard,
    ticket:  LifeBuoy,
    noticia: Newspaper,
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results.length > 0) {
      navigate(results[0].path)
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
    <header className="flex h-[64px] flex-shrink-0 items-center gap-3 border-b border-surface-border bg-white px-5">

      {/* Izquierda: toggle + logo */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop collapse */}
        <button
          onClick={toggleSidebar}
          className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors md:flex"
          title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {sidebarCollapsed
            ? <PanelLeftOpen  className="h-4 w-4" />
            : <PanelLeftClose className="h-4 w-4" />}
        </button>

        <div className="mx-1 h-5 w-px bg-surface-border hidden md:block" />

        {/* Logo */}
        <div className="hidden items-center gap-2 md:flex">
          <img src={logoAgyda} alt="AGYDA" className="h-8 w-8 flex-shrink-0 object-contain" />
          <div className="leading-tight">
            <p className="text-[1rem] font-extrabold tracking-tight text-ink">
              ARDABY<span className="text-brand">TEC</span>
            </p>
            <p className="text-[7.5px] font-semibold -mt-0.5 text-ink-tertiary" style={{ letterSpacing: '0.12em' }}>
              SOLUCIONES EN TECNOLOGÍA
            </p>
          </div>
        </div>

        <h1 className="text-[0.9rem] font-semibold text-ink truncate md:hidden">{pageTitle}</h1>
      </div>

      {/* Centro: buscador */}
      <div ref={containerRef} className="hidden flex-1 max-w-sm mx-auto sm:flex relative">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => query && setOpen(true)}
            onKeyDown={handleKey}
            placeholder="Buscar en AGYDA…"
            className="w-full rounded-full border-0 py-2 pl-9 pr-4 text-xs text-ink placeholder-ink-tertiary outline-none transition focus:ring-2 focus:ring-brand/15"
            style={{ background: '#F2F4F8' }}
          />
        </div>

        {open && results.length > 0 && (
          <div className="absolute top-full mt-1.5 w-72 rounded-2xl border border-surface-border bg-white shadow-lg z-50 overflow-hidden">
            {results.map((r) => {
              const Icon = ICONS[r.type]
              return (
                <button
                  key={r.id}
                  onMouseDown={() => { navigate(r.path); setQuery(''); setOpen(false) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-brand-light transition-colors group"
                >
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-surface group-hover:bg-brand-light transition-colors">
                    <Icon className="h-3.5 w-3.5 text-ink-tertiary group-hover:text-brand transition-colors" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.78rem] font-medium text-ink-secondary group-hover:text-brand truncate transition-colors">{r.label}</p>
                    {r.sub && <p className="text-[0.65rem] text-ink-tertiary capitalize truncate">{r.sub}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Derecha: notificaciones + perfil */}
      <div className="ml-auto flex items-center gap-2.5">

        {/* Botón marcador contingencia (AzulDial) */}
        {canUseMarcador && (
          <button
            onClick={openMarcadorContingencia}
            title="Marcador AzulDial"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors"
          >
            <Headset className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Botón marcador (Plata) */}
        {canUseMarcador && (
          <button
            onClick={openMarcador}
            title="Marcador Plata"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Headset className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Cambiar de sistema (Intranet / Ventas) */}
        <button
          onClick={handleSwitchSystem}
          title="Cambiar de sistema"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface text-ink-secondary hover:bg-brand-light hover:text-brand transition-colors"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </button>

        {/* Gestión MIS — solo para usuarios autorizados */}
        {canUseGestionMis && (
          <button
            onClick={openGestionMis}
            title="Gestión MIS"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface text-ink-secondary hover:bg-brand-light hover:text-brand transition-colors"
          >
            <MonitorCog className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="mx-0.5 h-5 w-px bg-surface-border hidden md:block" />

        <MensajeriaBell />

        <NotificationBell />

        <button className="hidden text-ink-tertiary hover:text-ink-secondary transition-colors sm:flex" title="Ayuda">
          <HelpCircle className="h-[19px] w-[19px]" />
        </button>
      </div>
    </header>

    </>
  )
}
