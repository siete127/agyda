import { Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { LogOut, ShoppingCart, Palette } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useVentasStore } from '@/stores/ventas.store'
import { disconnectSocket } from '@/lib/socket'
import { Avatar } from '@/components/ui/Avatar'
import { VentasBgModal } from '@/components/ui/VentasBgModal'
import { useVentasBgStore, bgCss } from '@/stores/ventas-bg.store'

export function VentasLayout() {
  const navigate      = useNavigate()
  const clearAuth     = useAuthStore((s) => s.clearSession)
  const user          = useAuthStore((s) => s.user)
  const ventasRole    = useVentasStore((s) => s.ventasRole)
  const bg            = useVentasBgStore()
  const [bgOpen, setBgOpen] = useState(false)

  const handleLogout = () => {
    disconnectSocket()
    clearAuth()
    window.location.replace('/login')
  }

  const handleIntranet = () => {
    navigate('/dashboard')
  }

  const roleBadge: Record<string, string> = {
    agente:     'bg-gray-700 text-gray-300',
    supervisor: 'bg-blue-900 text-blue-300',
    admin:      'bg-purple-900 text-purple-300',
    superadmin: 'bg-red-900 text-red-300',
  }

  const backgroundStyle = bgCss({ mode: bg.mode, color1: bg.color1, color2: bg.color2, direction: bg.direction })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: backgroundStyle }}>
      <VentasBgModal isOpen={bgOpen} onClose={() => setBgOpen(false)} />
      {/* Topbar ventas */}
      <header className="flex h-[58px] flex-shrink-0 items-center gap-3 border-b border-white/10 bg-slate-900/80 backdrop-blur px-5 shadow-sm">
        {/* Marca */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <ShoppingCart className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="leading-tight">
            <p className="text-[0.78rem] font-black text-white tracking-widest uppercase">Ventas</p>
            <p className="text-[0.62rem] text-slate-500">ArdaBytec</p>
          </div>
        </div>

        <div className="mx-3 h-5 w-px bg-white/10 hidden sm:block" />

        {/* Rol badge */}
        {ventasRole && (
          <span className={`rounded-lg px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider hidden sm:inline ${roleBadge[ventasRole] ?? 'bg-gray-700 text-gray-300'}`}>
            {ventasRole}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Fondo */}
          <button
            onClick={() => setBgOpen(true)}
            title="Cambiar fondo"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[0.72rem] font-semibold text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fondo</span>
          </button>

          {/* Ir a Intranet directo */}
          <button
            onClick={handleIntranet}
            className="flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/10 px-3 py-1.5 text-[0.72rem] font-semibold text-brand hover:bg-brand/20 transition-colors hidden sm:flex"
          >
            AGYDA
          </button>

          {/* Avatar usuario intranet */}
          {user && (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5">
              <Avatar src={user.perfilFotoUrl} name={user.nombres} size="sm" />
              <div className="hidden sm:block leading-none">
                <p className="text-[0.72rem] font-semibold text-white">
                  {user.perfilAlias ?? user.nombres?.split(' ')[0]}
                </p>
                <p className="text-[0.62rem] text-slate-500 capitalize">{user.tipoUsuario}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[0.72rem] font-medium text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 overflow-y-auto p-5 lg:p-7">
        <Outlet />
        <footer className="mt-8 pb-2 text-center text-[0.68rem] text-slate-500">
          © {new Date().getFullYear()} ARDABYTEC. Todos los derechos reservados.
        </footer>
      </main>
    </div>
  )
}
