import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { getApiError } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'
import { Spinner } from '@/components/ui/Spinner'
import type { User } from '@/types/user.types'

// Instancia limpia, SIN el interceptor que antepone el Authorization guardado.
// Así /auth/me se valida contra el ?token= de la URL y no contra una sesión
// vieja de esta pestaña — sin tener que borrar localStorage antes de tiempo.
const bridgeApi = axios.create({ baseURL: '/api', timeout: 30_000, withCredentials: true })

interface MeResponse {
  success: boolean
  message?: string
  data?: Record<string, unknown>
}

// Entra a la Intranet reusando la sesión ya iniciada en la página pública
// (ardabytec.com), sin pedir usuario/contraseña de nuevo. Recibe el JWT por
// query string y reconstruye el usuario completo contra /auth/me.
export function AuthBridgePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [error, setError] = useState('')
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const token = searchParams.get('token')
    if (!token) {
      // Sin token en la URL: si esta pestaña/navegador ya tenía una sesión de
      // AGYDA (p.ej. el usuario ya entró antes desde la página pública y solo
      // cerró la pestaña), la reusamos en vez de mandar al login.
      const { token: existente, isAuthenticated } = useAuthStore.getState()
      if (existente && isAuthenticated) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
      return
    }

    // Si el token de la URL es exactamente el mismo que esta pestaña ya tiene
    // guardado y la sesión está sana, no hace falta borrar nada ni volver a
    // consultar /auth/me: entramos directo. Esto evita que, al reabrir AGYDA
    // desde la página pública con el mismo token, se destruya una sesión que
    // seguía siendo válida y se acabe en /login.
    {
      const { token: existente, isAuthenticated, user } = useAuthStore.getState()
      if (existente === token && isAuthenticated && user) {
        localStorage.setItem('auth_token', token)
        getSocket()
        navigate(user.tipoUsuario === 'CL' ? '/tickets' : '/dashboard', { replace: true })
        return
      }
    }

    // Token nuevo (o la sesión de esta pestaña quedó incompleta, p.ej. porque se
    // cerró la pestaña a media carga de una vuelta anterior). NO borramos
    // localStorage todavía: si el usuario cierra esta pestaña antes de que
    // /auth/me responda, la sesión anterior sigue intacta y el próximo intento
    // funciona. Solo cuando /auth/me confirma, escribimos la sesión nueva
    // (setUser sobrescribe la vieja de una).
    bridgeApi
      .get<MeResponse>('/auth/me', { params: { token }, headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        if (!data.success || !data.data) {
          throw new Error(data.message || 'No se pudo validar la sesión')
        }
        const payload = data.data
        const user: User = {
          id: Number(payload.id ?? 0),
          nombres: String(payload.nombre ?? ''),
          usuario: String(payload.usuario ?? ''),
          tipoUsuario: String(payload.tipoUsuario ?? '').toUpperCase(),
          activo: Boolean(payload.activo ?? true),
          status: Boolean(payload.status ?? true),
          base: String(payload.cartera ?? '1'),
          fechaRegistro: null,
          fechaIngreso: null,
          ventasUsuario: String(payload.ventasUsuario ?? ''),
          ventasPassword: '',
          ventasRol: 'vendedor',
          accessToken: token,
          codigo: null,
          genero: (payload.genero as 'M' | 'F' | null) ?? null,
        }
        setUser(user, token)
        getSocket()
        if (user.tipoUsuario === 'CL') {
          navigate('/tickets', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
      .catch((err) => {
        setError(getApiError(err))
        setTimeout(() => navigate('/login', { replace: true }), 2000)
      })
  }, [searchParams, navigate, setUser])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50">
      <Spinner size="lg" />
      <p className="text-sm text-gray-500">
        {error ? `${error} — redirigiendo al login…` : 'Iniciando sesión…'}
      </p>
    </div>
  )
}
