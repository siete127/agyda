import { clsx } from 'clsx'
import { CITA_MODALIDAD_CONFIG, type Cita } from '@/types/cita.types'

const DIAS_LABEL = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const MAX_VISIBLES = 3

function fmtHora(f: string) {
  try { return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export function AgendaGridMes({ fechaAncla, citas, onSeleccionarCita, onSeleccionarDia }: {
  fechaAncla: Date
  citas: Cita[]
  onSeleccionarCita: (c: Cita) => void
  onSeleccionarDia: (d: Date) => void
}) {
  const year = fechaAncla.getFullYear()
  const month = fechaAncla.getMonth()
  const firstDayRaw = new Date(year, month, 1).getDay() // 0=domingo
  const firstDay = (firstDayRaw + 6) % 7 // normalizado a lunes-inicio
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const hoy = new Date().toDateString()

  const citasDelDia = (day: number) => {
    const fecha = new Date(year, month, day).toDateString()
    return citas.filter((c) => new Date(c.fechaHora).toDateString() === fecha)
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {DIAS_LABEL.map((d) => (
          <div key={d} className="py-1 text-center text-[0.65rem] font-bold uppercase tracking-wide text-gray-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const delDia = citasDelDia(day)
          const esHoy = new Date(year, month, day).toDateString() === hoy
          return (
            <button
              key={day}
              onClick={() => onSeleccionarDia(new Date(year, month, day))}
              className={clsx(
                'min-h-[80px] rounded-xl border p-1.5 text-left transition-colors hover:border-brand/40',
                esHoy ? 'border-brand bg-brand/5' : 'border-gray-100 bg-card',
              )}
            >
              <p className={clsx('mb-1 text-[0.72rem] font-bold', esHoy ? 'text-brand' : 'text-gray-600')}>{day}</p>
              <div className="space-y-0.5">
                {delDia.slice(0, MAX_VISIBLES).map((c) => {
                  const cfg = CITA_MODALIDAD_CONFIG[c.modalidad]
                  return (
                    <div
                      key={c.id}
                      onClick={(e) => { e.stopPropagation(); onSeleccionarCita(c) }}
                      className={clsx('truncate rounded px-1 py-0.5 text-[0.6rem] font-semibold', cfg.bg, cfg.text)}
                    >
                      {fmtHora(c.fechaHora)} {c.titulo}
                    </div>
                  )
                })}
                {delDia.length > MAX_VISIBLES && (
                  <p className="text-[0.6rem] font-semibold text-gray-400">+{delDia.length - MAX_VISIBLES} más</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
