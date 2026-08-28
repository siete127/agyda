import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gauge, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus, X, MessageSquare, FileDown, FileSpreadsheet, Trash2, Share2 } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  direccionGeneralService,
  type KpiIndicador,
} from '@/services/direccionGeneral.service'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from './useUsuariosSimple'

const currentPeriodo = new Date().toISOString().slice(0, 7)

function tonoConfig(kpi: KpiIndicador) {
  if (kpi.tono === 'critical') return { cls: 'bg-red-100 text-red-700', bar: 'bg-red-500', line: '#dc2626' }
  if (kpi.tono === 'warn') return { cls: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400', line: '#d97706' }
  if (kpi.tono === 'success') return { cls: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', line: '#059669' }
  return { cls: 'bg-blue-50 text-blue-700', bar: 'bg-brand', line: '#1B4FD8' }
}

// "Menor es mejor" se infiere: si el tono es crítico/riesgo con valores altos relativo a la meta
// tratamos como "mayor es mejor" (caso común: ventas, ingresos). Sin una bandera explícita en el
// dato, usamos progreso >100% como "mejor" por defecto — heurística simple, ver plan.
function varianzaConfig(variacionPct: number | null) {
  if (variacionPct === null) return null
  if (variacionPct > 0) return { Icon: TrendingUp, cls: 'text-emerald-600' }
  if (variacionPct < 0) return { Icon: TrendingDown, cls: 'text-red-600' }
  return { Icon: Minus, cls: 'text-ink-tertiary' }
}

// ── Sparkline minimal ────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: { valor: number }[]; color: string }) {
  if (data.length < 2) return null
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Tarjeta de KPI ────────────────────────────────────────────────────────
function KpiCard({ kpi, areaLabel, onClick }: { kpi: KpiIndicador; areaLabel: string; onClick: () => void }) {
  const cfg = tonoConfig(kpi)
  const pct = kpi.progreso !== null ? Math.max(0, Math.min(100, kpi.progreso)) : null

  const { data: historico } = useQuery({
    queryKey: ['kpi-historico', kpi.areaKey, kpi.kpiKey],
    queryFn: () => direccionGeneralService.getKpiHistorico(kpi.areaKey, kpi.kpiKey, 6),
    staleTime: 60_000,
  })

  const variacion = historico && historico.length > 0 ? historico[historico.length - 1].variacionPct : null
  const varCfg = varianzaConfig(variacion)

  return (
    <button onClick={onClick} className="flex h-full flex-col rounded-xl border border-gray-100 bg-card p-3.5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">{areaLabel}</span>

      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-xs font-semibold leading-snug text-ink">{kpi.label}</span>
        {kpi.tono && <span className={clsx('chip shrink-0', cfg.cls)}>{kpi.progreso !== null ? `${kpi.progreso}%` : '—'}</span>}
      </div>

      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-ink">{kpi.valor.toLocaleString()}</span>
        <span className="text-xs text-ink-tertiary">{kpi.unidad || ''}</span>
        {varCfg && variacion !== null && (
          <span className={clsx('ml-auto flex items-center gap-0.5 text-[11px] font-semibold', varCfg.cls)}>
            <varCfg.Icon className="h-3 w-3" />
            {Math.abs(variacion)}%
          </span>
        )}
      </div>

      {kpi.meta !== null ? (
        <>
          <p className="mb-1 text-[11px] text-ink-tertiary">
            {pct !== null ? `${pct}% de la meta` : ''} · meta {kpi.meta.toLocaleString()} {kpi.unidad || ''}
          </p>
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className={clsx('h-full transition-all', cfg.bar)} style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="mb-2 text-[11px] italic text-ink-tertiary">Sin meta definida</p>
      )}

      <div className="mt-auto">
        {historico && historico.length >= 2 ? (
          <Sparkline data={historico} color={cfg.line} />
        ) : (
          <p className="text-[10px] text-ink-tertiary">Aún sin histórico suficiente</p>
        )}
      </div>

      {kpi.comentariosCount > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-ink-tertiary">
          <MessageSquare className="h-3 w-3" />
          {kpi.comentariosCount} comentario{kpi.comentariosCount !== 1 ? 's' : ''}
        </div>
      )}
    </button>
  )
}

// ── Comentarios de un KPI ────────────────────────────────────────────────
function ComentariosKpiSection({ kpi }: { kpi: KpiIndicador }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')
  const { can } = useActionAccess()
  const puedeComentar = can('direccion-general', 'indicadores-comentar')

  const { data, isLoading } = useQuery({
    queryKey: ['kpi-comentarios', kpi.areaKey, kpi.kpiKey, kpi.periodo],
    queryFn: () => direccionGeneralService.getComentariosKpi(kpi.areaKey, kpi.kpiKey, kpi.periodo),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['kpi-comentarios', kpi.areaKey, kpi.kpiKey, kpi.periodo] })
    queryClient.invalidateQueries({ queryKey: ['direccion-general-indicadores'] })
  }

  const crearMutation = useMutation({
    mutationFn: () => direccionGeneralService.crearComentarioKpi(kpi.areaKey, kpi.kpiKey, texto, kpi.periodo),
    onSuccess: () => {
      setTexto('')
      invalidate()
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => direccionGeneralService.eliminarComentarioKpi(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el comentario'),
  })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <MessageSquare className="h-3.5 w-3.5" /> Comentarios
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {data?.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink">{c.texto}</p>
                  <p className="mt-1 text-[11px] text-ink-tertiary">
                    {c.autorNombre || 'Usuario'} · {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                {c.usuarioId === currentUserId && puedeComentar && (
                  <button onClick={() => eliminarMutation.mutate(c.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin comentarios aún.</p>}
        </ul>
      )}
      {puedeComentar && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            crearMutation.mutate()
          }}
        >
          <input
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Agregar comentario..."
          />
          <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Comentar</Button>
        </form>
      )}
    </div>
  )
}

// ── Modal de detalle: histórico + gobernanza ─────────────────────────────
function KpiDetalleModal({ kpi, onClose }: { kpi: KpiIndicador | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [editando, setEditando] = useState(false)
  const [responsableId, setResponsableId] = useState<string>('')
  const [formula, setFormula] = useState('')
  const [origen, setOrigen] = useState('')

  const { data: historico, isLoading } = useQuery({
    queryKey: ['kpi-historico-full', kpi?.areaKey, kpi?.kpiKey],
    queryFn: () => direccionGeneralService.getKpiHistorico(kpi!.areaKey, kpi!.kpiKey, 12),
    enabled: !!kpi,
  })

  const mutation = useMutation({
    mutationFn: () =>
      direccionGeneralService.actualizarGobernanzaKpi(kpi!.areaKey, kpi!.kpiKey, {
        periodo: kpi!.periodo,
        responsableId: responsableId ? Number(responsableId) : null,
        formula: formula || null,
        origen: origen || null,
      }),
    onSuccess: () => {
      toast.success('Gobernanza actualizada')
      queryClient.invalidateQueries({ queryKey: ['direccion-general-indicadores'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  if (!kpi) return null

  const startEdit = () => {
    setResponsableId('')
    setFormula(kpi.formula || '')
    setOrigen(kpi.origen || '')
    setEditando(true)
  }

  return (
    <Modal isOpen={!!kpi} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">{kpi.label}</h2>
            <p className="text-xs text-ink-tertiary">
              {kpi.valor.toLocaleString()} {kpi.unidad || ''} {kpi.meta !== null ? `· meta ${kpi.meta.toLocaleString()} ${kpi.unidad || ''}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Últimos 12 meses</h3>
          {isLoading ? (
            <p className="text-xs text-ink-tertiary">Cargando...</p>
          ) : !historico || historico.length < 2 ? (
            <p className="text-xs text-ink-tertiary">Aún no hay suficiente histórico para graficar (se necesitan al menos 2 periodos).</p>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historico}>
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="valor" name="Valor" stroke="#1B4FD8" strokeWidth={2} dot={{ r: 3 }} />
                  {historico.some((p) => p.meta !== null) && (
                    <Line type="monotone" dataKey="meta" name="Meta" stroke="#CBD5E1" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Gobernanza del indicador</h3>
            {!editando && (
              <button onClick={startEdit} className="text-[11px] font-semibold text-brand hover:underline">Editar</button>
            )}
          </div>

          {!editando ? (
            <div className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs text-ink-secondary">
              <p><span className="font-semibold text-ink">Responsable:</span> {kpi.responsable || 'Sin asignar'}</p>
              <p><span className="font-semibold text-ink">Fórmula:</span> {kpi.formula || 'No definida'}</p>
              <p><span className="font-semibold text-ink">Fuente:</span> {kpi.origen || 'No especificada'}</p>
              <p><span className="font-semibold text-ink">Última actualización:</span> {new Date(kpi.fechaCorte).toLocaleString()}</p>
            </div>
          ) : (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                mutation.mutate()
              }}
            >
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-secondary">Responsable</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={responsableId}
                  onChange={(e) => setResponsableId(e.target.value)}
                >
                  <option value="">Sin cambio</option>
                  {usuarios?.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-secondary">Fórmula</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="Ej. Ingresos del mes / Meta mensual"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-ink-secondary">Fuente del dato</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                  placeholder="Ej. CRM, ERP, Excel manual"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
                <Button type="submit" size="sm" isLoading={mutation.isPending}>Guardar</Button>
              </div>
            </form>
          )}
        </div>

        <ComentariosKpiSection kpi={kpi} />
      </div>
    </Modal>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function IndicadoresEmpresarialesPage() {
  const [periodo, setPeriodo] = useState(currentPeriodo)
  const [kpiActivo, setKpiActivo] = useState<KpiIndicador | null>(null)
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const { can } = useActionAccess()
  const puedeExportar = can('direccion-general', 'indicadores-exportar')

  const { data, isLoading } = useQuery({
    queryKey: ['direccion-general-indicadores', periodo],
    queryFn: () => direccionGeneralService.getIndicadores(periodo),
    staleTime: 30_000,
  })

  const areasConDatos = (data?.areas || []).filter((a) => a.kpis.length > 0)
  const areasSinDatos = (data?.areas || []).filter((a) => !a.reportando)

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await direccionGeneralService.exportarIndicadoresPdf(periodo)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `indicadores_empresariales_${periodo}.pdf`
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
    if (areasConDatos.length === 0) {
      toast.error('No hay indicadores para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Área', 'Indicador', 'Valor', 'Unidad', 'Meta', 'Progreso %', 'Responsable', 'Fórmula', 'Fuente'],
      ...areasConDatos.flatMap((a) =>
        a.kpis.map((k) => [
          a.label,
          k.label,
          k.valor,
          k.unidad || '',
          k.meta ?? '',
          k.progreso ?? '',
          k.responsable || '',
          k.formula || '',
          k.origen || '',
        ]),
      ),
    ])
    sheet['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 20 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Indicadores')
    XLSX.writeFile(wb, `indicadores_empresariales_${periodo}.xlsx`)
  }

  const compartirMutation = useMutation({
    mutationFn: () => direccionGeneralService.generarLinkIndicadores(periodo),
    onSuccess: async ({ token }) => {
      const url = `${window.location.origin}/indicadores-publico?token=${token}`
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Enlace copiado — vence en 30 días')
      } catch {
        toast.success(url, { duration: 8000 })
      }
    },
    onError: () => toast.error('No se pudo generar el enlace'),
  })

  const chartData = useMemo(() => {
    return areasConDatos
      .flatMap((a) => a.kpis.filter((k) => k.meta !== null).map((k) => ({
        nombre: `${k.label}`.length > 18 ? `${k.label.slice(0, 16)}…` : k.label,
        valor: k.valor,
        meta: k.meta as number,
      })))
      .slice(0, 12)
  }, [areasConDatos])

  const stats: DashboardStat[] = data ? [
    { key: 'total', icon: Gauge, label: 'KPIs publicados', value: data.totales.totalKpis, tone: 'brand' },
    { key: 'onMeta', icon: CheckCircle2, label: 'En meta', value: data.totales.onMeta, tone: 'success' },
    { key: 'riesgo', icon: AlertTriangle, label: 'En riesgo', value: data.totales.enRiesgo, tone: 'warn' },
    { key: 'critico', icon: XCircle, label: 'Críticos', value: data.totales.critico, tone: 'critical' },
  ] : []

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Gauge className="h-6 w-6 text-blue-300" />
            <div>
              <h1 className="text-lg font-bold">Indicadores empresariales</h1>
              <p className="text-xs text-blue-200/70">Indicadores clave consolidados de la empresa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white [color-scheme:dark]"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
            />
            {puedeExportar && (
              <>
                <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={() => compartirMutation.mutate()} isLoading={compartirMutation.isPending}>
                  <Share2 className="h-3.5 w-3.5" /> Compartir
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.totales.totalKpis === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Ninguna área ha publicado indicadores para este periodo.</p>
        </div>
      ) : (
        <>
          <DashboardStatRow stats={stats} />

          {chartData.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Valor vs. meta</h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                    <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="valor" name="Valor actual" fill="#1B4FD8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="meta" name="Meta" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold text-ink">Todos los indicadores</h2>
            <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {areasConDatos.flatMap((area) =>
                area.kpis.map((kpi) => (
                  <KpiCard key={`${area.areaKey}-${kpi.kpiKey}`} kpi={kpi} areaLabel={area.label} onClick={() => setKpiActivo(kpi)} />
                )),
              )}
            </div>
          </div>

          {areasSinDatos.length > 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Sin datos este periodo</h2>
              <div className="flex flex-wrap gap-2">
                {areasSinDatos.map((a) => (
                  <span key={a.areaKey} className="chip bg-gray-100 text-gray-500">{a.label}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <KpiDetalleModal kpi={kpiActivo} onClose={() => setKpiActivo(null)} />
    </div>
  )
}
