import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, CheckCircle2, MapPin, Truck, Wrench } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { catalogosTiService } from '@/services/catalogosTi.service'
import type { Sede, Proveedor, Servicio } from '@/types/catalogosTi.types'

function SedeRow({ sede }: { sede: Sede }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(sede.nombre)
  const [direccion, setDireccion] = useState(sede.direccion ?? '')

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateSede(sede.id, { nombre: nombre.trim(), direccion: direccion.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar la sede'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleSedeActiva(sede.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] }),
  })

  if (editando) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <input className="field flex-1 py-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        <input className="field flex-1 py-1 text-sm" placeholder="Dirección" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          Guardar
        </button>
        <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
      <MapPin className="h-4 w-4 shrink-0 text-ink-tertiary" />
      <span className={clsx('flex-1 font-medium', !sede.activa && 'text-ink-tertiary line-through')}>{sede.nombre}</span>
      <span className="flex-1 text-xs text-ink-tertiary">{sede.direccion ?? '—'}</span>
      <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        className={clsx('hover:opacity-70', sede.activa ? 'text-red-400' : 'text-green-500')}
        onClick={() => toggle.mutate()}
        title={sede.activa ? 'Desactivar' : 'Activar'}
      >
        {sede.activa ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function ProveedorRow({ proveedor }: { proveedor: Proveedor }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(proveedor.nombre)
  const [contacto, setContacto] = useState(proveedor.contacto ?? '')
  const [telefono, setTelefono] = useState(proveedor.telefono ?? '')
  const [correo, setCorreo] = useState(proveedor.correo ?? '')

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateProveedor(proveedor.id, {
      nombre: nombre.trim(), contacto: contacto.trim() || undefined, telefono: telefono.trim() || undefined, correo: correo.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-proveedores'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar el proveedor'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleProveedorActivo(proveedor.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-proveedores'] }),
  })

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <input className="field flex-1 py-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Nombre" />
        <input className="field flex-1 py-1 text-sm" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Contacto" />
        <input className="field flex-1 py-1 text-sm" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" />
        <input className="field flex-1 py-1 text-sm" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" />
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar</button>
        <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
      <Truck className="h-4 w-4 shrink-0 text-ink-tertiary" />
      <span className={clsx('flex-1 font-medium', !proveedor.activo && 'text-ink-tertiary line-through')}>{proveedor.nombre}</span>
      <span className="flex-1 text-xs text-ink-tertiary">{proveedor.contacto ?? '—'}</span>
      <span className="flex-1 text-xs text-ink-tertiary">{proveedor.telefono ?? proveedor.correo ?? '—'}</span>
      <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
      <button
        className={clsx('hover:opacity-70', proveedor.activo ? 'text-red-400' : 'text-green-500')}
        onClick={() => toggle.mutate()}
        title={proveedor.activo ? 'Desactivar' : 'Activar'}
      >
        {proveedor.activo ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function ServicioRow({ servicio, proveedores }: { servicio: Servicio; proveedores: Proveedor[] }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(servicio.nombre)
  const [descripcion, setDescripcion] = useState(servicio.descripcion ?? '')
  const [proveedorId, setProveedorId] = useState<number | ''>(servicio.proveedorId ?? '')

  const guardar = useMutation({
    mutationFn: () => catalogosTiService.updateServicio(servicio.id, {
      nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, proveedorId: proveedorId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos-ti-servicios'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar el servicio'),
  })

  const toggle = useMutation({
    mutationFn: () => catalogosTiService.toggleServicioActivo(servicio.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos-ti-servicios'] }),
  })

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
        <input className="field flex-1 py-1 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Nombre" />
        <input className="field flex-1 py-1 text-sm" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" />
        <select className="field py-1 text-sm" value={proveedorId} onChange={(e) => setProveedorId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button className="btn-secondary px-2 py-1 text-xs" onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar</button>
        <button className="px-2 py-1 text-xs text-ink-tertiary" onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
      <Wrench className="h-4 w-4 shrink-0 text-ink-tertiary" />
      <span className={clsx('flex-1 font-medium', !servicio.activo && 'text-ink-tertiary line-through')}>{servicio.nombre}</span>
      <span className="flex-1 text-xs text-ink-tertiary">{servicio.proveedorNombre ?? 'Interno'}</span>
      <button className="text-ink-tertiary hover:text-brand" onClick={() => setEditando(true)} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
      <button
        className={clsx('hover:opacity-70', servicio.activo ? 'text-red-400' : 'text-green-500')}
        onClick={() => toggle.mutate()}
        title={servicio.activo ? 'Desactivar' : 'Activar'}
      >
        {servicio.activo ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

function ProveedoresYServiciosPanel() {
  const qc = useQueryClient()
  const [nombreProv, setNombreProv] = useState('')
  const [nombreSrv, setNombreSrv] = useState('')
  const [proveedorSrv, setProveedorSrv] = useState<number | ''>('')

  const { data: proveedores = [], isLoading: loadingProv } = useQuery({
    queryKey: ['catalogos-ti-proveedores'],
    queryFn: () => catalogosTiService.getProveedores(true),
  })
  const { data: servicios = [], isLoading: loadingSrv } = useQuery({
    queryKey: ['catalogos-ti-servicios'],
    queryFn: () => catalogosTiService.getServicios(true),
  })

  const crearProveedor = useMutation({
    mutationFn: () => catalogosTiService.createProveedor({ nombre: nombreProv.trim() }),
    onSuccess: () => {
      setNombreProv('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-proveedores'] })
    },
    onError: () => toast.error('No se pudo crear el proveedor'),
  })

  const crearServicio = useMutation({
    mutationFn: () => catalogosTiService.createServicio({ nombre: nombreSrv.trim(), proveedorId: proveedorSrv || null }),
    onSuccess: () => {
      setNombreSrv('')
      setProveedorSrv('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-servicios'] })
    },
    onError: () => toast.error('No se pudo crear el servicio'),
  })

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Proveedores</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Terceros que dan soporte a servicios externos (ej. ISP, VICIdial hosting, licenciamiento).
        </p>

        {loadingProv ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {proveedores.map((p) => <ProveedorRow key={p.id} proveedor={p} />)}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input className="field flex-1 text-sm" placeholder="Nombre del proveedor" value={nombreProv} onChange={(e) => setNombreProv(e.target.value)} />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nombreProv.trim() || crearProveedor.isPending}
            onClick={() => crearProveedor.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Servicios</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Servicios que un ticket puede afectar (ej. Correo corporativo, VICIdial, VPN). Se usan para
          seleccionar "Servicio afectado" al crear un ticket y para reglas de SLA por servicio.
        </p>

        {loadingSrv ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {servicios.map((s) => <ServicioRow key={s.id} servicio={s} proveedores={proveedores} />)}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input className="field flex-1 text-sm" placeholder="Nombre del servicio" value={nombreSrv} onChange={(e) => setNombreSrv(e.target.value)} />
          <select className="field text-sm" value={proveedorSrv} onChange={(e) => setProveedorSrv(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Sin proveedor (interno)</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nombreSrv.trim() || crearServicio.isPending}
            onClick={() => crearServicio.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>
    </>
  )
}

export function CatalogosTab() {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [direccion, setDireccion] = useState('')

  const { data: sedes = [], isLoading } = useQuery({
    queryKey: ['catalogos-ti-sedes'],
    queryFn: () => catalogosTiService.getSedes(true),
  })

  const crear = useMutation({
    mutationFn: () => catalogosTiService.createSede({ nombre: nombre.trim(), direccion: direccion.trim() || undefined }),
    onSuccess: () => {
      setNombre('')
      setDireccion('')
      qc.invalidateQueries({ queryKey: ['catalogos-ti-sedes'] })
    },
    onError: () => toast.error('No se pudo crear la sede'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Sedes</p>
        <p className="mb-3 text-xs text-ink-tertiary">
          Ubicaciones físicas usadas para asignar tickets a técnicos con cobertura en esa sede.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {sedes.map((s) => <SedeRow key={s.id} sede={s} />)}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
          <input className="field flex-1 text-sm" placeholder="Nombre de la sede" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="field flex-1 text-sm" placeholder="Dirección (opcional)" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={!nombre.trim() || crear.isPending}
            onClick={() => crear.mutate()}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
      </div>

      <ProveedoresYServiciosPanel />

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="text-sm font-semibold text-ink">Activos</p>
        <p className="mt-1 text-xs text-ink-tertiary">
          El catálogo de activos generales (equipos, licencias) se administra en su propio módulo.
        </p>
        <a href="/activos" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
          Ir a Activos →
        </a>
      </div>
    </div>
  )
}
