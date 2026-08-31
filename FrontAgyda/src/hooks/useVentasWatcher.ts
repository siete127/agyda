import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useVentasStore } from '@/stores/ventas.store'
import { useVentasNotifStore } from '@/stores/ventasNotif.store'
import { ventasService } from '@/services/ventas.service'

const SSO_URL = 'https://ventas.ardabytec.vip:8443/api/auth/intranet-login'
const POLL_MS = 25_000

/* Watcher GLOBAL de ventas nuevas.
   - Garantiza sesión de ventas (SSO con el token del intranet) sin depender de
     que el usuario entre al módulo /ventas.
   - Cada POLL_MS trae las ventas de hoy y empuja las nuevas a ventasNotif.store.
   - La primera corrida siembra los IDs existentes SIN notificar (para no
     disparar 30 alertas al abrir la app). */
export function useVentasWatcher() {
  const intranetToken = useAuthStore((s) => s.token)
  const ventasToken = useVentasStore((s) => s.ventasToken)
  const setVentasSession = useVentasStore((s) => s.setVentasSession)

  const push = useVentasNotifStore((s) => s.push)
  const sembrar = useVentasNotifStore((s) => s.sembrar)

  // ── SSO: obtener token de ventas si no hay ──
  useEffect(() => {
    if (!intranetToken || ventasToken) return
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch(SSO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-intranet-token': intranetToken },
        })
        if (!res.ok || cancel) return
        const data = await res.json()
        const vToken = data.accessToken ?? data.token
        if (!vToken) return
        setVentasSession(
          String(vToken),
          String(data.role ?? 'agente'),
          String(data.id ?? ''),
          (data.campaigns ?? []).map((c: Record<string, unknown>) => ({
            id: Number(c['ID'] ?? c['id']), nombre: String(c['nombre'] ?? ''),
          })),
          String(data.nombreAgente ?? data.username ?? ''),
        )
      } catch { /* sin sesión de ventas — el poll simplemente no traerá nada */ }
    })()
    return () => { cancel = true }
  }, [intranetToken, ventasToken, setVentasSession])

  // ── Poll de ventas de hoy ──
  useEffect(() => {
    if (!ventasToken) return
    let stop = false

    const tick = async () => {
      try {
        const res = await ventasService.getStatsDay()
        if (stop) return
        const ventasHoy = res.ventas ?? []
        const st = useVentasNotifStore.getState()
        if (!st.sembrado) {
          sembrar(ventasHoy.map((v) => v.id))
        } else {
          push(ventasHoy)
        }
      } catch { /* red caída / token expirado — reintenta al siguiente tick */ }
    }

    tick()
    const id = setInterval(tick, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [ventasToken, push, sembrar])
}
