import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Play, Pause, Plus, Timer } from 'lucide-react'
import { capacitacionService } from '@/services/capacitacion.service'
import type { Curso } from '@/types/capacitacion.types'

function formatHMS(totalSegundos: number) {
  const h = Math.floor(totalSegundos / 3600)
  const m = Math.floor((totalSegundos % 3600) / 60)
  const s = totalSegundos % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// Cronómetro único y compartido por curso (no por persona) — arranca/pausa a
// nivel servidor (persistido en CAP_CURSOS) para que el tiempo transcurrido
// se mantenga igual para cualquiera que abra el curso, aunque recargue.
export function CronometroCurso({ curso, isAdmin }: { curso: Curso; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [segundosLocal, setSegundosLocal] = useState(curso.timerSegundos)
  const [showAgregar, setShowAgregar] = useState(false)
  const [minutosAgregar, setMinutosAgregar] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setSegundosLocal(curso.timerSegundos) }, [curso.timerSegundos])

  useEffect(() => {
    if (curso.timerCorriendo) {
      intervalRef.current = setInterval(() => setSegundosLocal((s) => s + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [curso.timerCorriendo])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['capacitacion-cursos'] })

  const play = useMutation({
    mutationFn: () => capacitacionService.timerPlay(curso.id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo iniciar el cronómetro'),
  })

  const pause = useMutation({
    mutationFn: () => capacitacionService.timerPause(curso.id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo pausar el cronómetro'),
  })

  const agregar = useMutation({
    mutationFn: (minutos: number) => capacitacionService.timerAgregar(curso.id, minutos),
    onSuccess: () => { invalidate(); toast.success('Tiempo agregado'); setShowAgregar(false); setMinutosAgregar('') },
    onError: () => toast.error('No se pudo agregar el tiempo'),
  })

  return (
    <div className={clsx(
      'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
      curso.timerCorriendo ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-100 bg-gray-50/60',
    )}>
      <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg', curso.timerCorriendo ? 'bg-emerald-100' : 'bg-gray-100')}>
        <Timer className={clsx('h-4 w-4', curso.timerCorriendo ? 'text-emerald-600' : 'text-gray-400')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Tiempo transcurrido</p>
        <p className={clsx('font-mono text-lg font-bold tabular-nums', curso.timerCorriendo ? 'text-emerald-700' : 'text-gray-700')}>
          {formatHMS(segundosLocal)}
        </p>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {curso.timerCorriendo ? (
            <button
              onClick={() => pause.mutate()}
              disabled={pause.isPending}
              title="Pausar"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => play.mutate()}
              disabled={play.isPending}
              title="Iniciar"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowAgregar((v) => !v)}
              title="Agregar tiempo manualmente"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand hover:bg-brand/15 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
            {showAgregar && (
              <div className="absolute right-0 top-11 z-10 w-48 rounded-xl border border-gray-200 bg-card p-3 shadow-lg">
                <label className="mb-1 block text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wide">Minutos a agregar</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="1" value={minutosAgregar} onChange={(e) => setMinutosAgregar(e.target.value)}
                    className="field py-1.5 text-sm" placeholder="Ej. 10" autoFocus
                  />
                  <button
                    onClick={() => { const m = Number(minutosAgregar); if (m > 0) agregar.mutate(m) }}
                    disabled={agregar.isPending || !minutosAgregar}
                    className="flex-shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-brand-dark transition-colors disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
