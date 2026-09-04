import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, type Location } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, UserCircle2, KeyRound, Building2, HelpCircle } from 'lucide-react'
import { authService, type EmpresaDetectada } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'
import { getApiError } from '@/lib/axios'

export function LoginPage() {
  const location = useLocation()
  const forcedTenant = new URLSearchParams(location.search).get('tenant')

  const [usuario,      setUsuario]      = useState('')
  const [contra,       setContra]       = useState('')
  const [empresa,      setEmpresa]      = useState(forcedTenant ?? '')
  // Solo se llena (y se muestra el selector) cuando detectar-hogar encuentra
  // más de una coincidencia — el caso normal de una sola nunca la toca y
  // entra directo, sin pasos intermedios.
  const [empresasAmbiguas, setEmpresasAmbiguas] = useState<EmpresaDetectada[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')

  const { setUser, setLoading, isLoading } = useAuthStore()
  const navigate = useNavigate()

  const irADashboard = (tipoUsuario: string | undefined) => {
    const tipo = tipoUsuario?.toUpperCase()
    if (tipo === 'CL') {
      navigate('/tickets', { replace: true })
    } else {
      const from = (location.state as { from?: Location })?.from
      const target = from?.pathname && from.pathname !== '/login' ? `${from.pathname}${from.search ?? ''}` : '/dashboard'
      navigate(target, { replace: true })
    }
  }

  const completarLogin = async (empresaKey: string) => {
    setLoading(true)
    try {
      const { user, token } = await authService.login(usuario.trim(), contra, empresaKey)
      setUser(user, token)
      getSocket()
      irADashboard(user.tipoUsuario)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!usuario.trim() || !contra.trim()) { setError('Ingresa tu usuario y contraseña'); return }

    // Con ?tenant= en la URL (link directo a una empresa), o si ya se resolvió
    // una ambigüedad y el usuario eligió su hogar, se loguea de una vez.
    if (forcedTenant || empresasAmbiguas.length > 0) {
      await completarLogin(empresa)
      return
    }

    setLoading(true)
    try {
      const encontradas = await authService.detectarHogar(usuario.trim(), contra)
      if (encontradas.length === 1) {
        await completarLogin(encontradas[0].key)
        return
      }
      // Más de una coincidencia: se muestra el selector (debajo de la
      // contraseña) para que elija solo entre esas, sin loguear todavía.
      setEmpresasAmbiguas(encontradas)
      setEmpresa(encontradas[0].key)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado — logo + título centrados juntos */}
      <div className="flex flex-col items-center text-center">
        <img
          src="/logo_ardabytec.png"
          alt="AGYDA System"
          className="mb-3 h-20 w-auto drop-shadow-[0_0_20px_rgba(34,211,238,0.35)]"
        />
        <h2 className="text-2xl font-bold text-white tracking-tight">Iniciar sesión</h2>
        <p className="mt-1.5 text-sm text-blue-200/60">Ingresa tus credenciales para acceder al portal</p>
      </div>

      {/* Card formulario — tarjeta oscura translúcida con blur */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl"
      >

        {/* Usuario */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-blue-100/70 uppercase tracking-wider">
            Usuario
          </label>
          <div className="relative">
            <UserCircle2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40 pointer-events-none" />
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ej. jdoe"
              autoComplete="username"
              autoFocus
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-blue-200/30 outline-none transition-colors focus:border-cyan-400/50 focus:bg-white/[0.08]"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-blue-100/70 uppercase tracking-wider">
            Contraseña
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={contra}
              onChange={(e) => setContra(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-11 text-sm text-white placeholder:text-blue-200/30 outline-none transition-colors focus:border-cyan-400/50 focus:bg-white/[0.08]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-blue-200/40 hover:text-blue-100 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Hogar — solo aparece si detectar-hogar encontró más de una empresa
            para este usuario/contraseña. */}
        {empresasAmbiguas.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-blue-100/70 uppercase tracking-wider">Hogar</label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40 pointer-events-none" />
              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors focus:border-cyan-400/50 focus:bg-white/[0.08] [&>option]:text-gray-900"
              >
                {empresasAmbiguas.map((emp) => (
                  <option key={emp.key} value={emp.key}>{emp.nombre}</option>
                ))}
              </select>
            </div>
            <p className="text-[0.7rem] text-blue-200/40">Encontramos tu usuario en más de una empresa — elige a cuál entrar.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
            <p className="text-xs font-medium text-red-300">{error}</p>
          </div>
        )}

        {/* Botón — degradado azul-cian, redondeado tipo píldora */}
        <button
          type="submit"
          disabled={isLoading}
          className="group flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
          style={{ background: 'linear-gradient(135deg, #1B4FD8 0%, #22D3EE 100%)' }}
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {empresasAmbiguas.length > 1 ? 'Ingresando...' : 'Verificando...'}
            </>
          ) : (
            <>
              Iniciar sesión
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-center text-[0.72rem] text-blue-200/40">
        <HelpCircle className="h-3.5 w-3.5" />
        Si tienes problemas para ingresar, contacta a soporte técnico
      </p>
    </div>
  )
}
