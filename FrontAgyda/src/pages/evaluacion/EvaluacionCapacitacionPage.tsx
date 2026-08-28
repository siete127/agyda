import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Plus, RefreshCw, CheckCircle2,
  Clock, User, Calendar, ChevronRight, Trash2, Save, Download, Search, X,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Evaluacion {
  id: number
  agenteId: number
  agenteNombre: string
  supervisorId: number
  supervisorNombre: string
  semanaInicio: string
  calificacion: number | null
  estado: 'borrador' | 'finalizado'
  fechaCreacion: string
}

interface Criterio {
  key: string
  label: string
  subitems: number
}

interface DetalleItem {
  criterioKey: string
  subitem: number
  dia: number
  valor: number | null
}

interface EvalDetalle extends Evaluacion {
  fortalezas: string
  areasOportunidad: string
  planAccion: string
  detalle: DetalleItem[]
  criterios: Criterio[]
}

// valor: 2=Cumple, 1=Parcial, 0=No cumple, null=sin marcar
const SEMAFORO = [
  { valor: 2, label: 'Cumple',    color: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-700' },
  { valor: 1, label: 'Parcial',   color: 'bg-amber-400',   ring: 'ring-amber-400',   text: 'text-amber-700' },
  { valor: 0, label: 'No cumple', color: 'bg-gray-300',    ring: 'ring-gray-400',    text: 'text-gray-500' },
]

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const fmtSemana = (s: string) => {
  try {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return s }
}

function calBadge(cal: number | null) {
  if (cal === null) return <span className="chip bg-gray-100 text-gray-400 text-[0.68rem]">Sin calificar</span>
  const color = cal >= 90 ? 'bg-emerald-100 text-emerald-700' : cal >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
  const label = cal >= 90 ? 'Excelente' : cal >= 70 ? 'Regular' : 'Requiere coaching'
  return (
    <div className="flex items-center gap-1.5">
      <span className={clsx('chip text-[0.68rem]', color)}>{cal.toFixed(1)}/100</span>
      <span className={clsx('text-[0.65rem] font-medium', color.replace('bg-', 'text-').replace('-100', '-600'))}>{label}</span>
    </div>
  )
}

// ─── Modal de creación ────────────────────────────────────────────────────────
function CrearEvalModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const [agenteId, setAgenteId] = useState('')
  const [semana, setSemana] = useState(() => {
    // Calcular el lunes de la semana actual
    const hoy = new Date()
    const dow = hoy.getDay()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1))
    return lunes.toISOString().slice(0, 10)
  })

  const { data: agentes = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['eval-agentes-cc'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/area/CC')
      const list = Array.isArray(data?.data) ? data.data : []
      return (list as Record<string, unknown>[]).map((r) => ({ id: Number(r['id']), nombre: String(r['nombre'] ?? '') }))
    },
  })

  const crear = useMutation({
    mutationFn: () => api.post('/eval-capacitacion', { agenteId: Number(agenteId), semanaInicio: semana }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['eval-capacitacion'] })
      toast.success('Evaluación creada')
      onCreated(res.data.id)
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nueva evaluación de capacitación" size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Agente a evaluar</label>
          <select value={agenteId} onChange={(e) => setAgenteId(e.target.value)} className="field">
            <option value="">Selecciona un agente CC</option>
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Semana (inicio lunes)</label>
          <input type="date" value={semana} onChange={(e) => setSemana(e.target.value)} className="field" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!agenteId || !semana} onClick={() => crear.mutate()}>
            <Plus className="h-3.5 w-3.5" /> Crear evaluación
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal de llenado ─────────────────────────────────────────────────────────
function EvalFormModal({ evalId, soloLectura, onClose }: { evalId: number; soloLectura: boolean; onClose: () => void }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<EvalDetalle>({
    queryKey: ['eval-capacitacion-detalle', evalId],
    queryFn: async () => (await api.get(`/eval-capacitacion/${evalId}`)).data?.data,
  })

  // Estado local del grid: "criterioKey|1|dia" → valor (subitem siempre 1)
  const [grid, setGrid] = useState<Record<string, number | null>>({})
  const [resumen, setResumen] = useState({ fortalezas: '', areasOportunidad: '', planAccion: '' })
  const [initialized, setInitialized] = useState(false)
  const [confirmFinalizar, setConfirmFinalizar] = useState(false)

  if (data && !initialized) {
    const g: Record<string, number | null> = {}
    for (const d of data.detalle) {
      // Only take subitem 1 (first/only row per criterion)
      if (d.subitem === 1) g[`${d.criterioKey}|1|${d.dia}`] = d.valor
    }
    setGrid(g)
    setResumen({ fortalezas: data.fortalezas, areasOportunidad: data.areasOportunidad, planAccion: data.planAccion })
    setInitialized(true)
  }

  // Calificación en tiempo real (1 subitem per criterion)
  const calificacionLocal = useMemo(() => {
    if (!data) return null
    const maxPts = data.criterios.length * 6 * 2
    const suma = Object.values(grid).reduce<number>((s, v) => s + (v ?? 0), 0)
    return maxPts > 0 ? Math.round((suma / maxPts) * 10000) / 100 : 0
  }, [grid, data])

  const handleDownloadPDF = () => {
    if (!data) return
    const printWindow = window.open('', '_blank', 'width=1000,height=750')
    if (!printWindow) return

    // Colors for each semaforo value
    const dotStyle = (valor: number | null, target: number) => {
      if (valor !== target) return 'display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #ccc;background:#fff;margin:0 2px;vertical-align:middle;'
      if (target === 2) return 'display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #059669;background:#10b981;margin:0 2px;vertical-align:middle;'
      if (target === 1) return 'display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #d97706;background:#fbbf24;margin:0 2px;vertical-align:middle;'
      return 'display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid #9ca3af;background:#d1d5db;margin:0 2px;vertical-align:middle;'
    }

    const tableRows = data.criterios.map((c, ci) => {
      const bg = ci % 2 === 0 ? '#fff' : '#f9fafb'
      const days = DIAS.map((_, di) => {
        const v = getValor(c.key, di + 1)
        return `<td style="border:1px solid #e5e7eb;padding:5px 6px;text-align:center;background:${bg}">
          <span style="${dotStyle(v, 2)}"></span>
          <span style="${dotStyle(v, 1)}"></span>
          <span style="${dotStyle(v, 0)}"></span>
        </td>`
      }).join('')
      return `<tr>
        <td style="border:1px solid #e5e7eb;padding:5px 10px;font-weight:600;font-size:10px;background:${bg}">${c.label}</td>
        ${days}
      </tr>`
    }).join('')

    const calColor = (calificacionLocal ?? 0) >= 90 ? '#059669' : (calificacionLocal ?? 0) >= 70 ? '#d97706' : '#dc2626'

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Evaluación de Capacitación</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
        @media print { body { margin: 10px; } @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>
      <div style="background:#0D1B3E;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:12px">
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;opacity:0.6;margin-bottom:6px">Evaluación Semanal de Capacitación</div>
        <div style="display:flex;gap:32px;flex-wrap:wrap;font-size:11px">
          <span><b>Agente:</b> ${data.agenteNombre}</span>
          <span><b>Supervisor:</b> ${data.supervisorNombre}</span>
          <span><b>Semana:</b> ${fmtSemana(data.semanaInicio)}</span>
          <span style="background:${data.estado === 'finalizado' ? 'rgba(16,185,129,0.3)' : 'rgba(251,191,36,0.3)'};padding:2px 8px;border-radius:99px;font-size:9px;font-weight:700">
            ${data.estado === 'finalizado' ? 'Finalizado' : 'Borrador'}
          </span>
        </div>
      </div>

      <div style="display:flex;gap:16px;margin-bottom:8px;font-size:10px;align-items:center">
        <b>Semáforo:</b>
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#10b981;vertical-align:middle;margin-right:4px"></span>Cumple</span>
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#fbbf24;vertical-align:middle;margin-right:4px"></span>Parcial</span>
        <span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#d1d5db;vertical-align:middle;margin-right:4px"></span>No cumple</span>
      </div>

      <table style="border-collapse:collapse;width:100%;margin-bottom:12px;font-size:10px">
        <thead>
          <tr style="background:#0D1B3E;color:#fff">
            <th style="padding:7px 10px;text-align:left;font-size:10px;min-width:140px">Criterio</th>
            ${DIAS.map(d => `<th style="padding:7px 8px;text-align:center;font-size:10px;min-width:80px">${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280">Calificación provisional</div>
          <div style="font-size:9px;color:#9ca3af;margin-top:2px">90-100 = Excelente · 70-89 = Regular · &lt;70 = Requiere coaching</div>
        </div>
        <div style="font-size:22px;font-weight:700;color:${calColor}">${calificacionLocal?.toFixed(1) ?? '—'}<span style="font-size:13px;font-weight:400;color:#9ca3af">/100</span></div>
      </div>

      <div style="margin-bottom:6px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:4px">Resumen semanal</div>
      ${[
        { label: 'Fortalezas', val: resumen.fortalezas },
        { label: 'Áreas de oportunidad', val: resumen.areasOportunidad },
        { label: 'Plan de acción', val: resumen.planAccion },
      ].map(({ label, val }) => `
        <div style="margin-bottom:8px">
          <div style="font-size:9px;font-weight:600;color:#6b7280;margin-bottom:3px">${label}:</div>
          <div style="border:1px solid #e5e7eb;border-radius:4px;padding:6px 8px;min-height:28px;font-size:10px">${val || '—'}</div>
        </div>
      `).join('')}
    </body></html>`

    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 500)
  }

  const buildDetalle = () =>
    Object.entries(grid).map(([k, valor]) => {
      const [criterioKey, subitem, dia] = k.split('|')
      return { criterioKey, subitem: Number(subitem), dia: Number(dia), valor }
    })

  const guardar = useMutation({
    mutationFn: () => api.put(`/eval-capacitacion/${evalId}`, { detalle: buildDetalle(), ...resumen }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eval-capacitacion'] })
      toast.success('Guardado correctamente')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const finalizar = useMutation({
    mutationFn: async () => {
      await api.put(`/eval-capacitacion/${evalId}`, { detalle: buildDetalle(), ...resumen })
      return api.patch(`/eval-capacitacion/${evalId}/finalizar`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eval-capacitacion'] })
      qc.invalidateQueries({ queryKey: ['eval-capacitacion-detalle', evalId] })
      toast.success('Evaluación finalizada')
      setConfirmFinalizar(false)
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error'),
  })

  // subitem is always 1 now (one row per criterion)
  const setValor = (key: string, dia: number, valor: number) => {
    if (soloLectura || data?.estado === 'finalizado') return
    const k = `${key}|1|${dia}`
    setGrid((g) => ({ ...g, [k]: g[k] === valor ? null : valor }))
  }

  const getValor = (key: string, dia: number) => grid[`${key}|1|${dia}`] ?? null

  const esFinalizado = data?.estado === 'finalizado'
  const readonly = soloLectura || esFinalizado

  return (
    <Modal isOpen onClose={onClose} title="" size="xl">
      {isLoading || !data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            {/* Encabezado */}
            <div className="rounded-xl bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-5 py-4 text-white mb-5">
              <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-white/50 mb-1">Evaluación Semanal de Capacitación</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-white/60" /><span className="text-white/70 text-[0.78rem]">Agente:</span> <span className="font-semibold text-[0.82rem]">{data.agenteNombre}</span></div>
                <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-white/60" /><span className="text-white/70 text-[0.78rem]">Supervisor:</span> <span className="font-semibold text-[0.82rem]">{data.supervisorNombre}</span></div>
                <div className="flex items-center gap-2 col-span-2"><Calendar className="h-3.5 w-3.5 text-white/60" /><span className="text-white/70 text-[0.78rem]">Semana:</span> <span className="font-semibold text-[0.82rem]">{fmtSemana(data.semanaInicio)}</span>
                  <span className={clsx('ml-3 rounded-full px-2 py-0.5 text-[0.65rem] font-bold', esFinalizado ? 'bg-emerald-500/30 text-emerald-200' : 'bg-amber-500/30 text-amber-200')}>
                    {esFinalizado ? 'Finalizado' : 'Borrador'}
                  </span>
                </div>
              </div>
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-4 text-[0.72rem] text-gray-500 mb-4">
              <span className="font-semibold">Semáforo:</span>
              {SEMAFORO.map((s) => (
                <span key={s.valor} className="flex items-center gap-1.5">
                  <span className={clsx('inline-block h-4 w-4 rounded-full border-2 border-white shadow', s.color)} />
                  {s.label}
                </span>
              ))}
            </div>

            {/* Grilla — una fila por criterio */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4">
              <table className="w-full text-[0.72rem]">
                <thead>
                  <tr className="border-b border-gray-200 bg-[#0D1B3E]">
                    <th className="sticky left-0 bg-[#0D1B3E] px-3 py-2.5 text-left font-semibold text-white/80 min-w-[160px]">Criterio</th>
                    {DIAS.map((d) => (
                      <th key={d} className="px-2 py-2.5 text-center font-semibold text-white/80 min-w-[88px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.criterios.map((criterio, ci) => (
                    <tr key={criterio.key}
                      className={clsx('border-b border-gray-100', ci % 2 === 0 ? 'bg-card' : 'bg-gray-50/50')}>
                      <td className={clsx('sticky left-0 px-3 py-2 font-semibold text-gray-800 text-[0.72rem]', ci % 2 === 0 ? 'bg-card' : 'bg-gray-50')}>
                        {criterio.label}
                      </td>
                      {DIAS.map((_, di) => (
                        <td key={di} className="px-2 py-2 text-center">
                          <div className="flex justify-center gap-1.5">
                            {SEMAFORO.map((sem) => {
                              const activo = getValor(criterio.key, di + 1) === sem.valor
                              return (
                                <button
                                  key={sem.valor}
                                  onClick={() => setValor(criterio.key, di + 1, sem.valor)}
                                  disabled={readonly}
                                  title={sem.label}
                                  className={clsx(
                                    'h-5 w-5 rounded-full border-2 transition-all',
                                    activo
                                      ? clsx(sem.color, 'border-white ring-2', sem.ring, 'shadow-sm scale-110')
                                      : 'bg-card border-gray-200 hover:border-gray-400',
                                    readonly && 'cursor-default'
                                  )}
                                />
                              )
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calificación */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between mb-4">
              <div>
                <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wide">Calificación provisional</p>
                <p className="text-[0.68rem] text-gray-400 mt-0.5">90-100 = Excelente · 70-89 = Regular · &lt;70 = Requiere coaching</p>
              </div>
              <div className="text-right">
                <p className={clsx('text-2xl font-bold tabular-nums',
                  (calificacionLocal ?? 0) >= 90 ? 'text-emerald-600' :
                  (calificacionLocal ?? 0) >= 70 ? 'text-amber-500' : 'text-red-500'
                )}>
                  {calificacionLocal?.toFixed(1) ?? '—'}<span className="text-base font-normal text-gray-400">/100</span>
                </p>
              </div>
            </div>

            {/* Resumen semanal */}
            <div className="space-y-3">
              <p className="text-[0.72rem] font-bold text-gray-600 uppercase tracking-wide border-b border-gray-100 pb-1">Resumen semanal</p>
              {[
                { key: 'fortalezas' as const,       label: 'Fortalezas:' },
                { key: 'areasOportunidad' as const, label: 'Áreas de oportunidad:' },
                { key: 'planAccion' as const,       label: 'Plan de acción:' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="mb-1 block text-[0.72rem] font-semibold text-gray-500">{label}</label>
                  <textarea
                    value={resumen[key]}
                    onChange={(e) => setResumen((r) => ({ ...r, [key]: e.target.value }))}
                    disabled={readonly}
                    rows={2}
                    className="field resize-none text-[0.82rem]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Acciones */}
          {!readonly && !confirmFinalizar && (
            <div className="flex justify-between gap-2 pt-1 border-t border-gray-100">
              <Button variant="ghost" onClick={handleDownloadPDF} className="text-gray-500">
                <Download className="h-3.5 w-3.5" /> Descargar PDF
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                <Button variant="ghost" isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
                  <Save className="h-3.5 w-3.5" /> Guardar borrador
                </Button>
                <Button
                  onClick={() => setConfirmFinalizar(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-[0.78rem]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar evaluación
                </Button>
              </div>
            </div>
          )}

          {/* Confirmación inline — evita modal anidado */}
          {!readonly && confirmFinalizar && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mt-1">
              <p className="text-sm font-semibold text-emerald-800 mb-1">¿Finalizar evaluación?</p>
              <p className="text-xs text-emerald-700 mb-3">Al finalizar, la evaluación quedará cerrada y la calificación se calculará. Esta acción no se puede deshacer.</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmFinalizar(false)} disabled={finalizar.isPending}>
                  Cancelar
                </Button>
                <Button
                  isLoading={finalizar.isPending}
                  onClick={() => finalizar.mutate()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-[0.78rem]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar y finalizar
                </Button>
              </div>
            </div>
          )}

          {readonly && (
            <div className="flex justify-between pt-1 border-t border-gray-100">
              <Button variant="ghost" onClick={handleDownloadPDF} className="text-gray-500">
                <Download className="h-3.5 w-3.5" /> Descargar PDF
              </Button>
              <Button variant="ghost" onClick={onClose}>Cerrar</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function EvaluacionCapacitacionPage() {
  const user = useAuthStore((s) => s.user)
  const rol = (user?.tipoUsuario ?? '').toUpperCase()
  const esAD = rol === 'AD'

  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [evalAbierta, setEvalAbierta] = useState<number | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<number | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'borrador' | 'finalizado'>('borrador')
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroSemana, setFiltroSemana] = useState('')

  const { data: evals = [], isLoading, isRefetching, refetch } = useQuery<Evaluacion[]>({
    queryKey: ['eval-capacitacion'],
    queryFn: async () => (await api.get('/eval-capacitacion')).data?.data ?? [],
  })

  const evalsFiltradas = useMemo(() => {
    return evals.filter((ev) => {
      if (filtroEstado !== 'todos' && ev.estado !== filtroEstado) return false
      if (filtroNombre && !ev.agenteNombre.toLowerCase().includes(filtroNombre.toLowerCase())) return false
      if (filtroSemana && ev.semanaInicio.slice(0, 10) !== filtroSemana) return false
      return true
    })
  }, [evals, filtroEstado, filtroNombre, filtroSemana])

  const hayFiltrosActivos = filtroEstado !== 'borrador' || !!filtroNombre || !!filtroSemana
  const limpiarFiltros = () => { setFiltroEstado('borrador'); setFiltroNombre(''); setFiltroSemana('') }

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/eval-capacitacion/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eval-capacitacion'] })
      toast.success('Evaluación eliminada')
      setConfirmEliminar(null)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner */}
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
                <ClipboardCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Evaluación de Capacitación</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">Evaluación semanal · Nuevo ingreso CC</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {esAD && (
                <Button onClick={() => setShowCrear(true)} className="bg-card !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Plus className="h-3.5 w-3.5" /> Nueva evaluación
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Estado</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Semana</label>
          <input type="date" value={filtroSemana} onChange={(e) => setFiltroSemana(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Agente</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre..." value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
          </div>
        </div>
        {hayFiltrosActivos && (
          <button onClick={limpiarFiltros} className="flex items-center gap-1 text-[0.75rem] text-gray-400 hover:text-gray-600 px-2 py-1.5">
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-14 animate-pulse bg-gray-100" />)}
        </div>
      ) : evals.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <ClipboardCheck className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin evaluaciones</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {esAD ? 'Crea la primera evaluación con el botón de arriba' : 'Aún no tienes evaluaciones registradas'}
            </p>
          </div>
        </div>
      ) : evalsFiltradas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
          <Search className="h-8 w-8 text-gray-300" />
          <p className="text-sm">Ningún resultado con los filtros aplicados</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-gray-500">Agente</th>
                  <th className="px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-gray-500">Estado</th>
                  <th className="px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-gray-500">Semana</th>
                  {esAD && <th className="px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-gray-500">Supervisor</th>}
                  <th className="px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-wide text-gray-500">Calificación</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {evalsFiltradas.map((ev) => (
                  <tr key={ev.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setEvalAbierta(ev.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                          ev.estado === 'finalizado' ? 'bg-emerald-100' : 'bg-amber-100'
                        )}>
                          {ev.estado === 'finalizado'
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            : <Clock className="h-4 w-4 text-amber-600" />
                          }
                        </div>
                        <span className="font-semibold text-gray-800 text-[0.82rem] truncate">{ev.agenteNombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('chip text-[0.65rem]', ev.estado === 'finalizado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                        {ev.estado === 'finalizado' ? 'Finalizado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-[0.78rem] text-gray-600 whitespace-nowrap"><Calendar className="h-3 w-3 text-gray-400" /> {fmtSemana(ev.semanaInicio)}</span>
                    </td>
                    {esAD && (
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-[0.78rem] text-gray-600 whitespace-nowrap"><User className="h-3 w-3 text-gray-400" /> {ev.supervisorNombre}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">{calBadge(ev.calificacion)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {esAD && ev.estado === 'borrador' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmEliminar(ev.id) }}
                            className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCrear && (
        <CrearEvalModal
          onClose={() => setShowCrear(false)}
          onCreated={(id) => setEvalAbierta(id)}
        />
      )}

      {evalAbierta !== null && (
        <EvalFormModal
          evalId={evalAbierta}
          soloLectura={!esAD}
          onClose={() => setEvalAbierta(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => confirmEliminar !== null && eliminar.mutate(confirmEliminar)}
        title="Eliminar evaluación"
        message="¿Eliminar esta evaluación? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
