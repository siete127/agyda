import { clsx } from 'clsx'
import { Video, Phone, Calendar } from 'lucide-react'
import { CITA_MODALIDAD_CONFIG, type Cita } from '@/types/cita.types'

const MODALIDAD_ICON = { videollamada: Video, telefonica: Phone, generica: Calendar }
const LIMITE = 5

function fmtCorta(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) }
  catch { return f }
}
function fmtHora(f: string) {
  try { return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export function AgendaProximasCitas({ citas, onSeleccionar }: { citas: Cita[]; onSeleccionar: (c: Cita) => void }) {
  const proximas = citas
    .filter((c) => new Date(c.fechaHora) >= new Date() && !['cancelada', 'asistio', 'no_asistio'].includes(c.estatus))
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
    .slice(0, LIMITE)

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-3 py-2.5">
        <p className="text-[0.78rem] font-bold text-gray-700">Próximas citas</p>
      </div>
      {proximas.length === 0 ? (
        <p className="py-6 text-center text-[0.72rem] text-gray-400">Sin citas próximas</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {proximas.map((c) => {
            const cfg = CITA_MODALIDAD_CONFIG[c.modalidad]
            const Icon = MODALIDAD_ICON[c.modalidad]
            return (
              <button key={c.id} onClick={() => onSeleccionar(c)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors">
                <span className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md', cfg.bg)}>
                  <Icon className={clsx('h-3 w-3', cfg.text)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.75rem] font-semibold text-gray-800">{c.titulo}</p>
                  <p className="truncate text-[0.65rem] text-gray-400">{c.contactoNombre || 'Cliente'}</p>
                  <p className="text-[0.65rem] font-semibold text-gray-500">{fmtCorta(c.fechaHora)} · {fmtHora(c.fechaHora)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
