import type { Cita } from '@/types/cita.types'

export const HORA_INICIO = 9   // 9:00 am — rango visible sin scroll
export const HORA_FIN = 18     // 6:00 pm
export const PX_POR_MIN = 1.2  // ~72px por hora
export const ALTO_MIN_BLOQUE = 46 // suficiente para título + cliente + hora sin cortar texto

// top/height en px relativos a `horaInicio` (HORA_INICIO por defecto, o el
// inicio efectivo calculado por rangoHorasEfectivo si hay citas fuera del
// rango fijo 9-18h — nunca se ocultan datos por caer antes/después).
export function calcularPosicion(fechaHora: string, duracionMin: number, horaInicio: number = HORA_INICIO) {
  const d = new Date(fechaHora)
  const minutosDesdeInicio = (d.getHours() - horaInicio) * 60 + d.getMinutes()
  const top = minutosDesdeInicio * PX_POR_MIN
  const height = Math.max(duracionMin * PX_POR_MIN, ALTO_MIN_BLOQUE)
  return { top, height }
}

// Rango fijo 9am-6pm (confirmado con el usuario) — una cita fuera de este
// rango no se dibuja en el timeline, pero sigue visible en "Próximas citas"
// y en el detalle al hacer clic.
export function rangoHorasEfectivo(_citas: Cita[]): { inicio: number; fin: number } {
  return { inicio: HORA_INICIO, fin: HORA_FIN }
}

export interface CitaConColumna {
  cita: Cita
  columna: number
  totalColumnas: number
}

// Algoritmo de barrido simple: ordena por inicio, asigna cada cita a la
// primera columna cuyo último evento ya terminó; agrupa por solapamiento
// para calcular cuántas columnas necesita cada grupo (ancho = 100/totalCols).
export function distribuirColumnas(citas: Cita[]): CitaConColumna[] {
  const ordenadas = [...citas].sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
  const finDe = (c: Cita) => new Date(c.fechaHora).getTime() + c.duracionMin * 60_000

  const columnasFin: number[] = [] // fin (ms) del último evento de cada columna
  const asignacion: { cita: Cita; columna: number }[] = []

  for (const c of ordenadas) {
    const inicio = new Date(c.fechaHora).getTime()
    let col = columnasFin.findIndex((fin) => fin <= inicio)
    if (col === -1) { col = columnasFin.length; columnasFin.push(0) }
    columnasFin[col] = finDe(c)
    asignacion.push({ cita: c, columna: col })
  }

  // Agrupa eventos solapados (comparten al menos una columna activa a la vez)
  // para saber cuántas columnas totales necesita cada grupo visualmente.
  return asignacion.map(({ cita, columna }) => {
    const inicio = new Date(cita.fechaHora).getTime()
    const fin = finDe(cita)
    const solapadas = asignacion.filter(({ cita: c2 }) => {
      const i2 = new Date(c2.fechaHora).getTime()
      const f2 = finDe(c2)
      return i2 < fin && f2 > inicio
    })
    const totalColumnas = Math.max(...solapadas.map((s) => s.columna)) + 1
    return { cita, columna, totalColumnas }
  })
}
