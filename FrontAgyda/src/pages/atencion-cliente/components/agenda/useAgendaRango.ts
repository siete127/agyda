import { useMemo } from 'react'

export type AgendaVista = 'dia' | 'semana' | 'mes'

function inicioDelDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}
function finDelDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
// El backend guarda CITA_FECHA_HORA como hora local "literal" (sin zona) y
// compara los filtros desde/hasta como texto de esa misma hora — nunca usar
// toISOString() aquí, que convierte a UTC y desfasa el rango varias horas.
function fechaLocalSql(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
// Lunes de la semana que contiene `d` — getDay() da 0=domingo, se normaliza
// a lunes-inicio con offset (dia+6)%7.
function lunesDeLaSemana(d: Date): Date {
  const r = new Date(d)
  const offset = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - offset)
  return inicioDelDia(r)
}

export function addDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
export function addMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

// Calcula el rango [desde, hasta] a pedir al backend según la vista activa,
// y expone helpers de navegación (anterior/siguiente/hoy) para esa vista.
export function useAgendaRango(vista: AgendaVista, fechaAncla: Date) {
  return useMemo(() => {
    let desde: Date
    let hasta: Date

    if (vista === 'dia') {
      desde = inicioDelDia(fechaAncla)
      hasta = finDelDia(fechaAncla)
    } else if (vista === 'semana') {
      desde = lunesDeLaSemana(fechaAncla)
      hasta = finDelDia(addDias(desde, 6))
    } else {
      // Mes: del 1º al último día, ampliado a cubrir el relleno del grid
      // (hasta 6 días antes/después para completar semanas completas).
      const primerDiaMes = new Date(fechaAncla.getFullYear(), fechaAncla.getMonth(), 1)
      const ultimoDiaMes = new Date(fechaAncla.getFullYear(), fechaAncla.getMonth() + 1, 0)
      desde = lunesDeLaSemana(primerDiaMes)
      hasta = finDelDia(addDias(lunesDeLaSemana(ultimoDiaMes), 6))
    }

    return { desde: fechaLocalSql(desde), hasta: fechaLocalSql(hasta) }
  }, [vista, fechaAncla])
}

export function navegar(vista: AgendaVista, fechaAncla: Date, direccion: 1 | -1): Date {
  if (vista === 'dia') return addDias(fechaAncla, direccion)
  if (vista === 'semana') return addDias(fechaAncla, 7 * direccion)
  return addMeses(fechaAncla, direccion)
}
