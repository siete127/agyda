import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, CheckCircle2, ClipboardList, Users } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { ResultadosModal } from './EncuestasPage'
import { PreguntaCerradaChart } from './EncuestaResultadosCharts'

/* Paleta de estado — validada con scripts/validate_palette.js (contraste ≥3:1, CVD ΔE≥12).
   El gris de "borrador" siempre va acompañado de su etiqueta de texto, nunca solo. */
const ESTADO_HEX: Record<string, string> = {
  activa: '#059669',
  cerrada: '#2563EB',
  borrador: '#6B7280',
}

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  cerrada: 'Cerrada',
  borrador: 'Borrador',
}

interface EncuestaResumen {
  id: number
  titulo: string
  estado: 'activa' | 'cerrada' | 'borrador'
  fechaCreacion: string
  totalAsignados: number
  totalCompletadas: number
}

interface PreguntaOpcion {
  encuestaId: number
  encuestaTitulo: string
  pregunta: string
  opciones: { opcion: string; total: number }[]
}

interface ResumenDashboard {
  encuestas: EncuestaResumen[]
  preguntasOpcionMultiple: PreguntaOpcion[]
}

function parseResumen(data: unknown): ResumenDashboard {
  const root = (data as Record<string, unknown>)?.['data'] ?? data
  const r = root as Record<string, unknown>
  const encuestas = (Array.isArray(r?.['encuestas']) ? r['encuestas'] : []) as Record<string, unknown>[]
  const preguntas = (Array.isArray(r?.['preguntasOpcionMultiple']) ? r['preguntasOpcionMultiple'] : []) as Record<string, unknown>[]
  return {
    encuestas: encuestas.map((e) => ({
      id: Number(e['id']),
      titulo: String(e['titulo'] ?? ''),
      estado: (String(e['estado'] ?? 'borrador')) as EncuestaResumen['estado'],
      fechaCreacion: String(e['fechaCreacion'] ?? ''),
      totalAsignados: Number(e['totalAsignados'] ?? 0),
      totalCompletadas: Number(e['totalCompletadas'] ?? 0),
    })),
    preguntasOpcionMultiple: preguntas.map((p) => ({
      encuestaId: Number(p['encuestaId']),
      encuestaTitulo: String(p['encuestaTitulo'] ?? ''),
      pregunta: String(p['pregunta'] ?? ''),
      opciones: (Array.isArray(p['opciones']) ? p['opciones'] : []) as { opcion: string; total: number }[],
    })),
  }
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone: 'brand' | 'success' | 'warn' }) {
  const toneClasses = {
    brand: 'bg-brand/10 text-brand',
    success: 'bg-emerald-100 text-emerald-600',
    warn: 'bg-amber-100 text-amber-600',
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

function BarEstados({ encuestas }: { encuestas: EncuestaResumen[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const counts: Record<string, number> = { activa: 0, cerrada: 0, borrador: 0 }
  encuestas.forEach((e) => { counts[e.estado] = (counts[e.estado] ?? 0) + 1 })
  const total = encuestas.length || 1
  const orden = ['activa', 'cerrada', 'borrador']

  return (
    <div className="card p-5">
      <h3 className="text-[0.8rem] font-bold text-gray-700 mb-4">Encuestas por estado</h3>
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
            <span className="text-gray-500">{ESTADO_LABEL[e]}</span>
            <span className="font-bold text-gray-800 tabular-nums">{counts[e]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TasaRespuesta({ encuestas, onSelect }: { encuestas: EncuestaResumen[]; onSelect: (e: EncuestaResumen) => void }) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const conAsignados = encuestas.filter((e) => e.totalAsignados > 0)

  if (conAsignados.length === 0) {
    return (
      <div className="card p-5">
        <h3 className="text-[0.8rem] font-bold text-gray-700 mb-1">Tasa de respuesta por encuesta</h3>
        <p className="text-[0.75rem] text-gray-400 py-6 text-center">Sin encuestas con asignaciones</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <h3 className="text-[0.8rem] font-bold text-gray-700 mb-1">Tasa de respuesta por encuesta</h3>
      <p className="text-[0.68rem] text-gray-400 mb-4">Haz clic en una encuesta para ver quién respondió</p>
      <div className="space-y-3">
        {conAsignados.map((e) => {
          const pct = Math.round((e.totalCompletadas / e.totalAsignados) * 100)
          const hovered = hoverId === e.id
          return (
            <button
              key={e.id}
              onMouseEnter={() => setHoverId(e.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(e)}
              className="group relative block w-full text-left cursor-pointer"
            >
              <div className="flex items-center justify-between mb-1">
                <span className={clsx('text-[0.75rem] font-semibold truncate pr-2', hovered ? 'text-brand underline' : 'text-gray-700')}>
                  {e.titulo}
                </span>
                <span className="text-[0.68rem] font-semibold flex-shrink-0 tabular-nums text-gray-400">
                  {e.totalCompletadas}/{e.totalAsignados} ({pct}%)
                </span>
              </div>
              <div className="relative h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OpcionMultipleCard({ p }: { p: PreguntaOpcion }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold text-brand uppercase tracking-wide truncate px-1 mb-1">{p.encuestaTitulo}</p>
      <PreguntaCerradaChart pregunta={{ preguntaId: p.encuestaId, pregunta: p.pregunta, opciones: p.opciones }} />
    </div>
  )
}

export function EncuestasDashboard() {
  const [verResultados, setVerResultados] = useState<EncuestaResumen | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['encuestas-dashboard-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/encuestas/dashboard/resumen')
      return parseResumen(data)
    },
  })

  const resumen = data ?? { encuestas: [], preguntasOpcionMultiple: [] }

  const { totalAsignados, totalCompletadas } = useMemo(() => {
    return resumen.encuestas.reduce(
      (acc, e) => ({ totalAsignados: acc.totalAsignados + e.totalAsignados, totalCompletadas: acc.totalCompletadas + e.totalCompletadas }),
      { totalAsignados: 0, totalCompletadas: 0 },
    )
  }, [resumen.encuestas])

  const activas = resumen.encuestas.filter((e) => e.estado === 'activa').length
  const tasaGlobal = totalAsignados > 0 ? Math.round((totalCompletadas / totalAsignados) * 100) : 0

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 w-48 rounded-lg bg-gray-100 mb-2" />
            <div className="h-3 w-32 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatTile icon={ClipboardList} label="Total de encuestas" value={resumen.encuestas.length} tone="brand" />
        <StatTile icon={BarChart3} label="Activas" value={activas} tone="brand" />
        <StatTile icon={Users} label="Asignaciones totales" value={totalAsignados} tone="warn" />
        <StatTile icon={CheckCircle2} label="Tasa de respuesta global" value={`${tasaGlobal}%`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BarEstados encuestas={resumen.encuestas} />
        <TasaRespuesta encuestas={resumen.encuestas} onSelect={setVerResultados} />
      </div>

      {resumen.preguntasOpcionMultiple.length > 0 && (
        <div>
          <h3 className="text-[0.8rem] font-bold text-gray-700 mb-3">Resultados de opción múltiple</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {resumen.preguntasOpcionMultiple.map((p, i) => (
              <OpcionMultipleCard key={`${p.encuestaId}-${i}`} p={p} />
            ))}
          </div>
        </div>
      )}

      {verResultados && (
        <ResultadosModal encuesta={verResultados} onClose={() => setVerResultados(null)} />
      )}
    </div>
  )
}
