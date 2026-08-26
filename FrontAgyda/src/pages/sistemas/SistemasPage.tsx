import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, Server, ServerCrash, AlertTriangle, Pencil, Trash2, ListChecks, CheckCircle2, ExternalLink,
} from 'lucide-react'
import { sistemasService } from '@/services/sistemas.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { ESTADO_LABELS, ESTADO_COLORS, type Sistema } from '@/types/sistemas.types'

function formatFechaHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function EstadoIcon({ estado }: { estado: string }) {
  if (estado === 'caido') return <ServerCrash className="h-4 w-4" />
  if (estado === 'con-problemas') return <AlertTriangle className="h-4 w-4" />
  return <Server className="h-4 w-4" />
}

/* ── Modal: crear/editar sistema ── */
function SistemaFormModal({ sistema, onClose }: { sistema?: Sistema; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!sistema
  const [form, setForm] = useState({
    nombre: sistema?.nombre ?? '',
    descripcion: sistema?.descripcion ?? '',
    url: sistema?.url ?? '',
    notas: sistema?.notas ?? '',
  })
  const canSave = form.nombre.trim().length > 0

  const guardar = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await sistemasService.actualizarSistema(sistema!.id, { ...form, estado: sistema!.estado })
      } else {
        await sistemasService.crearSistema(form)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sistemas'] })
      toast.success(isEdit ? 'Sistema actualizado' : 'Sistema agregado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el sistema'),
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar sistema' : 'Nuevo sistema'} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="field" placeholder="Ej. Intranet, Ventas, Correo" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className="field min-h-[60px]" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">URL (opcional)</label>
          <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="field" placeholder="https://..." />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notas (opcional)</label>
          <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} className="field min-h-[60px]" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>{isEdit ? 'Guardar cambios' : 'Agregar sistema'}</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal: reportar incidente ── */
function ReportarIncidenteModal({ sistemas, onClose }: { sistemas: Sistema[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ sistemaId: number | ''; tipo: string; descripcion: string }>({ sistemaId: '', tipo: 'caido', descripcion: '' })

  const reportar = useMutation({
    mutationFn: () => sistemasService.crearIncidente({
      sistemaId: form.sistemaId ? Number(form.sistemaId) : undefined,
      tipo: form.tipo,
      descripcion: form.descripcion || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sistemas'] })
      qc.invalidateQueries({ queryKey: ['sistemas-incidentes'] })
      toast.success('Incidente reportado')
      onClose()
    },
    onError: () => toast.error('Error al reportar el incidente'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Reportar incidente" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Sistema afectado (opcional)</label>
          <select value={form.sistemaId} onChange={(e) => setForm((f) => ({ ...f, sistemaId: e.target.value ? Number(e.target.value) : '' }))} className="field">
            <option value="">Sin sistema específico</option>
            {sistemas.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <div className="flex gap-2">
            {[{ v: 'caido', l: 'Caída total' }, { v: 'lentitud', l: 'Lentitud' }, { v: 'error', l: 'Error/bug' }, { v: 'otro', l: 'Otro' }].map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo: t.v }))}
                className={clsx('rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors', form.tipo === t.v ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                {t.l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className="field min-h-[70px]" placeholder="Qué está pasando..." />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={reportar.isPending} onClick={() => reportar.mutate()}>Reportar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tarjeta de sistema ── */
function SistemaCard({ sistema, isAdmin, onEditar, onEliminar }: { sistema: Sistema; isAdmin: boolean; onEditar: () => void; onEliminar: () => void }) {
  return (
    <div className="card p-4 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm text-gray-900 leading-snug">{sistema.nombre}</h3>
        <span className={clsx('flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', ESTADO_COLORS[sistema.estado])}>
          <EstadoIcon estado={sistema.estado} /> {ESTADO_LABELS[sistema.estado]}
        </span>
      </div>
      {sistema.descripcion && <p className="text-xs text-gray-600 line-clamp-2">{sistema.descripcion}</p>}
      {sistema.url && (
        <a href={sistema.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline w-fit">
          <ExternalLink className="h-3 w-3" /> {sistema.url.replace(/^https?:\/\//, '')}
        </a>
      )}
      {sistema.notas && <p className="text-xs text-gray-400 line-clamp-2">{sistema.notas}</p>}
      {isAdmin && (
        <div className="flex items-center justify-end gap-1 pt-2 mt-auto border-t border-gray-100">
          <button onClick={onEditar} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onEliminar} title="Eliminar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Tab: Incidentes ── */
function IncidentesTab() {
  const qc = useQueryClient()
  const { data: incidentes = [], isLoading } = useQuery({
    queryKey: ['sistemas-incidentes'],
    queryFn: () => sistemasService.getIncidentes(),
  })

  const resolver = useMutation({
    mutationFn: (id: number) => sistemasService.resolverIncidente(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sistemas-incidentes'] })
      qc.invalidateQueries({ queryKey: ['sistemas'] })
      toast.success('Incidente resuelto')
    },
    onError: () => toast.error('Error al resolver el incidente'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (incidentes.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <ListChecks className="h-8 w-8" />
        <p className="text-sm">No hay incidentes registrados</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Sistema</th>
            <th className="px-4 py-2.5 font-semibold">Tipo</th>
            <th className="px-4 py-2.5 font-semibold">Inicio</th>
            <th className="px-4 py-2.5 font-semibold">Fin</th>
            <th className="px-4 py-2.5 font-semibold">Descripción</th>
            <th className="px-4 py-2.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {incidentes.map((i) => (
            <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{i.sistemaNombre ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-600 capitalize">{i.tipo}</td>
              <td className="px-4 py-2.5 text-gray-500">{formatFechaHora(i.fechaInicio)}</td>
              <td className="px-4 py-2.5 text-gray-500">{i.fechaFin ? formatFechaHora(i.fechaFin) : '—'}</td>
              <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">{i.descripcion ?? '—'}</td>
              <td className="px-4 py-2.5 text-right">
                {!i.fechaFin && (
                  <button onClick={() => resolver.mutate(i.id)} className="flex items-center gap-1 ml-auto text-xs font-semibold text-emerald-600 hover:underline">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Página principal ── */
export function SistemasPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'sistemas' | 'incidentes'>('sistemas')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<Sistema | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Sistema | null>(null)
  const [showReportar, setShowReportar] = useState(false)
  const qc = useQueryClient()

  const { data: sistemas = [], isLoading } = useQuery({
    queryKey: ['sistemas'],
    queryFn: () => sistemasService.getSistemas(),
  })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => sistemasService.eliminarSistema(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sistemas'] })
      toast.success('Sistema eliminado')
      setConfirmEliminar(null)
    },
    onError: () => toast.error('Error al eliminar el sistema'),
  })

  const caidos = sistemas.filter((s) => s.estado === 'caido').length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Server className="h-5 w-5 text-brand" /> Sistemas
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {sistemas.length} sistema{sistemas.length !== 1 ? 's' : ''} registrado{sistemas.length !== 1 ? 's' : ''}
            {caidos > 0 && <span className="ml-2 text-red-600 font-semibold">· {caidos} caído{caidos !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowReportar(true)}>
            <AlertTriangle className="h-3.5 w-3.5" /> Reportar incidente
          </Button>
          {isAdmin && tab === 'sistemas' && (
            <Button size="sm" onClick={() => setShowCrear(true)}>
              <Plus className="h-3.5 w-3.5" /> Nuevo sistema
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('sistemas')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'sistemas' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <Server className="h-3.5 w-3.5" /> Sistemas
        </button>
        <button
          onClick={() => setTab('incidentes')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'incidentes' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <ListChecks className="h-3.5 w-3.5" /> Incidentes
        </button>
      </div>

      {tab === 'incidentes' ? (
        <IncidentesTab />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : sistemas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Server className="h-8 w-8" />
          <p className="text-sm">No hay sistemas registrados</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sistemas.map((s) => (
            <SistemaCard
              key={s.id}
              sistema={s}
              isAdmin={isAdmin}
              onEditar={() => setEditando(s)}
              onEliminar={() => setConfirmEliminar(s)}
            />
          ))}
        </div>
      )}

      {showCrear && <SistemaFormModal onClose={() => setShowCrear(false)} />}
      {editando && <SistemaFormModal sistema={editando} onClose={() => setEditando(null)} />}
      {showReportar && <ReportarIncidenteModal sistemas={sistemas} onClose={() => setShowReportar(false)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Eliminar sistema"
        message={`¿Seguro que deseas eliminar "${confirmEliminar?.nombre}"?`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
