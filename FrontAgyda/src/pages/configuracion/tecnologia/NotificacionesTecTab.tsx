import { Bell } from 'lucide-react'

const EVENTOS = [
  { evento: 'Ticket creado', descripcion: 'Se notifica al técnico asignado (o al pool del área/nivel) cuando se crea un ticket.' },
  { evento: 'Ticket escalado', descripcion: 'Se notifica al técnico del nivel destino cuando un ticket sube de N1 a N2 o de N2 a N3.' },
  { evento: 'Ticket resuelto', descripcion: 'Se notifica al solicitante para que valide la resolución.' },
  { evento: 'SLA en riesgo / incumplido', descripcion: 'El cron de SLA marca el ticket; se refleja como badge en el listado.' },
  { evento: 'Nuevo chat en vivo', descripcion: 'Se notifica al agente asignado por el motor de reglas o ruteo de campaña.' },
]

export function NotificacionesTecTab() {
  return (
    <div className="space-y-4">
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
