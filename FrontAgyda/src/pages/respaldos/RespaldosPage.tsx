import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, DatabaseBackup, CheckCircle2, AlertTriangle, XCircle, Pencil, Trash2, ListChecks, Clock,
} from 'lucide-react'
import { respaldosService } from '@/services/respaldos.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { calcularAtraso, type RespaldoConfig } from '@/types/respaldos.types'

function formatFechaHora(iso: string | null) {
  if (!iso) return 'Sin registro'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ATRASO_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Al día', color: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  proximo: { label: 'Próximo a vencer', color: 'bg-amber-50 text-amber-700', icon: Clock },
  atrasado: { label: 'Atrasado', color: 'bg-red-50 text-red-600', icon: AlertTriangle },
  'sin-registro': { label: 'Sin registro', color: 'bg-gray-100 text-gray-500', icon: XCircle },
}

/* ── Modal: crear/editar configuración de respaldo ── */
function ConfigFormModal({ config, onClose }: { config?: RespaldoConfig; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!config
  const [form, setForm] = useState({
    nombre: config?.nombre ?? '',
    descripcion: config?.descripcion ?? '',
    periodicidadDias: config?.periodicidadDias ? String(config.periodicidadDias) : '1',
  })
  const canSave = form.nombre.trim().length > 0 && Number(form.periodicidadDias) > 0

  const guardar = useMutation({
    mutationFn: async () => {
      const payload = { nombre: form.nombre, descripcion: form.descripcion || undefined, periodicidadDias: Number(form.periodicidadDias) }
      if (isEdit) {
        await respaldosService.actualizarConfig(config!.id, { ...payload, activo: config!.activo })
      } else {
        await respaldosService.crearConfig(payload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['respaldos-config'] })
      toast.success(isEdit ? 'Actualizado' : 'Respaldo agregado')
      onClose()
    },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar respaldo' : 'Nuevo respaldo'} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="field" placeholder="Ej. Base de datos intranet" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción (opcional)</label>
          <textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} className="field min-h-[60px]" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Periodicidad esperada (días)</label>
          <input type="number" min="1" value={form.periodicidadDias} onChange={(e) => setForm((f) => ({ ...f, periodicidadDias: e.target.value }))} className="field" placeholder="Ej. 1 = diario, 7 = semanal" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>{isEdit ? 'Guardar cambios' : 'Agregar'}</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal: registrar ejecución de respaldo ── */
function RegistrarModal({ config, onClose }: { config: RespaldoConfig; onClose: () => void }) {
  const qc = useQueryClient()
  const [exito, setExito] = useState(true)
  const [notas, setNotas] = useState('')

  const registrar = useMutation({
    mutationFn: () => respaldosService.registrar({ configId: config.id, exito, notas: notas || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['respaldos-config'] })
      qc.invalidateQueries({ queryKey: ['respaldos-registros'] })
      toast.success('Respaldo registrado')
      onClose()
    },
    onError: () => toast.error('Error al registrar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Registrar respaldo — ${config.nombre}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Resultado</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExito(true)}
              className={clsx('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors', exito ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Exitoso
            </button>
            <button
              type="button"
              onClick={() => setExito(false)}
              className={clsx('flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors', !exito ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              <XCircle className="h-3.5 w-3.5" /> Falló
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="field min-h-[60px]" placeholder="Detalles del respaldo..." />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={registrar.isPending} onClick={() => registrar.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tarjeta de configuración de respaldo ── */
function RespaldoCard({ config, isAdmin, onRegistrar, onEditar, onEliminar }: {
  config: RespaldoConfig
  isAdmin: boolean
  onRegistrar: () => void
  onEditar: () => void
  onEliminar: () => void
}) {
  const atraso = calcularAtraso(config)
  const meta = ATRASO_META[atraso]
  const Icon = meta.icon

  return (
    <div className={clsx('card p-4 flex flex-col gap-2.5', !config.activo && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm text-gray-900 leading-snug">{config.nombre}</h3>
        <span className={clsx('flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', meta.color)}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
      </div>
      {config.descripcion && <p className="text-xs text-gray-600 line-clamp-2">{config.descripcion}</p>}
      <p className="text-xs text-gray-400">Cada {config.periodicidadDias} día{config.periodicidadDias !== 1 ? 's' : ''}</p>
      <p className="text-xs text-gray-500">Último: {formatFechaHora(config.ultimoRespaldoFecha)}</p>

      <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100">
        <button onClick={onRegistrar} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <DatabaseBackup className="h-3.5 w-3.5" /> Registrar respaldo
        </button>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button onClick={onEditar} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEliminar} title="Eliminar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Tab: Historial ── */
function HistorialTab() {
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['respaldos-registros'],
    queryFn: () => respaldosService.getRegistros(),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (registros.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <ListChecks className="h-8 w-8" />
        <p className="text-sm">No hay respaldos registrados</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Respaldo</th>
            <th className="px-4 py-2.5 font-semibold">Fecha</th>
            <th className="px-4 py-2.5 font-semibold">Resultado</th>
            <th className="px-4 py-2.5 font-semibold">Notas</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.configNombre}</td>
              <td className="px-4 py-2.5 text-gray-500">{formatFechaHora(r.fecha)}</td>
              <td className="px-4 py-2.5">
                <span className={clsx('rounded-lg px-2 py-1 text-[0.7rem] font-semibold', r.exito ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                  {r.exito ? 'Exitoso' : 'Falló'}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">{r.notas ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Página principal ── */
export function RespaldosPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'respaldos' | 'historial'>('respaldos')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<RespaldoConfig | null>(null)
  const [registrando, setRegistrando] = useState<RespaldoConfig | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<RespaldoConfig | null>(null)
  const qc = useQueryClient()

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['respaldos-config'],
    queryFn: () => respaldosService.getConfig(),
  })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => respaldosService.eliminarConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['respaldos-config'] })
      toast.success('Eliminado')
      setConfirmEliminar(null)
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const atrasados = configs.filter((c) => calcularAtraso(c) === 'atrasado').length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-brand" /> Respaldos
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {configs.length} respaldo{configs.length !== 1 ? 's' : ''} configurado{configs.length !== 1 ? 's' : ''}
            {atrasados > 0 && <span className="ml-2 text-red-600 font-semibold">· {atrasados} atrasado{atrasados !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        {isAdmin && tab === 'respaldos' && (
          <Button size="sm" onClick={() => setShowCrear(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo respaldo
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('respaldos')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'respaldos' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <DatabaseBackup className="h-3.5 w-3.5" /> Respaldos
        </button>
        <button
          onClick={() => setTab('historial')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'historial' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          <ListChecks className="h-3.5 w-3.5" /> Historial
        </button>
      </div>

      {tab === 'historial' ? (
        <HistorialTab />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : configs.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <DatabaseBackup className="h-8 w-8" />
          <p className="text-sm">No hay respaldos configurados</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {configs.map((c) => (
            <RespaldoCard
              key={c.id}
              config={c}
              isAdmin={isAdmin}
              onRegistrar={() => setRegistrando(c)}
              onEditar={() => setEditando(c)}
              onEliminar={() => setConfirmEliminar(c)}
            />
          ))}
        </div>
      )}

      {showCrear && <ConfigFormModal onClose={() => setShowCrear(false)} />}
      {editando && <ConfigFormModal config={editando} onClose={() => setEditando(null)} />}
      {registrando && <RegistrarModal config={registrando} onClose={() => setRegistrando(null)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Eliminar respaldo"
        message={`¿Seguro que deseas eliminar "${confirmEliminar?.nombre}"? Se borrará también su historial.`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
