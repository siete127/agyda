import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation, type Location } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, UserCircle2, KeyRound, Building2, CheckCircle2 } from 'lucide-react'
import { authService, type EmpresaDetectada } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'
import { getApiError } from '@/lib/axios'

type Paso = 'credenciales' | 'confirmar-hogar'

export function LoginPage() {
  const location = useLocation()
  const forcedTenant = new URLSearchParams(location.search).get('tenant')

  const [paso,         setPaso]         = useState<Paso>('credenciales')
  const [usuario,      setUsuario]      = useState('')
  const [contra,       setContra]       = useState('')
  const [empresa,      setEmpresa]      = useState(forcedTenant ?? '')
  const [empresasDetectadas, setEmpresasDetectadas] = useState<EmpresaDetectada[]>([])
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
      setPaso('credenciales')
    } finally {
      setLoading(false)
    }
  }

  // Paso 1: usuario+contraseña → detecta el hogar sin loguear todavía.
  const handleContinuar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!usuario.trim() || !contra.trim()) { setError('Ingresa tu usuario y contraseña'); return }

    // Con ?tenant= en la URL (link directo a una empresa) se salta la
    // detección y se loguea de una vez, como antes.
    if (forcedTenant) {
      await completarLogin(forcedTenant)
      return
    }

    setLoading(true)
    try {
      const encontradas = await authService.detectarHogar(usuario.trim(), contra)
      // Si hay más de una coincidencia, se preselecciona la primera pero se
      // deja elegir entre esas — nunca entre el catálogo completo de empresas.
      setEmpresasDetectadas(encontradas)
      setEmpresa(encontradas[0].key)
      setPaso('confirmar-hogar')
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  // Paso 2: confirmar el hogar detectado (o elegido, si hubo varias coincidencias) → login real.
  const handleConfirmar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    await completarLogin(empresa)
  }

  const handleVolver = () => {
    setError('')
    setPaso('credenciales')
  }

  if (paso === 'confirmar-hogar') {
    const empresaActual = empresasDetectadas.find((e) => e.key === empresa)
    const hayVarias = empresasDetectadas.length > 1

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {hayVarias ? 'Elige tu hogar' : 'Hogar detectado'}
          </h2>
          <p className="mt-1.5 text-sm text-gray-500">
            {hayVarias
              ? 'Encontramos tu usuario en más de una empresa. Elige a cuál quieres entrar.'
              : 'Confirma que este es el portal al que quieres entrar.'}
          </p>
        </div>

        <form onSubmit={handleConfirmar} className="rounded-2xl bg-card border border-gray-200 shadow-card p-6 space-y-5">
          {hayVarias ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">Hogar</label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <select
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="field pl-10"
                >
                  {empresasDetectadas.map((emp) => (
                    <option key={emp.key} value={emp.key}>{emp.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10">
                <Building2 className="h-4 w-4 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">Hogar</p>
                <p className="truncate text-sm font-bold text-gray-900">{empresaActual?.nombre ?? empresa}</p>
              </div>
              <CheckCircle2 className="ml-auto h-5 w-5 flex-shrink-0 text-emerald-500" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <p className="text-xs font-medium text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleVolver}
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="group btn-primary flex-1 justify-center py-3 text-sm"
              style={{ background: 'linear-gradient(135deg, #1B4FD8 0%, #2563eb 100%)' }}
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Ingresando...
                </>
              ) : (
                <>
                  Ingresar al portal
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Iniciar sesión</h2>
        <p className="mt-1.5 text-sm text-gray-500">Ingresa tus credenciales para acceder al portal</p>
      </div>

      {/* Card formulario */}
      <form onSubmit={handleContinuar} className="rounded-2xl bg-card border border-gray-200 shadow-card p-6 space-y-5">

        {/* Usuario */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Usuario
          </label>
          <div className="relative">
            <UserCircle2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Ej. jdoe"
              autoComplete="username"
              autoFocus
              className="field pl-10"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Contraseña
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={contra}
              onChange={(e) => setContra(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="field pl-10 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
            <p className="text-xs font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Botón */}
        <button
          type="submit"
          disabled={isLoading}
          className="group btn-primary w-full justify-center py-3 text-sm"
          style={{ background: 'linear-gradient(135deg, #1B4FD8 0%, #2563eb 100%)' }}
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Verificando...
            </>
          ) : (
            <>
              Continuar
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-[0.68rem] text-gray-400">
        Si tienes problemas para ingresar, contacta a soporte TI
      </p>
    </div>
  )
}
