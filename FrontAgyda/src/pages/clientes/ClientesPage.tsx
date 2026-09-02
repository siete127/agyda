import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, RefreshCw, UserPlus, Edit2, Trash2, Building2, Phone, Mail, MapPin, FileText,
  Package, LayoutGrid, List, Eye, MoreVertical, Power, X, User, Route, MapPinned, Hash,
  ShoppingBag, PackagePlus, Save, ChevronDown, Wallet, ArrowUpRight,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { productoServicioService, type ProductoServicioRecurrencia } from '@/services/productoServicio.service'

const RECURRENCIA_LABEL: Record<ProductoServicioRecurrencia, string> = {
  MENSUAL: 'Mensual', ANUAL: 'Anual', UNICO: 'Pago único',
}
const RECURRENCIA_CHIP: Record<ProductoServicioRecurrencia, string> = {
  MENSUAL: 'bg-blue-100 text-blue-700',
  ANUAL: 'bg-violet-100 text-violet-700',
  UNICO: 'bg-gray-100 text-gray-600',
}
const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 })

interface FinanzasCliente {
  totalIngresado: number
  pendienteCobro: number
  registros: number
  ultimaFecha: string | null
  historico: { mes: string; total: number }[]
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/* Mini gráfico de barras del ingreso mensual — últimos 12 meses. */
function HistoricoMensual({ datos }: { datos: { mes: string; total: number }[] }) {
  if (!datos.length) return null
  // Rellenar los 12 meses hasta el actual aunque algunos vengan en 0.
  const hoy = new Date()
  const meses: { key: string; label: string; total: number }[] = []
  for (let k = 11; k >= 0; k--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - k, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    meses.push({ key, label: MES_CORTO[d.getMonth()], total: datos.find((x) => x.mes === key)?.total ?? 0 })
  }
  const max = Math.max(...meses.map((m) => m.total), 1)

  return (
    <div className="mt-3 border-t border-emerald-100 pt-3">
      <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Histórico mensual</p>
      <div className="flex items-end gap-1">
        {meses.map((m) => (
          <div key={m.key} className="group relative flex flex-1 flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded-t bg-emerald-400 transition-all group-hover:bg-emerald-500"
                style={{ height: `${Math.max((m.total / max) * 100, m.total > 0 ? 6 : 2)}%` }}
              />
            </div>
            <span className="text-[0.55rem] text-gray-400">{m.label}</span>
            {m.total > 0 && (
              <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[0.6rem] text-white group-hover:block">
                {money(m.total)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Resumen informativo de lo facturado/cobrado (módulo de Finanzas) ── */
function FinanzasClienteBloque({ clienteId }: { clienteId: number }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['cliente-finanzas', clienteId],
    queryFn: async () => {
      const { data } = await api.get(`/clientes/${clienteId}/finanzas`)
      return data.data as FinanzasCliente
    },
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-emerald-50/60 to-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">Ingresado por factura</p>
            <p className="text-[1.35rem] font-black leading-none tabular-nums text-emerald-700">
              {isLoading ? '—' : money(data?.totalIngresado ?? 0)}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/finanzas/ingresos')}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          Gestión de finanzas <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {!isLoading && data && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.7rem] text-gray-500">
          {data.pendienteCobro > 0 && (
            <span>Pendiente de cobro: <b className="text-amber-600">{money(data.pendienteCobro)}</b></span>
          )}
          <span>{data.registros} {data.registros === 1 ? 'registro' : 'registros'} en Finanzas</span>
          {data.ultimaFecha && <span>Último: {new Date(data.ultimaFecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
        </div>
      )}

      {!isLoading && data && <HistoricoMensual datos={data.historico} />}

      <p className="mt-2 text-[0.66rem] text-gray-400">
        Solo informativo. El registro y la gestión de ingresos se hace en el módulo de Finanzas.
      </p>
    </div>
  )
}

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

  const totalMensual = asignados.filter((a) => a.recurrencia === 'MENSUAL').reduce((s, a) => s + a.precio, 0)
  const totalAnual = asignados.filter((a) => a.recurrencia === 'ANUAL').reduce((s, a) => s + a.precio, 0)

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-xs text-gray-400">Cargando…</p>
      ) : asignados.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-500">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[0.85rem] font-semibold text-violet-700">Sin productos ni servicios asignados</p>
            <p className="text-[0.75rem] text-gray-400">Agrega productos o servicios para este cliente.</p>
          </div>
        </div>
      ) : (
        <>
          {(totalMensual > 0 || totalAnual > 0) && (
            <div className="flex justify-end text-[0.72rem] text-gray-400">
              {totalMensual > 0 && <span>{money(totalMensual)}/mes</span>}
              {totalMensual > 0 && totalAnual > 0 && <span className="mx-1">·</span>}
              {totalAnual > 0 && <span>{money(totalAnual)}/año</span>}
            </div>
          )}
          <div className="space-y-2">
            {asignados.map((a) => (
              <div key={a.productoServicioId} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-card px-3.5 py-3">
                <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
                  a.tipo === 'SERVICIO' ? 'bg-violet-100 text-violet-600' : 'bg-brand/10 text-brand')}>
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.85rem] font-semibold text-gray-800">{a.nombre}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[0.62rem] uppercase tracking-wide text-gray-400">{a.tipo === 'SERVICIO' ? 'Servicio' : 'Producto'}</span>
                    <span className={clsx('chip text-[0.6rem]', RECURRENCIA_CHIP[a.recurrencia])}>{RECURRENCIA_LABEL[a.recurrencia]}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {a.precio > 0 && (
                    <p className="text-[0.82rem] font-bold tabular-nums text-gray-700">
                      {money(a.precio)}
                      {a.recurrencia === 'MENSUAL' && <span className="text-[0.58rem] font-normal text-gray-400"> /mes</span>}
                      {a.recurrencia === 'ANUAL' && <span className="text-[0.58rem] font-normal text-gray-400"> /año</span>}
                    </p>
                  )}
                </div>
                <button onClick={() => quitar.mutate(a.productoServicioId)} className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-gray-100 pt-4">
        <label className="mb-1.5 block text-[0.78rem] font-semibold text-gray-600">Agregar producto/servicio</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ShoppingBag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <select
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-card py-2.5 pl-10 pr-9 text-[0.82rem] text-gray-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
            >
              <option value="">Selecciona un producto o servicio…</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {RECURRENCIA_LABEL[c.recurrencia]}{c.precio > 0 ? ` (${money(c.precio)})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            disabled={!seleccion || asignar.isPending}
            onClick={() => seleccion && asignar.mutate(Number(seleccion))}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white transition-all hover:bg-violet-700 disabled:opacity-40"
          >
            <PackagePlus className="h-4 w-4" /> Agregar
          </button>
        </div>
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
    { key: 'empresa',  label: 'Empresa',       span: 2, icon: Building2,  ph: 'Nombre de la empresa' },
    { key: 'nombre',   label: 'Contacto',      span: 1, icon: User,       ph: 'Persona de contacto' },
    { key: 'rfc',      label: 'RFC',           span: 1, icon: FileText,   ph: 'RFC' },
    { key: 'telefono', label: 'Teléfono',      span: 1, icon: Phone,      ph: 'Teléfono' },
    { key: 'correo',   label: 'Correo',        span: 1, icon: Mail,       ph: 'Ingresa el correo' },
    { key: 'ciudad',   label: 'Ciudad',        span: 1, icon: MapPin,     ph: 'Ciudad' },
    { key: 'calle',    label: 'Calle',         span: 1, icon: Route,      ph: 'Calle y número' },
    { key: 'colonia',  label: 'Colonia',       span: 1, icon: MapPinned,  ph: 'Colonia' },
    { key: 'cp',       label: 'Código postal', span: 1, icon: Hash,       ph: 'Código postal' },
  ] as const

  return (
    <Modal isOpen onClose={onClose} size={cliente ? 'full' : 'md'}>
      <div className="flex h-full flex-col">
        {/* Cabecera propia */}
        <div className="-m-5 mb-5 flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              {cliente ? <Edit2 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-[1.15rem] font-bold text-gray-900">{cliente ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <p className="text-[0.8rem] text-gray-400">
                {cliente ? 'Actualiza la información general y los productos o servicios contratados.' : 'Registra un nuevo cliente.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={clsx('flex-1 overflow-y-auto pr-0.5', cliente && 'grid gap-5 lg:grid-cols-2')}>
          {/* ── Datos del cliente ── */}
          <div className={clsx(cliente && 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card')}>
            {cliente && (
              <div className="mb-4 flex items-center gap-2.5 border-b border-gray-100 pb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                  <User className="h-4 w-4" />
                </div>
                <p className="text-[0.9rem] font-bold text-gray-800">Datos del cliente</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              {campos.map(({ key, label, span, icon: Icon, ph }) => (
                <div key={key} className={span === 2 ? 'col-span-2' : ''}>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[0.75rem] font-semibold text-gray-500">
                    <Icon className="h-3 w-3 text-violet-400" /> {label}
                  </label>
                  <div className="relative">
                    <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                    <input
                      value={(form as Record<string, string>)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={ph}
                      className="w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-9 pr-3 text-[0.85rem] text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Finanzas + Productos y servicios — solo al editar ── */}
          {cliente && (
            <div className="space-y-5">
              <FinanzasClienteBloque clienteId={cliente.id} />

              <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
                <div className="mb-4 flex items-center gap-2.5 border-b border-gray-100 pb-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <p className="text-[0.9rem] font-bold text-gray-800">Productos y servicios contratados</p>
                </div>
                <ProductosServiciosCliente clienteId={cliente.id} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="-mx-5 -mb-5 mt-5 flex flex-shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50/40 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-card px-5 py-2.5 text-[0.85rem] font-semibold text-gray-600 transition-colors hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending || !form.empresa.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.85rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50"
          >
            {guardar.isPending
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <Save className="h-4 w-4" />}
            {cliente ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Un dato con icono en pill + label arriba + valor debajo ── */
function DatoCard({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-[0.82rem] text-gray-700">{children}</p>
      </div>
    </div>
  )
}

/* ── Card cliente ── */
function ClienteCard({ cliente, onEdit, onDelete, onToggle }: { cliente: Cliente; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [menuAbierto])

  const ubicacion = [cliente.colonia, cliente.ciudad].filter(Boolean).join(', ')

  return (
    <div className={clsx('card flex flex-col p-5 transition-all duration-150 hover:shadow-card-md', !cliente.activo && 'opacity-60')}>
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-bold text-gray-900">{cliente.empresa}</p>
            {cliente.nombre && <p className="truncate text-[0.75rem] text-gray-400">{cliente.nombre}</p>}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold', cliente.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
            {cliente.activo ? 'Activo' : 'Inactivo'}
          </span>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuAbierto && (
              <div className="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-xl border border-gray-200 bg-card py-1 shadow-lg">
                <button
                  onClick={() => { setMenuAbierto(false); onToggle() }}
                  className={clsx('flex w-full items-center gap-2 px-3.5 py-2 text-[0.8rem] font-semibold transition-colors',
                    cliente.activo ? 'text-gray-600 hover:bg-gray-50' : 'text-emerald-600 hover:bg-emerald-50')}
                >
                  <Power className="h-3.5 w-3.5" /> {cliente.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Datos */}
      <div className="mt-4 flex-1 space-y-3.5">
        <DatoCard icon={Phone} label="Teléfono">{cliente.telefono || <span className="text-gray-300">—</span>}</DatoCard>
        <DatoCard icon={Mail} label="Correo">{cliente.correo || <span className="text-gray-300">—</span>}</DatoCard>
        <DatoCard icon={MapPin} label="Ubicación">
          {ubicacion || <span className="text-gray-300">—</span>}
          {ubicacion && cliente.cp && <span className="text-gray-400"> CP {cliente.cp}</span>}
        </DatoCard>
        <DatoCard icon={FileText} label="RFC">
          <span className="font-mono">{cliente.rfc || <span className="font-sans text-gray-300">—</span>}</span>
        </DatoCard>
      </div>

      {/* Acciones */}
      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
        <button onClick={onEdit} title="Ver detalle" className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100">
          <Eye className="h-4 w-4" />
        </button>
        <button onClick={onEdit} title="Editar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand/20 bg-brand/5 text-brand transition-colors hover:bg-brand/10">
          <Edit2 className="h-4 w-4" />
        </button>
        <button onClick={onDelete} title="Eliminar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ── Fila de tabla ── */
function ClienteRow({ cliente, onEdit, onDelete, onToggle }: { cliente: Cliente; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  return (
    <tr className={clsx('transition-colors hover:bg-gray-50', !cliente.activo && 'opacity-60')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/8">
            <Building2 className="h-3.5 w-3.5 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.82rem] font-semibold text-gray-900">{cliente.empresa}</p>
            {cliente.nombre && <p className="truncate text-[0.68rem] text-gray-400">{cliente.nombre}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[0.76rem] text-gray-600">
        {cliente.telefono ? <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-gray-300" />{cliente.telefono}</span> : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-[0.76rem] text-gray-600">
        {cliente.correo ? <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-gray-300" />{cliente.correo}</span> : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-[0.72rem] text-gray-500">
        {[cliente.colonia, cliente.ciudad].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
        {cliente.cp && <span className="text-gray-400"> · CP {cliente.cp}</span>}
      </td>
      <td className="px-4 py-3 font-mono text-[0.72rem] text-gray-500">{cliente.rfc || <span className="font-sans text-gray-300">—</span>}</td>
      <td className="px-4 py-3">
        <span className={clsx('chip text-[0.62rem]', cliente.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
          {cliente.activo ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-0.5">
          <button onClick={onToggle} title={cliente.activo ? 'Desactivar' : 'Activar'} className={clsx('rounded-lg p-1.5 transition-colors', cliente.activo ? 'text-emerald-500 hover:bg-gray-100' : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50')}>
            <Power className="h-4 w-4" />
          </button>
          <button onClick={onEdit} className="rounded-lg p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
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
  const [vista, setVista] = useState<'grid' | 'tabla'>(() => {
    try { return (localStorage.getItem('clientes-vista') as 'grid' | 'tabla') || 'grid' } catch { return 'grid' }
  })
  const cambiarVista = (v: 'grid' | 'tabla') => {
    setVista(v)
    try { localStorage.setItem('clientes-vista', v) } catch { /* ignore */ }
  }
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
              <Button onClick={() => { setEditando(null); setShowModal(true) }} className="bg-card !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
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
              soloActivos ? 'bg-brand/8 text-brand border-brand/20' : 'bg-card text-gray-500 border-gray-200 hover:border-gray-300',
            )}
          >
            {soloActivos ? 'Solo activos' : 'Todos'}
          </button>

          {/* Toggle vista grid / tabla */}
          <div className="flex rounded-xl border border-gray-200 p-0.5">
            <button
              onClick={() => cambiarVista('grid')}
              title="Ver en tarjetas"
              className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', vista === 'grid' ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:text-gray-600')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => cambiarVista('tabla')}
              title="Ver en lista"
              className={clsx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', vista === 'tabla' ? 'bg-brand/10 text-brand' : 'text-gray-400 hover:text-gray-600')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
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
      ) : vista === 'grid' ? (
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
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Cliente</th>
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Teléfono</th>
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Correo</th>
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Ubicación</th>
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">RFC</th>
                  <th className="px-4 py-2.5 text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Estado</th>
                  <th className="px-4 py-2.5 text-right text-[0.62rem] font-semibold uppercase tracking-wider text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <ClienteRow
                    key={c.id}
                    cliente={c}
                    onEdit={() => { setEditando(c); setShowModal(true) }}
                    onDelete={() => setConfirmEliminar(c)}
                    onToggle={() => toggleActivo.mutate({ id: c.id, activo: !c.activo })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-2.5 text-[0.68rem] text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}
          </div>
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
