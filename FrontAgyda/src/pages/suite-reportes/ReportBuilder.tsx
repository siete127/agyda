import { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Database, Play, Save, Download, Table2, SlidersHorizontal, Check, ArrowUpDown,
  Rows3, Columns3, Loader2, AlertTriangle, X, Filter,
} from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { getApiError } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { formatValor, descargarCsv } from './rbFormat'
import type {
  RbOrigen, RbDefinicion, RbFiltroValor, RbResultado, RbFiltroDef,
} from '@/types/reporteDiario.types'

function hoy() { return new Date().toISOString().slice(0, 10) }
function hace30() { return new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) }

interface Props {
  // Definición inicial (al abrir un reporte guardado); si no, arranca vacío
  definicionInicial?: RbDefinicion
  nombreInicial?: string
  onGuardar?: (def: RbDefinicion, origen: string) => void
  guardarLabel?: string
}

export function ReportBuilder({ definicionInicial, nombreInicial, onGuardar, guardarLabel = 'Guardar reporte' }: Props) {
  const { data: catalogo, isLoading: cargandoCat } = useQuery({
    queryKey: ['rb-catalogo'],
    queryFn: () => reporteDiarioService.builderCatalogo(),
    staleTime: 10 * 60_000,
  })

  const [origenId, setOrigenId] = useState(definicionInicial?.origen ?? '')
  const [dimensiones, setDimensiones] = useState<string[]>(definicionInicial?.dimensiones ?? [])
  const [metricas, setMetricas] = useState<string[]>(definicionInicial?.metricas ?? [])
  const [filtros, setFiltros] = useState<RbFiltroValor[]>(definicionInicial?.filtros ?? [])
  const [orden, setOrden] = useState<{ campo: string; dir: 'asc' | 'desc' } | undefined>(definicionInicial?.orden)
  const [limite, setLimite] = useState(definicionInicial?.limite ?? 500)
  const [resultado, setResultado] = useState<RbResultado | null>(null)

  const origen: RbOrigen | undefined = catalogo?.origenes[origenId]

  // Al cambiar de origen, resetear selección (salvo que venga de una definición cargada)
  function elegirOrigen(id: string) {
    setOrigenId(id)
    setResultado(null)
    const o = catalogo?.origenes[id]
    if (!o) return
    setDimensiones([])
    setMetricas(o.metricas.slice(0, 1).map((m) => m.id))
    setOrden(undefined)
    // pre-cargar filtros "por defecto" (rango de fechas)
    setFiltros(
      o.filtros.filter((f) => f.porDefecto && f.tipo === 'fecha_rango').map((f) => ({ id: f.id, desde: hace30(), hasta: hoy() })),
    )
  }

  const def: RbDefinicion = useMemo(
    () => ({ origen: origenId, dimensiones, metricas, filtros, orden, limite }),
    [origenId, dimensiones, metricas, filtros, orden, limite],
  )

  const ejecutar = useMutation({
    mutationFn: () => reporteDiarioService.builderEjecutar(def),
    onSuccess: (r) => setResultado(r),
    onError: (e) => toast.error(getApiError(e)),
  })

  const puedeEjecutar = origenId && metricas.length > 0

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  const filtrosActivos = new Set(filtros.map((f) => f.id))
  const agregarFiltro = (fdef: RbFiltroDef) => {
    if (filtrosActivos.has(fdef.id)) return
    const base: RbFiltroValor =
      fdef.tipo === 'fecha_rango' ? { id: fdef.id, desde: hace30(), hasta: hoy() }
      : fdef.tipo === 'enum' || fdef.tipo === 'id_lista' ? { id: fdef.id, valores: [] }
      : { id: fdef.id, valor: '' }
    setFiltros([...filtros, base])
  }
  const quitarFiltro = (id: string) => setFiltros(filtros.filter((f) => f.id !== id))
  const setFiltro = (id: string, patch: Partial<RbFiltroValor>) =>
    setFiltros(filtros.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  if (cargandoCat || !catalogo) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Database className="h-4.5 w-4.5 text-brand" /> Constructor de reportes
        </h2>
        <p className="text-xs text-gray-500">Arma un reporte con variables del sistema — tiempos de agentes, interacciones, llamadas y más.</p>
      </div>

      {/* Paso 1 — Origen */}
      <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[0.6rem] font-bold text-white">1</span>
          Origen de datos
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(catalogo.origenes).map((o) => (
            <button
              key={o.id}
              onClick={() => elegirOrigen(o.id)}
              className={clsx(
                'rounded-lg border p-2.5 text-left transition',
                origenId === o.id ? 'border-brand bg-brand/10' : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <p className={clsx('text-[0.8rem] font-semibold', origenId === o.id ? 'text-brand' : 'text-ink')}>{o.label}</p>
              <p className="mt-0.5 text-[0.68rem] leading-snug text-ink-tertiary">{o.descripcion}</p>
            </button>
          ))}
        </div>
      </section>

      {origen && (
        <>
          {/* Paso 2 — Campos */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <Rows3 className="h-3.5 w-3.5" /> Agrupar por (dimensiones)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {origen.dimensiones.map((d) => {
                  const on = dimensiones.includes(d.id)
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggle(dimensiones, setDimensiones, d.id)}
                      className={clsx(
                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition',
                        on ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                      )}
                    >
                      {on && <Check className="h-3 w-3" />} {d.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[0.68rem] text-ink-tertiary">Sin dimensiones = una sola fila con los totales.</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <Columns3 className="h-3.5 w-3.5" /> Métricas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {origen.metricas.map((m) => {
                  const on = metricas.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(metricas, setMetricas, m.id)}
                      className={clsx(
                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition',
                        on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                      )}
                    >
                      {on && <Check className="h-3 w-3" />} {m.label}
                    </button>
                  )
                })}
              </div>
              {metricas.length === 0 && <p className="mt-2 text-[0.68rem] text-amber-600">Elige al menos una métrica.</p>}
            </div>
          </section>

          {/* Paso 3 — Filtros */}
          <section className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <Filter className="h-3.5 w-3.5" /> Filtros
              </p>
              <div className="flex flex-wrap gap-1">
                {origen.filtros.filter((f) => !filtrosActivos.has(f.id)).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => agregarFiltro(f)}
                    className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[0.68rem] font-semibold text-ink-tertiary hover:border-brand hover:text-brand"
                  >
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filtros.length === 0 ? (
              <p className="text-[0.72rem] text-ink-tertiary">Sin filtros — se usa el rango de los últimos 30 días por defecto.</p>
            ) : (
              <div className="space-y-2">
                {filtros.map((fv) => {
                  const fdef = origen.filtros.find((x) => x.id === fv.id)
                  if (!fdef) return null
                  return (
                    <FiltroRow
                      key={fv.id}
                      fdef={fdef}
                      valor={fv}
                      onChange={(patch) => setFiltro(fv.id, patch)}
                      onQuitar={() => quitarFiltro(fv.id)}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* Paso 4 — Orden + límite + ejecutar */}
          <section className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Ordenar por</label>
              <div className="flex items-center gap-1">
                <select
                  className="field"
                  value={orden?.campo ?? ''}
                  onChange={(e) => setOrden(e.target.value ? { campo: e.target.value, dir: orden?.dir ?? 'desc' } : undefined)}
                >
                  <option value="">(automático)</option>
                  {[...dimensiones, ...metricas].map((id) => {
                    const label =
                      origen.dimensiones.find((d) => d.id === id)?.label ??
                      origen.metricas.find((m) => m.id === id)?.label ?? id
                    return <option key={id} value={id}>{label}</option>
                  })}
                </select>
                <button
                  onClick={() => setOrden(orden ? { ...orden, dir: orden.dir === 'asc' ? 'desc' : 'asc' } : undefined)}
                  disabled={!orden}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[0.7rem] font-semibold text-ink-secondary disabled:opacity-40"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" /> {orden?.dir === 'asc' ? 'Asc' : 'Desc'}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Máx. filas</label>
              <input
                type="number" min={1} max={5000} value={limite}
                onChange={(e) => setLimite(Math.max(1, Math.min(5000, Number(e.target.value) || 500)))}
                className="field w-24"
              />
            </div>
            <Button onClick={() => ejecutar.mutate()} disabled={!puedeEjecutar || ejecutar.isPending}>
              {ejecutar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Ejecutar
            </Button>
            {resultado && (
              <>
                <button
                  onClick={() => descargarCsv(nombreInicial || origen.label, resultado.columnas, resultado.filas)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                {onGuardar && (
                  <button
                    onClick={() => onGuardar(def, origenId)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[0.75rem] font-semibold text-brand transition hover:bg-brand/10"
                  >
                    <Save className="h-3.5 w-3.5" /> {guardarLabel}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Resultados */}
          {ejecutar.isPending ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : resultado ? (
            <ResultadoTabla resultado={resultado} />
          ) : null}
        </>
      )}
    </div>
  )
}

/* ── Fila de filtro ── */

function FiltroRow({
  fdef,
  valor,
  onChange,
  onQuitar,
}: {
  fdef: RbFiltroDef
  valor: RbFiltroValor
  onChange: (patch: Partial<RbFiltroValor>) => void
  onQuitar: () => void
}) {
  const { data: opciones = [] } = useQuery({
    queryKey: ['rb-catalogo-filtro', fdef.catalogo],
    queryFn: () => reporteDiarioService.builderCatalogoFiltro(fdef.catalogo!),
    enabled: !!fdef.catalogo,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2">
      <span className="min-w-[7rem] text-[0.72rem] font-semibold text-ink-secondary">{fdef.label}</span>

      {fdef.tipo === 'fecha_rango' && (
        <>
          <input type="date" className="field" value={valor.desde ?? ''} onChange={(e) => onChange({ desde: e.target.value })} />
          <span className="text-[0.7rem] text-ink-tertiary">a</span>
          <input type="date" className="field" value={valor.hasta ?? ''} onChange={(e) => onChange({ hasta: e.target.value })} />
        </>
      )}

      {fdef.tipo === 'texto' && (
        <input className="field flex-1" placeholder="contiene…" value={valor.valor ?? ''} onChange={(e) => onChange({ valor: e.target.value })} />
      )}

      {fdef.tipo === 'enum' && (
        <div className="flex flex-wrap gap-1">
          {(fdef.valores ?? []).map((v) => {
            const on = (valor.valores ?? []).map(String).includes(v)
            return (
              <button
                key={v}
                onClick={() => {
                  const cur = (valor.valores ?? []).map(String)
                  onChange({ valores: on ? cur.filter((x) => x !== v) : [...cur, v] })
                }}
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition',
                  on ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                )}
              >
                {v}
              </button>
            )
          })}
        </div>
      )}

      {(fdef.tipo === 'id_lista' || fdef.tipo === 'id') && (
        <select
          multiple={fdef.tipo === 'id_lista'}
          className="field min-w-[12rem] flex-1"
          value={(valor.valores ?? []).map(String)}
          onChange={(e) => {
            const vals = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
            onChange({ valores: vals })
          }}
        >
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      )}

      <button onClick={onQuitar} className="ml-auto rounded p-1 text-ink-tertiary hover:bg-gray-200 hover:text-red-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ── Tabla de resultados ── */

function ResultadoTabla({ resultado }: { resultado: RbResultado }) {
  const { columnas, filas, totales, meta } = resultado
  const hayTotales = Object.keys(totales).length > 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-ink-tertiary">
        <span className="flex items-center gap-1.5">
          <Table2 className="h-3.5 w-3.5" /> {meta.filasDevueltas} fila(s)
          {meta.truncado && <span className="text-amber-600"> · truncado a {meta.limite}</span>}
        </span>
        <span className="flex items-center gap-1"><SlidersHorizontal className="h-3 w-3" /> orden: {meta.orden.campo} {meta.orden.dir}</span>
      </div>

      {filas.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-[0.8rem] text-ink-tertiary">
          <AlertTriangle className="h-4 w-4" /> Sin datos para los filtros seleccionados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-secondary">
                {columnas.map((c) => (
                  <th key={c.id} className="border-b border-gray-200 px-3 py-2 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  {columnas.map((c) => (
                    <td key={c.id} className={clsx('px-3 py-1.5 whitespace-nowrap', c.esDimension ? 'text-ink' : 'text-ink-secondary tabular-nums')}>
                      {formatValor(f[c.id], c.formato, c.tipo)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hayTotales && (
              <tfoot>
                <tr className="bg-gray-50 font-bold text-ink">
                  {columnas.map((c, idx) => (
                    <td key={c.id} className="border-t border-gray-200 px-3 py-2 whitespace-nowrap tabular-nums">
                      {idx === 0 ? 'Total' : c.id in totales ? formatValor(totales[c.id], c.formato) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
