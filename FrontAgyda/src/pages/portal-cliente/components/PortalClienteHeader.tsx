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
    <header className="flex h-[72px] flex-shrink-0 items-center gap-6 border-b border-surface-border bg-card px-8">
      <div className="flex flex-shrink-0 items-center gap-3">
        <img src="/Logo_AGYDA.png" alt="AGYDA" className="h-9 w-auto" />
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold tracking-tight text-ink">AGYDA</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
            Soluciones de tecnología
          </p>
        </div>
      </div>

      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          placeholder="Buscar proyectos, campañas, reuniones..."
          className="w-full rounded-xl border border-surface-border bg-surface py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand focus:bg-card focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="ml-auto flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          title={`${themeLabel} · clic para cambiar`}
          aria-label={themeLabel}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface hover:text-ink-secondary"
        >
          <ThemeIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface hover:text-ink-secondary"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </button>
        <button
          type="button"
          aria-label="Mensajes"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface hover:text-ink-secondary"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            1
          </span>
        </button>
        <button
          type="button"
          aria-label="Ayuda"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface hover:text-ink-secondary"
        >
          <HelpCircle className="h-5 w-5" />
        </button>

        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-surface"
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
