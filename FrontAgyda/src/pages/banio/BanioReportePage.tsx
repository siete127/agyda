import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Clock } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'

// ── Configuración de tipos de pausa ──────────────────────────────────────────
const PAUSAS = [
  { statusId: 0,   label: 'Todas',           emoji: '📋', color: 'gray',   limiteMin: null,  acumulado: false },
  { statusId: 2,   label: 'Comida',          emoji: '🍽️', color: 'orange', limiteMin: 40,    acumulado: false },
  { statusId: 3,   label: 'Baño',            emoji: '🚻', color: 'blue',   limiteMin: 20,    acumulado: true  },
  { statusId: 5,   label: 'Capacitación',    emoji: '📚', color: 'purple', limiteMin: null,  acumulado: false },
  { statusId: 6,   label: 'Permiso',         emoji: '✋', color: 'green',  limiteMin: null,  acumulado: false },
] as const

// TI y AD tienen 60 min de comida; el resto 40 min
function getLimiteComida(area: string): number {
  return (area === 'TI' || area === 'AD') ? 60 : 40
}

// Colores por status_id
const STATUS_STYLES: Record<number, { bg: string; text: string; border: string; badge: string }> = {
  2: { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  badge: 'bg-orange-100 text-orange-700 border-orange-200'  },
  3: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    badge: 'bg-blue-100 text-blue-700 border-blue-200'        },
  5: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  badge: 'bg-purple-100 text-purple-700 border-purple-200'  },
  6: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200'},
}
const DEFAULT_STYLE = { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600 border-gray-200' }

const AREAS = [
  { value: '',   label: 'Todas las áreas' },
  { value: 'AD', label: 'Administración' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'CC', label: 'Call Center' },
  { value: 'CL', label: 'Clientes' },
]

interface PausaRecord {
  id: number
  usuarioId: number
  nombre: string
  usuario: string
  area: string
  statusId: number
  statusClave: string
  statusDesc: string
  entrada: string
  salida: string | null
  duracionSegundos: number
  activo: boolean
}

function fmt(seg: number): string {
  if (seg <= 0) return '0s'
  if (seg < 60) return `${seg}s`
  const m = Math.floor(seg / 60)
  const s = seg % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function badgeDuracion(seg: number, activo: boolean, limiteMin: number | null, esAcumulado = false, totalAcumSeg = 0) {
  if (activo) return 'bg-amber-100 text-amber-700 border-amber-200'
  const checkSeg = esAcumulado ? totalAcumSeg : seg
  if (limiteMin !== null && checkSeg > limiteMin * 60) return 'bg-red-100 text-red-700 border-red-200'
  if (limiteMin !== null && checkSeg > limiteMin * 60 * 0.75) return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
}

function localDateStr(d = new Date()) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function BanioReportePage() {
  const today = localDateStr()
  const [from,     setFrom]    = useState(today)
  const [to,       setTo]      = useState(today)
  const [buscar,   setBuscar]  = useState('')
  const [tabIdx,   setTabIdx]  = useState(0)
  const [area,     setArea]    = useState('')

  const pausaActiva = PAUSAS[tabIdx]

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pausas-reporte', from, to, pausaActiva.statusId, area],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to })
      if (pausaActiva.statusId) params.set('statusId', String(pausaActiva.statusId))
      if (area) params.set('area', area)
      const { data } = await api.get<{ success: boolean; data: PausaRecord[] }>(`/reports/banio?${params}`)
      return data.data ?? []
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const registros = (data ?? []).filter((r) =>
    buscar === ''
      || r.nombre.toLowerCase().includes(buscar.toLowerCase())
      || r.usuario.toLowerCase().includes(buscar.toLowerCase())
  )

  // Resumen por persona, con desglose por tipo de pausa
  const resumen: Record<number, {
    id: number; nombre: string; area: string; activo: boolean
    porTipo: Record<number, { visitas: number; totalSeg: number }>
  }> = {}
  for (const r of registros) {
    if (!resumen[r.usuarioId]) resumen[r.usuarioId] = { id: r.usuarioId, nombre: r.nombre, area: r.area, activo: false, porTipo: {} }
    if (!resumen[r.usuarioId].porTipo[r.statusId]) resumen[r.usuarioId].porTipo[r.statusId] = { visitas: 0, totalSeg: 0 }
    resumen[r.usuarioId].porTipo[r.statusId].visitas++
    resumen[r.usuarioId].porTipo[r.statusId].totalSeg += r.duracionSegundos
    if (r.activo) resumen[r.usuarioId].activo = true
  }
  const resumenList = Object.values(resumen)
    .sort((a, b) => {
      const totalA = Object.values(a.porTipo).reduce((s, t) => s + t.totalSeg, 0)
      const totalB = Object.values(b.porTipo).reduce((s, t) => s + t.totalSeg, 0)
      return totalB - totalA
    })

  const activos = registros.filter((r) => r.activo)

  // Totales generales
  const totalVisitas = registros.length
  const totalSeg = registros.filter(r => !r.activo).reduce((s, r) => s + r.duracionSegundos, 0)
  const promSeg = totalVisitas > 0 ? Math.round(totalSeg / registros.filter(r => !r.activo).length || 0) : 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Reporte de Pausas</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">Comida · Baño · Capacitación · Permiso</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs por tipo */}
      <div className="flex gap-1.5 flex-wrap">
        {PAUSAS.map((p, i) => (
          <button key={p.statusId} onClick={() => setTabIdx(i)}
            className={[
              'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[0.8rem] font-semibold border transition-all',
              tabIdx === i
                ? 'bg-brand text-white border-brand shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand/40 hover:text-brand',
            ].join(' ')}>
            <span>{p.emoji}</span>
            {p.label}
            {p.limiteMin !== null && tabIdx === i && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[0.68rem]">
                {p.acumulado ? `máx ${p.limiteMin}m/día` : `máx ${p.limiteMin}m`}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Límite info */}
      {pausaActiva.limiteMin !== null && (
        <div className={`rounded-xl border px-4 py-2.5 flex items-center gap-2.5 text-sm
          ${pausaActiva.color === 'orange' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
          <span className="text-lg">{pausaActiva.emoji}</span>
          <span>
            <strong>{pausaActiva.label}:</strong>{' '}
            {pausaActiva.acumulado
              ? `máximo ${pausaActiva.limiteMin} minutos acumulados por día`
              : `máximo ${pausaActiva.limiteMin} minutos por visita`}
            {' '}— <span className="font-semibold">en rojo</span> los que excedan el límite.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Área</label>
          <select value={area} onChange={(e) => setArea(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
            {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Buscar</label>
          <input type="text" placeholder="Nombre o usuario..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
      </div>

      {/* Cards de totales */}
      {registros.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4">
            <p className="text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wide">Visitas</p>
            <p className="text-2xl font-black text-gray-800 mt-1">{totalVisitas}</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4">
            <p className="text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wide">Tiempo total</p>
            <p className="text-2xl font-black text-gray-800 mt-1">{fmt(totalSeg)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4">
            <p className="text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wide">Promedio/visita</p>
            <p className="text-2xl font-black text-gray-800 mt-1">{promSeg > 0 ? fmt(promSeg) : '—'}</p>
          </div>
        </div>
      )}

      {/* Alerta activos */}
      {activos.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-xl mt-0.5">⏱️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Activos ahora</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {activos.map((r) => {
                const st = STATUS_STYLES[r.statusId] ?? DEFAULT_STYLE
                const pausa = PAUSAS.find(p => p.statusId === r.statusId)
                return (
                  <span key={r.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${st.badge}`}>
                    {pausa?.emoji} {r.nombre.split(' ').slice(0,2).join(' ')} · {fmt(r.duracionSegundos)}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Resumen por persona */}
      {resumenList.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">Resumen por colaborador</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {resumenList.map((r) => {
              const tipos = Object.entries(r.porTipo).map(([sid, data]) => {
                const pausa = PAUSAS.find(p => p.statusId === Number(sid)) ?? PAUSAS[0]
                const limiteEfectivo = pausa.statusId === 2 ? getLimiteComida(r.area) : pausa.limiteMin
                const excede = limiteEfectivo !== null && data.totalSeg > limiteEfectivo * 60
                const st = STATUS_STYLES[Number(sid)] ?? DEFAULT_STYLE
                return { pausa, limiteEfectivo, excede, st, ...data, statusId: Number(sid) }
              })
              const hayExcede = tipos.some(t => t.excede)
              return (
                <div key={r.id} className={`rounded-2xl border bg-white shadow-sm p-4 flex flex-col gap-2 ${hayExcede ? 'border-red-300' : 'border-gray-200/60'}`}>
                  <p className="text-[0.78rem] font-bold text-gray-800 leading-tight" title={r.nombre}>
                    {r.nombre.split(' ').slice(0,3).join(' ')}
                  </p>
                  {tipos.map((t) => (
                    <div key={t.statusId} className="flex flex-col gap-0.5">
                      <span className={`self-start inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${t.st.badge}`}>
                        {t.pausa.emoji} {t.pausa.label} · {t.visitas} {t.visitas === 1 ? 'visita' : 'visitas'}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-block rounded-lg border px-2 py-0.5 text-[0.72rem] font-bold ${t.excede ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {fmt(t.totalSeg)}
                        </span>
                        {t.limiteEfectivo !== null && (
                          <span className={`text-[0.65rem] font-medium ${t.excede ? 'text-red-500' : 'text-gray-400'}`}>
                            {t.excede ? `⚠️ +${fmt(t.totalSeg - t.limiteEfectivo * 60)} del límite` : `Límite: ${t.limiteEfectivo}m`}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Detalle de registros</h2>
          <span className="text-[0.72rem] text-gray-400">{registros.length} registro{registros.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : registros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <span className="text-4xl">📋</span>
            <p className="text-sm">Sin registros en este período</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Colaborador</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Área</th>
                  {pausaActiva.statusId === 0 && (
                    <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Tipo</th>
                  )}
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Entrada</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Salida</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Duración</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {registros.map((r) => {
                  const st  = STATUS_STYLES[r.statusId] ?? DEFAULT_STYLE
                  const pausa = PAUSAS.find(p => p.statusId === r.statusId) ?? PAUSAS[0]
                  // Para baño: comparar con total acumulado del usuario ese día
                  const totalAcumSeg = pausa.acumulado
                    ? registros.filter(x => x.usuarioId === r.usuarioId && !x.activo).reduce((s, x) => s + x.duracionSegundos, 0)
                    : r.duracionSegundos
                  const limiteEfectivoRow = pausa.statusId === 2 ? getLimiteComida(r.area) : pausa.limiteMin
                  const excede = limiteEfectivoRow !== null
                    && (pausa.acumulado ? totalAcumSeg : r.duracionSegundos) > limiteEfectivoRow * 60

                  return (
                    <tr key={r.id} className={`hover:bg-gray-50/60 transition-colors ${excede && !r.activo ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-[0.82rem] leading-tight">{r.nombre.split(' ').slice(0,3).join(' ')}</p>
                        <p className="text-[0.68rem] text-gray-400">{r.usuario}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">
                          {AREAS.find(a => a.value === r.area)?.label ?? r.area}
                        </span>
                      </td>
                      {pausaActiva.statusId === 0 && (
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold ${st.badge}`}>
                            {pausa.emoji} {pausa.label}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-[0.8rem] text-gray-600">{fmtFecha(r.entrada)}</td>
                      <td className="px-4 py-3 text-[0.8rem] text-gray-600 font-mono">{fmtHora(r.entrada)}</td>
                      <td className="px-4 py-3 text-[0.8rem] font-mono">
                        {r.activo
                          ? <span className="text-amber-500 font-semibold">Activo ⏱</span>
                          : <span className="text-gray-600">{fmtHora(r.salida!)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold
                          ${r.activo ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : excede ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                          {fmt(r.duracionSegundos)}{r.activo ? ' ⏱' : excede ? ' ⚠️' : ''}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
