import { createPortal } from 'react-dom'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarCheck, Video } from 'lucide-react'
import { useNotificationStore } from '@/stores/notification.store'
import { citaService } from '@/services/cita.service'

// Modal global que se dispara cuando el cron de cierre de citas
// (citaCierreCronController, backend) detecta que el horario de una cita ya
// pasó: pregunta si terminó y, de ser así, si el cliente asistió. Aparece
// sin importar en qué pantalla esté el asesor (llega por socket, igual que
// TicketAlertModal). "No, sigue en curso" solo cierra el modal — la cita
// sigue abierta y el asesor puede reabrir el enlace cuando quiera.
export function CitaCierreModal() {
  const { citaCierreAlerts, dismissCitaCierreAlert } = useNotificationStore()
  const qc = useQueryClient()
  const [paso, setPaso] = useState<'preguntaTermino' | 'preguntaAsistio'>('preguntaTermino')
  const [enviando, setEnviando] = useState(false)

  const current = citaCierreAlerts[0] ?? null
  if (!current) return null

  const citaId = current.dataExtra?.citaId as number | undefined

  const cerrar = () => {
    dismissCitaCierreAlert(current.id)
    setPaso('preguntaTermino')
  }

  const noTermino = async () => {
    if (!citaId) return cerrar()
    setEnviando(true)
    try {
      await citaService.confirmarCierre(citaId, false)
    } catch { /* si falla, el cron la vuelve a preguntar */ }
    setEnviando(false)
    cerrar()
  }

  const marcarAsistio = async (asistio: boolean) => {
    if (!citaId) return cerrar()
    setEnviando(true)
    try {
      await citaService.confirmarCierre(citaId, true, asistio)
      toast.success(asistio ? 'Cita cerrada: el cliente asistió' : 'Cita cerrada: el cliente no asistió')
      qc.invalidateQueries({ queryKey: ['citas'] })
    } catch {
      toast.error('No se pudo cerrar la cita')
    }
    setEnviando(false)
    cerrar()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />

      <div className="relative w-full max-w-sm rounded-2xl bg-card shadow-2xl overflow-hidden animate-slide-up border-2 border-brand/20">
        <div className="h-1.5 w-full bg-brand" />

        <div className="px-6 py-6 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            {paso === 'preguntaTermino' ? <Video className="h-7 w-7" /> : <CalendarCheck className="h-7 w-7" />}
          </div>

          {paso === 'preguntaTermino' ? (
            <>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-brand">Confirmar cita</p>
              </div>
              <p className="text-[0.9rem] font-medium text-gray-800 leading-snug">{current.mensaje}</p>

              {citaCierreAlerts.length > 1 && (
                <p className="text-[0.72rem] text-gray-400">
                  +{citaCierreAlerts.length - 1} cita{citaCierreAlerts.length - 1 !== 1 ? 's' : ''} más por confirmar
                </p>
              )}

              <div className="flex w-full gap-3 mt-1">
                <button
                  onClick={noTermino}
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-[0.8rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  No, sigue en curso
                </button>
                <button
                  onClick={() => setPaso('preguntaAsistio')}
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-[0.8rem] font-bold text-white hover:bg-brand-dark transition-colors disabled:opacity-50"
                >
                  Sí, terminó
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-brand">¿El cliente asistió?</p>
              </div>
              <p className="text-[0.9rem] font-medium text-gray-800 leading-snug">{current.mensaje}</p>

              <div className="flex w-full gap-3 mt-1">
                <button
                  onClick={() => marcarAsistio(false)}
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-[0.8rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  No asistió
                </button>
                <button
                  onClick={() => marcarAsistio(true)}
                  disabled={enviando}
                  className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Sí asistió
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
