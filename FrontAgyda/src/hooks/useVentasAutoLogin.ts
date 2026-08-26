import { useState } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import toast from 'react-hot-toast'

const VENTAS_URL = 'https://ventas.ardabytec.vip'
const VENTAS_API = 'https://ventas.ardabytec.vip:8443/api/auth/login'
const INTRANET_LOGIN_URL = 'https://intranet.ardabytec.vip:8444/api/auth/intranet-ventas-login'

export function useVentasAutoLogin() {
  const [loading, setLoading] = useState(false)
  const token = useAuthStore((s) => s.token)

  async function getVentasTokenFromIntranet(): Promise<string | null> {
    if (!token) return null
    try {
      const res = await fetch(INTRANET_LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-intranet-token': token,
        },
      })
      if (!res.ok) return null
      const data = await res.json()
      return (data.accessToken as string) ?? null
    } catch {
      return null
    }
  }

  async function performFallbackLogin(usuario: string, password: string): Promise<boolean> {
    const maxRetries = 3
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(VENTAS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ username: usuario, password }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) break
        const data = await res.json()
        const accessToken: string | undefined =
          data.accessToken ?? data.data?.accessToken ?? data.token ?? data.access_token
        if (accessToken) {
          localStorage.setItem('ventas_token', accessToken)
          localStorage.setItem('ventas_user', usuario)
          window.open(`${VENTAS_URL}/#token=${accessToken}&user=${usuario}`, '_blank', 'noopener,noreferrer')
          return true
        }
      } catch {
        if (i === maxRetries - 1) break
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
      }
    }
    return false
  }

  async function openVentas() {
    setLoading(true)
    try {
      // PASO 1: auto-login via intranet token
      const ventasToken = await getVentasTokenFromIntranet()
      if (ventasToken) {
        window.open(`${VENTAS_URL}/#token=${ventasToken}`, '_blank', 'noopener,noreferrer')
        return
      }

      // PASO 2: credenciales guardadas en localStorage
      const usuario  = localStorage.getItem('ventas_usuario') ?? ''
      const password = localStorage.getItem('ventas_password') ?? ''
      if (usuario && password) {
        const ok = await performFallbackLogin(usuario, password)
        if (ok) return
      }

      // PASO 3: abrir sin autologin
      toast('Abriendo Ventas sin sesión automática', { icon: '⚠️' })
      window.open(VENTAS_URL, '_blank', 'noopener,noreferrer')
    } finally {
      setLoading(false)
    }
  }

  return { openVentas, loading }
}
