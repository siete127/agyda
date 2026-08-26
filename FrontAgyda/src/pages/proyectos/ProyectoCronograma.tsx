import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { Proyecto, Tarea, TareaEstado } from '@/types/proyecto.types'
import { TAREA_ESTADO_LABELS } from '@/types/proyecto.types'

const DAY_MS = 86_400_000

/* Misma paleta de estado validada usada en ProyectosDashboard */
const ESTADO_HEX: Record<TareaEstado, string> = {
  pendiente: '#6B7280',
  en_progreso: '#2563EB',
  completada: '#059669',
  cancelada: '#D97706',
}

/* tarea.estado es un nombre de estatus dinámico (ej. "Pendiente", "En progreso"),
   no siempre coincide con las claves fijas de ESTADO_HEX — se normaliza para
   evitar que la barra quede sin color (undefined → invisible). */
function colorDe(estado: TareaEstado) {
  const key = estado.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
  if (ESTADO_HEX[key]) return ESTADO_HEX[key]
  if (key.includes('complet') || key.includes('termin') || key.includes('aprob')) return ESTADO_HEX.completada
  if (key.includes('cancel') || key.includes('rechaz')) return ESTADO_HEX.cancelada
  if (key.includes('progres') || key.includes('proceso') || key.includes('review')) return ESTADO_HEX.en_progreso
  return ESTADO_HEX.pendiente
}

function diasEntre(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / DAY_MS
}

function fmt(d: Date) {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

interface Barra {
  tarea: Tarea
  offsetPct: number
  widthPct: number
  inicio: Date
  fin: Date
  sinFechas: boolean
}

export function ProyectoCronograma({
  proyecto, tareas, onTareaClick,
}: {
  proyecto: Proyecto
  tareas: Tarea[]
  onTareaClick?: (t: Tarea) => void
}) {
  const [hoverId, setHoverId] = useState<number | null>(null)

  const { rango, barras } = useMemo(() => {
    const conFechas = tareas.filter((t) => t.fechaInicio && t.fechaFin)
    const inicios = conFechas.map((t) => new Date(t.fechaInicio as string).getTime())
    const fines = conFechas.map((t) => new Date(t.fechaFin as string).getTime())
    const proyInicio = new Date(proyecto.fechaInicio).getTime()
    const proyFin = new Date(proyecto.fechaFin).getTime()

    const min = new Date(Math.min(proyInicio, ...(inicios.length ? inicios : [proyInicio])))
    const max = new Date(Math.max(proyFin, ...(fines.length ? fines : [proyFin])))
    const totalDias = Math.max(1, diasEntre(min, max))

    const barras: Barra[] = tareas.map((t) => {
      const sinFechas = !t.fechaInicio || !t.fechaFin
      const inicio = t.fechaInicio ? new Date(t.fechaInicio) : min
      const fin = t.fechaFin ? new Date(t.fechaFin) : new Date(inicio.getTime() + DAY_MS)
      const offsetPct = (diasEntre(min, inicio) / totalDias) * 100
      const widthPct = Math.max(1.5, (diasEntre(inicio, fin) / totalDias) * 100)
      return { tarea: t, offsetPct, widthPct, inicio, fin, sinFechas }
    })

    return { rango: { min, max, totalDias }, barras }
  }, [proyecto, tareas])

  const hoyPct = useMemo(() => {
    const pct = (diasEntre(rango.min, new Date()) / rango.totalDias) * 100
    return pct >= 0 && pct <= 100 ? pct : null
  }, [rango])

  if (tareas.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-16">
        <p className="text-sm font-semibold text-gray-700">Sin tareas para mostrar</p>
        <p className="text-xs text-gray-400">Crea tareas con fechas para ver el cronograma</p>
      </div>
    )
  }

  return (
    <div className="card p-5 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[0.8rem] font-bold text-gray-700">Cronograma</h3>
          <p className="text-[0.68rem] text-gray-400 mt-0.5">{fmt(rango.min)} – {fmt(rango.max)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[0.68rem] text-gray-400">
          {(Object.keys(ESTADO_HEX) as TareaEstado[]).map((e) => (
            <span key={e} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_HEX[e] }} />
              {TAREA_ESTADO_LABELS[e]}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-[560px]">
        <div className="relative space-y-2">
          {hoyPct !== null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-400 z-10"
              style={{ left: `${hoyPct}%` }}
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.6rem] font-semibold text-red-500 whitespace-nowrap">Hoy</span>
            </div>
          )}
          {barras.map(({ tarea, offsetPct, widthPct, inicio, fin, sinFechas }) => {
            const hovered = hoverId === tarea.id
            const clickable = !!onTareaClick
            return (
              <div key={tarea.id} className="flex items-center gap-3">
                <div className="w-40 flex-shrink-0 truncate text-[0.72rem] font-medium text-gray-700" title={tarea.titulo}>
                  {tarea.titulo}
                </div>
                <div className="relative h-7 flex-1 rounded-md border border-gray-200 bg-gray-100">
                  <div
                    onMouseEnter={() => setHoverId(tarea.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => onTareaClick?.(tarea)}
                    role={clickable ? 'button' : undefined}
                    className={clsx(
                      'absolute top-0.5 h-6 rounded-md shadow-sm transition-all',
                      sinFechas && 'bg-transparent opacity-70 border-2 border-dashed shadow-none',
                      clickable && 'cursor-pointer hover:brightness-110 hover:shadow-md',
                    )}
                    style={{
                      left: `${offsetPct}%`,
                      width: `${widthPct}%`,
                      background: sinFechas ? 'transparent' : colorDe(tarea.estado),
                      borderColor: sinFechas ? colorDe(tarea.estado) : undefined,
                    }}
                  >
                    {hovered && (
                      <div className="absolute left-0 -top-11 z-20 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[0.65rem] text-white shadow-lg whitespace-nowrap">
                        <div className="font-semibold">{tarea.titulo}</div>
                        <div className="text-gray-300">
                          {sinFechas ? 'Sin fechas definidas' : `${fmt(inicio)} → ${fmt(fin)}`}
                          {tarea.asignados.length > 0 && ` · ${tarea.asignados.join(', ')}`}
                        </div>
                        {clickable && <div className="text-brand-muted mt-0.5">Clic para editar</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
