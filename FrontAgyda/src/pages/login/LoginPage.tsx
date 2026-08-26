import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useLocation, type Location } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, UserCircle2, KeyRound, Building2 } from 'lucide-react'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'
import { api, getApiError } from '@/lib/axios'

interface EmpresaOpcion {
  key: string
  nombre: string
}

export function LoginPage() {
  const location = useLocation()
  const forcedTenant = new URLSearchParams(location.search).get('tenant')

  const [usuario,      setUsuario]      = useState('')
  const [contra,       setContra]       = useState('')
  const [empresa,      setEmpresa]      = useState(forcedTenant ?? '')
  const [empresas,     setEmpresas]     = useState<EmpresaOpcion[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')

  const { setUser, setLoading, isLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (forcedTenant) return
    api.get('/auth/empresas')
      .then(({ data }) => {
        const list = (data?.data ?? []) as EmpresaOpcion[]
        setEmpresas(list)
        if (list.length && !empresa) setEmpresa(list[0].key)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!usuario.trim() || !contra.trim()) { setError('Ingresa tu usuario y contraseña'); return }
    setLoading(true)
    try {
      const { user, token } = await authService.login(usuario.trim(), contra, empresa)
      setUser(user, token)
      getSocket()
      const tipo = user.tipoUsuario?.toUpperCase()
      if (tipo === 'CL') {
        navigate('/tickets', { replace: true })
      } else {
        const from = (location.state as { from?: Location })?.from
        const target = from?.pathname && from.pathname !== '/login' ? `${from.pathname}${from.search ?? ''}` : '/dashboard'
        navigate(target, { replace: true })
      }
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Iniciar sesión</h2>
        <p className="mt-1.5 text-sm text-gray-500">Ingresa tus credenciales para acceder al portal</p>
      </div>

      {/* Card formulario */}
      <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-gray-200 shadow-card p-6 space-y-5">

        {/* Empresa */}
        {!forcedTenant && empresas.length > 1 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Hogar
            </label>
            <div className="relative">
              <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <select
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                className="field pl-10"
              >
                {empresas.map((emp) => (
                  <option key={emp.key} value={emp.key}>{emp.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

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
              Ingresar al portal
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
