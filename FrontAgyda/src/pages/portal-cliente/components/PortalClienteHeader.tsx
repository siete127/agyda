import { useState } from 'react'
import {
  Search, Bell, MessageSquare, HelpCircle, ChevronDown, LogOut, User as UserIcon,
  Sun, Moon, MonitorSmartphone,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'

function getInitials(nombre: string | undefined) {
  if (!nombre) return '?'
  const parts = nombre.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function PortalClienteHeader() {
  const user = useAuthStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const [menuOpen, setMenuOpen] = useState(false)

  const theme = useThemeStore((s) => s.theme)
  const cycleTheme = useThemeStore((s) => s.cycle)
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : MonitorSmartphone
  const themeLabel = theme === 'dark' ? 'Tema: oscuro' : theme === 'light' ? 'Tema: claro' : 'Tema: automático'

  return (
    // bg-surface (no bg-card): mismo tono que el fondo del dashboard, tanto
    // en claro como en oscuro — el header se funde con el contenido en vez
    // de leerse como una barra aparte. Sin border-b, pero con una sombra
    // propia constante (relative + z-10): sin ella, al hacer scroll el
    // borde superior de la primera tarjeta del contenido (que sí tiene su
    // propia sombra) queda pegado justo debajo del header y se ve como una
    // línea que aparece de la nada — con la sombra del header siempre
    // presente, el borde se ve igual esté o no el contenido scrolleado.
    <header className="relative z-10 flex h-[72px] flex-shrink-0 items-center gap-6 bg-surface px-8 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0a2f71]" />
          <input
            type="text"
            placeholder="Buscar proyectos, campañas, reuniones..."
            className="w-full rounded-full border border-[#0a2f71] bg-card py-2.5 pl-11 pr-4 text-sm text-ink placeholder:text-ink-tertiary focus:border-[#0a2f71] focus:outline-none focus:ring-2 focus:ring-[#0a2f71]/20"
          />
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
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-card hover:text-ink-secondary"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </button>
        <button
          type="button"
          aria-label="Mensajes"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-card hover:text-ink-secondary"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            1
          </span>
        </button>
        <button
          type="button"
          aria-label="Ayuda"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-card hover:text-ink-secondary"
        >
          <HelpCircle className="h-5 w-5" />
        </button>

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
