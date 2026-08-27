import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, Plus, Edit2, Trash2, Package, Wrench, ToggleLeft, ToggleRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  productoServicioService,
  type ProductoServicio,
  type ProductoServicioTipo,
  type ProductoServicioRecurrencia,
} from '@/services/productoServicio.service'

const RECURRENCIA_LABEL: Record<ProductoServicioRecurrencia, string> = {
  MENSUAL: 'Mensual',
  ANUAL: 'Anual',
  UNICO: 'Único pago',
}

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const EMPTY_FORM = {
  tipo: 'PRODUCTO' as ProductoServicioTipo,
  nombre: '',
  descripcion: '',
  precio: '',
  recurrencia: 'MENSUAL' as ProductoServicioRecurrencia,
}

/* ── Modal ── */
function ProductoServicioModal({ item, onClose }: { item: ProductoServicio | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(item ? {
    tipo: item.tipo, nombre: item.nombre, descripcion: item.descripcion,
    precio: String(item.precio), recurrencia: item.recurrencia,
  } : { ...EMPTY_FORM })

  const guardar = useMutation({
    mutationFn: () => {
      const body = { ...form, precio: Number(form.precio) || 0 }
      return item ? productoServicioService.update(item.id, body) : productoServicioService.create(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos-servicios'] })
      toast.success(item ? 'Actualizado' : 'Creado')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={item ? 'Editar producto/servicio' : 'Nuevo producto/servicio'} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
          <div className="grid grid-cols-2 gap-1.5">
            {(['PRODUCTO', 'SERVICIO'] as ProductoServicioTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, tipo: t })}
                className={clsx('rounded-xl border-2 py-2 text-[0.75rem] font-semibold transition-all', form.tipo === t ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300')}
              >
                {t === 'PRODUCTO' ? 'Producto' : 'Servicio'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="field" placeholder="Ej. Servicio web mensual" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="field" placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Precio (MXN)</label>
            <input type="number" min="0" step="0.01" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} className="field" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Recurrencia</label>
            <select value={form.recurrencia} onChange={(e) => setForm({ ...form, recurrencia: e.target.value as ProductoServicioRecurrencia })} className="field">
              {(Object.keys(RECURRENCIA_LABEL) as ProductoServicioRecurrencia[]).map((r) => (
                <option key={r} value={r}>{RECURRENCIA_LABEL[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!form.nombre.trim()} onClick={() => guardar.mutate()}>
            {item ? 'Guardar cambios' : 'Crear'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Card ── */
function ProductoServicioCard({ item, onEdit, onDelete, onToggle }: { item: ProductoServicio; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const Icon = item.tipo === 'PRODUCTO' ? Package : Wrench

  return (
    <div className={clsx('card p-4 space-y-2.5 transition-all duration-150 hover:shadow-card-md hover:-translate-y-0.5', !item.activo && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/8">
            <Icon className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-bold truncate text-gray-900">{item.nombre}</p>
            <p className="text-[0.7rem] text-gray-500">{item.tipo === 'PRODUCTO' ? 'Producto' : 'Servicio'}</p>
          </div>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={onToggle} title={item.activo ? 'Desactivar' : 'Activar'} className={clsx('rounded-xl p-1.5 transition-colors', item.activo ? 'text-emerald-500 hover:text-gray-400 hover:bg-gray-50' : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50')}>
            {item.activo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button onClick={onEdit} className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded-xl p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {item.descripcion && <p className="text-[0.72rem] text-gray-500">{item.descripcion}</p>}

      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-bold text-gray-900">{formatoMoneda.format(item.precio)}</span>
        <span className="chip bg-brand/8 text-brand text-[0.65rem]">{RECURRENCIA_LABEL[item.recurrencia]}</span>
      </div>

      {!item.activo && <span className="chip bg-gray-100 text-gray-400 text-[0.65rem]">Inactivo</span>}
    </div>
  )
}

/* ── Página ── */
export function ProductosServiciosPage() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<ProductoServicio | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<ProductoServicio | null>(null)
  const [soloActivos, setSoloActivos] = useState(true)
  const qc = useQueryClient()

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['productos-servicios'],
    queryFn: () => productoServicioService.getAll(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => productoServicioService.delete(id),
    onSuccess: (res: { message?: string }) => {
      qc.invalidateQueries({ queryKey: ['productos-servicios'] })
      toast.success(res?.message ?? 'Eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => productoServicioService.update(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos-servicios'] }),
    onError: () => toast.error('Error al actualizar estado'),
  })

  const filtered = items.filter((i) => {
    const match = `${i.nombre} ${i.descripcion}`.toLowerCase().includes(search.toLowerCase())
    return match && (!soloActivos || i.activo)
  })

  const activos = items.filter((i) => i.activo).length
  const inactivos = items.filter((i) => !i.activo).length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Productos y Servicios</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">{activos} activos · {inactivos} inactivos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button onClick={() => { setEditando(null); setShowModal(true) }} className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nuevo
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap px-5 py-3.5 border-b border-gray-100">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o descripción..."
              className="field py-2 pl-9 text-sm"
            />
          </div>
          <button
            onClick={() => setSoloActivos(!soloActivos)}
            className={clsx(
              'rounded-xl px-3 py-2 text-xs font-semibold border transition-colors',
              soloActivos ? 'bg-brand/8 text-brand border-brand/20' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
            )}
          >
            {soloActivos ? 'Solo activos' : 'Todos'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse space-y-2.5">
              <div className="h-9 w-9 rounded-xl bg-gray-100" />
              <div className="h-3.5 w-32 rounded-lg bg-gray-100" />
              <div className="h-2.5 w-20 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <Package className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin productos ni servicios</p>
            <p className="text-xs text-gray-400 mt-0.5">{search ? 'No coincide ninguno' : 'Agrega el primero con el botón de arriba'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <ProductoServicioCard
              key={i.id}
              item={i}
              onEdit={() => { setEditando(i); setShowModal(true) }}
              onDelete={() => setConfirmEliminar(i)}
              onToggle={() => toggleActivo.mutate({ id: i.id, activo: !i.activo })}
            />
          ))}
        </div>
      )}

      {showModal && <ProductoServicioModal item={editando} onClose={() => { setShowModal(false); setEditando(null) }} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminar.mutate(confirmEliminar.id) }}
        title="Eliminar producto/servicio"
        message={`¿Seguro que deseas eliminar "${confirmEliminar?.nombre}"? Si tiene clientes asignados, se desactivará en su lugar.`}
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
