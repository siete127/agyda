import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { BarChart3, Users, Headset } from 'lucide-react'
import { reporteResultadosService } from '@/services/reporteResultados.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'
import type { PeriodoReporte, ResultadosPorAgente, ResultadosPorCampania } from '@/types/reporteResultados.types'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

const PERIODOS: { key: PeriodoReporte; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
]

function ResultadosTable({ rows, tipo }: { rows: (ResultadosPorAgente | ResultadosPorCampania)[]; tipo: 'agente' | 'campania' }) {
  if (rows.length === 0) {
    return <p className="text-xs text-ink-tertiary py-10 text-center">Sin datos para este periodo</p>
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">{tipo === 'agente' ? 'Agente' : 'Campaña'}</th>
            {tipo === 'agente' && <th className="px-4 py-2.5 font-semibold">Campaña</th>}
            <th className="px-4 py-2.5 font-semibold">Aprobadas</th>
            <th className="px-4 py-2.5 font-semibold">Formalizadas</th>
            <th className="px-4 py-2.5 font-semibold">Garantizadas</th>
            <th className="px-4 py-2.5 font-semibold">Pendientes</th>
            <th className="px-4 py-2.5 font-semibold">Rechazadas</th>
            <th className="px-4 py-2.5 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {tipo === 'agente'
            ? (rows as ResultadosPorAgente[]).map((r) => (
              <tr key={r.agentId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.nombreAgente}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.campaignNombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-emerald-600 font-semibold">{r.aprobadas}</td>
                <td className="px-4 py-2.5 text-blue-600 font-semibold">{r.formalizadas}</td>
                <td className="px-4 py-2.5 text-purple-600 font-semibold">{r.garantizadas}</td>
                <td className="px-4 py-2.5 text-amber-600">{r.pendientes}</td>
                <td className="px-4 py-2.5 text-red-500">{r.rechazadas}</td>
                <td className="px-4 py-2.5 font-bold text-gray-900">{r.total}</td>
              </tr>
            ))
            : (rows as ResultadosPorCampania[]).map((r) => (
              <tr key={r.campaniaId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.campaniaNombre}</td>
                <td className="px-4 py-2.5 text-emerald-600 font-semibold">{r.aprobadas}</td>
                <td className="px-4 py-2.5 text-blue-600 font-semibold">{r.formalizadas}</td>
                <td className="px-4 py-2.5 text-purple-600 font-semibold">{r.garantizadas}</td>
                <td className="px-4 py-2.5 text-amber-600">{r.pendientes}</td>
                <td className="px-4 py-2.5 text-red-500">{r.rechazadas}</td>
                <td className="px-4 py-2.5 font-bold text-gray-900">{r.total}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportesResultadosPage() {
  const [periodo, setPeriodo] = useState<PeriodoReporte>('month')
  const [fecha, setFecha] = useState(hoy())
  const [tab, setTab] = useState<'agente' | 'campania'>('agente')

  const { data, isLoading } = useQuery({
    queryKey: ['ventas-area-reporte-resultados', periodo, fecha],
    queryFn: () => reporteResultadosService.get(periodo, fecha),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand" /> Reportes de resultados
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Resultados de ventas por agente y por campaña</p>
        </div>
        <div className="flex items-center gap-2">
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
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'aprobadas', icon: BarChart3, label: 'Aprobadas', value: data.totales.aprobadas, tone: 'success' },
              { key: 'formalizadas', icon: BarChart3, label: 'Formalizadas', value: data.totales.formalizadas, tone: 'brand' },
              { key: 'pendientes', icon: BarChart3, label: 'Pendientes', value: data.totales.pendientes, tone: 'warn' },
              { key: 'rechazadas', icon: BarChart3, label: 'Rechazadas', value: data.totales.rechazadas, tone: 'critical' },
              { key: 'total', icon: BarChart3, label: 'Total', value: data.totales.total, tone: 'brand' },
            ]}
          />

          <div className="flex gap-1 border-b border-gray-100">
            <button
              onClick={() => setTab('agente')}
              className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'agente' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <Users className="h-3.5 w-3.5" /> Por agente
            </button>
            <button
              onClick={() => setTab('campania')}
              className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'campania' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
            >
              <Headset className="h-3.5 w-3.5" /> Por campaña
            </button>
          </div>

          {tab === 'agente' ? <ResultadosTable rows={data.porAgente} tipo="agente" /> : <ResultadosTable rows={data.porCampania} tipo="campania" />}
        </>
      )}
    </div>
  )
}
