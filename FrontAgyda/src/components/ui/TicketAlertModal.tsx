import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { useNotificationStore } from '@/stores/notification.store'
import { useNavigate } from 'react-router-dom'
import { Ticket, ArrowRight } from 'lucide-react'

const TIPO_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  ticket_nuevo:             { emoji: '🎫', label: 'Ticket asignado',     color: '#1B4FD8' },
  ticket_transferido:       { emoji: '🔀', label: 'Ticket transferido',  color: '#7c3aed' },
  ticket_transferido_ajeno: { emoji: '🔀', label: 'Ticket reasignado',   color: '#7c3aed' },
  ticket_comentario:        { emoji: '💬', label: 'Nuevo comentario',    color: '#0891b2' },
  ticket_estado:            { emoji: '✅', label: 'Ticket actualizado',  color: '#059669' },
  ticket:                   { emoji: '🎫', label: 'Ticket',              color: '#1B4FD8' },
}

function playAlert() {
  try {
    const ctx = new AudioContext()
    const times = [0, 0.18, 0.36]
    times.forEach((t) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime + t)
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + t + 0.12)
      gain.gain.setValueAtTime(0.1, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.14)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.15)
    })
  } catch { /* browser bloqueó AudioContext */ }
}

export function TicketAlertModal() {
  const { ticketAlerts, dismissTicketAlert } = useNotificationStore()
  const navigate = useNavigate()
  const playedRef = useRef<Set<number>>(new Set())

  const current = ticketAlerts[0] ?? null

  useEffect(() => {
    if (current && !playedRef.current.has(current.id)) {
      playedRef.current.add(current.id)
      playAlert()
    }
  }, [current])

  if (!current) return null

  const meta = TIPO_LABELS[current.tipo ?? ''] ?? { emoji: '🎫', label: 'Notificación', color: '#1B4FD8' }
  const ticketId = current.dataExtra?.ticketId as number | undefined

  const handleEnterado = () => {
    dismissTicketAlert(current.id)
  }

  const handleVerTicket = () => {
    dismissTicketAlert(current.id)
    navigate('/tickets')
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop animado */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      {/* Tarjeta */}
      <div
        className="relative w-full max-w-sm rounded-2xl bg-card shadow-2xl overflow-hidden animate-slide-up"
        style={{ border: `2px solid ${meta.color}22` }}
      >
        {/* Franja de color superior */}
        <div
          className="h-1.5 w-full"
          style={{ background: meta.color }}
        />

        {/* Cuerpo */}
        <div className="px-6 py-6 flex flex-col items-center gap-4 text-center">
          {/* Ícono grande */}
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm"
            style={{ background: `${meta.color}15` }}
          >
            {meta.emoji}
          </div>

          {/* Título */}
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
              {meta.label}
            </p>
            {ticketId && (
              <p className="text-[0.72rem] text-gray-400 mt-0.5">Ticket #{ticketId}</p>
            )}
          </div>

          {/* Mensaje */}
          <p className="text-[0.9rem] font-medium text-gray-800 leading-snug">
            {current.mensaje}
          </p>

          {/* Contador de pendientes */}
          {ticketAlerts.length > 1 && (
            <p className="text-[0.72rem] text-gray-400">
              +{ticketAlerts.length - 1} notificación{ticketAlerts.length - 1 !== 1 ? 'es' : ''} pendiente{ticketAlerts.length - 1 !== 1 ? 's' : ''}
            </p>
          )}

          {/* Botones */}
          <div className="flex w-full gap-3 mt-1">
            <button
              onClick={handleVerTicket}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-[0.8rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Ticket className="h-3.5 w-3.5" />
              Ver ticket
              <ArrowRight className="h-3 w-3 opacity-50" />
            </button>
            <button
              onClick={handleEnterado}
              className="flex flex-1 items-center justify-center rounded-xl px-4 py-2.5 text-[0.8rem] font-bold text-white transition-colors shadow-sm"
              style={{ background: meta.color }}
            >
              Enterado
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
