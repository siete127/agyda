import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Gauge, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { direccionGeneralService, type IndicadoresPublico, type KpiPublico } from '@/services/direccionGeneral.service'

function tonoConfig(kpi: KpiPublico) {
  if (kpi.tono === 'critical') return { cls: 'bg-red-100 text-red-700', bar: 'bg-red-500' }
  if (kpi.tono === 'warn') return { cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' }
  if (kpi.tono === 'success') return { cls: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' }
  return { cls: 'bg-blue-50 text-blue-700', bar: 'bg-brand' }
}

function KpiCardPublica({ kpi, areaLabel }: { kpi: KpiPublico; areaLabel: string }) {
  const cfg = tonoConfig(kpi)
  const pct = kpi.progreso !== null ? Math.max(0, Math.min(100, kpi.progreso)) : null
  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{areaLabel}</span>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-xs font-semibold leading-snug text-gray-900">{kpi.label}</span>
        {kpi.tono && <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>{kpi.progreso !== null ? `${kpi.progreso}%` : '—'}</span>}
      </div>
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-gray-900">{kpi.valor.toLocaleString()}</span>
        <span className="text-xs text-gray-400">{kpi.unidad || ''}</span>
      </div>
      {kpi.meta !== null ? (
        <>
          <p className="mb-1 text-[11px] text-gray-400">
            {pct !== null ? `${pct}% de la meta` : ''} · meta {kpi.meta.toLocaleString()} {kpi.unidad || ''}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={clsx('h-full transition-all', cfg.bar)} style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-[11px] italic text-gray-400">Sin meta definida</p>
      )}
    </div>
  )
}

export function IndicadoresPublicoPage() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [data, setData] = useState<IndicadoresPublico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Enlace inválido'); setLoading(false); return }
    setLoading(true)
    direccionGeneralService.getIndicadoresPublico(token)
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.response?.data?.message ?? 'Enlace inválido o expirado'); setLoading(false) })
  }, [token])

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Spinner size="lg" />
    </div>
  )

  if (error || !data) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="space-y-3 text-center">
        <div className="text-5xl">🔒</div>
        <p className="text-lg font-bold text-gray-700">{error ?? 'Enlace inválido'}</p>
        <p className="text-[0.85rem] text-gray-400">Este enlace ya no está disponible. Solicita uno nuevo.</p>
      </div>
    </div>
  )

  const areasConDatos = data.areas.filter((a) => a.kpis.length > 0)

  const stats: DashboardStat[] = [
    { key: 'total', icon: Gauge, label: 'KPIs publicados', value: data.totales.totalKpis, tone: 'brand' },
    { key: 'onMeta', icon: CheckCircle2, label: 'En meta', value: data.totales.onMeta, tone: 'success' },
    { key: 'riesgo', icon: AlertTriangle, label: 'En riesgo', value: data.totales.enRiesgo, tone: 'warn' },
    { key: 'critico', icon: XCircle, label: 'Críticos', value: data.totales.critico, tone: 'critical' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10">
            <Gauge className="h-5 w-5 text-brand" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900">Indicadores empresariales</p>
            <p className="text-[0.72rem] text-gray-500">Ardabytec · Periodo {data.periodo}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <DashboardStatRow stats={stats} />

        {areasConDatos.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-[0.85rem] text-gray-400">
            No hay indicadores publicados para este periodo.
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areasConDatos.flatMap((area) =>
              area.kpis.map((kpi) => (
                <KpiCardPublica key={`${area.areaKey}-${kpi.kpiKey}`} kpi={kpi} areaLabel={area.label} />
              )),
            )}
          </div>
        )}

        <p className="pb-4 text-center text-[0.68rem] text-gray-400">
          Ardabytec · Vista compartida de solo lectura
        </p>
      </div>
    </div>
  )
}
