import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useSocketEvent } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import { disconnectSocket } from '@/lib/socket'

// Acciones remotas del supervisor sobre la sesión del agente — Fase 3, 3.7
// del plan basado en PSUP. Sin UI propia: solo ejecuta el efecto cuando
// llega el evento por socket, en la misma sala personal `user:{id}` que ya
// usan las notificaciones obligatorias.
export function AccionRemotaListener() {
  const clearSession = useAuthStore((s) => s.clearSession)
  const navigate = useNavigate()

  useSocketEvent<{ motivo?: string }>('cs:sesion_cerrada_remota', (payload) => {
    toast.error(payload.motivo || 'Un supervisor cerró tu sesión', { duration: 6000 })
    disconnectSocket()
    clearSession()
    navigate('/login', { replace: true })
  })

  useSocketEvent('cs:forzar_refresh', () => {
    toast('Un supervisor solicitó actualizar esta pantalla…', { duration: 2500 })
    setTimeout(() => window.location.reload(), 1200)
  })

  return null
}
