import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronRight, Folder, FolderOpen, Megaphone, Users, BarChart2 } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { ccService } from '@/services/cc.service'
import { supervisoresService } from '@/services/supervisores.service'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { Spinner } from '@/components/ui/Spinner'
import { StatColumnDynamic } from '@/components/ventas/StatColumnDynamic'
import { RegistrosFormularioVista } from '@/pages/contact-center/RegistrosFormularioPage'
import type { CCCampania } from '@/types/cc.types'
import type { ProductividadAgente } from '@/types/supervisores.types'
import { REPORTES_CAMPANIA, type ReporteCampaniaId } from './reportesCampania'
import { useTemaGrafica } from './rbVisual'

// Carpeta "Campañas" del árbol de la Suite: un apartado por cada campaña
// activa, con sus reportes ya filtrados. Se arma solo con las campañas: al
// crear una aparece aquí sin configurar nada.
export function CarpetaCampanias({ campanias, seleccion, onSeleccionar }: {
  campanias: CCCampania[]
  seleccion: { campaniaId: number; reporte: ReporteCampaniaId } | null
  onSeleccionar: (campaniaId: number, reporte: ReporteCampaniaId) => void
}) {
  const [abierta, setAbierta] = useState(true)
  const [abiertas, setAbiertas] = useState<Record<number, boolean>>(() => (seleccion ? { [seleccion.campaniaId]: true } : {}))
  if (!campanias.length) return null

  return (
    <div>
      <button onClick={() => setAbierta((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[0.8rem] font-semibold text-ink-secondary hover:bg-white">
        <ChevronRight className={clsx('h-3.5 w-3.5 flex-shrink-0 text-ink-tertiary transition-transform', abierta && 'rotate-90')} />
        {abierta ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-violet-500" /> : <Folder className="h-4 w-4 flex-shrink-0 text-violet-500" />}
        <span className="truncate">Campañas</span>
        <span className="ml-auto rounded-full bg-gray-200 px-1.5 text-[0.6rem] font-bold text-ink-tertiary">{campanias.length}</span>
      </button>
      {abierta && campanias.map((c) => {
        const abiertaC = abiertas[c.id] ?? false
        return (
          <div key={c.id}>
            <button onClick={() => setAbiertas((p) => ({ ...p, [c.id]: !abiertaC }))}
              className="flex w-full items-center gap-1.5 py-1.5 pl-7 pr-3 text-left text-[0.78rem] font-medium text-ink-secondary hover:bg-white">
              <ChevronRight className={clsx('h-3 w-3 flex-shrink-0 text-ink-tertiary transition-transform', abiertaC && 'rotate-90')} />
              <Megaphone className="h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <span className="truncate">{c.nombre}</span>
            </button>
            {abiertaC && REPORTES_CAMPANIA.map((r) => {
              const activo = seleccion?.campaniaId === c.id && seleccion.reporte === r.id
              return (
                <button key={r.id} onClick={() => onSeleccionar(c.id, r.id)}
                  className={clsx(
                    'flex w-full items-center gap-2 py-1.5 pl-12 pr-3 text-left text-[0.76rem] transition',
                    activo ? 'bg-brand/10 font-semibold text-brand' : 'text-ink-secondary hover:bg-white',
                  )}>
                  <r.icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{r.nombre}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Encabezado común de los reportes de una campaña.
export function EncabezadoCampania({ campania, reporte }: { campania: CCCampania | undefined; reporte: ReporteCampaniaId }) {
  const r = REPORTES_CAMPANIA.find((x) => x.id === reporte)
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-gray-100 pb-3">
      <Megaphone className="h-4 w-4 text-violet-500" />
      <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-ink-tertiary">Campaña</span>
      <span className="text-sm font-bold text-ink">{campania?.nombre ?? '—'}</span>
      {r && <span className="text-[0.75rem] text-ink-tertiary">· {r.nombre}</span>}
    </div>
  )
}

// Registros del formulario, acotado a los formularios asignados a la campaña.
// En una campaña de ventas, arriba van sus barras por asesor y estatus.
export function RegistrosDeCampania({ campaniaId }: { campaniaId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cc-campania-formularios', campaniaId],
    queryFn: () => ccService.getFormulariosDeCampania(campaniaId),
  })
  if (isLoading) return <div className="flex justify-center py-10"><Spinner /></div>
  const ids = (data?.formularios ?? []).map((f) => f.id)
  return (
    <div className="space-y-5">
      <BarrasVentasPorAgente campaniaId={campaniaId} conSelectorFecha />
      {ids.length
        ? <RegistrosFormularioVista formularioIds={ids} />
        : <p className="text-sm text-ink-tertiary">Esta campaña no tiene formularios asignados.</p>}
    </div>
  )
}

/* ══════════ Barras por asesor y estatus (mismo diseño que Ventas) ══════════ */

const PERIODOS_BARRAS = [
  { id: 'day', titulo: 'Diarias' },
  { id: 'week', titulo: 'Semanales' },
  { id: 'month', titulo: 'Mensuales' },
] as const
const fechaLarga = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', o)
function subtituloPeriodo(periodo: 'day' | 'week' | 'month', desde: string, hasta: string) {
  if (periodo === 'day') return fechaLarga(desde, { day: 'numeric', month: 'long', year: 'numeric' })
  if (periodo === 'week') return `del ${fechaLarga(desde, { day: '2-digit', month: 'long' })} al ${fechaLarga(hasta, { day: '2-digit', month: 'long', year: 'numeric' })}`
  return fechaLarga(desde, { month: 'long', year: 'numeric' })
}

// Diarias / Semanales / Mensuales de una campaña de ventas: una barra por
// asesor apilada por estatus (StatColumnDynamic, la misma gráfica de Ventas),
// del día, la semana y el mes de `fecha`. Carrusel: se ve una tarjeta a la
// vez a todo lo ancho; al elegir otra, la anterior se oculta. No pinta nada
// si la campaña no es de ventas.
export function BarrasVentasPorAgente({ campaniaId, fecha: fechaFija, conSelectorFecha = false, alto = 420 }: {
  campaniaId: number
  fecha?: string
  conSelectorFecha?: boolean
  alto?: number
}) {
  const [fechaPropia, setFechaPropia] = useState(hoyLocal())
  const [conAgendadas, setConAgendadas] = useState(false)
  const [actual, setActual] = useState(0)
  const [direccion, setDireccion] = useState<1 | -1>(1)
  const fecha = fechaFija ?? fechaPropia
  const tarjeta = useRef<HTMLDivElement>(null)
  const primera = useRef(true)
  // La tarjeta nueva entra deslizándose desde el lado hacia el que se avanzó.
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    tarjeta.current?.animate(
      [{ opacity: 0, transform: `translateX(${direccion * 40}px)` }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
  }, [actual, direccion])
  const irA = (i: number) => {
    const n = (i + PERIODOS_BARRAS.length) % PERIODOS_BARRAS.length
    if (n === actual) return
    setDireccion(i > actual ? 1 : -1)
    setActual(n)
  }
  const consultas = useQueries({
    queries: PERIODOS_BARRAS.map((p) => ({
      queryKey: ['suite-ventas-por-agente', campaniaId, p.id, fecha],
      queryFn: () => reporteDiarioService.getVentasPorAgente(campaniaId, { periodo: p.id, fecha }),
    })),
  })
  const cargando = consultas.some((q) => q.isLoading)
  if (!cargando && consultas.every((q) => q.data == null)) return null
  const hayAgendadas = consultas.some((q) => (q.data?.totalesPorEstatus?.['Agendada'] ?? 0) > 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><BarChart2 className="h-4 w-4 text-brand" /> Ventas por asesor y estatus</h3>
          <p className="text-[0.72rem] text-ink-tertiary">Día, semana y mes{conSelectorFecha ? '' : ' de la fecha consultada'} · BD de Ventas</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hayAgendadas && (
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-xl border border-gray-200 bg-card px-3 py-2 text-[0.8rem] font-medium text-ink-secondary shadow-sm hover:bg-gray-50">
              <input type="checkbox" checked={conAgendadas} onChange={(e) => setConAgendadas(e.target.checked)} className="h-3.5 w-3.5 rounded accent-blue-500" />
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#3b82f6' }} /> Agendadas
            </label>
          )}
          {conSelectorFecha && (
            <input type="date" className="field w-auto" value={fechaPropia} max={hoyLocal()} onChange={(e) => setFechaPropia(e.target.value || hoyLocal())} aria-label="Fecha" />
          )}
        </div>
      </div>
      {/* Selector del carrusel: una pestaña por periodo con su total, y flechas */}
      <div className="flex items-center gap-2">
        <button onClick={() => irA(actual - 1)} aria-label="Anterior"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-card text-ink-secondary shadow-sm transition hover:border-brand/40 hover:text-brand">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <div className="grid flex-1 grid-cols-3 gap-2" role="tablist" aria-label="Periodo">
          {PERIODOS_BARRAS.map((p, i) => {
            const q = consultas[i]
            const tot = q.data ? Object.entries(q.data.totalesPorEstatus)
              .filter(([k]) => conAgendadas || k !== 'Agendada')
              .reduce((s, [, v]) => s + v, 0) : null
            const sel = i === actual
            return (
              <button key={p.id} role="tab" aria-selected={sel} onClick={() => irA(i)}
                className={clsx('rounded-xl border px-3 py-2 text-left transition',
                  sel ? 'border-brand bg-brand text-white shadow-md' : 'border-gray-200 bg-card text-ink-secondary hover:border-brand/40 hover:text-ink')}>
                <span className="block text-[0.8rem] font-bold">{p.titulo}</span>
                <span className={clsx('block truncate text-[0.68rem]', sel ? 'text-white/80' : 'text-ink-tertiary')}>
                  {q.isLoading ? 'Cargando…' : `${tot ?? 0} registros${q.data ? ` · ${subtituloPeriodo(p.id, q.data.desde, q.data.hasta)}` : ''}`}
                </span>
              </button>
            )
          })}
        </div>
        <button onClick={() => irA(actual + 1)} aria-label="Siguiente"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-card text-ink-secondary shadow-sm transition hover:border-brand/40 hover:text-brand">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Solo la tarjeta elegida; las otras quedan ocultas */}
      {(() => {
        const p = PERIODOS_BARRAS[actual]
        const q = consultas[actual]
        return (
          <div key={p.id} ref={tarjeta}>
            <StatColumnDynamic
              title={p.titulo}
              subtitle={q.data ? subtituloPeriodo(p.id, q.data.desde, q.data.hasta) : ''}
              data={q.data ?? undefined}
              isLoading={q.isLoading}
              hideAgendada={!conAgendadas}
              alto={alto}
            />
          </div>
        )
      })()}
      <div className="flex justify-center gap-1.5">
        {PERIODOS_BARRAS.map((p, i) => (
          <button key={p.id} onClick={() => irA(i)} aria-label={p.titulo}
            className={clsx('h-1.5 rounded-full transition-all', i === actual ? 'w-6 bg-brand' : 'w-1.5 bg-gray-300 hover:bg-gray-400')} />
        ))}
      </div>
    </div>
  )
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ESTADO_LABEL: Record<string, { txt: string; cls: string }> = {
  disponible: { txt: 'Disponible', cls: 'bg-emerald-100 text-emerald-700' },
  pausa: { txt: 'En pausa', cls: 'bg-amber-100 text-amber-700' },
  no_disponible: { txt: 'No disponible', cls: 'bg-gray-100 text-gray-600' },
  desconectado: { txt: 'Desconectado', cls: 'bg-gray-100 text-gray-400' },
}
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`)
const fmtDinero = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }))
const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
// Cumplimiento: el número siempre va escrito; el color solo lo refuerza.
const tonoCumplimiento = (v: number | null | undefined) =>
  v == null ? 'text-ink-tertiary' : v >= 100 ? 'text-emerald-600' : v >= 70 ? 'text-amber-600' : 'text-red-600'

function Tarjeta({ label, valor, detalle }: { label: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-ink">{valor}</p>
      {detalle && <p className="text-[0.7rem] text-ink-tertiary">{detalle}</p>}
    </div>
  )
}

// Productividad del día de los agentes de la campaña (sus skills y, si el
// grupo es de marcador, sus miembros): atenciones cerradas, minutos de pausa
// y estado actual. En una campaña de ventas, además, sus ventas del día
// contra la meta (Metas, o la sugerida por la pre nómina) y la quincena
// contra lo que pide la pre nómina.
export function ProductividadCampaniaView({ campaniaId }: { campaniaId: number }) {
  const [fecha, setFecha] = useState(hoyLocal())
  const { data = [], isLoading } = useQuery({
    queryKey: ['suite-productividad-campania', campaniaId, fecha],
    queryFn: () => supervisoresService.getProductividad(fecha, campaniaId),
    refetchInterval: fecha === hoyLocal() ? 60_000 : false,
  })
  const conVentas = data.some((a) => a.ventas)
  const camp = data.find((a) => a.ventas)?.ventas?.campana
  const filas = [...data].sort((a, b) =>
    (conVentas ? (b.ventas?.contadasDia ?? 0) - (a.ventas?.contadasDia ?? 0) : 0)
    || (b.atenciones ?? 0) - (a.atenciones ?? 0) || a.nombre.localeCompare(b.nombre))
  const totAtenciones = filas.reduce((s, a) => s + (a.atenciones ?? 0), 0)
  const totPausa = filas.reduce((s, a) => s + a.totalPausaMin, 0)
  const totVentas = filas.reduce((s, a) => s + (a.ventas?.contadasDia ?? 0), 0)
  const totMeta = filas.reduce((s, a) => s + (a.ventas?.metaDia ?? 0), 0)
  const columnas = conVentas ? 11 : 9

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><Users className="h-4 w-4 text-brand" /> Productividad de agentes</h2>
          <p className="text-xs text-gray-500">
            {conVentas
              ? `Agentes de la campaña: ventas del día en ${camp?.nombre ?? 'Ventas'} contra su meta, quincena contra la pre nómina y pausas.`
              : 'Agentes de la campaña: atenciones cerradas en ella y minutos en pausa del día.'}
          </p>
        </div>
        <div className="ml-auto">
          <label className="mb-1 block text-[0.68rem] text-ink-secondary">Fecha</label>
          <input type="date" className="field" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value || hoyLocal())} />
        </div>
      </div>

      <div className={clsx('grid gap-3', conVentas ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-3')}>
        <Tarjeta label="Agentes" valor={filas.length} />
        {conVentas && (
          <>
            <Tarjeta label="Ventas del día" valor={totVentas} detalle={totMeta ? `Meta ${totMeta}` : 'Sin meta'} />
            <Tarjeta label="Cumplimiento del día" valor={<span className={tonoCumplimiento(totMeta ? (totVentas / totMeta) * 100 : null)}>{fmtPct(totMeta ? Math.round((totVentas / totMeta) * 1000) / 10 : null)}</span>} />
            <Tarjeta
              label="Quincena vs pre nómina"
              valor={camp?.necesariasQuincena != null ? `${camp.pagablesQuincena} / ${camp.necesariasQuincena}` : camp?.pagablesQuincena ?? 0}
              detalle={camp ? `${fmtDia(camp.quincena.desde)} – ${fmtDia(camp.quincena.hasta)}${camp.necesariasQuincena == null ? ' · campaña sin configurar en Nómina' : ' · ventas pagables / necesarias'}` : undefined}
            />
          </>
        )}
        {!conVentas && <Tarjeta label="Atenciones cerradas" valor={totAtenciones} />}
        <Tarjeta label="Tiempo total en pausa" valor={fmtMin(totPausa)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-left text-[0.78rem]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
              <th className="px-3 py-2.5">Agente</th>
              <th className="px-3 py-2.5">Estado</th>
              {conVentas ? (
                <>
                  <th className="px-3 py-2.5 text-right" title="Ventas contadas (estatus que cuentan en Metas) / registros del día">Ventas hoy</th>
                  <th className="px-3 py-2.5 text-right">Meta hoy</th>
                  <th className="px-3 py-2.5 text-right">Cumplimiento</th>
                  <th className="px-3 py-2.5 text-right" title="Ventas que paga Nómina en la quincena / mínimas de la pre nómina para cubrir su sueldo">Quincena</th>
                  <th className="px-3 py-2.5 text-right" title="Ventas pagables × comisión de la campaña en Nómina">Comisión est.</th>
                  <th className="px-3 py-2.5 text-right">Atenciones</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5 text-right">Atenciones</th>
                  <th className="px-3 py-2.5 text-right">Baño</th>
                  <th className="px-3 py-2.5 text-right">Comida</th>
                  <th className="px-3 py-2.5 text-right">Capacitación</th>
                  <th className="px-3 py-2.5 text-right">Permiso</th>
                </>
              )}
              <th className="px-3 py-2.5 text-right">Pausa total</th>
              <th className="px-3 py-2.5 text-right">Prom. 7 días</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columnas} className="py-10"><div className="flex justify-center"><Spinner /></div></td></tr>
            ) : filas.length === 0 ? (
              <tr><td colSpan={columnas} className="py-10 text-center text-ink-tertiary">La campaña no tiene agentes en sus grupos ni en sus skills.</td></tr>
            ) : filas.map((a) => {
              const est = ESTADO_LABEL[a.estado] ?? { txt: a.estado, cls: 'bg-gray-100 text-gray-600' }
              const excede = a.avgSemanalMin != null && a.totalPausaMin > a.avgSemanalMin * 1.25 && a.totalPausaMin - a.avgSemanalMin >= 10
              const desglosePausa = `Baño ${fmtMin(a.banio)} · Comida ${fmtMin(a.comida)} · Capacitación ${fmtMin(a.capacitacion)} · Permiso ${fmtMin(a.permiso)}`
              return (
                <tr key={a.agenteId} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{a.nombre}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.66rem] font-semibold', est.cls)}>
                      {est.txt}{a.estado === 'pausa' && a.tipoPausa ? ` · ${a.tipoPausa}` : ''}
                    </span>
                  </td>
                  {conVentas ? <CeldasVentas a={a} /> : (
                    <>
                      <td className="px-3 py-2 text-right font-semibold text-ink">{a.atenciones ?? 0}</td>
                      <td className="px-3 py-2 text-right">{fmtMin(a.banio)}</td>
                      <td className="px-3 py-2 text-right">{fmtMin(a.comida)}</td>
                      <td className="px-3 py-2 text-right">{fmtMin(a.capacitacion)}</td>
                      <td className="px-3 py-2 text-right">{fmtMin(a.permiso)}</td>
                    </>
                  )}
                  <td className={clsx('px-3 py-2 text-right font-semibold', excede ? 'text-red-600' : 'text-ink')}
                    title={[conVentas ? desglosePausa : '', excede ? 'Más de lo que acostumbra (promedio de 7 días)' : ''].filter(Boolean).join('\n') || undefined}>
                    {fmtMin(a.totalPausaMin)}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-tertiary">{a.avgSemanalMin != null ? fmtMin(a.avgSemanalMin) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {conVentas && camp && (
        <p className="text-[0.7rem] leading-relaxed text-ink-tertiary">
          <b>Meta hoy</b>: la capturada en Metas para el asesor; si no tiene, la sugerida por la pre nómina (sus ventas mínimas de la quincena entre los días hábiles).{' '}
          <b>Quincena</b>: ventas que paga Nómina (Aprobada / Formalizado) del {fmtDia(camp.quincena.desde)} a la fecha, contra las mínimas para que su aporte cubra su sueldo
          {camp.preNominaBase ? ` (pre nómina con base en la quincena ${fmtDia(camp.preNominaBase.fechaInicio)} – ${fmtDia(camp.preNominaBase.fechaFin)})` : ''}.
          Los agentes se ligan a su usuario de Ventas por nombre, como en Nómina.
        </p>
      )}
    </div>
  )
}

function CeldasVentas({ a }: { a: ProductividadAgente }) {
  const v = a.ventas
  if (!v || !v.ligadoAVentas) {
    return (
      <>
        <td colSpan={5} className="px-3 py-2 text-right text-[0.72rem] text-ink-tertiary">Sin usuario ni ventas en la BD de Ventas</td>
        <td className="px-3 py-2 text-right font-semibold text-ink">{a.atenciones ?? 0}</td>
      </>
    )
  }
  const falta = v.minimasQuincena != null && v.pagablesQuincena < v.minimasQuincena
  return (
    <>
      <td className="px-3 py-2 text-right">
        <span className="font-semibold text-ink">{v.contadasDia}</span>
        <span className="text-ink-tertiary"> / {v.totalDia}</span>
      </td>
      <td className="px-3 py-2 text-right">
        {v.metaDia ?? '—'}
        {v.metaOrigen === 'pre_nomina' && <span className="ml-1 rounded bg-gray-100 px-1 text-[0.6rem] font-semibold text-ink-tertiary" title="Sin meta en Metas: sugerida por la pre nómina">sugerida</span>}
      </td>
      <td className={clsx('px-3 py-2 text-right font-semibold', tonoCumplimiento(v.cumplimientoDia))}>{fmtPct(v.cumplimientoDia)}</td>
      <td className="px-3 py-2 text-right">
        <span className={clsx('font-semibold', falta ? 'text-amber-600' : 'text-ink')}>{v.pagablesQuincena}</span>
        <span className="text-ink-tertiary"> / {v.minimasQuincena ?? '—'}</span>
      </td>
      <td className="px-3 py-2 text-right text-ink-secondary">{fmtDinero(v.comisionEstimada)}</td>
      <td className="px-3 py-2 text-right font-semibold text-ink">{a.atenciones ?? 0}</td>
    </>
  )
}

/* ══════════ Reporte ejecutivo de una campaña ══════════ */

// Si el grupo de la campaña tiene campaña de Ventas, el reporte ejecutivo es
// el de ventas; si no, el de reclutamiento (`reclutamiento`).
export function ReporteEjecutivoCampania({ campaniaId, reclutamiento }: { campaniaId: number; reclutamiento: ReactNode }) {
  const { data: contexto, isLoading } = useQuery({
    queryKey: ['suite-campania-contexto', campaniaId],
    queryFn: () => reporteDiarioService.getContextoReportesCampania(campaniaId),
    staleTime: 5 * 60_000,
  })
  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!contexto?.ventas) return <>{reclutamiento}</>
  return <ReporteEjecutivoVentasView campaniaId={campaniaId} />
}

function ReporteEjecutivoVentasView({ campaniaId }: { campaniaId: number }) {
  const [desde, setDesde] = useState(() => `${hoyLocal().slice(0, 8)}01`)
  const [hasta, setHasta] = useState(hoyLocal())
  const { data, isLoading } = useQuery({
    queryKey: ['suite-ejecutivo-ventas', campaniaId, desde, hasta],
    queryFn: () => reporteDiarioService.getReporteEjecutivoVentas(campaniaId, { desde, hasta }),
  })
  const { series, c } = useTemaGrafica()
  const colorVentas = series[0]

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!data) return <p className="text-sm text-ink-tertiary">La campaña no tiene campaña de Ventas en sus grupos.</p>

  const ind = data.indicadores
  const pre = data.preNomina
  const avancePre = pre?.ventasNecesarias ? Math.min(100, Math.round((pre.ventasQuincena / pre.ventasNecesarias) * 100)) : null
  const puntos = data.porDia.map((d) => ({ ...d, etiqueta: fmtDia(d.dia) }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink"><BarChart2 className="h-4 w-4 text-brand" /> Reporte ejecutivo · {data.campana.nombre}</h2>
          <p className="text-xs text-gray-500">
            De la BD de Ventas (histórico + lo capturado en AGYDA). Cuenta como venta: {data.estatusContados.join(', ') || '—'}.
          </p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="mb-1 block text-[0.68rem] text-ink-secondary">Desde</label>
            <input type="date" className="field" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[0.68rem] text-ink-secondary">Hasta</label>
            <input type="date" className="field" value={hasta} min={desde} max={hoyLocal()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tarjeta label="Registros" valor={ind.total.toLocaleString('es-MX')} detalle={`${ind.asesores} asesores`} />
        <Tarjeta label="Ventas" valor={ind.contadas.toLocaleString('es-MX')} />
        <Tarjeta label="Conversión" valor={fmtPct(ind.conversion)} detalle="Ventas / registros" />
        <Tarjeta
          label="Cumplimiento de meta"
          valor={<span className={tonoCumplimiento(ind.cumplimiento)}>{fmtPct(ind.cumplimiento)}</span>}
          detalle={ind.meta ? `Meta ${ind.meta.toLocaleString('es-MX')} (${ind.metaDeEquipo ? 'de campaña' : 'suma por asesor'})` : 'Sin metas en el rango'}
        />
        <Tarjeta label="Capturados en AGYDA" valor={ind.capturadasAgyda.toLocaleString('es-MX')} detalle="Desde el formulario del grupo" />
      </div>

      {pre && (
        <div className="card p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">Quincena contra la pre nómina</h3>
            <span className="text-[0.7rem] text-ink-tertiary">
              Quincena {fmtDia(pre.quincena.desde)} – {fmtDia(pre.quincena.hasta)} · base {fmtDia(pre.base.fechaInicio)} – {fmtDia(pre.base.fechaFin)}
            </span>
          </div>
          {!pre.configurada ? (
            <p className="text-xs text-ink-tertiary">Esta campaña de Ventas no está configurada en Nómina (campañas de nómina), así que la pre nómina no le asigna ventas necesarias.</p>
          ) : (
            <>
              <p className="text-sm text-ink">
                <b>{pre.ventasQuincena}</b> ventas pagables de <b>{pre.ventasNecesarias ?? '—'}</b> que necesita esta campaña para cubrir la nómina.
              </p>
              {avancePre != null && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={avancePre} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full" style={{ width: `${avancePre}%`, background: colorVentas }} />
                </div>
              )}
              <p className="mt-2 text-[0.72rem] text-ink-tertiary">
                Comisión por venta {fmtDinero(pre.comisionPorVenta)} · ganancia neta por venta {fmtDinero(pre.gananciaPorVenta)}
                {pre.ventasSoloEstaCampana != null && ` · si solo se vendiera esta campaña harían falta ${pre.ventasSoloEstaCampana}`}
              </p>
            </>
          )}
        </div>
      )}

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">Embudo por estatus</h3>
        {data.embudo.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-tertiary">Sin registros en este rango</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {data.embudo.map((e) => (
              <div key={e.estatus} className="rounded-xl border border-gray-100 p-3" style={{ borderTopColor: e.color ?? c.base, borderTopWidth: 3 }}>
                <p className="truncate text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">{e.estatus}</p>
                <p className="text-lg font-bold text-ink">{e.cantidad.toLocaleString('es-MX')} <span className="text-xs font-medium text-ink-tertiary">| {fmtPct(e.porcentaje)}</span></p>
                {e.cuentaComoVenta && <p className="text-[0.62rem] font-semibold text-emerald-600">Cuenta como venta</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-1 text-sm font-bold text-ink">Por día</h3>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-ink-secondary">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.base }} /> Registros</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorVentas }} /> Ventas</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: c.tinta2 }} /> Meta</span>
        </div>
        {puntos.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-tertiary">Sin datos</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={puntos} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={c.rejilla} />
                <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: c.eje }} axisLine={{ stroke: c.base }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: c.eje }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: c.rejilla, opacity: 0.4 }}
                  contentStyle={{ background: c.superficie, border: `1px solid ${c.borde}`, borderRadius: 8, fontSize: 12, color: c.tinta }}
                  formatter={(valor, nombre) => [valor as number, nombre === 'total' ? 'Registros' : nombre === 'contadas' ? 'Ventas' : 'Meta']}
                />
                <Bar dataKey="total" fill={c.base} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="contadas" fill={colorVentas} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line dataKey="meta" type="stepAfter" stroke={c.tinta2} strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">Por asesor</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.78rem]">
            <thead>
              <tr className="border-b border-gray-100 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <th className="px-3 py-2">Asesor</th>
                <th className="px-3 py-2 text-right">Registros</th>
                <th className="px-3 py-2 text-right">Ventas</th>
                <th className="px-3 py-2 text-right">Conversión</th>
                <th className="px-3 py-2 text-right">Meta del rango</th>
                <th className="px-3 py-2 text-right">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {data.asesores.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-tertiary">Sin asesores con registros en este rango</td></tr>
              ) : data.asesores.map((a) => (
                <tr key={`${a.asesorId ?? ''}-${a.nombre}`} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{a.nombre}</td>
                  <td className="px-3 py-2 text-right text-ink-secondary">{a.total}</td>
                  <td className="px-3 py-2 text-right font-semibold text-ink">{a.contadas}</td>
                  <td className="px-3 py-2 text-right text-ink-secondary">{fmtPct(a.conversion)}</td>
                  <td className="px-3 py-2 text-right text-ink-secondary">{a.meta ?? '—'}</td>
                  <td className={clsx('px-3 py-2 text-right font-semibold', tonoCumplimiento(a.cumplimiento))}>{fmtPct(a.cumplimiento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
