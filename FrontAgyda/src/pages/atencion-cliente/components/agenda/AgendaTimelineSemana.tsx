import type { Cita } from '@/types/cita.types'
import { PX_POR_MIN, distribuirColumnas, rangoHorasEfectivo } from './AgendaTimelineComun'
import { AgendaBloqueCita } from './AgendaBloqueCita'
import { addDias } from './useAgendaRango'

const DIAS_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function horasDelRango(inicio: number, fin: number): number[] {
  const arr: number[] = []
  for (let h = inicio; h <= fin; h++) arr.push(h)
  return arr
}

export function AgendaTimelineSemana({ lunes, citas, onSeleccionar, onSlotVacio }: {
  lunes: Date
  citas: Cita[]
  onSeleccionar: (c: Cita) => void
  onSlotVacio: (fechaHora: string) => void
}) {
  const dias = Array.from({ length: 7 }, (_, i) => addDias(lunes, i))
  const hoy = new Date().toDateString()
  // Rango compartido por todas las columnas de la semana, para que las líneas
  // de hora se mantengan alineadas entre días.
  const { inicio: horaInicio, fin: horaFin } = rangoHorasEfectivo(citas)
  const altoRango = (horaFin - horaInicio) * 60 * PX_POR_MIN

  const clickSlot = (dia: Date, hora: number, minuto: number) => {
    // Fecha local, no toISOString() (convierte a UTC y desfasa el día/hora).
    const pad = (n: number) => String(n).padStart(2, '0')
    const fechaLocal = `${dia.getFullYear()}-${pad(dia.getMonth() + 1)}-${pad(dia.getDate())}`
    onSlotVacio(`${fechaLocal}T${pad(hora)}:${pad(minuto)}`)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
      <div className="flex border-b border-gray-100">
        <div className="w-14 flex-shrink-0" />
        {dias.map((d) => (
          <div key={d.toISOString()} className={`flex-1 border-l border-gray-100 py-2 text-center ${d.toDateString() === hoy ? 'bg-brand/5' : ''}`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400">{DIAS_LABEL[(d.getDay() + 6) % 7]}</p>
            <p className={`text-sm font-bold ${d.toDateString() === hoy ? 'text-brand' : 'text-gray-700'}`}>{d.getDate()}</p>
          </div>
        ))}
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        <div className="flex">
          <div className="w-14 flex-shrink-0 border-r border-gray-100">
            {horasDelRango(horaInicio, horaFin).map((h) => (
              <div key={h} style={{ height: 60 * PX_POR_MIN }} className="relative">
                <span className="absolute -top-2 right-1.5 text-[0.62rem] text-gray-400">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
          {dias.map((dia) => {
            const citasDelDia = citas.filter((c) => new Date(c.fechaHora).toDateString() === dia.toDateString())
            // Fuera del rango 9-18h no se dibuja en el timeline (queda visible
            // en "Próximas citas" y en el detalle).
            const citasEnRango = citasDelDia.filter((c) => {
              const h = new Date(c.fechaHora).getHours()
              return h >= horaInicio && h <= horaFin
            })
            const conColumnas = distribuirColumnas(citasEnRango)
            return (
              <div key={dia.toISOString()} className="relative flex-1 border-l border-gray-50" style={{ height: altoRango }}>
                {horasDelRango(horaInicio, horaFin).map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-gray-50" style={{ top: (h - horaInicio) * 60 * PX_POR_MIN }}>
                    <button onClick={() => clickSlot(dia, h, 0)} style={{ height: 30 * PX_POR_MIN }} className="block w-full hover:bg-brand/5 transition-colors" />
                    <button onClick={() => clickSlot(dia, h, 30)} style={{ height: 30 * PX_POR_MIN }} className="block w-full hover:bg-brand/5 transition-colors" />
                  </div>
                ))}
                {conColumnas.map((item) => (
                  <AgendaBloqueCita key={item.cita.id} item={item} horaInicio={horaInicio} onClick={onSeleccionar} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
