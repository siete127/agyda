import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { LifeBuoy, Newspaper, CalendarCheck, FolderOpen } from 'lucide-react'

const FEATURES = [
  { Icon: LifeBuoy,     text: 'Gestión de tickets y proyectos' },
  { Icon: Newspaper,    text: 'Noticias y comunicados internos' },
  { Icon: CalendarCheck,text: 'Permisos, vacaciones y calendario' },
  { Icon: FolderOpen,   text: 'Documentos y expedientes digitales' },
]

export function AuthLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isInitialized   = useAuthStore((s) => s.isInitialized)

  if (isInitialized && isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="flex min-h-screen">

      {/* ══ Panel izquierdo — Branding corporativo ══ */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between overflow-hidden bg-[#0D1B3E] p-12">

        {/* Capas de fondo */}
        <div className="pointer-events-none absolute inset-0">
          {/* Gradiente base */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E]" />
          {/* Orbes */}
          <div className="absolute -top-24 -left-24 h-[480px] w-[480px] rounded-full bg-brand/20 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-indigo-600/15 blur-[80px]" />
          {/* Grid de puntos */}
          <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>

        {/* Header del panel */}
        <div className="relative flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-brand blur-lg opacity-60" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-brand shadow-glow">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" />
              </svg>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-widest uppercase">AGYDA</p>
            <p className="text-[0.65rem] text-blue-300/50 tracking-widest">ArdaBytec</p>
          </div>
        </div>

        {/* Contenido central */}
        <div className="relative space-y-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse-dot" />
              Portal corporativo interno
            </span>
            <h1 className="text-4xl font-bold leading-tight text-white">
              Tu lugar de trabajo,<br />
              <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                todo en un solo lugar
              </span>
            </h1>
            <p className="text-sm leading-relaxed text-blue-200/60 max-w-sm">
              Accede a herramientas, información y comunicación de tu empresa de forma centralizada y segura.
            </p>
          </div>

          {/* Lista de features */}
          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                  <f.Icon className="h-4 w-4 text-blue-300/70" />
                </span>
                <span className="text-sm text-blue-100/70">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer del panel */}
        <div className="relative">
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
          <p className="text-[0.68rem] text-blue-200/30">
            © {new Date().getFullYear()} ArdaBytec · Todos los derechos reservados · v20.11.0
          </p>
        </div>
      </div>

      {/* ══ Panel derecho — Formulario ══ */}
      <div className="relative flex flex-1 flex-col items-center justify-center bg-[#F0F2F5] p-6 lg:p-12">
        {/* Solo visible en mobile */}
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
            </svg>
          </div>
          <span className="text-sm font-bold text-gray-900 tracking-widest uppercase">AGYDA</span>
        </div>

        <div className="w-full max-w-[400px] animate-slide-up">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
