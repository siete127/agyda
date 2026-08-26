import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useVentasStore } from '@/stores/ventas.store'
import { queryClient } from '@/lib/queryClient'

const SSO_URL = 'https://ventas.ardabytec.vip:8443/api/auth/intranet-login'

export function useVentasSession() {
  const [isReady, setIsReady] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const intranetToken = useAuthStore((s) => s.token)
  const { ventasToken, ventasUserId, setVentasSession, clearVentasSession } = useVentasStore()

  useEffect(() => {
    // Siempre hacer SSO al montar — si ya hay token, refrescar en primer plano
    // para asegurar que el usuario correcto tiene sus datos actualizados
    login()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function login() {
    setError(null)
    try {
      if (intranetToken) {
        const ok = await trySSO(intranetToken)
        if (ok) { setIsReady(true); return }
      }
      // Si ya había token, marcamos como listo aunque el SSO falle
      if (ventasToken) { setIsReady(true); return }
      setError('No se pudo iniciar sesión en el sistema de Ventas.')
    } catch {
      if (ventasToken) { setIsReady(true); return }
      setError('Error de conexión con el servidor de Ventas.')
    } finally {
      setIsReady(true)
    }
  }

  async function trySSO(token: string): Promise<boolean> {
    try {
      const res = await fetch(SSO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-intranet-token': token },
      })
      if (!res.ok) return false
      const data = await res.json()
      const vToken = data.accessToken ?? data.token
      if (!vToken) return false

      const newUserId = String(data.id ?? '')
      const prevUserId = ventasUserId

      setVentasSession(
        String(vToken),
        String(data.role ?? 'agente'),
        newUserId,
        (data.campaigns ?? []).map((c: Record<string, unknown>) => ({ id: Number(c['ID'] ?? c['id']), nombre: String(c['nombre'] ?? '') })),
        String(data.nombreAgente ?? data.username ?? ''),
      )

      // Invalidar queries si cambió el usuario para evitar mostrar datos de otro usuario
      if (prevUserId !== newUserId) {
        queryClient.invalidateQueries({ queryKey: ['ventas'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-hoy'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-agentes'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-stats'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-stats-dyn'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-all'] })
        queryClient.invalidateQueries({ queryKey: ['ventas-admin-campaigns'] })
        queryClient.invalidateQueries({ queryKey: ['agent-all-campaigns'] })
      }

      return true
    } catch {
      return false
    }
  }

  return { isReady, error, retry: login, clearVentasSession }
}
