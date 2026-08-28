import { api } from '@/lib/axios'

// Convierte la clave pública VAPID (base64url) al formato Uint8Array que pide
// PushManager.subscribe — es la conversión estándar recomendada por MDN.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export const pushNotificationsService = {
  soportado(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window
  },

  permisoActual(): NotificationPermission | 'no-soportado' {
    if (!('Notification' in window)) return 'no-soportado'
    return Notification.permission
  },

  async getEstadoSuscripcion(): Promise<boolean> {
    if (!this.soportado()) return false
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js')
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  },

  async activar(): Promise<{ ok: boolean; motivo?: string }> {
    if (!this.soportado()) return { ok: false, motivo: 'Este navegador no soporta notificaciones push.' }

    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return { ok: false, motivo: 'Permiso de notificaciones no concedido.' }

    const { data } = await api.get('/push/public-key')
    const publicKey = data?.data?.publicKey as string | null
    if (!publicKey) return { ok: false, motivo: 'El servidor no tiene configuradas las notificaciones push.' }

    const reg = await navigator.serviceWorker.register('/sw-push.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
    }

    const json = sub.toJSON()
    await api.post('/push/suscripciones', {
      subscription: { endpoint: json.endpoint, keys: json.keys },
    })

    return { ok: true }
  },

  async desactivar(): Promise<void> {
    if (!this.soportado()) return
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await api.delete('/push/suscripciones', { data: { endpoint } })
  },
}
