import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVentasSession } from '@/hooks/useVentasSession'
import { useVentasStore } from '@/stores/ventas.store'
import { ventasService } from '@/services/ventas.service'
import { VENTA_ESTADO_COLORS, type VentaStats } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import {
  BarChart2, Download, AlertCircle, RefreshCw, ChevronDown,
  TrendingUp, CheckCircle2, XCircle, Clock,
} from 'lucide-react'

type Tab = 'hoy' | 'semana' | 'mes'

export function VentasAdminPage() {
  const { isReady, error, retry } = useVentasSession()
  if (!isReady) return <div className="flex min-h-[50vh] items-center justify-center"><Spinner size="lg" /></div>
  if (error) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-8 w-8 text-red-400" />
      <p className="text-sm text-gray-500">{error}</p>
      <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )
  return <AdminContent />
}

function AdminContent() {
  const [tab,        setTab]        = useState<Tab>('hoy')
  const [campaignId, setCampaignId] = useState<number | undefined>(undefined)
  const { ventasCampaigns } = useVentasStore()

  const queryFn = tab === 'hoy'
    ? () => ventasService.getStatsDay(campaignId)
    : tab === 'semana'
      ? () => ventasService.getStatsWeek(campaignId)
      : () => ventasService.getStatsMonth(campaignId)

  const { data, isLoading } = useQuery({
    queryKey: ['ventas-stats', tab, campaignId],
    queryFn,
    staleTime: 60_000,
  })

  const totales = data?.totales
  const stats   = data?.stats ?? []

  const exportCSV = () => {
    if (!stats.length) return
    const headers = ['Agente','Campaña','Aprobadas','Rechazadas','Pendientes','Formalizadas','Total']
    const rows = stats.map((s) => [s.nombreAgente, s.campaignNombre, s.aprobadas, s.rechazadas, s.pendientes, s.formalizadas, s.total])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `ventas_${tab}_${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-brand" /> Panel de Ventas
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">Estadísticas y reportes del equipo</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ventasCampaigns.length > 1 && (
            <div className="relative">
              <select value={campaignId ?? ''} onChange={(e) => setCampaignId(e.target.value ? Number(e.target.value) : undefined)}
                className="appearance-none rounded-xl border border-gray-200 bg-card py-2 pl-3 pr-8 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10">
                <option value="">Todas las campañas</option>
                {ventasCampaigns.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          )}
          <button onClick={exportCSV} disabled={!stats.length}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {([['hoy','Hoy'], ['semana','Semana'], ['mes','Mes']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('rounded-lg px-4 py-1.5 text-[0.78rem] font-semibold transition-all',
              tab === key ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
            {label}
          </button>
        ))}
      </div>

      {/* Totales */}
      {totales && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total',      value: totales.total,      icon: TrendingUp,   color: 'text-brand',         bg: 'bg-brand/5'       },
            { label: 'Aprobadas',  value: totales.aprobadas,  icon: CheckCircle2, color: 'text-emerald-600',   bg: 'bg-emerald-50'    },
            { label: 'Rechazadas', value: totales.rechazadas, icon: XCircle,      color: 'text-red-500',       bg: 'bg-red-50'        },
            { label: 'Pendientes', value: totales.pendientes, icon: Clock,        color: 'text-yellow-600',    bg: 'bg-yellow-50'     },
          ].map((s) => (
            <div key={s.label} className={clsx('rounded-2xl border border-gray-200/60 p-4 shadow-sm', s.bg)}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.72rem] font-semibold text-gray-500">{s.label}</p>
                <s.icon className={clsx('h-4 w-4', s.color)} />
              </div>
              <p className={clsx('text-2xl font-black tabular-nums', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-[0.85rem] font-bold text-gray-900">Detalle por agente</h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <BarChart2 className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin datos para el período seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Agente','Campaña','Aprobadas','Rechazadas','Pendientes','Formalizadas','Total'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-white"
                          style={{ backgroundColor: s.color ?? '#1B4FD8' }}>
                          {s.nombreAgente.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[0.82rem] font-medium text-gray-800">{s.nombreAgente}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500">{s.campaignNombre}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-emerald-700">{s.aprobadas}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-red-500">{s.rechazadas}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-yellow-700">{s.pendientes}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-purple-700">{s.formalizadas}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[0.85rem] font-bold text-gray-900 tabular-nums">{s.total}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barras visuales */}
      {stats.length > 0 && !isLoading && (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-[0.85rem] font-bold text-gray-900">Aprobadas por agente</h2>
          </div>
          <div className="p-5 space-y-3">
            {[...stats].sort((a, b) => b.aprobadas - a.aprobadas).slice(0, 10).map((s, i) => {
              const max = Math.max(...stats.map((x) => x.aprobadas), 1)
              const pct = Math.round((s.aprobadas / max) * 100)
              return (
                <div key={i} className="flex items-center gap-3">
                  <p className="w-32 truncate text-[0.75rem] font-medium text-gray-600 text-right flex-shrink-0">
                    {s.nombreAgente.split(' ')[0]}
                  </p>
                  <div className="flex-1 rounded-full bg-gray-100 h-5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center pl-2"
                      style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: s.color ?? '#1B4FD8' }}
                    />
                  </div>
                  <span className="w-8 text-[0.78rem] font-bold tabular-nums text-gray-700 flex-shrink-0">{s.aprobadas}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
