import { useState, useEffect } from 'react'
import { Bell, BellRing, BellOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { pushNotificationsService } from '@/services/pushNotifications.service'

const EVENTOS = [
  { evento: 'Ticket creado', descripcion: 'Se notifica al técnico asignado (o al pool del área/nivel) cuando se crea un ticket.' },
  { evento: 'Ticket escalado', descripcion: 'Se notifica al técnico del nivel destino cuando un ticket sube de N1 a N2 o de N2 a N3.' },
  { evento: 'Ticket resuelto', descripcion: 'Se notifica al solicitante para que valide la resolución.' },
  { evento: 'SLA en riesgo / incumplido', descripcion: 'El cron de SLA marca el ticket; se refleja como badge en el listado.' },
  { evento: 'Nuevo chat en vivo', descripcion: 'Se notifica al agente asignado por el motor de reglas o ruteo de campaña.' },
  { evento: 'Chat de Soporte TI sin atender', descripcion: 'Si un chat interno espera demasiado sin técnico, se notifica al asignado (si lo hay).' },
]

function PushNotificacionesPanel() {
  const [soportado] = useState(() => pushNotificationsService.soportado())
  const [activo, setActivo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (!soportado) { setCargando(false); return }
    pushNotificationsService.getEstadoSuscripcion().then((v) => { setActivo(v); setCargando(false) })
  }, [soportado])

  const toggle = async () => {
    setProcesando(true)
    try {
      if (activo) {
        await pushNotificationsService.desactivar()
        setActivo(false)
        toast.success('Notificaciones push desactivadas')
      } else {
        const res = await pushNotificationsService.activar()
        if (res.ok) {
          setActivo(true)
          toast.success('Notificaciones push activadas')
        } else {
          toast.error(res.motivo || 'No se pudo activar')
        }
      }
    } catch {
      toast.error('Ocurrió un error al cambiar las notificaciones push')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-1 flex items-center gap-2">
        {activo ? <BellRing className="h-4 w-4 text-brand" /> : <BellOff className="h-4 w-4 text-ink-tertiary" />}
        <p className="text-sm font-semibold text-ink">Notificaciones push del navegador</p>
      </div>
      <p className="mb-3 text-xs text-ink-tertiary">
        Recibe una notificación del sistema operativo (aunque tengas la pestaña de AGYDA cerrada) para
        alertas de SLA, escalamientos y chats de Soporte TI sin atender.
      </p>

      {!soportado ? (
        <p className="text-xs text-ink-tertiary">Este navegador no soporta notificaciones push.</p>
      ) : cargando ? (
        <p className="text-xs text-ink-tertiary">Verificando estado...</p>
      ) : (
        <button
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
          onClick={toggle}
          disabled={procesando}
        >
          {procesando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {activo ? 'Desactivar notificaciones push' : 'Activar notificaciones push'}
        </button>
      )}
    </div>
  )
}

export function NotificacionesTecTab() {
  return (
    <div className="space-y-4">
      <PushNotificacionesPanel />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Eventos que disparan notificación</p>
        </div>
        <p className="mb-3 text-xs text-ink-tertiary">
          Panel informativo. Las preferencias de notificación por usuario se administran de forma global
          en el sistema de mensajería/notificaciones, no aquí.
        </p>
        <div className="divide-y divide-gray-100">
          {EVENTOS.map((e) => (
            <div key={e.evento} className="py-2.5">
              <p className="text-sm font-medium text-ink">{e.evento}</p>
              <p className="text-xs text-ink-tertiary">{e.descripcion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
