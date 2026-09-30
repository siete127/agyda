import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Activity, BarChart2, CalendarCheck, ClipboardList, LayoutDashboard, MessagesSquare, ShoppingCart, ArrowRight } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { Spinner } from '@/components/ui/Spinner'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import type { PanoramaCampania } from '@/types/reporteDiario.types'
import type { ReporteCampaniaId } from './reportesCampania'
import { useTemaGrafica } from './rbVisual'

// Primera vista de la Suite: todas las campañas activas de un vistazo, en una
// misma unidad ("registros": interacciones + postulantes + ventas del marcador)
// para poder compararlas, con su detalle y acceso directo a sus reportes.

const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fechaLocal(d) }
const RANGOS: { id: string; label: string; rango: () => [string, string] }[] = [
  { id: 'hoy', label: 'Hoy', rango: () => [haceDias(0), haceDias(0)] },
  { id: '7d', label: 'Últimos 7 días', rango: () => [haceDias(6), haceDias(0)] },
  { id: 'mes', label: 'Este mes', rango: () => [`${haceDias(0).slice(0, 8)}01`, haceDias(0)] },
  { id: '30d', label: 'Últimos 30 días', rango: () => [haceDias(29), haceDias(0)] },
  { id: '90d', label: 'Últimos 90 días', rango: () => [haceDias(89), haceDias(0)] },
]
const MAX_SERIES = 8
const OTROS = 'Otras campañas'
const n = (v: number) => v.toLocaleString('es-MX')
const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const MODALIDAD: Record<string, string> = { marcador: 'Marcador', omnicanal: 'Omnicanal', ambos: 'Marcador + omnicanal' }

export function PanoramaGeneral({ onAbrir }: { onAbrir: (campaniaId: number, reporte: ReporteCampaniaId) => void }) {
  const [rangoId, setRangoId] = useState('mes')
  const [desde, hasta] = (RANGOS.find((r) => r.id === rangoId) ?? RANGOS[2]).rango()
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suite-panorama', desde, hasta],
    queryFn: () => reporteDiarioService.getPanorama({ desde, hasta }),
    refetchInterval: 5 * 60_000,
  })
  const { series, c } = useTemaGrafica()

  // Color por campaña, fijo por su nombre (orden alfabético), no por su lugar
  // en el ranking: cambiar el rango no las repinta.
  const colorDe = useMemo(() => {
    const nombres = [...(data?.campanias ?? [])].map((x) => x.nombre).sort((a, b) => a.localeCompare(b, 'es'))
    const m = new Map<string, string>()
    nombres.forEach((nm, i) => m.set(nm, i < MAX_SERIES ? series[i % series.length] : c.otros))
    return m
  }, [data?.campanias, series, c.otros])

  // Serie apilada por día: las campañas con actividad (hasta 7 + "Otras").
  const { puntos, claves } = useMemo(() => {
    const activas = (data?.campanias ?? []).filter((x) => x.registros > 0)
    const principales = activas.length > MAX_SERIES ? activas.slice(0, MAX_SERIES - 1) : activas
    const resto = activas.slice(principales.length)
    const claves = [...principales.map((x) => x.nombre), ...(resto.length ? [OTROS] : [])]
    const puntos = (data?.dias ?? []).map((dia, i) => {
      const p: Record<string, string | number> = { dia: fmtDia(dia) }
      for (const x of principales) p[x.nombre] = x.serie[i] ?? 0
      if (resto.length) p[OTROS] = resto.reduce((s, x) => s + (x.serie[i] ?? 0), 0)
      return p
    })
    return { puntos, claves }
  }, [data])
  const color = (k: string) => (k === OTROS ? c.otros : colorDe.get(k) ?? c.otros)

  const t = data?.totales
  const conMovimiento = (data?.campanias ?? []).filter((x) => x.registros > 0)
  const maxRegistros = Math.max(1, ...conMovimiento.map((x) => x.registros))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><LayoutDashboard className="h-4.5 w-4.5 text-brand" /> Panorama general</h2>
          <p className="text-xs text-gray-500">Todas las campañas activas: lo que movió cada una en el periodo y cómo va.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Periodo">
          {RANGOS.map((r) => (
            <button key={r.id} role="radio" aria-checked={rangoId === r.id} onClick={() => setRangoId(r.id)}
              className={clsx('rounded-full border px-3 py-1 text-[0.75rem] font-semibold transition',
                rangoId === r.id ? 'border-brand bg-brand text-white shadow-sm' : 'border-gray-200 bg-card text-ink-secondary hover:border-brand/40 hover:text-brand')}>
              {r.label}
            </button>
          ))}
          {isFetching && !isLoading && <Spinner size="sm" />}
        </div>
      </div>

      {isLoading || !data || !t ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {data.errorVentas && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-800">{data.errorVentas}</p>
          )}

          <DashboardStatRow stats={[
            { key: 'reg', icon: Activity, label: `Registros · ${t.conActividad} de ${t.campanias} campañas`, value: n(t.registros), tone: 'brand' },
            { key: 'int', icon: MessagesSquare, label: 'Interacciones cerradas', value: n(t.cerradas), tone: 'brand' },
            { key: 'ven', icon: ShoppingCart, label: `Ventas${t.conversion != null ? ` · ${t.conversion}% conversión` : ''}`, value: `${n(t.ventas)} de ${n(t.ventasRegistros)}`, tone: 'success' },
            { key: 'pos', icon: ClipboardList, label: 'Postulantes registrados', value: n(t.postulantes), tone: 'warn' },
          ]} />

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="card p-4 xl:col-span-2">
              <h3 className="text-sm font-bold text-ink">Registros por día</h3>
              <p className="mb-2 text-[0.7rem] text-ink-tertiary">Interacciones, postulantes y ventas del marcador de cada campaña.</p>
              {claves.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                  {claves.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-[0.7rem] text-ink-secondary">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(k) }} /> {k}
                    </span>
                  ))}
                </div>
              )}
              {claves.length === 0 ? (
                <p className="py-16 text-center text-xs text-ink-tertiary">Sin movimiento en este periodo</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={puntos} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={c.rejilla} />
                      <XAxis dataKey="dia" tick={{ fontSize: 11, fill: c.eje }} axisLine={{ stroke: c.base }} tickLine={false} minTickGap={12} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.eje }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: c.rejilla, opacity: 0.4 }}
                        contentStyle={{ background: c.superficie, border: `1px solid ${c.borde}`, borderRadius: 8, fontSize: 12, color: c.tinta }}
                        formatter={(v) => n(Number(v))}
                      />
                      {claves.map((k, i) => (
                        <Bar key={k} dataKey={k} stackId="r" fill={color(k)} stroke={c.superficie} strokeWidth={1}
                          radius={i === claves.length - 1 ? [4, 4, 0, 0] : undefined} maxBarSize={28} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-bold text-ink">Participación por campaña</h3>
              <p className="mb-3 text-[0.7rem] text-ink-tertiary">Registros del periodo.</p>
              {conMovimiento.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-tertiary">Sin movimiento en este periodo</p>
              ) : (
                <ProgressBarList items={conMovimiento.map((x) => ({
                  key: String(x.id), label: `${x.nombre} · ${t.registros ? Math.round((x.registros / t.registros) * 100) : 0}%`,
                  value: x.registros, max: maxRegistros, color: color(x.nombre),
                }))} />
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-ink">Campañas</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.campanias.map((x) => (
                <TarjetaCampania key={x.id} campania={x} dias={data.dias} color={color(x.nombre)} onAbrir={onAbrir} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TarjetaCampania({ campania: x, dias, color, onAbrir }: {
  campania: PanoramaCampania
  dias: string[]
  color: string
  onAbrir: (campaniaId: number, reporte: ReporteCampaniaId) => void
}) {
  const { c } = useTemaGrafica()
  const datos = x.serie.map((v, i) => ({ dia: fmtDia(dias[i] ?? ''), v }))
  const metricas = [
    x.ventasRegistros > 0 && { label: 'Ventas', valor: `${n(x.ventas)} de ${n(x.ventasRegistros)}`, detalle: x.conversion != null ? `${x.conversion}% conversión` : null },
    x.interacciones > 0 && { label: 'Interacciones', valor: n(x.interacciones), detalle: `${n(x.cerradas)} cerradas` },
    x.postulantes > 0 && { label: 'Postulantes', valor: n(x.postulantes), detalle: null },
  ].filter(Boolean) as { label: string; valor: string; detalle: string | null }[]

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-card p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{x.nombre}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {x.ventasNombre && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[0.62rem] font-semibold text-violet-700">Ventas · {x.ventasNombre}</span>}
            {x.modalidad && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-secondary">{MODALIDAD[x.modalidad]}</span>}
            {x.postulantes > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-700">Reclutamiento</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-black leading-none text-ink">{n(x.registros)}</p>
          <p className="text-[0.62rem] text-ink-tertiary">registros</p>
        </div>
      </div>

      <div className="mt-3 h-12">
        {x.registros > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                contentStyle={{ background: c.superficie, border: `1px solid ${c.borde}`, borderRadius: 8, fontSize: 11, color: c.tinta, padding: '2px 8px' }}
                formatter={(v) => [n(Number(v)), 'Registros']}
                labelFormatter={(l) => String(l)}
              />
              <Area dataKey="v" type="monotone" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.15} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 text-[0.7rem] text-ink-tertiary">Sin movimiento en el periodo</div>
        )}
      </div>

      {metricas.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
          {metricas.map((m) => (
            <div key={m.label} className="min-w-0">
              <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-ink-tertiary">{m.label}</p>
              <p className="truncate text-[0.85rem] font-bold text-ink">{m.valor}</p>
              {m.detalle && <p className="truncate text-[0.62rem] text-ink-tertiary">{m.detalle}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-3">
        <button onClick={() => onAbrir(x.id, 'ejecutivo')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-2 py-1.5 text-[0.72rem] font-semibold text-ink-secondary transition hover:border-brand/40 hover:text-brand">
          <BarChart2 className="h-3.5 w-3.5" /> Reporte ejecutivo
        </button>
        <button onClick={() => onAbrir(x.id, 'registros')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-2 py-1.5 text-[0.72rem] font-semibold text-ink-secondary transition hover:border-brand/40 hover:text-brand">
          <CalendarCheck className="h-3.5 w-3.5" /> Registros <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
