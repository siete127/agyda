import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, getApiError } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { getSocket } from '@/lib/socket'
import { Spinner } from '@/components/ui/Spinner'
import type { User } from '@/types/user.types'

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
      navigate('/login', { replace: true })
      return
    }

    api
      .get<MeResponse>('/auth/me', { params: { token } })
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
