import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart3, FileDown, FileSpreadsheet, Play, Target, Gauge, Gavel, Save, Trash2, PlayCircle, LayoutGrid, BookMarked } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  reportesEjecutivosService,
  type FuenteReporte,
  type CatalogoCampo,
  type ResultadoReporte,
  type PlantillaReporte,
} from '@/services/reportesEjecutivos.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { decisionesService } from '@/services/decisiones.service'

// Filtros cuya columna real es un ID numérico (sqlType Int en el backend) — se
// resuelven como <select> con nombres reales en vez de <input type="text">
// para evitar que el usuario escriba texto libre y falle la conversión SQL.
const FILTROS_USUARIO_ID = new Set(['oeResponsableId', 'akResponsableId', 'deSolicitanteId', 'deAprobadorId'])
const FILTRO_TIPO_DECISION_ID = 'deTipoId'

const FUENTE_ICONO: Record<FuenteReporte, React.ElementType> = {
  okr: Target,
  kpis: Gauge,
  decisiones: Gavel,
}

const FUENTE_DESCRIPCION: Record<FuenteReporte, string> = {
  okr: 'Objetivos, resultados clave y progreso',
  kpis: 'Indicadores empresariales consolidados',
  decisiones: 'Solicitudes de decisión y aprobación',
}

const FUENTE_LABEL: Record<FuenteReporte, string> = {
  okr: 'OKR / Planeación estratégica',
  kpis: 'Indicadores empresariales (KPIs)',
  decisiones: 'Toma de decisiones',
}

function formatearValor(valor: unknown, formato: string) {
  if (valor === null || valor === undefined) return '—'
  if (formato === 'porcentaje') return `${valor}%`
  if (formato === 'moneda') return `$${Number(valor).toLocaleString()}`
  return String(valor)
}

// ── Selector de fuente ─────────────────────────────────────────────────
function SelectorFuenteCard({ fuente, activa, label, descripcion, onClick }: {
  fuente: FuenteReporte
  activa: boolean
  label: string
  descripcion: string
  onClick: () => void
}) {
  const Icon = FUENTE_ICONO[fuente]
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all',
        activa ? 'border-brand bg-brand/5 shadow-card' : 'border-gray-100 bg-card hover:border-gray-200',
      )}
    >
      <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', activa ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500')}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-tertiary">{descripcion}</p>
      </div>
    </button>
  )
}

// ── Lista de checkboxes reutilizable (métricas/dimensiones) ──────────────
function CampoCheckboxList({ campos, seleccionados, onToggle, limite }: {
  campos: CatalogoCampo[]
  seleccionados: string[]
  onToggle: (key: string) => void
  limite: number
}) {
  const alLimite = seleccionados.length >= limite
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {campos.map((c) => {
        const checked = seleccionados.includes(c.key)
        const disabled = !checked && alLimite
        return (
          <label
            key={c.key}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
              checked ? 'border-brand/40 bg-brand/5 text-ink' : 'border-gray-100 text-ink-secondary',
              disabled && 'opacity-40',
            )}
            title={disabled ? `Máximo ${limite} seleccionados` : undefined}
          >
            <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(c.key)} />
            {c.label}
          </label>
        )
      })}
      {campos.length === 0 && <p className="text-xs text-ink-tertiary">Sin opciones disponibles.</p>}
    </div>
  )
}

// Filtro de texto (NVarChar) resuelto como <select> con los valores realmente
// existentes en la BD para esa fuente — evita que el usuario escriba un valor
// que nunca coincide con ningún registro (comparación exacta en el backend).
function FiltroTextoSelect({ fuente, filtroKey, value, onChange }: {
  fuente: FuenteReporte
  filtroKey: string
  value: string
  onChange: (value: string) => void
}) {
  const { data: opciones, isLoading } = useQuery({
    queryKey: ['reportes-filtro-opciones', fuente, filtroKey],
    queryFn: () => reportesEjecutivosService.getOpcionesFiltro(fuente, filtroKey),
    staleTime: 60_000,
  })
  return (
    <select
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading}
    >
      <option value="">Todos</option>
      {(opciones ?? []).map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

// ── Panel de filtros dinámicos ────────────────────────────────────────────
function FiltrosPanel({ fuente, filtrosDisponibles, filtros, onChange }: {
  fuente: FuenteReporte
  filtrosDisponibles: { key: string; label: string; tipo: string }[]
  filtros: Record<string, string>
  onChange: (filtros: Record<string, string>) => void
}) {
  const { data: usuarios } = useUsuariosSimple()
  const { data: tiposDecision } = useQuery({
    queryKey: ['decisiones-tipos'],
    queryFn: () => decisionesService.listTipos(),
    staleTime: 5 * 60_000,
    enabled: filtrosDisponibles.some((f) => f.key === FILTRO_TIPO_DECISION_ID),
  })

  if (filtrosDisponibles.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {filtrosDisponibles.map((f) => {
        const esUsuarioId = FILTROS_USUARIO_ID.has(f.key)
        const esTipoDecisionId = f.key === FILTRO_TIPO_DECISION_ID
        const esFecha = f.tipo === 'fecha'
        return (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">{f.label}</label>
            {esUsuarioId ? (
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={filtros[f.key] || ''}
                onChange={(e) => onChange({ ...filtros, [f.key]: e.target.value })}
              >
                <option value="">Todos</option>
                {(usuarios ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            ) : esTipoDecisionId ? (
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={filtros[f.key] || ''}
                onChange={(e) => onChange({ ...filtros, [f.key]: e.target.value })}
              >
                <option value="">Todos</option>
                {(tiposDecision ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            ) : esFecha ? (
              <input
                type="date"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={filtros[f.key] || ''}
                onChange={(e) => onChange({ ...filtros, [f.key]: e.target.value })}
              />
            ) : (
              <FiltroTextoSelect
                fuente={fuente}
                filtroKey={f.key}
                value={filtros[f.key] || ''}
                onChange={(v) => onChange({ ...filtros, [f.key]: v })}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tabla de resultados ────────────────────────────────────────────────
function TablaResultados({ resultado }: { resultado: ResultadoReporte }) {
  if (resultado.filas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
        <p className="text-sm text-ink-tertiary">No hay datos para esta selección de filtros.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
          <tr>
            {resultado.columnas.map((c) => (
              <th key={c.key} className="px-4 py-2 font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {resultado.filas.map((fila, i) => (
            <tr key={i}>
              {resultado.columnas.map((c) => (
                <td key={c.key} className="px-4 py-2.5 text-ink">{formatearValor(fila[c.key], c.formato)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Guardar como plantilla ────────────────────────────────────────────────
function GuardarPlantillaModal({ isOpen, onClose, config }: {
  isOpen: boolean
  onClose: () => void
  config: { fuente: FuenteReporte; metricas: string[]; dimensiones: string[]; agruparPor?: string; filtros?: Record<string, string> }
}) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const mutation = useMutation({
    mutationFn: () => reportesEjecutivosService.crearPlantilla({ nombre, descripcion: descripcion || undefined, ...config }),
    onSuccess: () => {
      toast.success('Plantilla guardada')
      queryClient.invalidateQueries({ queryKey: ['reportes-plantillas'] })
      setNombre('')
      setDescripcion('')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la plantilla'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Guardar como plantilla" size="sm" elevated>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. OKR por área - trimestral"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Mis plantillas ───────────────────────────────────────────────────────
function PlantillasPanel({ onEjecutar }: { onEjecutar: (fuente: FuenteReporte, resultado: ResultadoReporte) => void }) {
  const queryClient = useQueryClient()
  const { can } = useActionAccess()
  const puedeEliminar = can('direccion-general', 'reporte-eliminar')
  const [ejecutandoId, setEjecutandoId] = useState<number | null>(null)

  const { data: plantillas, isLoading } = useQuery({
    queryKey: ['reportes-plantillas'],
    queryFn: () => reportesEjecutivosService.listPlantillas(),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => reportesEjecutivosService.eliminarPlantilla(id),
    onSuccess: () => {
      toast.success('Plantilla eliminada')
      queryClient.invalidateQueries({ queryKey: ['reportes-plantillas'] })
    },
    onError: () => toast.error('No se pudo eliminar la plantilla'),
  })

  const ejecutar = async (p: PlantillaReporte) => {
    setEjecutandoId(p.id)
    try {
      const resultado = await reportesEjecutivosService.ejecutarPlantilla(p.id)
      onEjecutar(p.fuente, resultado)
      toast.success(`Reporte "${p.nombre}" generado`)
    } catch {
      toast.error('No se pudo ejecutar la plantilla')
    } finally {
      setEjecutandoId(null)
    }
  }

  if (isLoading) return <p className="text-sm text-ink-tertiary">Cargando plantillas...</p>

  if (!plantillas || plantillas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
        <p className="text-sm text-ink-tertiary">Todavía no hay plantillas guardadas. Genera un reporte y usa "Guardar como plantilla".</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
          <tr>
            <th className="px-4 py-2 font-semibold">Nombre</th>
            <th className="px-4 py-2 font-semibold">Fuente</th>
            <th className="px-4 py-2 font-semibold">Creado por</th>
            <th className="px-4 py-2 font-semibold">Fecha</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plantillas.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2.5">
                <p className="font-medium text-ink">{p.nombre}</p>
                {p.descripcion && <p className="text-[11px] text-ink-tertiary">{p.descripcion}</p>}
              </td>
              <td className="px-4 py-2.5 text-ink-tertiary">{FUENTE_LABEL[p.fuente] || p.fuente}</td>
              <td className="px-4 py-2.5 text-ink-tertiary">{p.creadoPorNombre || '—'}</td>
              <td className="px-4 py-2.5 text-ink-tertiary">{new Date(p.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => ejecutar(p)}
                    disabled={ejecutandoId === p.id}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                    title="Ejecutar"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                  </button>
                  {puedeEliminar && (
                    <button onClick={() => eliminarMutation.mutate(p.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
const LIMITE_METRICAS = 6
const LIMITE_DIMENSIONES = 3
type Tab = 'generador' | 'plantillas'

export function ReportesEjecutivosPage() {
  const [tab, setTab] = useState<Tab>('generador')
  const [guardarPlantillaOpen, setGuardarPlantillaOpen] = useState(false)
  const { can } = useActionAccess()
  const puedeCrearPlantilla = can('direccion-general', 'reporte-crear')
  const [fuente, setFuente] = useState<FuenteReporte>('okr')
  const [metricas, setMetricas] = useState<string[]>([])
  const [dimensiones, setDimensiones] = useState<string[]>([])
  const [agruparPor, setAgruparPor] = useState('')
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<ResultadoReporte | null>(null)
  const [exportandoPdf, setExportandoPdf] = useState(false)

  const { data: catalogo, isLoading: catalogoLoading } = useQuery({
    queryKey: ['reportes-catalogo'],
    queryFn: () => reportesEjecutivosService.getCatalogo(),
    staleTime: 5 * 60_000,
  })

  const fuenteData = catalogo?.porFuente[fuente]

  const cambiarFuente = (f: FuenteReporte) => {
    setFuente(f)
    setMetricas([])
    setDimensiones([])
    setAgruparPor('')
    setFiltros({})
    setResultado(null)
  }

  const toggleMetrica = (key: string) => {
    setMetricas((prev) => (prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]))
  }

  const toggleDimension = (key: string) => {
    setDimensiones((prev) => {
      const next = prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
      if (!next.includes(agruparPor)) setAgruparPor('')
      return next
    })
  }

  const configActual = useMemo(() => ({
    fuente,
    metricas,
    dimensiones,
    agruparPor: agruparPor || undefined,
    filtros,
  }), [fuente, metricas, dimensiones, agruparPor, filtros])

  const ejecutarMutation = useMutation({
    mutationFn: () => reportesEjecutivosService.ejecutarReporte(configActual),
    onSuccess: (data) => setResultado(data),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo generar el reporte')
    },
  })

  const handleExportarPdf = async () => {
    if (!resultado) return
    setExportandoPdf(true)
    try {
      const blob = await reportesEjecutivosService.exportarPdf(configActual)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporte_${fuente}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = () => {
    if (!resultado || resultado.filas.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      resultado.columnas.map((c) => c.label),
      ...resultado.filas.map((fila) => resultado.columnas.map((c) => formatearValor(fila[c.key], c.formato))),
    ])
    sheet['!cols'] = resultado.columnas.map(() => ({ wch: 22 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Reporte')
    XLSX.writeFile(wb, `reporte_${fuente}.xlsx`)
  }

  const irAGeneradorConResultado = (fuenteResultado: FuenteReporte, resultadoPlantilla: ResultadoReporte) => {
    setFuente(fuenteResultado)
    setResultado(resultadoPlantilla)
    setTab('generador')
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'generador', label: 'Generador', icon: LayoutGrid },
    { key: 'plantillas', label: 'Mis plantillas', icon: BookMarked },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Reportes ejecutivos</h1>
            <p className="text-xs text-blue-200/70">Generador guiado de reportes sobre OKR, indicadores y decisiones</p>
          </div>
        </div>
      </div>

      <div className="flex rounded-lg border border-gray-200 p-0.5 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', tab === t.key ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-50')}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'plantillas' ? (
        <PlantillasPanel onEjecutar={irAGeneradorConResultado} />
      ) : catalogoLoading || !catalogo ? (
        <p className="text-sm text-ink-tertiary">Cargando catálogo...</p>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-ink">1. Fuente de datos</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {catalogo.fuentes.map((f) => (
                <SelectorFuenteCard
                  key={f.key}
                  fuente={f.key}
                  activa={fuente === f.key}
                  label={f.label}
                  descripcion={FUENTE_DESCRIPCION[f.key]}
                  onClick={() => cambiarFuente(f.key)}
                />
              ))}
            </div>
          </div>

          {fuenteData && (
            <>
              <div className="space-y-2 rounded-2xl border border-gray-100 bg-card p-4">
                <h2 className="text-sm font-bold text-ink">2. Métricas ({metricas.length}/{LIMITE_METRICAS})</h2>
                <CampoCheckboxList campos={fuenteData.metricas} seleccionados={metricas} onToggle={toggleMetrica} limite={LIMITE_METRICAS} />
              </div>

              <div className="space-y-2 rounded-2xl border border-gray-100 bg-card p-4">
                <h2 className="text-sm font-bold text-ink">3. Dimensiones ({dimensiones.length}/{LIMITE_DIMENSIONES})</h2>
                <CampoCheckboxList campos={fuenteData.dimensiones} seleccionados={dimensiones} onToggle={toggleDimension} limite={LIMITE_DIMENSIONES} />
              </div>

              {fuenteData.filtros.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-gray-100 bg-card p-4">
                  <h2 className="text-sm font-bold text-ink">4. Filtros (opcional)</h2>
                  <FiltrosPanel fuente={fuente} filtrosDisponibles={fuenteData.filtros} filtros={filtros} onChange={setFiltros} />
                </div>
              )}

              {dimensiones.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-gray-100 bg-card p-4">
                  <h2 className="text-sm font-bold text-ink">5. Agrupar por (opcional)</h2>
                  <select
                    className="w-full max-w-xs rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    value={agruparPor}
                    onChange={(e) => setAgruparPor(e.target.value)}
                  >
                    <option value="">Sin agrupación</option>
                    {dimensiones.map((d) => {
                      const campo = fuenteData.dimensiones.find((c) => c.key === d)
                      return <option key={d} value={d}>{campo?.label || d}</option>
                    })}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button onClick={() => ejecutarMutation.mutate()} isLoading={ejecutarMutation.isPending} disabled={metricas.length === 0}>
                  <Play className="h-3.5 w-3.5" /> Generar reporte
                </Button>
                {resultado && (
                  <div className="flex items-center gap-2">
                    {puedeCrearPlantilla && (
                      <Button size="sm" variant="secondary" onClick={() => setGuardarPlantillaOpen(true)}>
                        <Save className="h-3.5 w-3.5" /> Guardar como plantilla
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
                      <FileDown className="h-3.5 w-3.5" /> PDF
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                    </Button>
                  </div>
                )}
              </div>

              {resultado && (
                <div className="space-y-2">
                  <p className="text-xs text-ink-tertiary">{resultado.totalFilas} fila{resultado.totalFilas !== 1 ? 's' : ''} generadas el {new Date(resultado.generadoAt).toLocaleString()}</p>
                  <TablaResultados resultado={resultado} />
                </div>
              )}
            </>
          )}
        </>
      )}

      <GuardarPlantillaModal isOpen={guardarPlantillaOpen} onClose={() => setGuardarPlantillaOpen(false)} config={configActual} />
    </div>
  )
}
