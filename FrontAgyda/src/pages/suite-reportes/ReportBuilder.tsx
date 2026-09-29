import { Fragment, useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Database, Play, Save, Download, Table2, SlidersHorizontal, Check, ArrowUpDown,
  Rows3, Columns3, Loader2, AlertTriangle, X, Filter, Users, Lock, Search, Plus,
  CalendarRange, GitCompareArrows, ListFilter, Percent, Sigma, LayoutTemplate,
} from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { getApiError } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { formatValor, descargarCsv, esSumable } from './rbFormat'
import { RbGrafica } from './RbGrafica'
import { FORMAS, formasDisponibles, formaEfectiva, PRESETS_FECHA } from './rbVisual'
import { RbGaleria } from './RbGaleria'
import type {
  RbOrigen, RbDefinicion, RbFiltroValor, RbResultado, RbFiltroDef, RbCatalogo,
  RbCondicion, RbOperador, RbVisual, RbGrupo, RbSugerencia,
} from '@/types/reporteDiario.types'

const OPERADORES: { id: RbOperador; label: string }[] = [
  { id: '>', label: 'mayor que' }, { id: '>=', label: 'mayor o igual a' },
  { id: '<', label: 'menor que' }, { id: '<=', label: 'menor o igual a' },
  { id: '=', label: 'igual a' }, { id: '<>', label: 'distinto de' },
]

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hoy = () => ymd(new Date())
const hace30 = () => ymd(new Date(Date.now() - 29 * 864e5))

// Filtros y dimensiones que solo tienen sentido sin un grupo fijo
const SOLO_SIN_GRUPO = 'equipo'

interface Props {
  // Definición inicial (al abrir un reporte guardado); si no, arranca vacío
  definicionInicial?: RbDefinicion
  nombreInicial?: string
  // `sugerencia`: nombre propuesto cuando se partió de una plantilla o copia
  onGuardar?: (def: RbDefinicion, origen: string, sugerencia?: RbSugerencia) => void
  guardarLabel?: string
}

export function ReportBuilder({ definicionInicial, nombreInicial, onGuardar, guardarLabel = 'Guardar reporte' }: Props) {
  const { data: catalogo, isLoading: cargandoCat, error: errorCat } = useQuery({
    queryKey: ['rb-catalogo'],
    queryFn: () => reporteDiarioService.builderCatalogo(),
    staleTime: 10 * 60_000,
    retry: false,
  })

  const [grupoId, setGrupoId] = useState<number | null>(definicionInicial?.grupoId ?? null)
  const [origenId, setOrigenId] = useState(definicionInicial?.origen ?? '')
  const [dimensiones, setDimensiones] = useState<string[]>(definicionInicial?.dimensiones ?? [])
  const [metricas, setMetricas] = useState<string[]>(definicionInicial?.metricas ?? [])
  const [filtros, setFiltros] = useState<RbFiltroValor[]>(definicionInicial?.filtros ?? [])
  const [condiciones, setCondiciones] = useState<RbCondicion[]>(definicionInicial?.condiciones ?? [])
  const [comparar, setComparar] = useState<RbDefinicion['comparar']>(definicionInicial?.comparar ?? null)
  const [orden, setOrden] = useState<{ campo: string; dir: 'asc' | 'desc' } | undefined>(definicionInicial?.orden)
  const [limite, setLimite] = useState(definicionInicial?.limite ?? 500)
  const [visual, setVisual] = useState<RbVisual>(definicionInicial?.visual ?? { tipo: 'auto' })
  const [resultado, setResultado] = useState<RbResultado | null>(null)
  const [galeriaAbierta, setGaleriaAbierta] = useState(false)
  const [sugerencia, setSugerencia] = useState<RbSugerencia | undefined>()

  // Carga una definición (copia de plantilla u otro reporte) en todos los pasos.
  function aplicarDefinicion(d: RbDefinicion, sug: RbSugerencia, quitados: string[]) {
    setGrupoId(d.grupoId ?? null)
    setOrigenId(d.origen)
    setDimensiones(d.dimensiones ?? [])
    setMetricas(d.metricas ?? [])
    setFiltros(d.filtros ?? [])
    setCondiciones(d.condiciones ?? [])
    setComparar(d.comparar ?? null)
    setOrden(d.orden)
    setLimite(d.limite ?? 500)
    setVisual(d.visual ?? { tipo: 'auto' })
    setResultado(null)
    setSugerencia(sug)
    setGaleriaAbierta(false)
    toast.success(quitados.length ? `Configuración copiada. Se quitaron: ${quitados.join(', ')}` : 'Configuración copiada — ajústala y ejecútala')
  }

  const grupos = catalogo?.grupos ?? []
  const grupo = grupos.find((g) => g.id === grupoId) ?? null
  const origenesVisibles = useMemo(
    () => Object.values(catalogo?.origenes ?? {}).filter((o) => !grupo || !o.requiere || o.requiere.includes(grupo.modalidad)),
    [catalogo, grupo],
  )
  const origenCompleto: RbOrigen | undefined = catalogo?.origenes[origenId]
  // Con un grupo fijo (o sin grupos en la empresa) no se ofrece "Grupo" como dimensión/filtro
  const origen: RbOrigen | undefined = useMemo(() => {
    if (!origenCompleto) return undefined
    if (grupoId == null && grupos.length > 0) return origenCompleto
    return {
      ...origenCompleto,
      dimensiones: origenCompleto.dimensiones.filter((d) => d.id !== SOLO_SIN_GRUPO),
      filtros: origenCompleto.filtros.filter((f) => f.id !== SOLO_SIN_GRUPO),
    }
  }, [origenCompleto, grupoId, grupos.length])

  function elegirGrupo(id: number | null) {
    setGrupoId(id)
    setResultado(null)
    setFiltros((fs) => (id == null ? fs : fs.filter((f) => f.id !== SOLO_SIN_GRUPO)))
    setDimensiones((ds) => (id == null ? ds : ds.filter((d) => d !== SOLO_SIN_GRUPO)))
    const g = grupos.find((x) => x.id === id)
    const o = catalogo?.origenes[origenId]
    if (g && o?.requiere && !o.requiere.includes(g.modalidad)) setOrigenId('')
  }

  // Al cambiar de origen, resetear selección (salvo que venga de una definición cargada)
  function elegirOrigen(id: string) {
    setOrigenId(id)
    setResultado(null)
    const o = catalogo?.origenes[id]
    if (!o) return
    setDimensiones([])
    setMetricas(o.metricas.slice(0, 1).map((m) => m.id))
    setOrden(undefined)
    setCondiciones([])
    setVisual({ tipo: 'auto' })
    // pre-cargar filtros "por defecto" (rango de fechas: últimos 30 días)
    setFiltros(o.filtros.filter((f) => f.porDefecto && f.tipo === 'fecha_rango').map((f) => ({ id: f.id, preset: 'ult30' })))
  }

  const def: RbDefinicion = useMemo(
    () => ({
      origen: origenId, dimensiones, metricas, filtros, orden, limite,
      grupoId, condiciones: condiciones.filter((c) => c.metrica), comparar, visual,
    }),
    [origenId, dimensiones, metricas, filtros, orden, limite, grupoId, condiciones, comparar, visual],
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
      fdef.tipo === 'fecha_rango' ? { id: fdef.id, preset: 'ult30' }
      : fdef.tipo === 'hora_rango' ? { id: fdef.id, desde: 9, hasta: 18 }
      : fdef.tipo === 'enum' || fdef.tipo === 'id_lista' || fdef.tipo === 'grupo' ? { id: fdef.id, valores: [] }
      : { id: fdef.id, valor: '' }
    setFiltros([...filtros, base])
  }
  const quitarFiltro = (id: string) => setFiltros(filtros.filter((f) => f.id !== id))
  const setFiltro = (id: string, patch: Partial<RbFiltroValor>) =>
    setFiltros(filtros.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  if (cargandoCat) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }
  if (errorCat || !catalogo) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-gray-200 bg-gray-50 p-5 text-center">
        <Lock className="mx-auto h-6 w-6 text-ink-tertiary" />
        <p className="mt-2 text-sm font-semibold text-ink">Constructor no disponible</p>
        <p className="mt-1 text-[0.78rem] text-ink-tertiary">{errorCat ? getApiError(errorCat) : 'No se pudo cargar el catálogo.'}</p>
      </div>
    )
  }

  const hayFecha = origen?.filtros.some((f) => f.tipo === 'fecha_rango' && f.porDefecto)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Database className="h-4.5 w-4.5 text-brand" /> Constructor de reportes
          </h2>
          <p className="text-xs text-gray-500">Arma un reporte con variables del sistema — tiempos de agentes, interacciones, llamadas y más — y visualízalo en gráficas.</p>
        </div>
        {!definicionInicial && (
          <button
            onClick={() => setGaleriaAbierta(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[0.75rem] font-semibold text-brand transition hover:bg-brand/10"
          >
            <LayoutTemplate className="h-3.5 w-3.5" /> Plantillas y copias
          </button>
        )}
      </div>

      {galeriaAbierta && (
        <RbGaleria catalogo={catalogo} grupoId={grupoId} onClose={() => setGaleriaAbierta(false)} onUsar={aplicarDefinicion} />
      )}

      {/* Paso 0 — Grupo (alcance) */}
      {(grupos.length > 0 || catalogo.acceso === 'supervisor') && (
        <PasoGrupo catalogo={catalogo} grupos={grupos} grupoId={grupoId} onChange={elegirGrupo} />
      )}

      {/* Paso 1 — Origen */}
      <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <Titulo n={1}>Origen de datos</Titulo>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {origenesVisibles.map((o) => (
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
        {grupo && origenesVisibles.length < Object.keys(catalogo.origenes).length && (
          <p className="mt-2 text-[0.68rem] text-ink-tertiary">
            Se muestran los orígenes que aplican a un grupo {grupo.modalidad === 'marcador' ? 'de marcador' : grupo.modalidad === 'omnicanal' ? 'omnicanal' : 'mixto'}.
          </p>
        )}
      </section>

      {origen && (
        <>
          {/* Paso 2 — Campos */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <Rows3 className="h-3.5 w-3.5" /> Agrupar por (desgloses)
              </p>
              {[
                { titulo: 'Tiempo', lista: origen.dimensiones.filter((d) => d.tiempo) },
                { titulo: 'Categorías', lista: origen.dimensiones.filter((d) => !d.tiempo) },
              ].map((bloque) => bloque.lista.length > 0 && (
                <div key={bloque.titulo} className="mb-2 last:mb-0">
                  <p className="mb-1 text-[0.64rem] font-semibold text-ink-tertiary">{bloque.titulo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bloque.lista.map((d) => (
                      <Chip key={d.id} on={dimensiones.includes(d.id)} onClick={() => toggle(dimensiones, setDimensiones, d.id)}>
                        {dimensiones.includes(d.id) && dimensiones.length > 1 && (
                          <span className="mr-0.5 text-[0.6rem] opacity-70">{dimensiones.indexOf(d.id) + 1}.</span>
                        )}
                        {d.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
              <p className="mt-2 text-[0.68rem] text-ink-tertiary">
                Sin desgloses = indicadores con los totales. Con dos (p. ej. día de la semana + hora) se puede ver como mapa de calor.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <Columns3 className="h-3.5 w-3.5" /> Métricas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {origen.metricas.map((m) => (
                  <Chip key={m.id} tono="verde" on={metricas.includes(m.id)} onClick={() => toggle(metricas, setMetricas, m.id)}>
                    {m.label}
                  </Chip>
                ))}
              </div>
              {metricas.length === 0 && <p className="mt-2 text-[0.68rem] text-amber-600">Elige al menos una métrica.</p>}
            </div>
          </section>

          {/* Paso 3 — Filtros */}
          <section className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
              <p className="text-[0.72rem] text-ink-tertiary">Sin filtros — se usan los últimos 30 días por defecto.</p>
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
                      grupoId={grupoId}
                      onChange={(patch) => setFiltro(fv.id, patch)}
                      onQuitar={() => quitarFiltro(fv.id)}
                    />
                  )
                })}
              </div>
            )}

            {/* Condiciones sobre el resultado (HAVING) */}
            {dimensiones.length > 0 && (
              <Condiciones origen={origen} condiciones={condiciones} onChange={setCondiciones} />
            )}
          </section>

          {/* Paso 4 — Orden + límite + comparar + ejecutar */}
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
            {hayFecha && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                  <GitCompareArrows className="h-3 w-3" /> Comparar con
                </label>
                <select className="field" value={comparar ?? ''} onChange={(e) => setComparar((e.target.value || null) as RbDefinicion['comparar'])}>
                  <option value="">Sin comparar</option>
                  <option value="periodo_anterior">Periodo anterior</option>
                  <option value="anio_anterior">Mismo periodo del año pasado</option>
                </select>
              </div>
            )}
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
                    onClick={() => onGuardar(def, origenId, sugerencia)}
                    className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[0.75rem] font-semibold text-brand transition hover:bg-brand/10"
                  >
                    <Save className="h-3.5 w-3.5" /> {guardarLabel}
                  </button>
                )}
              </>
            )}
          </section>

          {/* Resultados — el anterior se mantiene atenuado mientras se recalcula */}
          {resultado ? (
            <div className={clsx('transition-opacity', ejecutar.isPending && 'pointer-events-none opacity-50')}>
              <Resultado resultado={resultado} visual={visual} onVisual={setVisual} />
            </div>
          ) : ejecutar.isPending ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ── Piezas ── */

function Titulo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[0.6rem] font-bold text-white">{n}</span>
      {children}
    </p>
  )
}

function Chip({ on, onClick, children, tono = 'marca' }: { on: boolean; onClick: () => void; children: React.ReactNode; tono?: 'marca' | 'verde' }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition',
        on
          ? tono === 'verde' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-brand bg-brand/10 text-brand'
          : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
      )}
    >
      {on && <Check className="h-3 w-3" />} {children}
    </button>
  )
}

/* ── Paso 0: grupo ── */

function PasoGrupo({ catalogo, grupos, grupoId, onChange }: {
  catalogo: RbCatalogo
  grupos: RbGrupo[]
  grupoId: number | null
  onChange: (id: number | null) => void
}) {
  const esSupervisor = catalogo.acceso === 'supervisor'
  const modalidad = (m: string) => (m === 'marcador' ? 'Marcador' : m === 'ambos' ? 'Omnicanal + marcador' : 'Omnicanal')
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-ink-tertiary">
        <Users className="h-3.5 w-3.5" /> Grupo
        <span className="font-normal normal-case tracking-normal">
          — {esSupervisor ? 'ves solo los grupos que supervisas' : 'el reporte queda limitado a lo que pertenece al grupo'}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange(null)}
          className={clsx(
            'rounded-lg border px-3 py-1.5 text-left transition',
            grupoId == null ? 'border-brand bg-brand/10' : 'border-gray-200 bg-white hover:bg-gray-50',
          )}
        >
          <p className={clsx('text-[0.75rem] font-semibold', grupoId == null ? 'text-brand' : 'text-ink')}>
            {esSupervisor ? 'Todos mis grupos' : 'Toda la operación'}
          </p>
          <p className="text-[0.64rem] text-ink-tertiary">{esSupervisor ? `${grupos.length} grupo(s)` : 'sin límite de grupo'}</p>
        </button>
        {grupos.map((g) => (
          <button
            key={g.id}
            onClick={() => onChange(g.id)}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-left transition',
              grupoId === g.id ? 'border-brand bg-brand/10' : 'border-gray-200 bg-white hover:bg-gray-50',
            )}
          >
            <p className={clsx('text-[0.75rem] font-semibold', grupoId === g.id ? 'text-brand' : 'text-ink')}>{g.nombre}</p>
            <p className="text-[0.64rem] text-ink-tertiary">{modalidad(g.modalidad)}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ── Fila de filtro ── */

function FiltroRow({
  fdef, valor, grupoId, onChange, onQuitar,
}: {
  fdef: RbFiltroDef
  valor: RbFiltroValor
  grupoId: number | null
  onChange: (patch: Partial<RbFiltroValor>) => void
  onQuitar: () => void
}) {
  const { data: opciones = [] } = useQuery({
    queryKey: ['rb-catalogo-filtro', fdef.catalogo, grupoId],
    queryFn: () => reporteDiarioService.builderCatalogoFiltro(fdef.catalogo!, grupoId),
    enabled: !!fdef.catalogo,
    staleTime: 5 * 60_000,
  })
  const admiteExcluir = fdef.tipo === 'texto' || fdef.tipo === 'id_lista' || fdef.tipo === 'enum' || fdef.tipo === 'grupo'

  // Opciones de chips para enum: del catálogo (claves de STATUS) o fijas con etiqueta
  const chipsEnum = fdef.tipo === 'enum'
    ? fdef.catalogo
      ? opciones.map((o) => ({ id: String(o.id), label: o.nombre }))
      : (fdef.valores ?? []).map((v, i) => ({ id: v, label: fdef.etiquetas?.[i] ?? v }))
    : []

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2">
      <span className="min-w-[7rem] text-[0.72rem] font-semibold text-ink-secondary">{fdef.label}</span>

      {admiteExcluir && (
        <div className="flex overflow-hidden rounded-md border border-gray-200 text-[0.66rem] font-semibold">
          {[false, true].map((ex) => (
            <button
              key={String(ex)}
              onClick={() => onChange({ excluir: ex })}
              className={clsx('px-2 py-0.5 transition', !!valor.excluir === ex ? (ex ? 'bg-red-50 text-red-600' : 'bg-brand/10 text-brand') : 'bg-white text-ink-tertiary hover:bg-gray-50')}
            >
              {ex ? 'Excluir' : fdef.tipo === 'texto' ? 'Contiene' : 'Solo'}
            </button>
          ))}
        </div>
      )}

      {fdef.tipo === 'fecha_rango' && <FiltroFecha valor={valor} onChange={onChange} />}

      {fdef.tipo === 'hora_rango' && (
        <div className="flex items-center gap-1.5 text-[0.72rem] text-ink-secondary">
          de
          <select className="field" value={Number(valor.desde ?? 0)} onChange={(e) => onChange({ desde: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
          a
          <select className="field" value={Number(valor.hasta ?? 23)} onChange={(e) => onChange({ hasta: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:59</option>)}
          </select>
        </div>
      )}

      {fdef.tipo === 'texto' && (
        <input className="field flex-1" placeholder="texto…" value={valor.valor ?? ''} onChange={(e) => onChange({ valor: e.target.value })} />
      )}

      {fdef.tipo === 'enum' && (
        <div className="flex flex-wrap gap-1">
          {chipsEnum.map((v) => {
            const cur = (valor.valores ?? []).map(String)
            const on = cur.includes(v.id)
            return (
              <button
                key={v.id}
                onClick={() => onChange({ valores: on ? cur.filter((x) => x !== v.id) : [...cur, v.id] })}
                className={clsx(
                  'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition',
                  on ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
                )}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      )}

      {(fdef.tipo === 'id_lista' || fdef.tipo === 'grupo' || fdef.tipo === 'id') && (
        <MultiPicker
          opciones={opciones}
          valores={(valor.valores ?? []).map(Number)}
          onChange={(vals) => onChange({ valores: vals })}
        />
      )}

      <button onClick={onQuitar} className="ml-auto rounded p-1 text-ink-tertiary hover:bg-gray-200 hover:text-red-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function FiltroFecha({ valor, onChange }: { valor: RbFiltroValor; onChange: (patch: Partial<RbFiltroValor>) => void }) {
  const personalizado = !valor.preset
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1">
      <CalendarRange className="h-3.5 w-3.5 text-ink-tertiary" />
      {PRESETS_FECHA.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange({ preset: p.id, desde: undefined, hasta: undefined })}
          className={clsx(
            'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition',
            valor.preset === p.id ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-white text-ink-secondary hover:bg-gray-50',
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => onChange({ preset: undefined, desde: String(valor.desde ?? '') || hace30(), hasta: String(valor.hasta ?? '') || hoy() })}
        className={clsx(
          'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold transition',
          personalizado ? 'border-brand bg-brand/10 text-brand' : 'border-dashed border-gray-300 bg-white text-ink-tertiary hover:bg-gray-50',
        )}
      >
        Personalizado
      </button>
      {personalizado && (
        <span className="flex items-center gap-1">
          <input type="date" className="field" value={String(valor.desde ?? '')} onChange={(e) => onChange({ desde: e.target.value })} />
          <span className="text-[0.7rem] text-ink-tertiary">a</span>
          <input type="date" className="field" value={String(valor.hasta ?? '')} onChange={(e) => onChange({ hasta: e.target.value })} />
        </span>
      )}
    </div>
  )
}

/* Selector múltiple con búsqueda (agentes, campañas, skills…) */
function MultiPicker({ opciones, valores, onChange }: {
  opciones: { id: number; nombre: string }[]
  valores: number[]
  onChange: (vals: number[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const sel = new Set(valores)
  const nombre = (id: number) => opciones.find((o) => Number(o.id) === id)?.nombre ?? `#${id}`
  const filtradas = opciones.filter((o) => o.nombre?.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="relative flex flex-1 flex-wrap items-center gap-1">
      {valores.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand/5 px-2 py-0.5 text-[0.68rem] font-semibold text-brand">
          {nombre(id)}
          <button onClick={() => onChange(valores.filter((x) => x !== id))} className="rounded-full hover:text-red-600"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-ink-tertiary hover:border-brand hover:text-brand"
      >
        <Plus className="h-3 w-3" /> {valores.length ? 'Agregar' : 'Elegir'}
      </button>
      {abierto && (
        <>
          <button aria-label="Cerrar" className="fixed inset-0 z-10 cursor-default" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-gray-200 px-2">
              <Search className="h-3.5 w-3.5 text-ink-tertiary" />
              <input autoFocus className="w-full bg-transparent py-1 text-[0.75rem] outline-none" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtradas.length === 0 && <p className="px-2 py-3 text-center text-[0.7rem] text-ink-tertiary">Sin opciones</p>}
              {filtradas.map((o) => {
                const id = Number(o.id)
                const on = sel.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => onChange(on ? valores.filter((x) => x !== id) : [...valores, id])}
                    className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[0.75rem] transition', on ? 'bg-brand/10 text-brand' : 'text-ink-secondary hover:bg-gray-50')}
                  >
                    <span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-gray-300')}>
                      {on && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {o.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ── Condiciones (HAVING) ── */

function Condiciones({ origen, condiciones, onChange }: { origen: RbOrigen; condiciones: RbCondicion[]; onChange: (c: RbCondicion[]) => void }) {
  const set = (i: number, patch: Partial<RbCondicion>) => onChange(condiciones.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-ink-secondary">
          <ListFilter className="h-3.5 w-3.5" /> Mostrar solo filas donde…
        </p>
        {condiciones.length < 5 && (
          <button
            onClick={() => onChange([...condiciones, { metrica: origen.metricas[0]?.id ?? '', op: '>=', valor: 1 }])}
            className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[0.68rem] font-semibold text-ink-tertiary hover:border-brand hover:text-brand"
          >
            + Condición
          </button>
        )}
      </div>
      {condiciones.length === 0 ? (
        <p className="text-[0.68rem] text-ink-tertiary">Ej.: agentes con 10 interacciones o más, días con TMO mayor a 5 min (en segundos: 300).</p>
      ) : (
        <div className="space-y-1.5">
          {condiciones.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select className="field" value={c.metrica} onChange={(e) => set(i, { metrica: e.target.value })}>
                {origen.metricas.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select className="field" value={c.op} onChange={(e) => set(i, { op: e.target.value as RbOperador })}>
                {OPERADORES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <input type="number" className="field w-28" value={c.valor} onChange={(e) => set(i, { valor: Number(e.target.value) })} />
              <button onClick={() => onChange(condiciones.filter((_, j) => j !== i))} className="rounded p-1 text-ink-tertiary hover:bg-gray-200 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Resultado: visualización + tabla ── */

function Resultado({ resultado, visual, onVisual }: { resultado: RbResultado; visual: RbVisual; onVisual: (v: RbVisual) => void }) {
  const dims = resultado.columnas.filter((c) => c.esDimension)
  const mets = resultado.columnas.filter((c) => !c.esDimension)
  const disponibles = formasDisponibles(dims, mets)
  const efectivo = formaEfectiva(visual.tipo, dims, mets, resultado.filas.length)
  const unaMetrica = (efectivo === 'calor' || efectivo === 'pastel' || (dims.length === 2 && efectivo !== 'kpi' && efectivo !== 'tabla')) && mets.length > 1
  const { rango } = resultado.meta

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2">
        <span className="px-1 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">Ver como</span>
        <div className="flex flex-wrap gap-1">
          {FORMAS.filter((f) => disponibles.includes(f.id)).map((f) => {
            const Icon = f.icon
            const on = efectivo === f.id
            return (
              <button
                key={f.id}
                title={f.label}
                onClick={() => onVisual({ ...visual, tipo: f.id })}
                className={clsx(
                  'flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem] font-semibold transition',
                  on ? 'border-brand bg-brand/10 text-brand' : 'border-transparent text-ink-secondary hover:bg-gray-50',
                )}
              >
                <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{f.label}</span>
              </button>
            )
          })}
        </div>
        {unaMetrica && (
          <select className="field ml-auto" value={visual.metrica ?? mets[0]?.id} onChange={(e) => onVisual({ ...visual, metrica: e.target.value })}>
            {mets.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
      </div>

      {rango && (
        <p className="text-[0.7rem] text-ink-tertiary">
          Periodo: {formatValor(rango.desde, undefined, 'date')} – {formatValor(rango.hasta, undefined, 'date')}
          {resultado.comparacion && <> · comparado con {formatValor(resultado.comparacion.desde, undefined, 'date')} – {formatValor(resultado.comparacion.hasta, undefined, 'date')}</>}
        </p>
      )}

      {efectivo !== 'tabla' && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <RbGrafica resultado={resultado} visual={{ ...visual, tipo: efectivo }} />
        </div>
      )}

      {(efectivo !== 'kpi' || dims.length > 0) && (
        <ResultadoTabla resultado={resultado} visual={visual} onVisual={onVisual} />
      )}
    </div>
  )
}

function ResultadoTabla({ resultado, visual, onVisual }: { resultado: RbResultado; visual: RbVisual; onVisual: (v: RbVisual) => void }) {
  const { columnas, filas, totales, meta } = resultado
  const hayDims = columnas.some((c) => c.esDimension)
  const sumables = columnas.filter((c) => !c.esDimension && esSumable(c.formato))
  const extras = hayDims && sumables.length > 0

  // Columnas derivadas: % del total y acumulado de cada métrica sumable
  const acumulados: Record<string, number>[] = []
  const corrido: Record<string, number> = {}
  for (const f of filas) {
    for (const c of sumables) corrido[c.id] = (corrido[c.id] ?? 0) + (Number(f[c.id]) || 0)
    acumulados.push({ ...corrido })
  }

  const celdasExtra = (c: typeof columnas[number], i: number | null) => {
    if (!extras || !esSumable(c.formato)) return null
    const total = Number(totales[c.id]) || 0
    const v = i == null ? total : Number(filas[i][c.id]) || 0
    return (
      <>
        {visual.pct && <td className="px-3 py-1.5 text-right tabular-nums text-ink-tertiary">{total ? `${(v * 100 / total).toFixed(1)}%` : '—'}</td>}
        {visual.acumulado && <td className="px-3 py-1.5 text-right tabular-nums text-ink-tertiary">{i == null ? '' : formatValor(acumulados[i][c.id], c.formato)}</td>}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] text-ink-tertiary">
        <span className="flex items-center gap-1.5">
          <Table2 className="h-3.5 w-3.5" /> {meta.filasDevueltas} fila(s)
          {meta.truncado && <span className="text-amber-600"> · truncado a {meta.limite}</span>}
        </span>
        <div className="flex items-center gap-2">
          {extras && (
            <>
              <button
                onClick={() => onVisual({ ...visual, pct: !visual.pct })}
                className={clsx('flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold', visual.pct ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-secondary hover:bg-gray-50')}
              >
                <Percent className="h-3 w-3" /> % del total
              </button>
              <button
                onClick={() => onVisual({ ...visual, acumulado: !visual.acumulado })}
                className={clsx('flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold', visual.acumulado ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-secondary hover:bg-gray-50')}
              >
                <Sigma className="h-3 w-3" /> Acumulado
              </button>
            </>
          )}
          <span className="flex items-center gap-1"><SlidersHorizontal className="h-3 w-3" /> orden: {meta.orden.campo} {meta.orden.dir}</span>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-[0.8rem] text-ink-tertiary">
          <AlertTriangle className="h-4 w-4" /> Sin datos para los filtros seleccionados.
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-gray-50 text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-secondary">
                {columnas.map((c) => (
                  <Fragment key={c.id}>
                    <th className={clsx('border-b border-gray-200 px-3 py-2 whitespace-nowrap', !c.esDimension && 'text-right')}>{c.label}</th>
                    {extras && esSumable(c.formato) && visual.pct && <th className="border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap">% total</th>}
                    {extras && esSumable(c.formato) && visual.acumulado && <th className="border-b border-gray-200 px-3 py-2 text-right whitespace-nowrap">Acumulado</th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  {columnas.map((c) => (
                    <Fragment key={c.id}>
                      <td className={clsx('px-3 py-1.5 whitespace-nowrap', c.esDimension ? 'text-ink' : 'text-right tabular-nums text-ink-secondary')}>
                        {formatValor(f[c.id], c.formato, c.tipo)}
                      </td>
                      {celdasExtra(c, i)}
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            {hayDims && Object.keys(totales).length > 0 && (
              <tfoot className="sticky bottom-0">
                <tr className="bg-gray-50 font-bold text-ink">
                  {columnas.map((c, idx) => (
                    <Fragment key={c.id}>
                      <td className={clsx('border-t border-gray-200 px-3 py-2 whitespace-nowrap tabular-nums', !c.esDimension && 'text-right')}>
                        {idx === 0 ? 'Total general' : c.esDimension ? '' : formatValor(totales[c.id], c.formato)}
                      </td>
                      {celdasExtra(c, null)}
                    </Fragment>
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
