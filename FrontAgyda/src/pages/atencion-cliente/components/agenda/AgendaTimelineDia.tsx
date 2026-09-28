import type { Cita } from '@/types/cita.types'
import { PX_POR_MIN, distribuirColumnas, rangoHorasEfectivo } from './AgendaTimelineComun'
import { AgendaBloqueCita } from './AgendaBloqueCita'

function horasDelRango(inicio: number, fin: number): number[] {
  const arr: number[] = []
  for (let h = inicio; h <= fin; h++) arr.push(h)
  return arr
}

export function AgendaTimelineDia({ fecha, citas, onSeleccionar, onSlotVacio }: {
  fecha: Date
  citas: Cita[]
  onSeleccionar: (c: Cita) => void
  onSlotVacio: (fechaHora: string) => void
}) {
  const citasDelDia = citas.filter((c) => {
    const d = new Date(c.fechaHora)
    return d.toDateString() === fecha.toDateString()
  })
  const { inicio: horaInicio, fin: horaFin } = rangoHorasEfectivo(citasDelDia)
  const altoRango = (horaFin - horaInicio) * 60 * PX_POR_MIN
  // Fuera del rango 9-18h no se dibuja en el timeline (queda visible en
  // "Próximas citas" y en el detalle), para no producir un top negativo/
  // fuera del contenedor que corta el bloque.
  const citasEnRango = citasDelDia.filter((c) => {
    const h = new Date(c.fechaHora).getHours()
    return h >= horaInicio && h <= horaFin
  })
  const conColumnas = distribuirColumnas(citasEnRango)

  const clickSlot = (hora: number, minuto: number) => {
    // Fecha local, no toISOString() (convierte a UTC y desfasa el día/hora).
    const pad = (n: number) => String(n).padStart(2, '0')
    const fechaLocal = `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
    onSlotVacio(`${fechaLocal}T${pad(hora)}:${pad(minuto)}`)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
      <div className="max-h-[600px] overflow-y-auto">
        <div className="flex">
          <div className="w-14 flex-shrink-0 border-r border-gray-100">
            {horasDelRango(horaInicio, horaFin).map((h) => (
              <div key={h} style={{ height: 60 * PX_POR_MIN }} className="relative">
                <span className="absolute -top-2 right-1.5 text-[0.62rem] text-gray-400">{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: altoRango }}>
            {/* Líneas de hora + slots clickeables de 30 min */}
            {horasDelRango(horaInicio, horaFin).map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-gray-50" style={{ top: (h - horaInicio) * 60 * PX_POR_MIN }}>
                <button
                  onClick={() => clickSlot(h, 0)}
                  style={{ height: 30 * PX_POR_MIN }}
                  className="block w-full hover:bg-brand/5 transition-colors"
                  title="Nueva cita"
                />
                <button
                  onClick={() => clickSlot(h, 30)}
                  style={{ height: 30 * PX_POR_MIN }}
                  className="block w-full hover:bg-brand/5 transition-colors"
                  title="Nueva cita"
                />
              </div>
            ))}
            {conColumnas.map((item) => (
              <AgendaBloqueCita key={item.cita.id} item={item} horaInicio={horaInicio} onClick={onSeleccionar} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
