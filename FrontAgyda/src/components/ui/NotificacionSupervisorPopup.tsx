import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Megaphone, AlertOctagon, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSocketEvent } from '@/hooks/useSocket'
import { supervisoresService } from '@/services/supervisores.service'
import type { NotificacionPendiente } from '@/types/supervisores.types'

// Notificaciones del supervisor a agentes (Fase 2, 3.3 del plan basado en
// PSUP de Mitrol). 'informativa' es un toast que se descarta solo; una
// 'obligatoria' bloquea la pantalla completa hasta que el agente la cierra
// — mismo concepto que las notificaciones "obligatorias" del manual, salvo
// que aquí no hay PAD que bloquear, así que se bloquea la propia app web.
export function NotificacionSupervisorPopup() {
  const qc = useQueryClient()
  const [obligatorias, setObligatorias] = useState<NotificacionPendiente[]>([])

  // Al montar (login, recarga de página): trae las que ya estaban pendientes
  // antes de que este socket se conectara — así una obligatoria no se pierde
  // solo porque el agente no estaba conectado cuando se envió.
  useEffect(() => {
    supervisoresService.getNotificacionesPendientes()
      .then((lista) => {
        const obligs = lista.filter((n) => n.tipo === 'obligatoria')
        if (obligs.length) setObligatorias(obligs)
        lista.filter((n) => n.tipo === 'informativa').forEach((n) => {
          toast(`📣 ${n.autorNombre ?? 'Supervisor'}: ${n.mensaje}`, { duration: 8000 })
        })
      })
      .catch(() => { /* silencioso */ })
  }, [])

  useSocketEvent<{ id: number; tipo: 'informativa' | 'obligatoria'; mensaje: string; autorNombre: string | null }>(
    'cs:notificacion',
    (payload) => {
      if (payload.tipo === 'obligatoria') {
        setObligatorias((prev) => (prev.some((n) => n.id === payload.id) ? prev : [...prev, { ...payload, fecha: new Date().toISOString() }]))
      } else {
        toast(`📣 ${payload.autorNombre ?? 'Supervisor'}: ${payload.mensaje}`, { duration: 8000 })
      }
    },
  )

  const actual = obligatorias[0]
  if (!actual) return null

  const cerrar = () => {
    supervisoresService.cerrarNotificacion(actual.id).catch(() => { /* silencioso */ })
    setObligatorias((prev) => prev.filter((n) => n.id !== actual.id))
    qc.invalidateQueries({ queryKey: ['supervisores-notificaciones-pendientes'] })
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 bg-red-500 px-5 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <AlertOctagon className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.7rem] font-bold text-white/90 uppercase tracking-wide">Notificación obligatoria</p>
            <p className="text-sm font-semibold text-white truncate">De: {actual.autorNombre ?? 'Supervisor'}</p>
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm text-ink whitespace-pre-wrap">{actual.mensaje}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-app px-5 py-3">
          <button
            onClick={cerrar}
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            <X className="h-4 w-4" /> Entendido, cerrar
          </button>
        </div>
        {obligatorias.length > 1 && (
          <p className="border-t border-app px-5 py-2 text-center text-[0.7rem] text-ink-tertiary">
            <Megaphone className="mr-1 inline h-3 w-3" /> Tienes {obligatorias.length - 1} notificación(es) obligatoria(s) más pendiente(s)
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
