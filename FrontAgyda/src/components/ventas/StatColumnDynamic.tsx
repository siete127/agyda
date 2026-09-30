import { BarChart2, Download } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import type { StatsDynamicResponse } from '@/types/ventas.types'

/* ── Columna de estadísticas DINÁMICA (estatus reales de campaña) ──
   Una barra por agente, apilada por estatus con los colores de la campaña.
   La usan Ventas (Estadísticas) y la Suite de reportes (campañas de ventas). */
const FALLBACK_COLORS = ['#2563eb','#22c55e','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#14b8a6','#f97316','#6366f1']

// Colores fijos por nombre conocido — independiente de posición
const KNOWN_COLORS: Record<string, string> = {
  'Aprobada':    '#22c55e',
  'Aprobado':    '#22c55e',
  'Pendiente':   '#f59e0b',
  'Rechazada':   '#ef4444',
  'Rechazado':   '#ef4444',
  'Agendada':    '#3b82f6',
  'Agendado':    '#3b82f6',
  'Formalizada': '#8b5cf6',
  'Formalizado': '#8b5cf6',
  'Garantizada': '#14b8a6',
  'Garantizado': '#14b8a6',
  'Declinado':   '#f97316',
  'Cancelada':   '#6b7280',
  'Cancelado':   '#6b7280',
}

export function StatColumnDynamic({ title, subtitle, data, isLoading, hideAgendada, onExport, alto = 480 }: {
  title: string; subtitle: string
  data: StatsDynamicResponse | undefined
  isLoading: boolean
  hideAgendada?: boolean
  /** Botón de exportar a Excel (se oculta si no se pasa). */
  onExport?: () => void
  /** Alto del área de barras en px. */
  alto?: number
}) {
  const CHART_H = alto

  const rawAgents = data?.stats ?? []
  // Si hideAgendada, filtrar Agendada de los counts de cada agente
  const agents = hideAgendada
    ? rawAgents.map((ag) => {
        const counts = { ...ag.estatusCounts }
        delete counts['Agendada']
        const total = Object.values(counts).reduce((s, v) => s + v, 0)
        return { ...ag, estatusCounts: counts, total }
      })
    : rawAgents
  const sorted = [...agents].sort((a, b) => b.total - a.total)
  const maxVal = Math.max(...sorted.map((a) => a.total), 1)

  // Estatus de la campaña (con colores) — si no hay campaña seleccionada, fallback a globales
  const rawStatuses = data?.statuses ?? []
  const statuses = hideAgendada
    ? rawStatuses.filter((s) => s.nombreEstado !== 'Agendada')
    : rawStatuses

  // Si no hay estatus de campaña, usar los globales fijos
  const efectiveStatuses = statuses.length > 0 ? statuses : [
    { id: -1, nombreEstado: 'Aprobada',    color: '#22c55e' },
    { id: -2, nombreEstado: 'Pendiente',   color: '#f59e0b' },
    { id: -3, nombreEstado: 'Rechazada',   color: '#ef4444' },
  ]

  const getColor = (nombre: string) => {
    // 1. Color configurado en CampaignStatuses (tiene prioridad)
    const st = efectiveStatuses.find((s) => s.nombreEstado === nombre)
    if (st?.color) return st.color
    // 2. Color fijo por nombre conocido
    if (KNOWN_COLORS[nombre]) return KNOWN_COLORS[nombre]
    // 3. Hash determinístico por nombre (mismo nombre → mismo color siempre)
    let hash = 0
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash)
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }

  // Todos los estatus que aparecen en los datos (para la leyenda)
  const allStatuses = new Set<string>()
  for (const ag of sorted) Object.keys(ag.estatusCounts).forEach((e) => allStatuses.add(e))
  const legendStatuses = efectiveStatuses.filter((s) => allStatuses.has(s.nombreEstado))
  // Agregar los que están en datos pero no en efectiveStatuses
  for (const name of allStatuses) {
    if (!legendStatuses.find((s) => s.nombreEstado === name)) {
      legendStatuses.push({ id: -99, nombreEstado: name, color: null })
    }
  }

  const rawTotales = data?.totalesPorEstatus ?? {}
  const totales = hideAgendada
    ? Object.fromEntries(Object.entries(rawTotales).filter(([k]) => k !== 'Agendada'))
    : rawTotales

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-[1rem] font-bold text-gray-900">{title}</h3>
          <p className="text-[0.72rem] text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        {onExport && (
          <button onClick={onExport} title="Exportar Excel"
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-50 hover:text-brand transition-colors">
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Totales por estatus — estatus de campaña + los que tienen datos */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3">
        {(() => {
          // Partir de los estatus de la campaña (si hay), luego agregar los que vienen en datos
          const shown: { nombre: string; cnt: number }[] = []
          const seen = new Set<string>()
          // 1. Estatus configurados de la campaña (siempre mostrar si hay campaña)
          if (statuses.length > 0) {
            for (const s of statuses) {
              shown.push({ nombre: s.nombreEstado, cnt: totales[s.nombreEstado] ?? 0 })
              seen.add(s.nombreEstado)
            }
          }
          // 2. Estatus que vienen en datos pero no están en la configuración
          for (const [nombre, cnt] of Object.entries(totales)) {
            if (!seen.has(nombre) && cnt > 0) shown.push({ nombre, cnt })
          }
          // Si no hay campaña seleccionada, solo mostrar los que tienen datos
          if (statuses.length === 0) {
            return Object.entries(totales)
              .filter(([, cnt]) => cnt > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([nombre, cnt]) => {
                const color = getColor(nombre)
                return (
                  <span key={nombre} className="flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color }}>
                    <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    {nombre}: {cnt}
                  </span>
                )
              })
          }
          return shown.map(({ nombre, cnt }) => {
            const color = getColor(nombre)
            return (
              <span key={nombre} className="flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color: cnt === 0 ? '#9ca3af' : color }}>
                <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cnt === 0 ? '#d1d5db' : color }} />
                {nombre}: {cnt}
              </span>
            )
          })
        })()}
      </div>

      {/* Gráfica */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16"><Spinner size="lg" /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
          <BarChart2 className="h-10 w-10" />
          <p className="text-[0.8rem]">Sin datos</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {/* Eje Y */}
          <div className="relative" style={{ height: `${CHART_H + 40}px` }}>
            {/* Líneas de cuadrícula */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = CHART_H - frac * CHART_H
              const val = Math.round(frac * maxVal)
              return (
                <div key={frac} className="absolute left-0 right-0 flex items-center gap-1" style={{ top: `${y}px` }}>
                  <span className="text-[0.65rem] text-gray-300 w-5 text-right flex-shrink-0">{val}</span>
                  <div className="flex-1 border-t border-dashed border-gray-100" />
                </div>
              )
            })}
            {/* Barras */}
            <div className="absolute inset-0 flex items-end gap-1.5 pl-7">
              {sorted.map((ag) => {
                const hTotal = ag.total === 0 ? 0 : Math.max(Math.round((ag.total / maxVal) * CHART_H), 6)

                // Orden de segmentos: primero los de efectiveStatuses, luego el resto
                const orderedNames = [...efectiveStatuses.map((s) => s.nombreEstado)]
                for (const name of Object.keys(ag.estatusCounts)) {
                  if (!orderedNames.includes(name)) orderedNames.push(name)
                }
                // Solo los que tienen count > 0
                const active = orderedNames.filter((n) => (ag.estatusCounts[n] ?? 0) > 0)

                // Invertir para que el primero de la lista quede abajo (flex-col normal, de abajo a arriba)
                const activeReversed = [...active].reverse()

                return (
                  <div key={ag.agentId} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                    {ag.total > 0 && <span className="text-[0.78rem] font-black text-gray-700 mb-1">{ag.total}</span>}
                    <div className="w-full rounded-t-xl overflow-hidden flex flex-col" style={{ height: `${hTotal}px`, minWidth: '32px' }}
                      title={`${ag.nombreAgente}: ${active.map((n) => `${n} ${ag.estatusCounts[n]}`).join(' · ')}`}>
                      {activeReversed.map((name, i) => {
                        const cnt = ag.estatusCounts[name]!
                        const color = getColor(name)
                        const pct = (cnt / ag.total) * 100
                        const segH = hTotal * pct / 100
                        return (
                          <div key={i} className="w-full flex items-center justify-center overflow-hidden"
                            style={{ flexGrow: cnt, flexBasis: 0, backgroundColor: color }}>
                            {segH >= 16 &&
                              <span className="text-[0.68rem] font-bold text-white leading-none">{cnt}</span>}
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 w-full text-center text-[0.65rem] text-gray-500 leading-tight px-0.5" style={{ wordBreak: 'break-word' }}>{ag.nombreAgente}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leyenda */}
          {legendStatuses.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
              {legendStatuses.map((s) => (
                <span key={`${s.id}-${s.nombreEstado}`} className="flex items-center gap-1 text-[0.7rem] text-gray-500">
                  <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getColor(s.nombreEstado) }} />
                  {s.nombreEstado}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[0.65rem] text-gray-300 text-center">Cada barra representa el total de casos por agente, desglosado por estatus.</p>
        </div>
      )}
    </div>
  )
}
