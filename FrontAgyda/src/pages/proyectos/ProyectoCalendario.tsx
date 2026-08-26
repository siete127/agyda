import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import type { Tarea, TareaEstado } from '@/types/proyecto.types'
import { TAREA_ESTADO_LABELS } from '@/types/proyecto.types'

/* Misma paleta de estado usada en ProyectoCronograma / ProyectosDashboard */
const ESTADO_HEX: Record<TareaEstado, string> = {
  pendiente: '#6B7280',
  en_progreso: '#2563EB',
  completada: '#059669',
  cancelada: '#D97706',
}

/* tarea.estado es un nombre de estatus dinámico (ej. "Pendiente", "En progreso"),
   no siempre coincide con las claves fijas de ESTADO_HEX — se normaliza para
   evitar que el chip quede sin color. */
function colorDe(estado: TareaEstado) {
  const key = estado.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
  if (ESTADO_HEX[key]) return ESTADO_HEX[key]
  if (key.includes('complet') || key.includes('termin') || key.includes('aprob')) return ESTADO_HEX.completada
  if (key.includes('cancel') || key.includes('rechaz')) return ESTADO_HEX.cancelada
  if (key.includes('progres') || key.includes('proceso') || key.includes('review')) return ESTADO_HEX.en_progreso
  return ESTADO_HEX.pendiente
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ProyectoCalendario({
  tareas, onTareaClick,
}: {
  tareas: Tarea[]
  onTareaClick?: (t: Tarea) => void
}) {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())

  const tareasPorDia = useMemo(() => {
    const map = new Map<string, Tarea[]>()
    for (const t of tareas) {
      if (!t.fechaInicio || !t.fechaFin) continue
      const inicio = new Date(t.fechaInicio)
      const fin = new Date(t.fechaFin)
      const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())
      const finDia = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate())
      while (cursor <= finDia) {
        const key = ymd(cursor)
        const list = map.get(key) ?? []
        list.push(t)
        map.set(key, list)
        cursor.setDate(cursor.getDate() + 1)
      }
    }
    return map
  }, [tareas])

  const celdas = useMemo(() => {
    const diasEnMes = new Date(anio, mes + 1, 0).getDate()
    const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7
    const items: Array<{ dia: number; fecha: string; tareasDia: Tarea[] } | null> = []
    for (let i = 0; i < primerDiaSemana; i++) items.push(null)
    for (let dia = 1; dia <= diasEnMes; dia++) {
      const fecha = ymd(new Date(anio, mes, dia))
      items.push({ dia, fecha, tareasDia: tareasPorDia.get(fecha) ?? [] })
    }
    return items
  }, [anio, mes, tareasPorDia])

  function irMesAnterior() {
    if (mes === 0) { setMes(11); setAnio((a) => a - 1) } else setMes((m) => m - 1)
  }
  function irMesSiguiente() {
    if (mes === 11) { setMes(0); setAnio((a) => a + 1) } else setMes((m) => m + 1)
  }

  const esHoyCelda = (dia: number) =>
    anio === hoy.getFullYear() && mes === hoy.getMonth() && dia === hoy.getDate()

  const tareasSinFecha = tareas.filter((t) => !t.fechaInicio || !t.fechaFin)

  if (tareas.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-16">
        <CalendarIcon className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-semibold text-gray-700">Sin tareas para mostrar</p>
        <p className="text-xs text-gray-400">Crea tareas con fechas para verlas en el calendario</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      {/* Navegación de mes */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={irMesAnterior} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-[0.9rem] font-bold text-gray-800 w-40 text-center">{MESES[mes]} {anio}</h3>
          <button onClick={irMesSiguiente} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
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

      {/* Cabecera días */}
      <div className="grid grid-cols-7 gap-2.5 mb-2">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="text-center text-[0.7rem] font-bold uppercase tracking-wide text-gray-500 py-1">{d}</div>
        ))}
      </div>

      {/* Grilla de días */}
      <div className="grid grid-cols-7 gap-2.5">
        {celdas.map((c, i) => {
          if (!c) return <div key={`empty-${i}`} />
          const { dia, tareasDia } = c
          const hoyCelda = esHoyCelda(dia)
          const visibles = tareasDia.slice(0, 3)
          const restantes = tareasDia.length - visibles.length

          return (
            <div
              key={dia}
              className={clsx(
                'flex min-h-[92px] flex-col gap-1 rounded-xl border-2 p-1.5 transition-colors',
                tareasDia.length > 0 ? 'border-blue-200 bg-blue-50/60' : 'border-gray-200 bg-gray-50',
                hoyCelda && 'ring-2 ring-brand ring-offset-1',
              )}
            >
              <span className={clsx('text-[0.78rem] font-bold px-0.5', hoyCelda ? 'text-brand' : tareasDia.length > 0 ? 'text-blue-700' : 'text-gray-400')}>
                {dia}
              </span>
              <div className="flex flex-col gap-1">
                {visibles.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onTareaClick?.(t)}
                    title={t.titulo}
                    className="truncate rounded-md px-1.5 py-0.5 text-left text-[0.62rem] font-semibold text-white transition-transform hover:scale-[1.03]"
                    style={{ background: colorDe(t.estado) }}
                  >
                    {t.titulo}
                  </button>
                ))}
                {restantes > 0 && (
                  <span className="px-1.5 text-[0.6rem] font-semibold text-gray-400">+{restantes} más</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tareas sin fechas definidas */}
      {tareasSinFecha.length > 0 && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-wide text-gray-500 mb-2">
            Sin fechas definidas
          </p>
          <div className="flex flex-wrap gap-2">
            {tareasSinFecha.map((t) => (
              <button
                key={t.id}
                onClick={() => onTareaClick?.(t)}
                className="rounded-full border-2 border-dashed px-3 py-1 text-[0.7rem] font-semibold transition-colors hover:bg-gray-50"
                style={{ borderColor: colorDe(t.estado), color: colorDe(t.estado) }}
              >
                {t.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
