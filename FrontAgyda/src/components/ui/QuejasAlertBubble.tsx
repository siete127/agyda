import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { MessageSquareWarning, X, Bell } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useSocketEvent } from '@/hooks/useSocket'

const SUPERVISORES = ['ADM_0002', 'ADM_0004']
const SUPERVISORES_IDS = [2, 43]
const DURACION_MS = 2 * 60 * 1000 // 2 minutos

interface QuejaNueva {
  quejaId: number
  nombreUsuario: string
  titulo: string
  mensaje: string
  fecha: string
}

interface Alerta extends QuejaNueva {
  uid: number
}

export function QuejasAlertBubble() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const counterRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const esSupervisor = Boolean(
    (user?.codigo && SUPERVISORES.includes(user.codigo)) ||
    (user?.id && SUPERVISORES_IDS.includes(user.id))
  )

  // Hook siempre se registra — la condición está dentro del handler
  useSocketEvent<QuejaNueva>('queja:nueva', (payload) => {
    if (!esSupervisor) return
    const uid = ++counterRef.current
    setAlertas((prev) => [...prev, { ...payload, uid }])

    const timer = setTimeout(() => {
      setAlertas((prev) => prev.filter((a) => a.uid !== uid))
      timersRef.current.delete(uid)
    }, DURACION_MS)
    timersRef.current.set(uid, timer)
  })

  // Limpiar timers al desmontar
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  function dismiss(uid: number) {
    const timer = timersRef.current.get(uid)
    if (timer) { clearTimeout(timer); timersRef.current.delete(uid) }
    setAlertas((prev) => prev.filter((a) => a.uid !== uid))
  }

  function irAQueja(alerta: Alerta) {
    dismiss(alerta.uid)
    navigate(`/quejas?quejaId=${alerta.quejaId}`)
  }

  if (!esSupervisor || alertas.length === 0) return null

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {alertas.map((alerta) => (
        <div
          key={alerta.uid}
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-orange-200 bg-card shadow-2xl p-4 animate-fade-in cursor-pointer hover:border-orange-400 transition-colors"
          onClick={() => irAQueja(alerta)}
        >
          {/* Icono pulsante */}
          <div className="relative flex-shrink-0 mt-0.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-orange-500" />
            </span>
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.78rem] font-bold text-orange-600 uppercase tracking-wide">Nueva queja</p>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(alerta.uid) }}
                className="rounded-lg p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[0.82rem] font-semibold text-gray-800 mt-0.5 leading-tight">
              <span className="text-orange-600">{alerta.nombreUsuario}</span> levantó una queja
            </p>
            <p className="text-[0.75rem] text-gray-500 mt-0.5 truncate">"{alerta.titulo}"</p>
            <p className="text-[0.68rem] text-orange-500 font-semibold mt-1.5 flex items-center gap-1">
              <MessageSquareWarning className="h-3 w-3" /> Clic para ver · desaparece en 2 min
            </p>
          </div>
        </div>
      ))}
    </div>,
    document.body
  )
}
