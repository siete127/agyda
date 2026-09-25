import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Bell, ChevronDown, LogOut, User as UserIcon,
  Sun, Moon, MonitorSmartphone, Loader2, CheckCheck,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import { usePortalBusqueda } from '@/hooks/usePortalBusqueda'
import { portalClienteService } from '@/services/portalCliente.service'

function getInitials(nombre: string | undefined) {
  if (!nombre) return '?'
  const parts = nombre.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function PortalClienteHeader() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAbierta, setBusquedaAbierta] = useState(false)
  const { resultados, isLoading: buscando, activo: busquedaActiva } = usePortalBusqueda(busqueda)

  const { data: notificaciones = [] } = useQuery({
    queryKey: ['portal-notificaciones'],
    queryFn: () => portalClienteService.getNotificaciones(),
    refetchInterval: 60_000,
  })
  const sinLeer = notificaciones.filter((n) => !n.leida).length

  async function marcarLeida(id: number) {
    await portalClienteService.marcarNotificacionLeida(id)
    queryClient.invalidateQueries({ queryKey: ['portal-notificaciones'] })
  }

  async function marcarTodasLeidas() {
    await portalClienteService.marcarTodasNotificacionesLeidas()
    queryClient.invalidateQueries({ queryKey: ['portal-notificaciones'] })
  }

  function irAResultado(ruta: string) {
    navigate(ruta)
    setBusqueda('')
    setBusquedaAbierta(false)
  }

  const theme = useThemeStore((s) => s.theme)
  const cycleTheme = useThemeStore((s) => s.cycle)
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : MonitorSmartphone
  const themeLabel = theme === 'dark' ? 'Tema: oscuro' : theme === 'light' ? 'Tema: claro' : 'Tema: automático'

  return (
    // bg-surface (no bg-card): mismo tono que el fondo del dashboard, tanto
    // en claro como en oscuro — el header se funde con el contenido.
    <header className="relative z-10 flex h-[72px] flex-shrink-0 items-center gap-6 bg-surface px-8">
      <div className="flex flex-shrink-0 items-center gap-3">
        <img src="/Logo_AGYDA.png" alt="AGYDA" className="h-9 w-auto" />
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold tracking-tight text-ink">AGYDA</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
            Soluciones de tecnología
          </p>
        </div>
      </div>

      {/* flex-1 + justify-center: centra la barra en el espacio disponible
         entre el logo y los íconos de la derecha (no queda pegada al logo
         como con un simple flex-1 sin centrar). */}
      <div className="flex flex-1 justify-center">
        <div className="relative w-full max-w-xl">
          {buscando ? (
            <Loader2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#0a2f71]" />
          ) : (
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0a2f71]" />
          )}
          <input
            type="text"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setBusquedaAbierta(true) }}
            onFocus={() => setBusquedaAbierta(true)}
            placeholder="Buscar facturas, cotizaciones, reuniones, documentos..."
            className="w-full rounded-full border border-[#0a2f71] bg-card py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink-tertiary focus:border-[#0a2f71] focus:outline-none focus:ring-2 focus:ring-[#0a2f71]/20"
          />

          {busquedaAbierta && busquedaActiva && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setBusquedaAbierta(false)} />
              <div className="absolute left-0 right-0 top-12 z-20 max-h-80 overflow-y-auto rounded-xl border border-surface-border bg-card py-1.5 shadow-card-lg">
                {buscando && resultados.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-tertiary">Buscando...</p>
                ) : resultados.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-ink-tertiary">Sin resultados para "{busqueda}"</p>
                ) : (
                  resultados.map((r, i) => (
                    <button
                      key={`${r.tipo}-${r.titulo}-${i}`}
                      type="button"
                      onClick={() => irAResultado(r.ruta)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{r.titulo}</p>
                        <p className="truncate text-xs text-ink-tertiary">{r.subtitulo}</p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[#0a2f71]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0a2f71]">
                        {r.tipo}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ml-auto flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          title={`${themeLabel} · clic para cambiar`}
          aria-label={themeLabel}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-card hover:text-ink-secondary"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notificaciones"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-card hover:text-ink-secondary"
          >
            <Bell className="h-5 w-5" />
            {sinLeer > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {sinLeer > 9 ? '9+' : sinLeer}
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-80 overflow-hidden rounded-xl border border-surface-border bg-card shadow-card-lg">
                <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
                  <p className="text-sm font-semibold text-ink">Notificaciones</p>
                  {sinLeer > 0 && (
                    <button type="button" onClick={marcarTodasLeidas} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                      <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notificaciones.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-ink-tertiary">Sin notificaciones</p>
                  ) : (
                    notificaciones.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => marcarLeida(n.id)}
                        className={clsx(
                          'flex w-full flex-col items-start gap-0.5 border-b border-surface-border px-4 py-2.5 text-left last:border-0 hover:bg-surface',
                          !n.leida && 'bg-brand/5'
                        )}
                      >
                        <p className={clsx('text-sm', n.leida ? 'text-ink-secondary' : 'font-semibold text-ink')}>{n.mensaje}</p>
                        <p className="text-[11px] text-ink-tertiary">{new Date(n.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-card"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0a2f71] text-sm font-bold text-white">
              {getInitials(user?.nombres)}
            </span>
            <ChevronDown className="h-4 w-4 text-ink-tertiary" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-xl border border-surface-border bg-card py-1.5 shadow-card-lg">
                <div className="border-b border-surface-border px-4 py-2.5">
                  <p className="truncate text-sm font-semibold text-ink">{user?.nombres ?? 'Cliente'}</p>
                  <p className="truncate text-xs text-ink-tertiary">{user?.usuario}</p>
                </div>
                <button
                  type="button"
                  className={clsx(
                    'flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink-secondary hover:bg-surface'
                  )}
                >
                  <UserIcon className="h-4 w-4" />
                  Mi perfil
                </button>
                <button
                  type="button"
                  onClick={() => clearSession()}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
