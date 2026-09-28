import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AgendaVista } from './useAgendaRango'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function tituloRango(vista: AgendaVista, fechaAncla: Date): string {
  if (vista === 'mes') return `${MESES[fechaAncla.getMonth()]} ${fechaAncla.getFullYear()}`
  if (vista === 'dia') return fechaAncla.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `${MESES[fechaAncla.getMonth()]} ${fechaAncla.getFullYear()}`
}

export function AgendaVistaSelector({ vista, onVista, fechaAncla, onAnterior, onSiguiente, onHoy }: {
  vista: AgendaVista
  onVista: (v: AgendaVista) => void
  fechaAncla: Date
  onAnterior: () => void
  onSiguiente: () => void
  onHoy: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button onClick={onHoy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[0.75rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Hoy
        </button>
        <div className="flex items-center">
          <button onClick={onAnterior} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={onSiguiente} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[0.9rem] font-bold capitalize text-gray-800">{tituloRango(vista, fechaAncla)}</p>
      </div>
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {(['dia', 'semana', 'mes'] as AgendaVista[]).map((v) => (
          <button
            key={v}
            onClick={() => onVista(v)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
              vista === v ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>
    </div>
  )
}
