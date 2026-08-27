import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, UserPlus, Edit2, Trash2, Building2, Phone, Mail, ToggleLeft, ToggleRight, Package } from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { productoServicioService } from '@/services/productoServicio.service'

interface Cliente {
  id: number
  empresa: string
  nombre: string
  rfc: string
  telefono: string
  correo: string
  ciudad: string
  calle: string
  colonia: string
  cp: string
  activo: boolean
  fechaRegistro: string
}

function parseCliente(r: Record<string, unknown>): Cliente {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['CL_ID'] ?? 0),
    empresa: s(['empresa', 'CL_EMPRESA', 'company']),
    nombre: s(['nombre', 'CL_NOMBRE', 'name', 'contacto']),
    rfc: s(['rfc', 'CL_RFC', 'RFC']),
    telefono: s(['telefono', 'CL_TELEFONO', 'phone', 'tel']),
    correo: s(['correo', 'CL_CORREO', 'email', 'mail']),
    ciudad: s(['ciudad', 'CL_CIUDAD', 'city']),
    calle: s(['calle', 'CL_CALLE', 'street']),
    colonia: s(['colonia', 'CL_COLONIA']),
    cp: s(['cp', 'CL_CP', 'codigoPostal', 'zipCode']),
    activo: Boolean(r['activo'] ?? r['CL_ACTIVO'] ?? true),
    fechaRegistro: s(['fechaRegistro', 'CL_FECHA_REGISTRO', 'createdAt']),
  }
}

const EMPTY_FORM = {
  empresa: '', nombre: '', rfc: '', telefono: '',
  correo: '', ciudad: '', calle: '', colonia: '', cp: '',
}

/* ── Productos/servicios contratados (solo al editar un cliente existente) ── */
function ProductosServiciosCliente({ clienteId }: { clienteId: number }) {
  const qc = useQueryClient()
  const [seleccion, setSeleccion] = useState('')

  const { data: catalogo = [] } = useQuery({
    queryKey: ['productos-servicios', 'activos'],
    queryFn: () => productoServicioService.getAll(),
  })

  const { data: asignados = [], isLoading } = useQuery({
    queryKey: ['cliente-productos-servicios', clienteId],
    queryFn: () => productoServicioService.getByCliente(clienteId),
  })

  const asignar = useMutation({
    mutationFn: (psId: number) => productoServicioService.asignarACliente(clienteId, psId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-productos-servicios', clienteId] })
      setSeleccion('')
    },
    onError: () => toast.error('No se pudo asignar'),
  })

  const quitar = useMutation({
    mutationFn: (psId: number) => productoServicioService.quitarDeCliente(clienteId, psId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cliente-productos-servicios', clienteId] }),
    onError: () => toast.error('No se pudo quitar'),
  })

  const disponibles = catalogo.filter((c) => c.activo && !asignados.some((a) => a.productoServicioId === c.id))

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Productos y servicios contratados</label>
      {isLoading ? (
        <p className="text-xs text-gray-400">Cargando...</p>
      ) : asignados.length === 0 ? (
        <p className="text-xs text-gray-400">Sin productos ni servicios asignados</p>
      ) : (
        <div className="space-y-1.5">
          {asignados.map((a) => (
            <div key={a.productoServicioId} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-3.5 w-3.5 text-brand flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700 truncate">{a.nombre}</span>
              </div>
              <button onClick={() => quitar.mutate(a.productoServicioId)} className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="field text-sm flex-1">
          <option value="">Agregar producto/servicio...</option>
          {disponibles.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          disabled={!seleccion || asignar.isPending}
          onClick={() => seleccion && asignar.mutate(Number(seleccion))}
        >
          Agregar
        </Button>
      </div>
    </div>
  )
}

/* ── Modal ── */
function ClienteModal({ cliente, onClose }: { cliente: Cliente | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(cliente ? {
    empresa: cliente.empresa, nombre: cliente.nombre, rfc: cliente.rfc,
    telefono: cliente.telefono, correo: cliente.correo, ciudad: cliente.ciudad,
    calle: cliente.calle, colonia: cliente.colonia, cp: cliente.cp,
  } : { ...EMPTY_FORM })

  const guardar = useMutation({
    mutationFn: () => cliente ? api.put(`/clientes/${cliente.id}`, form) : api.post('/clientes', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.success(cliente ? 'Cliente actualizado' : 'Cliente creado')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const campos = [
    { key: 'empresa',  label: 'Empresa',       span: 2 },
    { key: 'nombre',   label: 'Contacto',       span: 1 },
    { key: 'rfc',      label: 'RFC',            span: 1 },
    { key: 'telefono', label: 'Teléfono',       span: 1 },
    { key: 'correo',   label: 'Correo',         span: 1 },
    { key: 'ciudad',   label: 'Ciudad',         span: 1 },
    { key: 'calle',    label: 'Calle',          span: 1 },
    { key: 'colonia',  label: 'Colonia',        span: 1 },
    { key: 'cp',       label: 'Código Postal',  span: 1 },
  ] as const

  return (
    <Modal isOpen onClose={onClose} title={cliente ? 'Editar cliente' : 'Nuevo cliente'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {campos.map(({ key, label, span }) => (
            <div key={key} className={span === 2 ? 'col-span-2' : ''}>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="field"
              />
            </div>
          ))}
        </div>

        {cliente && <ProductosServiciosCliente clienteId={cliente.id} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!form.empresa.trim()} onClick={() => guardar.mutate()}>
            {cliente ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Card cliente ── */
function ClienteCard({ cliente, onEdit, onDelete, onToggle }: { cliente: Cliente; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={clsx(
        'card p-4 space-y-2.5 transition-all duration-150',
        hovered ? 'shadow-card-md -translate-y-0.5' : '',
        !cliente.activo && 'opacity-60',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand/8">
            <Building2 className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className={clsx('text-[0.85rem] font-bold truncate transition-colors', hovered ? 'text-brand' : 'text-gray-900')}>
              {cliente.empresa}
            </p>
            {cliente.nombre && <p className="text-[0.7rem] text-gray-500">{cliente.nombre}</p>}
          </div>
        </div>
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={onToggle} title={cliente.activo ? 'Desactivar' : 'Activar'} className={clsx('rounded-xl p-1.5 transition-colors', cliente.activo ? 'text-emerald-500 hover:text-gray-400 hover:bg-gray-50' : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50')}>
            {cliente.activo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button onClick={onEdit} className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded-xl p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {cliente.telefono && (
          <div className="flex items-center gap-2 text-[0.72rem] text-gray-500">
            <Phone className="h-3 w-3 text-gray-300 flex-shrink-0" />
            {cliente.telefono}
          </div>
        )}
        {cliente.correo && (
          <div className="flex items-center gap-2 text-[0.72rem] text-gray-500">
            <Mail className="h-3 w-3 text-gray-300 flex-shrink-0" />
            {cliente.correo}
          </div>
        )}
        {(cliente.ciudad || cliente.colonia) && (
          <p className="text-[0.68rem] text-gray-400">
            {[cliente.colonia, cliente.ciudad].filter(Boolean).join(', ')}
            {cliente.cp && ` CP ${cliente.cp}`}
          </p>
        )}
        {cliente.rfc && <p className="text-[0.68rem] text-gray-400 font-mono">RFC: {cliente.rfc}</p>}
      </div>

      {!cliente.activo && (
        <span className="chip bg-gray-100 text-gray-400 text-[0.65rem]">Inactivo</span>
      )}
    </div>
  )
}

/* ── Skeleton card ── */
function SkeletonCard() {
  return (
    <div className="card p-4 animate-pulse space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-gray-100 flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3.5 w-32 rounded-lg bg-gray-100" />
          <div className="h-2.5 w-20 rounded-full bg-gray-100" />
        </div>
      </div>
      <div className="h-2.5 w-40 rounded-full bg-gray-100" />
      <div className="h-2.5 w-28 rounded-full bg-gray-100" />
    </div>
  )
}

/* ── Página ── */
export function ClientesPage() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Cliente | null>(null)
  const [soloActivos, setSoloActivos] = useState(true)
  const qc = useQueryClient()

  const { data: clientes = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data } = await api.get('/clientes')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.clientes ?? [])
      return (list as Record<string, unknown>[]).map(parseCliente)
    },
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/clientes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }); toast.success('Cliente eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => api.put(`/clientes/${id}`, { activo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clientes'] }) },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const filtered = clientes.filter((c) => {
    const match = `${c.empresa} ${c.nombre} ${c.rfc} ${c.ciudad} ${c.correo}`.toLowerCase().includes(search.toLowerCase())
    return match && (!soloActivos || c.activo)
  })

  const activos   = clientes.filter((c) => c.activo).length
  const inactivos = clientes.filter((c) => !c.activo).length

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
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
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Clientes</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">{activos} activos · {inactivos} inactivos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button onClick={() => { setEditando(null); setShowModal(true) }} className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <UserPlus className="h-3.5 w-3.5" /> Nuevo cliente
              </Button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 flex-wrap px-5 py-3.5 border-b border-gray-100">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por empresa, RFC, correo..."
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
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <Building2 className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin clientes</p>
            <p className="text-xs text-gray-400 mt-0.5">{search ? 'No coincide ningún cliente' : 'Agrega el primero con el botón de arriba'}</p>
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="text-xs font-medium text-brand hover:underline">
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              onEdit={() => { setEditando(c); setShowModal(true) }}
              onDelete={() => setConfirmEliminar(c)}
              onToggle={() => toggleActivo.mutate({ id: c.id, activo: !c.activo })}
            />
          ))}
        </div>
      )}

      {showModal && <ClienteModal cliente={editando} onClose={() => { setShowModal(false); setEditando(null) }} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminar.mutate(confirmEliminar.id) }}
        title="Eliminar cliente"
        message={`¿Seguro que deseas eliminar a ${confirmEliminar?.empresa ?? 'este cliente'}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
