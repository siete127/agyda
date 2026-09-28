import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Cita } from '@/types/cita.types'

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS_LABEL = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// Mini-calendario para saltar de fecha — mes propio navegable, independiente
// del mes mostrado en la vista principal (permite prever el mes siguiente
// sin cambiar la vista activa).
export function AgendaMiniCalendario({ fechaSeleccionada, onSeleccionar, citas }: {
  fechaSeleccionada: Date
  onSeleccionar: (d: Date) => void
  citas: Cita[]
}) {
  const [mesVisible, setMesVisible] = useState(new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), 1))

  const year = mesVisible.getFullYear()
  const month = mesVisible.getMonth()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const hoy = new Date().toDateString()
  const seleccionadaStr = fechaSeleccionada.toDateString()

  const tieneCitas = (day: number) => citas.some((c) => new Date(c.fechaHora).toDateString() === new Date(year, month, day).toDateString())

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => setMesVisible(new Date(year, month - 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <p className="text-[0.75rem] font-bold capitalize text-gray-700">{MESES_CORTO[month]} {year}</p>
        <button onClick={() => setMesVisible(new Date(year, month + 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {DIAS_LABEL.map((d, i) => (
          <div key={i} className="py-0.5 text-center text-[0.6rem] font-bold text-gray-400">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const fecha = new Date(year, month, day)
          const esHoy = fecha.toDateString() === hoy
          const esSeleccionada = fecha.toDateString() === seleccionadaStr
          return (
            <button
              key={day}
              onClick={() => onSeleccionar(fecha)}
              className={clsx(
                'relative flex h-7 w-7 items-center justify-center rounded-full text-[0.68rem] font-semibold transition-colors',
                esSeleccionada ? 'bg-brand text-white' : esHoy ? 'text-brand' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              {day}
              {tieneCitas(day) && !esSeleccionada && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
