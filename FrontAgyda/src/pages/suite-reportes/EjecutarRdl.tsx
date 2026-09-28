import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { Play, Loader2, Download, Search, AlertTriangle, ChevronDown, X, Check, Table2 } from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { getApiError } from '@/lib/axios'
import type { RdlDefinition, RdlParameter } from '@/lib/rdl'
import type { RdlOpcion, RdlReporte, RdlResultado } from '@/types/reporteDiario.types'

const field = 'w-full rounded-lg border border-gray-200 bg-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'
const POR_PAGINA = 200
type Valores = Record<string, string | string[] | null>

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')
const esFecha = (p: RdlParameter) => /date/i.test(p.dataType || '')
const esNumero = (p: RdlParameter) => /integer|float|decimal/i.test(p.dataType || '')

// Fechas ISO de SQL (medianoche UTC = solo fecha) → dd/mm/aaaa [hh:mm].
function formatear(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) {
      const f = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
      const hh = d.getUTCHours(), mm = d.getUTCMinutes()
      return hh || mm ? `${f} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : f
    }
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

// Ejecuta el RDL dentro de AGYDA: parámetros → tabla con los datos reales.
// La consulta corre en el servidor, solo lectura (se revierte siempre).
export function EjecutarRdl({ reporte, def }: { reporte: RdlReporte; def: RdlDefinition }) {
  const params = def.parameters
  const [valores, setValores] = useState<Valores>(() =>
    Object.fromEntries(params.map((p) => [p.name, p.multiValue ? [...p.defaultValues] : p.defaultValues[0] ?? null])))
  const [busca, setBusca] = useState('')
  const [mostrar, setMostrar] = useState(POR_PAGINA)

  const { data: meta, error: errorOpciones } = useQuery({
    queryKey: ['rdl-opciones', reporte.id],
    queryFn: () => reporteDiarioService.opcionesRdl(reporte.id),
    retry: false,
  })
  const ejecutar = useMutation({
    mutationFn: () => reporteDiarioService.ejecutarRdl(reporte.id, valores),
    onSuccess: (r) => { setMostrar(POR_PAGINA); setBusca(''); if (r.avisos?.length) toast(r.avisos.join('\n')) },
    onError: (e) => toast.error(getApiError(e) || 'No se pudo ejecutar el reporte'),
  })
  const r = ejecutar.data

  // Columnas como las pinta el Tablix del RDL (título → campo); si no se
  // pueden emparejar, todas las del resultado.
  const columnas = useMemo(() => {
    if (!r) return [] as { campo: string; titulo: string }[]
    const region = def.dataRegions.find((d) => d.dataSetName === r.dataSet && d.columns.length)
    const porNombre = new Map(r.columnas.map((c) => [normal(c), c]))
    const emparejadas = (region?.columns ?? []).map((t) => ({ titulo: t, campo: porNombre.get(normal(t)) })).filter((x): x is { titulo: string; campo: string } => !!x.campo)
    return emparejadas.length ? emparejadas : r.columnas.map((c) => ({ campo: c, titulo: c }))
  }, [r, def.dataRegions])

  const filas = useMemo(() => {
    if (!r) return []
    const t = normal(busca)
    return t ? r.filas.filter((f) => columnas.some((c) => normal(formatear(f[c.campo])).includes(t))) : r.filas
  }, [r, busca, columnas])

  const descargar = () => {
    if (!r) return
    const hoja = XLSX.utils.aoa_to_sheet([columnas.map((c) => c.titulo), ...filas.map((f) => columnas.map((c) => formatear(f[c.campo])))])
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
    XLSX.writeFile(libro, `${reporte.nombre.replace(/[\\/:*?"<>|]/g, '')} ${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const opcionesDe = (p: RdlParameter): RdlOpcion[] | null => {
    const o = meta?.opciones?.[p.name]
    return Array.isArray(o) ? o : null
  }
  const set = (nombre: string, v: string | string[] | null) => setValores((xs) => ({ ...xs, [nombre]: v }))

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Play className="h-4 w-4 text-brand" /> Ejecutar reporte
        </h3>
        <span className="text-[0.7rem] text-ink-tertiary">Se ejecuta en AGYDA con los datos actuales · solo lectura</span>
      </div>

      {errorOpciones ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[0.8rem] text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> <span>{getApiError(errorOpciones) || 'No se puede ejecutar este reporte'}</span>
        </div>
      ) : (
        <>
          {params.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {params.map((p) => {
                const ops = opcionesDe(p)
                const v = valores[p.name]
                return (
                  <label key={p.name} className="block min-w-0">
                    <span className="mb-1 block text-[0.72rem] font-semibold text-ink-secondary">{p.prompt || p.name}</span>
                    {p.multiValue && ops ? (
                      <MultiSelect opciones={ops} valor={Array.isArray(v) ? v : []} onChange={(x) => set(p.name, x)} />
                    ) : ops ? (
                      <select className={field} value={typeof v === 'string' ? v : ''} onChange={(e) => set(p.name, e.target.value || null)}>
                        <option value="">Todos</option>
                        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : esFecha(p) ? (
                      <input type="date" className={field} value={typeof v === 'string' ? v.slice(0, 10) : ''} onChange={(e) => set(p.name, e.target.value || null)} />
                    ) : (
                      <input type={esNumero(p) ? 'number' : 'text'} className={field} value={typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : ''}
                        placeholder={p.multiValue ? 'Valores separados por coma' : 'Todos'}
                        onChange={(e) => set(p.name, p.multiValue ? e.target.value.split(',').map((x) => x.trim()).filter(Boolean) : e.target.value || null)} />
                    )}
                  </label>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => ejecutar.mutate()} disabled={ejecutar.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
              {ejecutar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Ejecutar
            </button>
            {params.length > 0 && (
              <button onClick={() => setValores(Object.fromEntries(params.map((p) => [p.name, p.multiValue ? [] : null])))}
                className="rounded-lg px-3 py-2 text-[0.78rem] font-semibold text-ink-tertiary hover:bg-gray-50">Limpiar filtros</button>
            )}
            <span className="text-[0.7rem] text-ink-tertiary">Filtro vacío = todos.</span>
          </div>
        </>
      )}

      {r && <Resultado r={r} columnas={columnas} filas={filas} busca={busca} setBusca={setBusca} mostrar={mostrar} setMostrar={setMostrar} descargar={descargar} />}
    </section>
  )
}

function Resultado({ r, columnas, filas, busca, setBusca, mostrar, setMostrar, descargar }: {
  r: RdlResultado; columnas: { campo: string; titulo: string }[]; filas: Record<string, unknown>[]
  busca: string; setBusca: (v: string) => void; mostrar: number; setMostrar: (n: number) => void; descargar: () => void
}) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Table2 className="h-4 w-4 text-brand" /> {r.total.toLocaleString('es-MX')} registro(s)
          <span className="text-[0.7rem] font-normal text-ink-tertiary">· {(r.ms / 1000).toFixed(1)} s</span>
        </p>
        {r.truncado && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">Se muestran los primeros {r.filas.length.toLocaleString('es-MX')}: acota con los filtros</span>}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input className={clsx(field, '!w-56 !py-1.5 pl-8 text-[0.8rem]')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en el resultado…" />
        </div>
        <button onClick={descargar} disabled={!filas.length}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50 disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      </div>
      {filas.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-ink-tertiary">{busca ? 'Nada coincide con la búsqueda.' : 'El reporte no devolvió registros con esos filtros.'}</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-[0.8rem]">
            <thead className="sticky top-0 z-[1] bg-gray-50">
              <tr className="text-left text-[0.68rem] font-semibold uppercase tracking-wide text-ink-secondary">
                {columnas.map((c) => <th key={c.campo} className="whitespace-nowrap border-b border-gray-200 px-3 py-2">{c.titulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, mostrar).map((f, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  {columnas.map((c) => <td key={c.campo} className="whitespace-nowrap px-3 py-1.5 text-ink">{formatear(f[c.campo])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filas.length > mostrar && (
        <button onClick={() => setMostrar(mostrar + POR_PAGINA)} className="w-full rounded-lg border border-gray-200 py-1.5 text-[0.75rem] font-semibold text-ink-secondary hover:bg-gray-50">
          Mostrar más ({(filas.length - mostrar).toLocaleString('es-MX')} restantes)
        </button>
      )}
    </div>
  )
}

// Selección múltiple compacta (p. ej. tipificaciones): vacío = todas.
function MultiSelect({ opciones, valor, onChange }: { opciones: RdlOpcion[]; valor: string[]; onChange: (v: string[]) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const visibles = opciones.filter((o) => normal(o.label).includes(normal(filtro)))
  const toggle = (v: string) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v])
  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} className={clsx(field, 'flex items-center gap-2 text-left')}>
        <span className={clsx('min-w-0 flex-1 truncate', !valor.length && 'text-ink-tertiary')}>
          {valor.length ? valor.map((v) => opciones.find((o) => o.value === v)?.label ?? v).join(', ') : 'Todas'}
        </span>
        {valor.length > 0 && <span className="rounded-full bg-brand/10 px-1.5 text-[0.65rem] font-bold text-brand">{valor.length}</span>}
        <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
            <div className="flex items-center gap-1 border-b border-gray-100 p-1.5">
              <input autoFocus className={clsx(field, '!py-1 text-[0.78rem]')} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" />
              {valor.length > 0 && <button type="button" onClick={() => onChange([])} title="Quitar todas" className="rounded-md p-1.5 text-ink-tertiary hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {visibles.length === 0 && <p className="px-3 py-2 text-[0.75rem] text-ink-tertiary">Sin resultados</p>}
              {visibles.map((o) => {
                const marcado = valor.includes(o.value)
                return (
                  <button type="button" key={o.value} onClick={() => toggle(o.value)}
                    className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[0.8rem] hover:bg-gray-50', marcado && 'bg-brand/5')}>
                    <span className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border', marcado ? 'border-brand bg-brand text-white' : 'border-gray-300')}>
                      {marcado && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.label || '(vacío)'}</span>
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
