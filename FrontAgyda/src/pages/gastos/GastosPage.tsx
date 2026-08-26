import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gastosService } from '@/services/gastos.service'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Receipt, Plus, Paperclip, Send, ChevronRight,
  ChevronDown, CheckCircle2, XCircle, Pencil, Trash2,
  Eye, MessageSquare, DollarSign, Search, Calendar,
  FileText, Users, CreditCard, Tag, Power,
} from 'lucide-react'
import type { Gasto, GastoCategoria, GastoReporte, GastoComentario } from '@/types/gasto.types'

/* ── colores por estatus ── */
const ESTATUS_REP: Record<string, string> = {
  borrador:  'bg-gray-100 text-gray-600',
  enviado:   'bg-blue-100 text-blue-700',
  aprobado:  'bg-emerald-100 text-emerald-700',
  rechazado: 'bg-red-100 text-red-700',
  pagado:    'bg-teal-100 text-teal-700',
}
const ESTATUS_GASTO: Record<string, string> = {
  borrador:   'bg-gray-100 text-gray-500',
  en_reporte: 'bg-blue-100 text-blue-600',
  aprobado:   'bg-emerald-100 text-emerald-700',
  rechazado:  'bg-red-100 text-red-600',
}
const LABEL_EST: Record<string, string> = {
  borrador: 'Borrador', enviado: 'Enviado', aprobado: 'Aprobado',
  rechazado: 'Rechazado', pagado: 'Pagado', en_reporte: 'En reporte',
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}
function fmtFecha(s: string) {
  if (!s) return '—'
  return new Date(s.includes('T') ? s : s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ══════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════ */
export default function GastosPage() {
  const user = useCurrentUser()
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD' || user?.tipoUsuario?.toUpperCase() === 'TI'
  const [tab, setTab] = useState<'gastos' | 'reportes' | 'admin'>('gastos')

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Gastos</h1>
              <p className="mt-0.5 text-xs text-white/50">Registra, agrupa y envía tus gastos para reembolso</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <TabBtn active={tab === 'gastos'}   onClick={() => setTab('gastos')}   icon={<Receipt   className="h-3.5 w-3.5" />} label="Mis Gastos" />
        <TabBtn active={tab === 'reportes'} onClick={() => setTab('reportes')} icon={<FileText  className="h-3.5 w-3.5" />} label="Mis Reportes" />
        {isAdmin && (
          <TabBtn active={tab === 'admin'}  onClick={() => setTab('admin')}    icon={<Users     className="h-3.5 w-3.5" />} label="Administración" />
        )}
      </div>

      {tab === 'gastos'   && <MisGastosTab />}
      {tab === 'reportes' && <MisReportesTab />}
      {tab === 'admin'    && isAdmin && <AdminGastosTab />}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
        active ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
      )}
    >
      {icon} {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════
   MIS GASTOS TAB
══════════════════════════════════════════════════════ */
function MisGastosTab() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<number[]>([])
  const [showNuevo, setShowNuevo] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [showReporte, setShowReporte] = useState(false)
  const [viewGasto, setViewGasto] = useState<Gasto | null>(null)

  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['mis-gastos'],
    queryFn: gastosService.getMisGastos,
    staleTime: 30_000,
  })

  // Pipeline: montos por estado
  const porEnviar    = gastos.filter(g => g.estatus === 'borrador' && !g.reporteId).reduce((s, g) => s + g.monto, 0)
  const validacion   = gastos.filter(g => g.estatus === 'en_reporte').reduce((s, g) => s + g.monto, 0)
  const reembolsar   = gastos.filter(g => g.estatus === 'aprobado').reduce((s, g) => s + g.monto, 0)

  // Solo gastos sin reporte para la tabla principal
  const sinReporte   = gastos.filter(g => !g.reporteId)

  const toggle = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const toggleAll = () => {
    const borradores = sinReporte.filter(g => g.estatus === 'borrador').map(g => g.id)
    setSelected(prev => prev.length === borradores.length ? [] : borradores)
  }

  const del = useMutation({
    mutationFn: (id: number) => gastosService.deleteGasto(id),
    onSuccess: () => { toast.success('Gasto eliminado'); qc.invalidateQueries({ queryKey: ['mis-gastos'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="space-y-4">
      {/* Pipeline */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Por enviar',       monto: porEnviar,  color: 'bg-gray-50 border-gray-200',      text: 'text-gray-700', chevron: 'text-gray-300' },
          { label: 'Bajo validación',  monto: validacion, color: 'bg-blue-50 border-blue-200',      text: 'text-blue-700', chevron: 'text-blue-300' },
          { label: 'A reembolsar',     monto: reembolsar, color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', chevron: 'text-emerald-300' },
        ].map((p, i) => (
          <div key={i} className={clsx('rounded-2xl border p-4 flex items-center justify-between', p.color)}>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">{p.label}</p>
              <p className={clsx('text-[1.1rem] font-black mt-0.5', p.text)}>{fmt(p.monto)}</p>
            </div>
            {i < 2 && <ChevronRight className={clsx('h-5 w-5 flex-shrink-0', p.chevron)} />}
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[0.75rem] text-gray-400">{sinReporte.length} gasto{sinReporte.length !== 1 ? 's' : ''} sin agrupar</p>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={() => setShowReporte(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand/90 transition-colors">
              <FileText className="h-3.5 w-3.5" /> Crear Reporte ({selected.length})
            </button>
          )}
          <button onClick={() => setShowNuevo(true)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.78rem] font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo gasto
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : sinReporte.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300">
            <Receipt className="h-10 w-10" />
            <p className="text-[0.82rem]">Sin gastos registrados</p>
            <button onClick={() => setShowNuevo(true)} className="mt-1 text-[0.78rem] font-semibold text-brand hover:underline">+ Agregar primer gasto</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 w-8">
                    <input type="checkbox" className="rounded accent-brand"
                      checked={selected.length > 0 && selected.length === sinReporte.filter(g => g.estatus === 'borrador').length}
                      onChange={toggleAll} />
                  </th>
                  {['Fecha','Descripción','Categoría','Pagado por','Monto','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sinReporte.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {g.estatus === 'borrador' && (
                        <input type="checkbox" className="rounded accent-brand"
                          checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500 whitespace-nowrap">{fmtFecha(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-medium text-gray-800">{g.descripcion}</p>
                      {g.notas && <p className="text-[0.68rem] text-gray-400 truncate max-w-[180px]">{g.notas}</p>}
                    </td>
                    <td className="px-4 py-3 text-[0.75rem] text-gray-500">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600 text-[0.65rem]">
                        [{g.categoriaCodigo}]
                      </span>{' '}
                      {g.categoriaNombre}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.68rem] font-semibold capitalize',
                        g.pagadoPor === 'empresa' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')}>
                        {g.pagadoPor === 'empresa' ? 'Empresa' : 'Empleado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.82rem] font-bold text-gray-900 whitespace-nowrap font-mono">{fmt(g.monto)}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', ESTATUS_GASTO[g.estatus] ?? 'bg-gray-100 text-gray-500')}>
                        {LABEL_EST[g.estatus] ?? g.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {g.reciboUrl && (
                          <a href={g.reciboUrl} target="_blank" rel="noreferrer"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-500 transition-colors" title="Ver recibo">
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {g.estatus === 'borrador' && (
                          <>
                            <button onClick={() => setEditando(g)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (window.confirm('¿Eliminar este gasto?')) del.mutate(g.id) }}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNuevo && (
        <GastoModal
          onClose={() => setShowNuevo(false)}
          onSaved={() => { setShowNuevo(false); qc.invalidateQueries({ queryKey: ['mis-gastos'] }) }}
        />
      )}
      {editando && (
        <GastoModal
          gasto={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['mis-gastos'] }) }}
        />
      )}
      {showReporte && (
        <CrearReporteModal
          gastosSeleccionados={sinReporte.filter(g => selected.includes(g.id))}
          onClose={() => setShowReporte(false)}
          onSaved={(id) => { setShowReporte(false); setSelected([]); qc.invalidateQueries({ queryKey: ['mis-gastos'] }); toast.success(`Reporte creado`) }}
        />
      )}
      {viewGasto && <Modal isOpen title="Detalle gasto" onClose={() => setViewGasto(null)}><p>{viewGasto.descripcion}</p></Modal>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   MODAL GASTO (crear / editar)
══════════════════════════════════════════════════════ */
function GastoModal({ gasto, onClose, onSaved }: { gasto?: Gasto | null; onClose: () => void; onSaved: () => void }) {
  const user = useCurrentUser()
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD' || user?.tipoUsuario?.toUpperCase() === 'TI'
  const { can } = useActionAccess()
  const puedeGestionarCategorias = isAdmin && can('gastos', 'gestionar-categorias')
  const [showNuevaCategoria, setShowNuevaCategoria] = useState(false)
  const qc = useQueryClient()
  const { data: categorias = [] } = useQuery({ queryKey: ['gastos-categorias'], queryFn: gastosService.getCategorias, staleTime: 300_000 })
  const [form, setForm] = useState({
    categoriaId: gasto?.categoriaId ?? 0,
    descripcion: gasto?.descripcion ?? '',
    fecha:       gasto?.fecha ?? new Date().toISOString().slice(0, 10),
    monto:       gasto?.monto ?? 0,
    km:          gasto?.cantidad ?? 0,
    pagadoPor:   gasto?.pagadoPor ?? 'empleado' as 'empleado' | 'empresa',
    notas:       gasto?.notas ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const catSel = categorias.find(c => c.id === form.categoriaId)
  const esKm   = catSel?.tipo === 'kilometraje'
  const montoCalc = esKm ? (form.km || 0) * (catSel?.tarifaKm ?? 0) : form.monto

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = {
        categoriaId: form.categoriaId,
        descripcion: form.descripcion.trim(),
        fecha:       form.fecha,
        monto:       montoCalc,
        cantidad:    esKm ? form.km : null,
        pagadoPor:   form.pagadoPor,
        notas:       form.notas.trim() || undefined,
      }
      let id: number
      if (gasto) {
        await gastosService.updateGasto(gasto.id, payload)
        id = gasto.id
      } else {
        id = await gastosService.createGasto(payload)
      }
      if (file) await gastosService.uploadRecibo(id, file)
    },
    onSuccess: () => { toast.success(gasto ? 'Gasto actualizado' : 'Gasto creado'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen title={gasto ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Descripción</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            placeholder="Ej. Gasolina visita cliente" className="field w-full" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="field-label">Categoría</label>
              {puedeGestionarCategorias && (
                <button type="button" onClick={() => setShowNuevaCategoria(true)}
                  className="text-[0.68rem] font-semibold text-brand hover:underline">+ Nueva categoría</button>
              )}
            </div>
            <div className="relative">
              <select value={form.categoriaId} onChange={e => setForm(f => ({ ...f, categoriaId: Number(e.target.value) }))}
                className="field w-full appearance-none pr-8">
                <option value={0}>Selecciona…</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>[{c.codigo}] {c.nombre}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          <div>
            <label className="field-label">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              className="field w-full" />
          </div>
        </div>

        {esKm ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Kilómetros recorridos</label>
              <input type="number" min={0} step={0.1} value={form.km || ''} onChange={e => setForm(f => ({ ...f, km: Number(e.target.value) }))}
                className="field w-full" />
            </div>
            <div>
              <label className="field-label">Monto calculado</label>
              <div className="field w-full bg-gray-50 text-gray-600 font-semibold">{fmt(montoCalc)}</div>
            </div>
          </div>
        ) : (
          <div>
            <label className="field-label">Monto ($)</label>
            <input type="number" min={0} step={0.01} value={form.monto || ''} onChange={e => setForm(f => ({ ...f, monto: Number(e.target.value) }))}
              className="field w-full" />
          </div>
        )}

        <div>
          <label className="field-label">Pagado por</label>
          <div className="flex gap-3">
            {(['empleado', 'empresa'] as const).map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer select-none">
                <input type="radio" name="pagadoPor" value={p} checked={form.pagadoPor === p} onChange={() => setForm(f => ({ ...f, pagadoPor: p }))} className="accent-brand" />
                <span className="text-[0.82rem] font-medium capitalize">{p === 'empleado' ? 'Empleado (reembolsable)' : 'Empresa'}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="field-label">Notas (opcional)</label>
          <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            placeholder="Observaciones adicionales..." className="field w-full resize-none" />
        </div>

        <div>
          <label className="field-label">Recibo (jpg, png, pdf — máx. 5 MB)</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
              <Paperclip className="h-3.5 w-3.5" />
              {file ? file.name : (gasto?.reciboUrl ? 'Cambiar recibo' : 'Adjuntar recibo')}
            </button>
            {gasto?.reciboUrl && !file && (
              <a href={gasto.reciboUrl} target="_blank" rel="noreferrer"
                className="text-[0.75rem] font-semibold text-brand hover:underline flex items-center gap-1">
                <Eye className="h-3 w-3" /> Ver actual
              </a>
            )}
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!form.descripcion || !form.categoriaId || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
            {guardar.isPending && <Spinner size="sm" />} {gasto ? 'Guardar cambios' : 'Crear gasto'}
          </button>
        </div>
      </div>

      {showNuevaCategoria && (
        <CategoriaModal
          onClose={() => setShowNuevaCategoria(false)}
          onSaved={() => { setShowNuevaCategoria(false); qc.invalidateQueries({ queryKey: ['gastos-categorias'] }) }}
        />
      )}
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════
   MODAL CREAR REPORTE
══════════════════════════════════════════════════════ */
function CrearReporteModal({ gastosSeleccionados, onClose, onSaved }: {
  gastosSeleccionados: Gasto[]; onClose: () => void; onSaved: (id: number) => void
}) {
  const fechas = gastosSeleccionados.map(g => g.fecha).sort()
  const autoTitulo = fechas.length
    ? `${fmtFecha(fechas[0])} – ${fmtFecha(fechas[fechas.length - 1])}`
    : 'Reporte de gastos'
  const [titulo, setTitulo] = useState(autoTitulo)
  const total = gastosSeleccionados.reduce((s, g) => s + g.monto, 0)

  const crear = useMutation({
    mutationFn: () => gastosService.createReporte({ titulo: titulo.trim(), gastoIds: gastosSeleccionados.map(g => g.id) }),
    onSuccess: (id) => { toast.success('Reporte creado'); onSaved(id) },
    onError: () => toast.error('Error al crear reporte'),
  })

  return (
    <Modal isOpen title="Crear Reporte de Gastos" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Título del reporte</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} className="field w-full" />
        </div>

        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
            <p className="text-[0.72rem] font-bold uppercase tracking-wide text-gray-400">{gastosSeleccionados.length} gasto(s) incluidos</p>
          </div>
          <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto">
            {gastosSeleccionados.map(g => (
              <div key={g.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[0.78rem] font-semibold text-gray-800">{g.descripcion}</p>
                  <p className="text-[0.68rem] text-gray-400">{fmtFecha(g.fecha)} · {g.categoriaNombre}</p>
                </div>
                <span className="text-[0.82rem] font-bold text-gray-900 font-mono">{fmt(g.monto)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-100">
            <span className="text-[0.75rem] font-bold text-gray-500">Total</span>
            <span className="text-[1rem] font-black text-brand font-mono">{fmt(total)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => crear.mutate()} disabled={!titulo.trim() || crear.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
            {crear.isPending && <Spinner size="sm" />} Crear Reporte
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════
   MIS REPORTES TAB
══════════════════════════════════════════════════════ */
function MisReportesTab() {
  const [detalle, setDetalle] = useState<number | null>(null)
  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['mis-reportes'],
    queryFn: gastosService.getMisReportes,
    staleTime: 30_000,
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[0.85rem] font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand" /> Mis reportes
          </h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-brand">{reportes.length}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : reportes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300">
            <FileText className="h-10 w-10" />
            <p className="text-[0.82rem]">Sin reportes — crea uno desde "Mis Gastos"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Período','Gastos','Total','Estado','Enviado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reportes.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(r.id)}>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-semibold text-gray-800">{r.titulo}</p>
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500">{r.numGastos ?? '—'}</td>
                    <td className="px-4 py-3 text-[0.82rem] font-bold text-gray-900 font-mono whitespace-nowrap">{fmt(r.total)}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', ESTATUS_REP[r.estatus] ?? 'bg-gray-100')}>
                        {LABEL_EST[r.estatus] ?? r.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-400">{r.fechaEnvio ? fmtFecha(r.fechaEnvio) : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setDetalle(r.id) }}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <DetalleReporteModal reporteId={detalle} onClose={() => setDetalle(null)} isAdmin={false} />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   DETALLE REPORTE MODAL (empleado + admin)
══════════════════════════════════════════════════════ */
function DetalleReporteModal({ reporteId, onClose, isAdmin, onRefresh }: {
  reporteId: number; onClose: () => void; isAdmin: boolean; onRefresh?: () => void
}) {
  const { can } = useActionAccess()
  const puedeAprobarReporte = isAdmin && can('gastos', 'aprobar-reporte')
  const puedeRegistrarPago  = isAdmin && can('gastos', 'registrar-pago')
  const qc = useQueryClient()
  const [comentario, setComentario] = useState('')
  const [rechazarNotas, setRechazarNotas] = useState('')
  const [showRechazar, setShowRechazar] = useState(false)
  const [showPago, setShowPago] = useState(false)
  const [metodoPago, setMetodoPago] = useState('transferencia')
  const [excluidos, setExcluidos] = useState<number[]>([])

  const { data: rep, isLoading } = useQuery({
    queryKey: ['reporte-detalle', reporteId],
    queryFn: () => gastosService.getReporte(reporteId),
    staleTime: 0,
  })

  const enviar = useMutation({
    mutationFn: () => gastosService.enviarReporte(reporteId),
    onSuccess: () => { toast.success('Reporte enviado'); qc.invalidateQueries({ queryKey: ['reporte-detalle', reporteId] }); qc.invalidateQueries({ queryKey: ['mis-reportes'] }) },
    onError: () => toast.error('Error al enviar'),
  })
  const aprobar = useMutation({
    mutationFn: () => gastosService.aprobarReporte(reporteId, excluidos),
    onSuccess: () => { toast.success('Reporte aprobado'); qc.invalidateQueries({ queryKey: ['reporte-detalle', reporteId] }); qc.invalidateQueries({ queryKey: ['admin-reportes'] }); onRefresh?.() },
    onError: () => toast.error('Error al aprobar'),
  })
  const rechazar = useMutation({
    mutationFn: () => gastosService.rechazarReporte(reporteId, rechazarNotas),
    onSuccess: () => { toast.success('Reporte rechazado'); qc.invalidateQueries({ queryKey: ['reporte-detalle', reporteId] }); qc.invalidateQueries({ queryKey: ['admin-reportes'] }); setShowRechazar(false); onRefresh?.() },
    onError: () => toast.error('Error al rechazar'),
  })
  const pago = useMutation({
    mutationFn: () => gastosService.registrarPago(reporteId, metodoPago),
    onSuccess: () => { toast.success('Pago registrado'); qc.invalidateQueries({ queryKey: ['reporte-detalle', reporteId] }); qc.invalidateQueries({ queryKey: ['admin-reportes'] }); setShowPago(false); onRefresh?.() },
    onError: () => toast.error('Error al registrar pago'),
  })
  const enviarCom = useMutation({
    mutationFn: () => gastosService.addComentario(reporteId, comentario),
    onSuccess: () => { setComentario(''); qc.invalidateQueries({ queryKey: ['reporte-detalle', reporteId] }) },
    onError: () => toast.error('Error al enviar'),
  })

  const PASOS = ['borrador', 'enviado', 'aprobado', 'pagado']
  const pasoIdx = rep ? PASOS.indexOf(rep.estatus === 'rechazado' ? 'enviado' : rep.estatus) : 0

  return (
    <Modal isOpen title={rep?.titulo ?? 'Detalle de reporte'} onClose={onClose}>
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : !rep ? (
        <p className="text-[0.82rem] text-gray-400">No se pudo cargar</p>
      ) : (
        <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
          {/* Stepper */}
          <div className="flex items-center gap-0">
            {PASOS.map((p, i) => (
              <div key={p} className="flex items-center flex-1">
                <div className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold',
                  i <= pasoIdx && rep.estatus !== 'rechazado' ? 'bg-brand text-white' : i <= pasoIdx && rep.estatus === 'rechazado' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400')}>
                  {i + 1}
                </div>
                <p className={clsx('ml-1 text-[0.65rem] font-semibold capitalize', i <= pasoIdx ? 'text-gray-700' : 'text-gray-300')}>
                  {LABEL_EST[p]}
                </p>
                {i < PASOS.length - 1 && <div className={clsx('flex-1 h-px mx-2', i < pasoIdx ? 'bg-brand' : 'bg-gray-200')} />}
              </div>
            ))}
            {rep.estatus === 'rechazado' && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-bold text-red-600">Rechazado</span>
            )}
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-2 text-[0.75rem]">
            <div><span className="text-gray-400">Empleado:</span> <span className="font-semibold text-gray-700">{rep.usuarioNombre}</span></div>
            <div><span className="text-gray-400">Total:</span> <span className="font-black text-brand">{fmt(rep.total)}</span></div>
            {rep.managerNombre && <div><span className="text-gray-400">Aprobador:</span> <span className="font-semibold text-gray-700">{rep.managerNombre}</span></div>}
            {rep.metodoPago && <div><span className="text-gray-400">Método pago:</span> <span className="font-semibold capitalize">{rep.metodoPago}</span></div>}
            {rep.notas && <div className="col-span-2"><span className="text-gray-400">Notas:</span> <span className="text-gray-700 italic">{rep.notas}</span></div>}
          </div>

          {/* Líneas de gasto */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
              <p className="text-[0.72rem] font-bold uppercase tracking-wide text-gray-400">Gastos incluidos</p>
            </div>
            <div className="divide-y divide-gray-50">
              {(rep.gastos ?? []).map(g => (
                <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                  {isAdmin && rep.estatus === 'enviado' && (
                    <input type="checkbox" className="rounded accent-red-500 flex-shrink-0"
                      title="Marcar para rechazar esta línea"
                      checked={excluidos.includes(g.id)}
                      onChange={() => setExcluidos(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{g.descripcion}</p>
                    <p className="text-[0.68rem] text-gray-400">{fmtFecha(g.fecha)} · {g.categoriaNombre}</p>
                  </div>
                  {g.reciboUrl && (
                    <a href={g.reciboUrl} target="_blank" rel="noreferrer"
                      className="flex-shrink-0 text-blue-400 hover:text-blue-600" title="Ver recibo">
                      <Paperclip className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold flex-shrink-0', ESTATUS_GASTO[g.estatus] ?? 'bg-gray-100')}>{LABEL_EST[g.estatus] ?? g.estatus}</span>
                  <span className="text-[0.82rem] font-bold text-gray-900 font-mono flex-shrink-0">{fmt(g.monto)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-100">
              <span className="text-[0.72rem] font-bold text-gray-500">Total</span>
              <span className="text-[0.95rem] font-black text-brand font-mono">{fmt(rep.total)}</span>
            </div>
          </div>

          {/* Acciones empleado */}
          {!isAdmin && rep.estatus === 'borrador' && (
            <button onClick={() => enviar.mutate()} disabled={enviar.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[0.82rem] font-bold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
              {enviar.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />} Enviar al manager
            </button>
          )}

          {/* Acciones admin */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {rep.estatus === 'enviado' && puedeAprobarReporte && (
                <>
                  <button onClick={() => aprobar.mutate()} disabled={aprobar.isPending}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[0.78rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors">
                    {aprobar.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {excluidos.length ? `Aprobar (excluir ${excluidos.length})` : 'Aprobar'}
                  </button>
                  <button onClick={() => setShowRechazar(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-[0.78rem] font-bold text-white hover:bg-red-600 transition-colors">
                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </>
              )}
              {rep.estatus === 'aprobado' && puedeRegistrarPago && (
                <button onClick={() => setShowPago(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-[0.78rem] font-bold text-white hover:bg-teal-700 transition-colors">
                  <CreditCard className="h-3.5 w-3.5" /> Registrar pago
                </button>
              )}
            </div>
          )}

          {showRechazar && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-[0.78rem] font-semibold text-red-700">Motivo del rechazo</p>
              <textarea rows={2} value={rechazarNotas} onChange={e => setRechazarNotas(e.target.value)}
                placeholder="Explica por qué se rechaza..." className="field w-full resize-none" />
              <div className="flex gap-2">
                <button onClick={() => rechazar.mutate()} disabled={rechazar.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-1.5 text-[0.75rem] font-bold text-white hover:bg-red-600 disabled:opacity-40">
                  {rechazar.isPending ? <Spinner size="sm" /> : null} Confirmar rechazo
                </button>
                <button onClick={() => setShowRechazar(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.75rem] font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}

          {showPago && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-3">
              <p className="text-[0.78rem] font-semibold text-teal-700">Método de pago</p>
              <div className="relative">
                <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} className="field w-full appearance-none pr-8">
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="cheque">Cheque</option>
                  <option value="efectivo">Efectivo</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => pago.mutate()} disabled={pago.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-[0.75rem] font-bold text-white hover:bg-teal-700 disabled:opacity-40">
                  {pago.isPending ? <Spinner size="sm" /> : null} Confirmar pago
                </button>
                <button onClick={() => setShowPago(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.75rem] font-semibold text-gray-500 hover:bg-gray-50">Cancelar</button>
              </div>
            </div>
          )}

          {/* Chatter */}
          <div className="space-y-3">
            <p className="text-[0.75rem] font-bold text-gray-500 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Conversación
            </p>
            {(rep.comentarios ?? []).length === 0 ? (
              <p className="text-[0.72rem] text-gray-300 text-center py-2">Sin mensajes</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(rep.comentarios ?? []).map(c => (
                  <div key={c.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[0.72rem] font-bold text-gray-700">{c.usuarioNombre}</p>
                      <p className="text-[0.65rem] text-gray-400">{new Date(c.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <p className="text-[0.78rem] text-gray-700">{c.texto}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={comentario} onChange={e => setComentario(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && comentario.trim()) { e.preventDefault(); enviarCom.mutate() } }}
                placeholder="Escribe un mensaje..." className="field flex-1 text-[0.78rem]" />
              <button onClick={() => { if (comentario.trim()) enviarCom.mutate() }} disabled={!comentario.trim() || enviarCom.isPending}
                className="flex items-center justify-center rounded-xl bg-brand px-3 py-2 text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
                {enviarCom.isPending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════
   ADMIN TAB
══════════════════════════════════════════════════════ */
function AdminGastosTab() {
  const [subtab, setSubtab] = useState<'reportes' | 'categorias'>('reportes')
  const [detalle, setDetalle] = useState<number | null>(null)
  const [filtEst, setFiltEst] = useState('')
  const [filtFechaDesde, setFiltFechaDesde] = useState('')
  const [filtFechaHasta, setFiltFechaHasta] = useState('')
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeGestionarCategorias = can('gastos', 'gestionar-categorias')

  const { data: reportes = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-reportes', filtEst, filtFechaDesde, filtFechaHasta],
    queryFn: () => gastosService.getAllReportes({
      estatus: filtEst || undefined,
      fechaDesde: filtFechaDesde || undefined,
      fechaHasta: filtFechaHasta || undefined,
    }),
    staleTime: 30_000,
    enabled: subtab === 'reportes',
  })

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <TabBtn active={subtab === 'reportes'}   onClick={() => setSubtab('reportes')}   icon={<FileText className="h-3.5 w-3.5" />} label="Reportes" />
        {puedeGestionarCategorias && (
          <TabBtn active={subtab === 'categorias'} onClick={() => setSubtab('categorias')} icon={<Tag className="h-3.5 w-3.5" />}      label="Categorías" />
        )}
      </div>

      {subtab === 'categorias' && puedeGestionarCategorias ? <CategoriasTab /> : <>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <select value={filtEst} onChange={e => setFiltEst(e.target.value)}
            className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none">
            <option value="">Todos los estados</option>
            {Object.entries(LABEL_EST).filter(([k]) => k !== 'en_reporte').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="date" value={filtFechaDesde} onChange={e => setFiltFechaDesde(e.target.value)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-2 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none w-[148px]" />
          </div>
          <span className="text-[0.72rem] text-gray-400">—</span>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="date" value={filtFechaHasta} onChange={e => setFiltFechaHasta(e.target.value)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-2 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none w-[148px]" />
          </div>
          {(filtFechaDesde || filtFechaHasta) && (
            <button onClick={() => { setFiltFechaDesde(''); setFiltFechaHasta('') }}
              className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[0.72rem] font-medium text-gray-400 hover:bg-gray-50">✕</button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[0.85rem] font-bold text-gray-900">Todos los reportes</h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-brand">{reportes.length}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : reportes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300">
            <FileText className="h-10 w-10" />
            <p className="text-[0.82rem]">Sin reportes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Empleado','Período','Gastos','Total','Estado','Enviado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reportes.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setDetalle(r.id)}>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-semibold text-gray-800">{r.usuarioNombre}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.78rem] text-gray-700">{r.titulo}</p>
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500">{r.numGastos ?? '—'}</td>
                    <td className="px-4 py-3 text-[0.82rem] font-bold text-gray-900 font-mono whitespace-nowrap">{fmt(r.total)}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', ESTATUS_REP[r.estatus] ?? 'bg-gray-100')}>
                        {LABEL_EST[r.estatus] ?? r.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-400">{r.fechaEnvio ? fmtFecha(r.fechaEnvio) : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setDetalle(r.id) }}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <DetalleReporteModal
          reporteId={detalle}
          onClose={() => setDetalle(null)}
          isAdmin
          onRefresh={() => { qc.invalidateQueries({ queryKey: ['admin-reportes'] }) }}
        />
      )}
      </>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   ADMIN — CATEGORÍAS DE GASTO
══════════════════════════════════════════════════════ */
function CategoriasTab() {
  const qc = useQueryClient()
  const [showNueva, setShowNueva] = useState(false)
  const [editando, setEditando] = useState<GastoCategoria | null>(null)

  const { data: categorias = [], isLoading } = useQuery({
    queryKey: ['gastos-categorias'],
    queryFn: gastosService.getCategorias,
  })

  const toggleActivo = useMutation({
    mutationFn: (c: GastoCategoria) => gastosService.updateCategoria(c.id, {
      nombre: c.nombre, descripcion: c.descripcion ?? undefined, tipo: c.tipo,
      tarifaKm: c.tarifaKm ?? undefined, activo: !(c.activo ?? true), orden: c.orden,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['gastos-categorias'] }); toast.success('Categoría actualizada') },
    onError: () => toast.error('Error al actualizar'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] text-gray-400">{categorias.length} categoría{categorias.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowNueva(true)}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand/90 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Nueva categoría
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : categorias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-300">
            <Tag className="h-10 w-10" />
            <p className="text-[0.82rem]">Sin categorías registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Código','Nombre','Tipo','Tarifa/km','Estado','Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categorias.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600 text-[0.65rem]">[{c.codigo}]</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-medium text-gray-800">{c.nombre}</p>
                      {c.descripcion && <p className="text-[0.68rem] text-gray-400">{c.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500 capitalize">{c.tipo}</td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-500 font-mono">{c.tipo === 'kilometraje' ? fmt(c.tarifaKm ?? 0) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold',
                        (c.activo ?? true) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        {(c.activo ?? true) ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditando(c)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggleActivo.mutate(c)} disabled={toggleActivo.isPending}
                          className={clsx('rounded-lg p-1.5 transition-colors',
                            (c.activo ?? true) ? 'text-gray-400 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-500')}
                          title={(c.activo ?? true) ? 'Desactivar' : 'Activar'}>
                          <Power className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNueva && (
        <CategoriaModal onClose={() => setShowNueva(false)}
          onSaved={() => { setShowNueva(false); qc.invalidateQueries({ queryKey: ['gastos-categorias'] }) }} />
      )}
      {editando && (
        <CategoriaModal categoria={editando} onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['gastos-categorias'] }) }} />
      )}
    </div>
  )
}

function CategoriaModal({ categoria, onClose, onSaved }: {
  categoria?: GastoCategoria | null; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    codigo:      categoria?.codigo ?? '',
    nombre:      categoria?.nombre ?? '',
    descripcion: categoria?.descripcion ?? '',
    tipo:        categoria?.tipo ?? 'monto' as 'monto' | 'kilometraje',
    tarifaKm:    categoria?.tarifaKm ?? 0,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (categoria) {
        await gastosService.updateCategoria(categoria.id, {
          nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || undefined,
          tipo: form.tipo, tarifaKm: form.tipo === 'kilometraje' ? form.tarifaKm : undefined,
          activo: categoria.activo ?? true, orden: categoria.orden,
        })
      } else {
        await gastosService.createCategoria({
          codigo: form.codigo.trim().toUpperCase(), nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined, tipo: form.tipo,
          tarifaKm: form.tipo === 'kilometraje' ? form.tarifaKm : undefined,
        })
      }
    },
    onSuccess: () => { toast.success(categoria ? 'Categoría actualizada' : 'Categoría creada'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen title={categoria ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <div className="space-y-4">
        {!categoria && (
          <div>
            <label className="field-label">Código (identificador único)</label>
            <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              placeholder="Ej. VIATICOS" className="field w-full uppercase" />
          </div>
        )}

        <div>
          <label className="field-label">Nombre</label>
          <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej. Viáticos y transporte" className="field w-full" />
        </div>

        <div>
          <label className="field-label">Descripción (opcional)</label>
          <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            placeholder="Descripción breve" className="field w-full" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Tipo</label>
            <div className="relative">
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'monto' | 'kilometraje' }))}
                className="field w-full appearance-none pr-8">
                <option value="monto">Monto libre</option>
                <option value="kilometraje">Kilometraje</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          {form.tipo === 'kilometraje' && (
            <div>
              <label className="field-label">Tarifa por km ($)</label>
              <input type="number" min={0} step={0.01} value={form.tarifaKm || ''}
                onChange={e => setForm(f => ({ ...f, tarifaKm: Number(e.target.value) }))} className="field w-full" />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!form.nombre.trim() || (!categoria && !form.codigo.trim()) || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors">
            {guardar.isPending && <Spinner size="sm" />} {categoria ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
