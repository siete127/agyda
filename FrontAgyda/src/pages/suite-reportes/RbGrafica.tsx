import { useState } from 'react'
import { clsx } from 'clsx'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { formatDimension, formatValor, formatEje, esSumable } from './rbFormat'
import { formaEfectiva, useTemaGrafica, type CromoGrafica } from './rbVisual'
import type { RbColumna, RbResultado, RbTipoVisual, RbVisual, RbFormato } from '@/types/reporteDiario.types'

const OTROS = 'Otros'
const MAX_SERIES = 8
/* ── Preparación de datos ── */

type Punto = Record<string, string | number | null>
interface Serie { clave: string; label: string; color: string; formato?: RbFormato }

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

// Recorta categorías: las primeras N y, si la métrica se puede sumar, el resto en "Otros".
function recortar(puntos: Punto[], claves: string[], max: number, sumable: boolean): Punto[] {
  if (puntos.length <= max) return puntos
  const cabeza = puntos.slice(0, max - (sumable ? 1 : 0))
  if (!sumable) return cabeza
  const resto = puntos.slice(max - 1)
  const otros: Punto = { __x: OTROS }
  for (const k of claves) otros[k] = resto.reduce((a, p) => a + (Number(p[k]) || 0), 0)
  return [...cabeza, otros]
}

// 2 dimensiones → una fila por valor de la 1ª y una serie por valor de la 2ª
// (las 7 mayores + "Otros").
function pivotear(filas: Record<string, unknown>[], d1: RbColumna, d2: RbColumna, met: RbColumna, colores: string[], colorOtros: string) {
  const totalPorSerie = new Map<string, number>()
  for (const f of filas) {
    const k = formatDimension(f[d2.id], d2.tipo, true)
    totalPorSerie.set(k, (totalPorSerie.get(k) ?? 0) + (Number(f[met.id]) || 0))
  }
  const ordenadas = [...totalPorSerie.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  const hayOtros = ordenadas.length > MAX_SERIES
  const principales = hayOtros ? ordenadas.slice(0, MAX_SERIES - 1) : ordenadas
  // Color por nombre (orden alfabético del conjunto), no por posición en el ranking.
  const porNombre = [...principales].sort((a, b) => a.localeCompare(b, 'es'))
  const series: Serie[] = principales.map((k) => ({ clave: `s_${k}`, label: k, color: colores[porNombre.indexOf(k)], formato: met.formato }))
  if (hayOtros) series.push({ clave: `s_${OTROS}`, label: OTROS, color: colorOtros, formato: met.formato })

  const puntos = new Map<string, Punto>()
  for (const f of filas) {
    const x = String(f[d1.id] ?? '')
    if (!puntos.has(x)) puntos.set(x, { __x: formatDimension(f[d1.id], d1.tipo, true), __orden: x })
    const p = puntos.get(x)!
    const s = formatDimension(f[d2.id], d2.tipo, true)
    const clave = principales.includes(s) ? `s_${s}` : `s_${OTROS}`
    p[clave] = (Number(p[clave]) || 0) + (Number(f[met.id]) || 0)
  }
  let lista = [...puntos.values()]
  if (d1.tiempo) lista = lista.sort((a, b) => String(a.__orden).localeCompare(String(b.__orden), 'es', { numeric: true }))
  return { puntos: lista, series }
}

/* ── Piezas comunes ── */

function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null
  return (
    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
      {series.map((s) => (
        <span key={s.clave} className="flex items-center gap-1.5 text-[0.7rem] text-ink-secondary">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
    </div>
  )
}

function Globo({ active, payload, label, series, c }: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number | null; payload?: Punto }[]
  label?: string
  series: Serie[]
  c: CromoGrafica
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg px-2.5 py-2 text-[0.72rem] shadow-md" style={{ background: c.superficie, border: `1px solid ${c.borde}`, color: c.tinta }}>
      <p className="mb-1 font-semibold">{label ?? String(payload[0]?.payload?.__x ?? '')}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.clave === p.dataKey)
        if (!s) return null
        return (
          <p key={s.clave} className="flex items-center gap-1.5" style={{ color: c.tinta2 }}>
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}: <span className="font-semibold tabular-nums" style={{ color: c.tinta }}>{formatValor(p.value, s.formato)}</span>
          </p>
        )
      })}
    </div>
  )
}

/* ── Indicadores (stat tiles) ── */

function Indicadores({ resultado, mets }: { resultado: RbResultado; mets: RbColumna[] }) {
  const { totales, comparacion } = resultado
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {mets.map((m) => {
        const v = num(totales[m.id])
        const antes = comparacion ? num(comparacion.totales[m.id]) : null
        const delta = v != null && antes != null && antes !== 0 ? ((v - antes) / Math.abs(antes)) * 100 : null
        const Flecha = delta == null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
        return (
          <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[0.7rem] font-semibold text-ink-tertiary">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{formatValor(v, m.formato)}</p>
            {comparacion && (
              <p className="mt-1 flex items-center gap-1 text-[0.7rem] text-ink-secondary">
                <Flecha className="h-3.5 w-3.5" />
                {delta == null ? 'sin datos para comparar' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
                <span className="text-ink-tertiary">vs {formatValor(antes, m.formato)}</span>
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Mapa de calor (2 dimensiones, una métrica) ── */

function MapaCalor({ filas, d1, d2, met, rampa, c }: { filas: Record<string, unknown>[]; d1: RbColumna; d2: RbColumna; met: RbColumna; rampa: string[]; c: CromoGrafica }) {
  const [hover, setHover] = useState<string | null>(null)
  const orden = (vals: string[]) => [...new Set(vals)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  const ys = orden(filas.map((f) => String(f[d1.id] ?? '')))
  const xs = orden(filas.map((f) => String(f[d2.id] ?? '')))
  const celdas = new Map<string, number>()
  for (const f of filas) celdas.set(`${f[d1.id]}|${f[d2.id]}`, Number(f[met.id]) || 0)
  const max = Math.max(0, ...celdas.values())
  const color = (v: number | undefined) => (v == null || max === 0 ? 'transparent' : rampa[Math.min(rampa.length - 1, Math.floor((v / max) * (rampa.length - 1)))])

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `auto repeat(${xs.length}, minmax(1.9rem, 1fr))` }}>
        <span />
        {xs.map((x) => (
          <span key={x} className="px-0.5 pb-1 text-center text-[0.62rem] tabular-nums" style={{ color: c.eje }}>{formatDimension(x, d2.tipo, true)}</span>
        ))}
        {ys.map((y) => (
          <div key={y} className="contents">
            <span className="pr-2 text-right text-[0.68rem] leading-7" style={{ color: c.tinta2 }}>{formatDimension(y, d1.tipo, true)}</span>
            {xs.map((x) => {
              const k = `${y}|${x}`
              const v = celdas.get(k)
              return (
                <span
                  key={k}
                  onMouseEnter={() => setHover(k)}
                  onMouseLeave={() => setHover(null)}
                  title={`${formatDimension(y, d1.tipo)} · ${formatDimension(x, d2.tipo)}: ${formatValor(v ?? 0, met.formato)}`}
                  className="h-7 rounded-[3px]"
                  style={{ background: color(v), outline: hover === k ? `2px solid ${c.tinta}` : undefined, border: v == null ? `1px solid ${c.rejilla}` : undefined }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[0.65rem]" style={{ color: c.eje }}>
        <span>{formatValor(0, met.formato)}</span>
        <span className="h-2 w-40 rounded-full" style={{ background: `linear-gradient(to right, ${rampa.join(',')})` }} />
        <span>{formatValor(max, met.formato)}</span>
        <span className="ml-1" style={{ color: c.tinta2 }}>{met.label}</span>
      </div>
    </div>
  )
}

/* ── Gráfica principal ── */

interface Props {
  resultado: RbResultado
  visual: RbVisual
}

export function RbGrafica({ resultado, visual }: Props) {
  const { series: colores, c, rampa } = useTemaGrafica()
  const dims = resultado.columnas.filter((x) => x.esDimension)
  const mets = resultado.columnas.filter((x) => !x.esDimension)
  const tipo = formaEfectiva(visual.tipo, dims, mets, resultado.filas.length)
  const metSel = mets.find((m) => m.id === visual.metrica) ?? mets[0]

  const ejes = {
    x: { tick: { fill: c.eje, fontSize: 11 }, axisLine: { stroke: c.base }, tickLine: false },
    y: { tick: { fill: c.eje, fontSize: 11 }, axisLine: false, tickLine: false, width: 56 },
  } as const

  // Una métrica por gráfica cuando los formatos no coinciden (nunca doble eje):
  // se agrupan las métricas por formato y cada grupo va en su propia gráfica.
  const porFormato = new Map<string, RbColumna[]>()
  for (const x of mets) porFormato.set(x.formato ?? '', [...(porFormato.get(x.formato ?? '') ?? []), x])
  const grupos = [...porFormato.values()]

  if (tipo === 'tabla') return null
  if (tipo === 'kpi') return <Indicadores resultado={resultado} mets={mets} />
  if (resultado.filas.length === 0) return null

  const d1 = dims[0]
  const d2 = dims[1]

  if (tipo === 'calor' && d1 && d2) {
    return <MapaCalor filas={resultado.filas} d1={d1} d2={d2} met={metSel} rampa={rampa} c={c} />
  }

  // Forma cartesiana con 2 dimensiones → series por la 2ª dimensión, una métrica.
  if (d1 && d2) {
    const { puntos, series } = pivotear(resultado.filas, d1, d2, metSel, colores, c.otros)
    return (
      <div>
        <p className="mb-1 text-[0.72rem] font-semibold text-ink-secondary">{metSel.label} por {d1.label.toLowerCase()} y {d2.label.toLowerCase()}</p>
        <Leyenda series={series} />
        <Cartesiana tipo={tipo === 'apiladas' ? 'apiladas' : tipo} puntos={puntos} series={series} formato={metSel.formato} ejes={ejes} c={c} />
      </div>
    )
  }

  // 1 dimensión
  const base: Punto[] = resultado.filas.map((f) => {
    const p: Punto = { __x: formatDimension(f[d1.id], d1.tipo, true) }
    for (const m of mets) p[m.id] = num(f[m.id])
    return p
  })

  if (tipo === 'pastel') {
    const met = esSumable(metSel.formato) ? metSel : mets.find((m) => esSumable(m.formato)) ?? metSel
    const ordenados = [...base].sort((a, b) => (Number(b[met.id]) || 0) - (Number(a[met.id]) || 0))
    const datos = recortar(ordenados, [met.id], 6, true)
    const total = datos.reduce((a, p) => a + (Number(p[met.id]) || 0), 0)
    const color = (p: Punto, i: number) => (p.__x === OTROS ? c.otros : colores[i])
    return (
      <div className="flex flex-wrap items-center gap-6">
        <div className="h-60 w-60">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={datos} dataKey={met.id} nameKey="__x" innerRadius="58%" outerRadius="100%" stroke={c.superficie} strokeWidth={2} isAnimationActive={false}>
                {datos.map((p, i) => <Cell key={String(p.__x)} fill={color(p, i)} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                const p = payload?.[0]?.payload as Punto | undefined
                if (!active || !p) return null
                const i = datos.indexOf(p)
                return (
                  <div className="rounded-lg px-2.5 py-2 text-[0.72rem] shadow-md" style={{ background: c.superficie, border: `1px solid ${c.borde}`, color: c.tinta }}>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <span className="h-2 w-2 rounded-sm" style={{ background: color(p, i) }} /> {p.__x}
                    </p>
                    <p style={{ color: c.tinta2 }}>
                      {met.label}: <span className="font-semibold tabular-nums" style={{ color: c.tinta }}>{formatValor(p[met.id], met.formato)}</span>
                      {total ? ` · ${((Number(p[met.id]) || 0) * 100 / total).toFixed(1)}%` : ''}
                    </p>
                  </div>
                )
              }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5">
          <li className="text-[0.72rem] font-semibold text-ink-secondary">{met.label}</li>
          {datos.map((p, i) => (
            <li key={String(p.__x)} className="flex items-center gap-2 text-[0.75rem] text-ink-secondary">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(p, i) }} />
              <span className="text-ink">{p.__x}</span>
              <span className="tabular-nums">{formatValor(p[met.id], met.formato)}</span>
              <span className="tabular-nums text-ink-tertiary">{total ? `${((Number(p[met.id]) || 0) * 100 / total).toFixed(1)}%` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (tipo === 'apiladas') {
    const apilables = mets.filter((m) => esSumable(m.formato) && m.formato === (mets.find((x) => esSumable(x.formato))?.formato))
    const series: Serie[] = apilables.slice(0, MAX_SERIES).map((m, i) => ({ clave: m.id, label: m.label, color: colores[i], formato: m.formato }))
    return (
      <div>
        <Leyenda series={series} />
        <Cartesiana tipo="apiladas" puntos={d1.tiempo ? base : recortar(base, series.map((s) => s.clave), 20, true)} series={series} formato={series[0]?.formato} ejes={ejes} c={c} />
      </div>
    )
  }

  // Barras / líneas / área con 1 dimensión: una gráfica por formato de métrica.
  return (
    <div className={clsx('grid gap-5', grupos.length > 1 && 'lg:grid-cols-2')}>
      {grupos.map((g) => {
        const series: Serie[] = g.slice(0, MAX_SERIES).map((m) => ({ clave: m.id, label: m.label, color: colores[mets.indexOf(m) % MAX_SERIES], formato: m.formato }))
        const sumable = g.every((m) => esSumable(m.formato))
        const max = tipo === 'barras_h' ? 25 : 20
        const puntos = d1.tiempo ? base : recortar(base, series.map((s) => s.clave), max, sumable)
        return (
          <div key={g[0].id}>
            {(grupos.length > 1 || series.length === 1) && (
              <p className="mb-1 text-[0.72rem] font-semibold text-ink-secondary">{series.map((s) => s.label).join(' · ')}</p>
            )}
            <Leyenda series={series} />
            <Cartesiana tipo={tipo} puntos={puntos} series={series} formato={g[0].formato} ejes={ejes} c={c} />
            {!d1.tiempo && base.length > puntos.length && (
              <p className="mt-1 text-[0.65rem] text-ink-tertiary">
                Se muestran {sumable ? `${puntos.length - 1} + "Otros"` : `las primeras ${puntos.length}`} de {base.length}; la tabla tiene todas.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Barras / líneas / área (recharts) ── */

function Cartesiana({ tipo, puntos, series, formato, ejes, c }: {
  tipo: RbTipoVisual
  puntos: Punto[]
  series: Serie[]
  formato?: RbFormato
  ejes: { x: object; y: object }
  c: CromoGrafica
}) {
  const tick = (v: number) => formatEje(v, formato)
  const globo = <Tooltip cursor={{ fill: c.rejilla, opacity: 0.5 }} content={<Globo series={series} c={c} />} />
  const rejilla = <CartesianGrid stroke={c.rejilla} vertical={false} />

  if (tipo === 'barras_h') {
    const alto = Math.max(160, puntos.length * 26 * Math.max(1, series.length * 0.7) + 40)
    return (
      <div style={{ height: alto }}>
        <ResponsiveContainer>
          <BarChart data={puntos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap="22%" barGap={2}>
            <CartesianGrid stroke={c.rejilla} horizontal={false} />
            <XAxis type="number" tickFormatter={tick} {...ejes.x} />
            <YAxis type="category" dataKey="__x" {...ejes.y} width={140} tick={{ fill: c.tinta2, fontSize: 11 }} />
            {globo}
            {series.map((s) => <Bar key={s.clave} dataKey={s.clave} fill={s.color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const comun = { data: puntos, margin: { top: 8, right: 12, bottom: 4, left: 0 } }
  const ejeX = <XAxis dataKey="__x" {...ejes.x} interval="preserveStartEnd" minTickGap={12} />
  const ejeY = <YAxis tickFormatter={tick} {...ejes.y} />

  if (tipo === 'lineas') {
    return (
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart {...comun}>
            {rejilla}{ejeX}{ejeY}
            <Tooltip cursor={{ stroke: c.base }} content={<Globo series={series} c={c} />} />
            {series.map((s) => (
              <Line key={s.clave} type="monotone" dataKey={s.clave} stroke={s.color} strokeWidth={2} dot={puntos.length <= 2 ? { r: 4, fill: s.color, stroke: c.superficie, strokeWidth: 2 } : false}
                activeDot={{ r: 4, fill: s.color, stroke: c.superficie, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (tipo === 'area') {
    const apilar = series.length > 1 && series.every((s) => esSumable(s.formato))
    return (
      <div className="h-72">
        <ResponsiveContainer>
          <AreaChart {...comun}>
            {rejilla}{ejeX}{ejeY}
            <Tooltip cursor={{ stroke: c.base }} content={<Globo series={series} c={c} />} />
            {series.map((s) => (
              <Area key={s.clave} type="monotone" dataKey={s.clave} stackId={apilar ? 'a' : undefined} stroke={s.color} strokeWidth={2}
                fill={s.color} fillOpacity={apilar ? 0.55 : 0.18} activeDot={{ r: 4, fill: s.color, stroke: c.superficie, strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // barras / apiladas (verticales)
  const apilar = tipo === 'apiladas'
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <BarChart {...comun} barCategoryGap="22%" barGap={2}>
          {rejilla}{ejeX}{ejeY}
          {globo}
          {series.map((s, i) => (
            <Bar key={s.clave} dataKey={s.clave} stackId={apilar ? 'a' : undefined} fill={s.color}
              // Esquinas redondeadas solo en el extremo de la barra (el segmento de arriba si se apila)
              radius={!apilar || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke={apilar ? c.superficie : undefined} strokeWidth={apilar ? 1 : 0}
              maxBarSize={48} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
