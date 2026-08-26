import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { UserCircle, TrendingUp, Target, Headset } from 'lucide-react'
import { ventasAreaService } from '@/services/ventasArea.service'
import { perfilAsesorService } from '@/services/perfilAsesor.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'
import type { PeriodoReporte } from '@/types/reporteResultados.types'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

const PERIODOS: { key: PeriodoReporte; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
]

export function AsesoresVentasPage() {
  const [asesorId, setAsesorId] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState<PeriodoReporte>('month')
  const [fecha, setFecha] = useState(hoy())

  const { data: asesores = [], isLoading: loadingAsesores } = useQuery({
    queryKey: ['ventas-area-asesores'],
    queryFn: () => ventasAreaService.getAsesores(),
  })

  const asesorSeleccionado = useMemo(() => {
    if (asesorId !== '') return asesorId
    return asesores.length > 0 ? asesores[0].id : ''
  }, [asesorId, asesores])

  const { data, isLoading } = useQuery({
    queryKey: ['ventas-area-perfil-asesor', asesorSeleccionado, periodo, fecha],
    queryFn: () => perfilAsesorService.get(Number(asesorSeleccionado), periodo, fecha),
    enabled: asesorSeleccionado !== '',
  })

  const pctMeta = data?.meta && data.meta.metaUnidades > 0
    ? Math.min(100, Math.round((data.meta.avanceUnidades / data.meta.metaUnidades) * 100))
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Headset className="h-5 w-5 text-brand" /> Asesores
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Productividad, ventas y conversión por asesor</p>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asesor</label>
          <select
            value={asesorSeleccionado}
            onChange={(e) => setAsesorId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingAsesores}
            className="field min-w-[220px]"
          >
            {asesores.length === 0 && <option value="">Sin asesores disponibles</option>}
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-200 p-1">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={clsx('rounded-lg px-3 py-1 text-xs font-semibold transition-colors', periodo === p.key ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
        </div>
      </div>

      {asesorSeleccionado === '' ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <UserCircle className="h-8 w-8" />
          <p className="text-sm">No hay asesores disponibles para consultar</p>
        </div>
      ) : isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="card p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <UserCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{data.asesor.nombre}</p>
              <p className="text-xs text-gray-500">{data.asesor.campaignNombre ?? 'Sin campaña asignada'}</p>
            </div>
          </div>

          <DashboardStatRow
            stats={[
              { key: 'aprobadas', icon: TrendingUp, label: 'Aprobadas', value: data.resultados.aprobadas, tone: 'success' },
              { key: 'formalizadas', icon: TrendingUp, label: 'Formalizadas', value: data.resultados.formalizadas, tone: 'brand' },
              { key: 'garantizadas', icon: TrendingUp, label: 'Garantizadas', value: data.resultados.garantizadas, tone: 'brand' },
              { key: 'pendientes', icon: TrendingUp, label: 'Pendientes', value: data.resultados.pendientes, tone: 'warn' },
              { key: 'rechazadas', icon: TrendingUp, label: 'Rechazadas', value: data.resultados.rechazadas, tone: 'critical' },
              { key: 'conversion', icon: TrendingUp, label: 'Conversión', value: `${data.conversion}%`, tone: 'brand' },
            ]}
          />

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-ink flex items-center gap-1.5"><Target className="h-4 w-4 text-brand" /> Meta del mes ({data.meta?.periodoMes ?? fecha.slice(0, 7)})</h2>
            {!data.meta ? (
              <p className="text-xs text-ink-tertiary py-4 text-center">Este asesor no tiene una meta registrada para este mes</p>
            ) : (
              <div className="space-y-3">
                {data.meta.metaUnidades > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600">{data.meta.avanceUnidades} / {data.meta.metaUnidades} unidades</span>
                      <span className={clsx('font-bold', (pctMeta ?? 0) >= 100 ? 'text-emerald-600' : 'text-gray-700')}>{pctMeta}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={clsx('h-full rounded-full transition-all', (pctMeta ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-brand')} style={{ width: `${pctMeta}%` }} />
                    </div>
                  </div>
                )}
                {data.meta.metaMonto > 0 && (
                  <p className="text-xs text-gray-500">Meta de monto: <span className="font-semibold text-gray-800">${data.meta.metaMonto.toLocaleString('es-MX')}</span></p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
