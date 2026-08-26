import { useMemo, useState } from 'react'
import { AlertTriangle, Briefcase, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import type { Proyecto, ProyectoEstado } from '@/types/proyecto.types'

const DAY_MS = 86_400_000

/* Paleta de estado — mismos tonos que las stat tiles de ProyectosPage; validada con
   scripts/validate_palette.js (contraste ≥3:1, CVD ΔE ≥25). El gris de "Cancelado"
   siempre va acompañado de su etiqueta de texto, nunca solo. */
const ESTADO_HEX: Record<ProyectoEstado, string> = {
  Activo: '#059669',
  Pausado: '#D97706',
  Completado: '#2563EB',
  Cancelado: '#6B7280',
}

function diasEntre(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

interface ProyectoTiempo {
  proyecto: Proyecto
  duracionDias: number
  transcurridoDias: number
  restantesDias: number
  pctTiempo: number
  vencido: boolean
}

function calcularTiempo(p: Proyecto): ProyectoTiempo {
  const inicio = new Date(p.fechaInicio)
  const fin = new Date(p.fechaFin)
  const hoy = new Date()
  const duracionDias = Math.max(1, diasEntre(inicio, fin))
  const transcurridoRaw = diasEntre(inicio, hoy)
  const transcurridoDias = Math.min(duracionDias, Math.max(0, transcurridoRaw))
  const restantesDias = diasEntre(hoy, fin)
  const pctTiempo = Math.round((transcurridoDias / duracionDias) * 100)
  const vencido = restantesDias < 0 && p.estado === 'Activo'
  return { proyecto: p, duracionDias, transcurridoDias, restantesDias, pctTiempo, vencido }
}

/* ── Barra de estados (categórica) ── */
function BarEstados({ proyectos }: { proyectos: Proyecto[] }) {
  const [hover, setHover] = useState<ProyectoEstado | null>(null)
  const counts: Record<ProyectoEstado, number> = { Activo: 0, Pausado: 0, Completado: 0, Cancelado: 0 }
  proyectos.forEach((p) => { counts[p.estado] = (counts[p.estado] ?? 0) + 1 })
  const total = proyectos.length || 1
  const orden: ProyectoEstado[] = ['Activo', 'Pausado', 'Completado', 'Cancelado']

  return (
    <div className="card p-5">
      <h3 className="text-[0.8rem] font-bold text-gray-700 mb-4">Proyectos por estado</h3>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {orden.filter((e) => counts[e] > 0).map((e) => {
          const pct = (counts[e] / total) * 100
          return (
            <div
              key={e}
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
              style={{ width: `${pct}%`, background: ESTADO_HEX[e] }}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            />
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {orden.map((e) => (
          <div
            key={e}
            onMouseEnter={() => setHover(e)}
            onMouseLeave={() => setHover(null)}
            className={clsx('flex items-center gap-1.5 text-[0.72rem] transition-opacity', hover && hover !== e && 'opacity-40')}
          >
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: ESTADO_HEX[e] }} />
            <span className="text-gray-500">{e}</span>
            <span className="font-bold text-gray-800 tabular-nums">{counts[e]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Timeline de tiempo transcurrido/restante por proyecto ── */
function TimelineTiempos({ items }: { items: ProyectoTiempo[] }) {
  const [hoverId, setHoverId] = useState<number | null>(null)

  if (items.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="text-[0.8rem] font-bold text-gray-700 mb-1">Tiempo por proyecto</h3>
        <p className="text-[0.75rem] text-gray-400 py-6 text-center">Sin proyectos activos para mostrar</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[0.8rem] font-bold text-gray-700">Tiempo por proyecto</h3>
        <div className="flex items-center gap-3 text-[0.68rem] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Transcurrido</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gray-200" />Restante</span>
        </div>
      </div>
      <div className="space-y-3">
        {items.map(({ proyecto, pctTiempo, restantesDias, vencido }) => {
          const hovered = hoverId === proyecto.id
          return (
            <div
              key={proyecto.id}
              onMouseEnter={() => setHoverId(proyecto.id)}
              onMouseLeave={() => setHoverId(null)}
              className="group relative"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={clsx('text-[0.75rem] font-semibold truncate pr-2', hovered ? 'text-brand' : 'text-gray-700')}>
                  {proyecto.nombre}
                </span>
                <span className={clsx('text-[0.68rem] font-semibold flex-shrink-0 tabular-nums', vencido ? 'text-red-500' : 'text-gray-400')}>
                  {vencido ? `${Math.abs(restantesDias)}d vencido` : restantesDias >= 0 ? `${restantesDias}d restantes` : 'finalizado'}
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', vencido ? 'bg-red-400' : 'bg-brand')}
                  style={{ width: `${Math.min(100, pctTiempo)}%` }}
                />
              </div>
              {hovered && (
                <div className="absolute left-0 -top-7 z-10 rounded-lg bg-gray-900 px-2.5 py-1 text-[0.65rem] text-white shadow-lg whitespace-nowrap">
                  {pctTiempo}% del tiempo transcurrido
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Stat tile simple ── */
function StatTile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone: 'brand' | 'warn' | 'critical' }) {
  const toneClasses = {
    brand: 'bg-brand/10 text-brand',
    warn: 'bg-amber-100 text-amber-600',
    critical: 'bg-red-100 text-red-600',
  }[tone]
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', toneClasses)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{value}</p>
        <p className="text-[0.7rem] text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

/* ── Tabla accesible (misma info que el timeline, en formato tabular) ── */
function TablaTiempos({ items }: { items: ProyectoTiempo[] }) {
  return (
    <div className="card overflow-hidden">
      <h3 className="text-[0.8rem] font-bold text-gray-700 p-5 pb-0">Detalle por proyecto</h3>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-[0.75rem]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-400">
              <th className="px-5 py-2 font-semibold">Proyecto</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold text-right">Duración</th>
              <th className="px-3 py-2 font-semibold text-right">Transcurrido</th>
              <th className="px-3 py-2 font-semibold text-right">Restante</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ proyecto, duracionDias, transcurridoDias, restantesDias, vencido }) => (
              <tr key={proyecto.id} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-2.5 font-medium text-gray-800 truncate max-w-[220px]">{proyecto.nombre}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: ESTADO_HEX[proyecto.estado] }} />
                    {proyecto.estado}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{duracionDias}d</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{transcurridoDias}d</td>
                <td className={clsx('px-3 py-2.5 text-right tabular-nums font-semibold', vencido ? 'text-red-500' : 'text-gray-700')}>
                  {vencido ? `-${Math.abs(restantesDias)}d` : `${restantesDias}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ProyectosDashboard({ proyectos }: { proyectos: Proyecto[] }) {
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico')

  const tiempos = useMemo(
    () => proyectos
      .filter((p) => p.estado === 'Activo' || p.estado === 'Pausado')
      .map(calcularTiempo)
      .sort((a, b) => a.restantesDias - b.restantesDias),
    [proyectos],
  )

  const vencidos = tiempos.filter((t) => t.vencido).length
  const proximosAVencer = tiempos.filter((t) => !t.vencido && t.restantesDias >= 0 && t.restantesDias <= 7).length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={Briefcase} label="Proyectos en curso" value={tiempos.length} tone="brand" />
        <StatTile icon={Clock} label="Vencen en 7 días" value={proximosAVencer} tone="warn" />
        <StatTile icon={AlertTriangle} label="Vencidos" value={vencidos} tone="critical" />
      </div>

      <BarEstados proyectos={proyectos} />

      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setVista('grafico')}
          className={clsx('rounded-lg px-3 py-1.5 text-[0.72rem] font-semibold transition-colors', vista === 'grafico' ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-100')}
        >
          Gráfico
        </button>
        <button
          onClick={() => setVista('tabla')}
          className={clsx('rounded-lg px-3 py-1.5 text-[0.72rem] font-semibold transition-colors', vista === 'tabla' ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-100')}
        >
          Tabla
        </button>
      </div>

      {vista === 'grafico' ? <TimelineTiempos items={tiempos} /> : <TablaTiempos items={tiempos} />}
    </div>
  )
}
