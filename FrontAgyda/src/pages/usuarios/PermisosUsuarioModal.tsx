import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Shield, ChevronDown, ChevronRight, CheckSquare, Square, Monitor, Phone, Megaphone, Building2, Plus } from 'lucide-react'
import { api, getApiError } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'

// Mismos 2 IDs que el backend restringe en accesoController.esSuperAdminEmpresas
// — aquí solo controla si se MUESTRA la sección; la autorización real vive en
// el servidor (403 si no coincide, aunque alguien fuerce la UI).
const SUPER_ADMIN_EMPRESAS_IDS = new Set([1, 96])

const ROLES_LABEL: Record<string, string> = {
  AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes', ST: 'Staff', VE: 'Ventas',
}
const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700', TI: 'bg-blue-100 text-blue-700', CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600', ST: 'bg-green-100 text-green-700', VE: 'bg-amber-100 text-amber-700',
}

interface Modulo { key: string; nombre: string; descripcion: string }
interface AccionModulo { key: string; nombre: string; descripcion: string }
type ActionsCatalog = Record<string, AccionModulo[]>

interface PermisosUsuarioModalProps {
  usuarioId: number
  nombre: string
  tipoUsuario: string
  login: string
  fotoPerfil: string | null
  activo: boolean
  status: boolean
  onClose: () => void
}

// Editor de permisos fusionado: switches de acceso a sistemas externos (AGYDA
// intranet / Ventas call center) + editor granular de módulos y acciones —
// antes vivía como módulo separado /admin/accesos, ahora se abre directamente
// desde la fila del usuario en Usuarios.
export function PermisosUsuarioModal({ usuarioId, nombre, tipoUsuario, login, fotoPerfil, activo, status, onClose }: PermisosUsuarioModalProps) {
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeGestionar = can('accesos', 'gestionar')
  const { user: usuarioActual } = useAuthStore()
  const esSuperAdmin = SUPER_ADMIN_EMPRESAS_IDS.has(usuarioActual?.id ?? -1)

  const [activoLocal, setActivoLocal] = useState(activo)
  const [statusLocal, setStatusLocal] = useState(status)
  const [expandedMod, setExpandedMod] = useState<string | null>(null)
  const [mostrarFormEmpresa, setMostrarFormEmpresa] = useState(false)
  const [formEmpresa, setFormEmpresa] = useState({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })

  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['accesos-empresas'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/empresas')
      return (data?.data ?? []) as { key: string; nombre: string }[]
    },
    enabled: esSuperAdmin,
  })

  const crearEmpresa = useMutation({
    mutationFn: () => api.post('/accesos/empresas', formEmpresa),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accesos-empresas'] })
      toast.success('Empresa creada correctamente')
      setFormEmpresa({ codigo: '', nombre: '', adminUsuario: '', adminPassword: '', adminNombre: '' })
      setMostrarFormEmpresa(false)
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const handleCrearEmpresa = () => {
    const { codigo, nombre: nombreEmp, adminUsuario, adminPassword, adminNombre } = formEmpresa
    if (!codigo.trim() || !nombreEmp.trim() || !adminUsuario.trim() || !adminPassword.trim() || !adminNombre.trim()) {
      toast.error('Completa todos los campos')
      return
    }
    crearEmpresa.mutate()
  }

  // Módulos activos por empresa completa — solo super-admins fijos, mismo
  // criterio que el resto de la sección Empresas.
  const [empresaModulosExpandida, setEmpresaModulosExpandida] = useState<string | null>(null)

  const { data: modulosEmpresa = [], isLoading: loadingModulosEmpresa } = useQuery({
    queryKey: ['empresa-modulos', empresaModulosExpandida],
    queryFn: async () => {
      const { data } = await api.get(`/accesos/empresas/${empresaModulosExpandida}/modulos`)
      return (data?.data?.modulos ?? []) as { key: string; nombre: string; descripcion: string; allow: boolean }[]
    },
    enabled: esSuperAdmin && !!empresaModulosExpandida,
  })

  const toggleModuloEmpresa = useMutation({
    mutationFn: ({ empKey, moduloKey, allow }: { empKey: string; moduloKey: string; allow: boolean }) =>
      api.put(`/accesos/empresas/${empKey}/modulos/${moduloKey}`, { allow }),
    onSuccess: (_, { empKey }) => {
      qc.invalidateQueries({ queryKey: ['empresa-modulos', empKey] })
      toast.success('Módulo actualizado para la empresa')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const toggleIntranet = useMutation({
    mutationFn: (v: boolean) => api.put(`/usuarios/${usuarioId}/activo`, { activo: v }),
    onSuccess: (_, v) => { setActivoLocal(v); qc.invalidateQueries({ queryKey: ['usuarios'] }); toast.success(v ? 'AGYDA activada' : 'AGYDA desactivada') },
    onError: () => toast.error('Error al cambiar acceso a intranet'),
  })

  const toggleVentas = useMutation({
    mutationFn: (v: boolean) => api.put(`/usuarios/${usuarioId}/status-ventas`, { status: v }),
    onSuccess: (_, v) => { setStatusLocal(v); qc.invalidateQueries({ queryKey: ['usuarios'] }); toast.success(v ? 'Ventas activado' : 'Ventas desactivado') },
    onError: () => toast.error('Error al cambiar acceso a ventas'),
  })

  const esAgenteCC = tipoUsuario.toUpperCase() === 'CC'

  const { data: campanasDisponibles = [] } = useQuery({
    queryKey: ['campanas-disponibles'],
    queryFn: async () => {
      const { data } = await api.get('/campanas/disponibles')
      return (data?.data ?? []) as { id: number; nombre: string; color: string | null }[]
    },
    enabled: esAgenteCC,
    staleTime: 60_000,
  })

  const { data: campanaActual, isLoading: loadingCampana } = useQuery({
    queryKey: ['campana-agente', usuarioId],
    queryFn: async () => {
      const { data } = await api.get(`/campanas/agentes/${usuarioId}`)
      return data?.data as { campanaId: number; campanaNombre: string } | null
    },
    enabled: esAgenteCC,
  })

  const asignarCampana = useMutation({
    mutationFn: (campanaId: number) => {
      const campana = campanasDisponibles.find((c) => c.id === campanaId)
      return api.put(`/campanas/agentes/${usuarioId}`, { campanaId, campanaNombre: campana?.nombre ?? '' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campana-agente', usuarioId] }); toast.success('Campaña asignada') },
    onError: () => toast.error('Error al asignar campaña'),
  })

  const quitarCampana = useMutation({
    mutationFn: () => api.delete(`/campanas/agentes/${usuarioId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campana-agente', usuarioId] }); toast.success('Campaña quitada') },
    onError: () => toast.error('Error al quitar campaña'),
  })

  const { data: modulos = [] } = useQuery({
    queryKey: ['accesos-modulos'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/modules')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((m) => ({
        key: String(m['key'] ?? ''),
        nombre: String(m['nombre'] ?? m['name'] ?? m['key'] ?? ''),
        descripcion: String(m['descripcion'] ?? m['description'] ?? ''),
      })) as Modulo[]
    },
  })

  const { data: catalogoAcciones = {} } = useQuery({
    queryKey: ['accesos-catalogo-acciones'],
    queryFn: async () => {
      const { data } = await api.get('/accesos/actions/catalog')
      return (data?.data ?? {}) as ActionsCatalog
    },
  })

  const { data: accesos, isLoading: loadingAccesos } = useQuery({
    queryKey: ['accesos-usuario', usuarioId],
    queryFn: async () => {
      const [modRes, accRes] = await Promise.all([
        api.get(`/accesos/${usuarioId}`),
        api.get(`/accesos/${usuarioId}/actions`),
      ])
      const rawMod = modRes.data?.data?.modules ?? modRes.data?.modulos ?? modRes.data?.data ?? modRes.data
      const modulosList = Array.isArray(rawMod)
        ? rawMod.map((m) => typeof m === 'string' ? m : String(m['key'] ?? m['moduleKey'] ?? m))
        : []
      const acciones = (accRes.data?.data?.acciones ?? {}) as Record<string, string[]>
      return { modulos: modulosList, acciones }
    },
  })

  const modulosActivos = accesos?.modulos ?? []
  const accionesPorModulo = accesos?.acciones ?? {}

  const grant = useMutation({
    mutationFn: (key: string) => api.post(`/accesos/${usuarioId}/${key}/grant`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accesos-usuario', usuarioId] }); toast.success('Acceso otorgado') },
    onError: () => toast.error('Error al otorgar acceso'),
  })

  const revoke = useMutation({
    mutationFn: (key: string) => api.post(`/accesos/${usuarioId}/${key}/revoke`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accesos-usuario', usuarioId] }); toast.success('Acceso revocado') },
    onError: () => toast.error('Error al revocar acceso'),
  })

  const setAcciones = useMutation({
    mutationFn: ({ moduloKey, acciones }: { moduloKey: string; acciones: string[] }) =>
      api.put(`/accesos/${usuarioId}/actions/${moduloKey}`, { acciones }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accesos-usuario', usuarioId] }); toast.success('Permisos actualizados') },
    onError: () => toast.error('Error al actualizar permisos'),
  })

  const toggleAccion = (moduloKey: string, accionKey: string) => {
    const actuales = accionesPorModulo[moduloKey] ?? []
    const tiene = actuales.includes(accionKey)
    const next = tiene ? actuales.filter((a) => a !== accionKey) : [...actuales, accionKey]
    setAcciones.mutate({ moduloKey, acciones: next })
  }

  const toggleTodasAcciones = (moduloKey: string) => {
    const disponibles = (catalogoAcciones[moduloKey] ?? []).map((a) => a.key)
    const actuales = accionesPorModulo[moduloKey] ?? []
    const tieneTodas = disponibles.length > 0 && disponibles.every((k) => actuales.includes(k))
    setAcciones.mutate({ moduloKey, acciones: tieneTodas ? [] : disponibles })
  }

  const rolUpper = tipoUsuario.toUpperCase()

  return (
    <Modal isOpen onClose={onClose} title="Permisos del usuario" size="xl" variant="corporate">
      <div className="space-y-4">
        {/* Cabecera usuario */}
        <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
          <Avatar src={fotoPerfil ? `/uploads/${fotoPerfil}` : undefined} name={nombre} size="sm" />
          <div className="min-w-0">
            <p className="text-[0.9rem] font-bold text-gray-900 truncate">{nombre}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[0.7rem] text-gray-400">@{login}</span>
              {rolUpper && (
                <span className={clsx('chip', ROL_COLORS[rolUpper] ?? 'bg-gray-100 text-gray-600')}>
                  {ROLES_LABEL[rolUpper] ?? rolUpper}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Switches de sistemas externos */}
        <div className="space-y-2">
          <span className="section-label">Acceso a sistemas</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', activoLocal ? 'bg-blue-50' : 'bg-gray-100')}>
                  <Monitor className={clsx('h-3.5 w-3.5', activoLocal ? 'text-blue-600' : 'text-gray-400')} />
                </div>
                <div>
                  <p className="text-[0.78rem] font-semibold text-gray-800">AGYDA</p>
                  <p className="text-[0.65rem] text-gray-400">Portal interno</p>
                </div>
              </div>
              <button
                disabled={toggleIntranet.isPending || !puedeGestionar}
                onClick={() => toggleIntranet.mutate(!activoLocal)}
                className={clsx(
                  'relative inline-flex h-5.5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                  activoLocal ? 'bg-blue-600' : 'bg-gray-200',
                )}
              >
                <span className={clsx('inline-block h-4.5 w-4.5 rounded-full bg-white shadow transform transition-transform duration-200', activoLocal ? 'translate-x-4.5' : 'translate-x-0')} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', statusLocal ? 'bg-emerald-50' : 'bg-gray-100')}>
                  <Phone className={clsx('h-3.5 w-3.5', statusLocal ? 'text-emerald-600' : 'text-gray-400')} />
                </div>
                <div>
                  <p className="text-[0.78rem] font-semibold text-gray-800">Ventas</p>
                  <p className="text-[0.65rem] text-gray-400">Sistema de ventas</p>
                </div>
              </div>
              <button
                disabled={toggleVentas.isPending || !puedeGestionar}
                onClick={() => toggleVentas.mutate(!statusLocal)}
                className={clsx(
                  'relative inline-flex h-5.5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                  statusLocal ? 'bg-emerald-500' : 'bg-gray-200',
                )}
              >
                <span className={clsx('inline-block h-4.5 w-4.5 rounded-full bg-white shadow transform transition-transform duration-200', statusLocal ? 'translate-x-4.5' : 'translate-x-0')} />
              </button>
            </div>
          </div>
        </div>

        {/* Campaña asignada — solo agentes CC. El catálogo se jala en vivo del
            sistema Ventas; la asignación agente→campaña vive en AGYDA. */}
        {esAgenteCC && (
          <div className="space-y-2">
            <span className="section-label">Campaña</span>
            <div className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50">
                  <Megaphone className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[0.78rem] font-semibold text-gray-800 truncate">
                    {loadingCampana ? 'Cargando…' : campanaActual?.campanaNombre ?? 'Sin campaña asignada'}
                  </p>
                  <p className="text-[0.65rem] text-gray-400">Catálogo tomado de Ventas</p>
                </div>
              </div>
              {puedeGestionar && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <select
                    value={campanaActual?.campanaId ?? ''}
                    onChange={(e) => { if (e.target.value) asignarCampana.mutate(Number(e.target.value)) }}
                    disabled={asignarCampana.isPending}
                    className="field py-1.5 text-[0.75rem]"
                  >
                    <option value="">Selecciona…</option>
                    {campanasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  {campanaActual && (
                    <button
                      onClick={() => quitarCampana.mutate()}
                      disabled={quitarCampana.isPending}
                      className="rounded-lg px-2 py-1.5 text-[0.68rem] font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empresas (multi-tenant) — solo visible para los 2 super-admins fijos */}
        {esSuperAdmin && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="section-label">Empresas</span>
              <button
                onClick={() => setMostrarFormEmpresa((v) => !v)}
                className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva empresa
              </button>
            </div>

            {loadingEmpresas ? (
              <div className="flex justify-center py-4"><Building2 className="h-5 w-5 animate-pulse text-gray-300" /></div>
            ) : (
              <div className="space-y-1.5">
                {empresas.map((e) => (
                  <div key={e.key} className="rounded-xl border border-gray-100 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setEmpresaModulosExpandida((prev) => (prev === e.key ? null : e.key))}
                      className="flex w-full items-center gap-2.5 text-left"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <Building2 className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.78rem] font-semibold text-gray-800">{e.nombre}</p>
                        <p className="text-[0.65rem] text-gray-400">{e.key}</p>
                      </div>
                      {empresaModulosExpandida === e.key ? (
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      )}
                    </button>

                    {empresaModulosExpandida === e.key && (
                      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-1.5 animate-fade-in">
                        {loadingModulosEmpresa ? (
                          <div className="flex justify-center py-4"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
                        ) : (
                          modulosEmpresa.map((m) => (
                            <div key={m.key} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5">
                              <div className="min-w-0">
                                <p className="text-[0.75rem] font-medium text-gray-800">{m.nombre}</p>
                                {m.descripcion && <p className="text-[0.65rem] text-gray-400 truncate">{m.descripcion}</p>}
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleModuloEmpresa.mutate({ empKey: e.key, moduloKey: m.key, allow: !m.allow })}
                                className={clsx(
                                  'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                                  m.allow ? 'bg-blue-600' : 'bg-gray-200',
                                )}
                              >
                                <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', m.allow ? 'translate-x-4' : 'translate-x-0')} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {mostrarFormEmpresa && (
              <div className="rounded-xl border border-brand/30 bg-brand/[0.02] p-3 space-y-2.5 animate-fade-in">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Código</label>
                    <input
                      value={formEmpresa.codigo}
                      onChange={(e) => setFormEmpresa((f) => ({ ...f, codigo: e.target.value.toLowerCase() }))}
                      placeholder="ej. clientex"
                      className="field py-1.5 text-[0.78rem]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
                    <input
                      value={formEmpresa.nombre}
                      onChange={(e) => setFormEmpresa((f) => ({ ...f, nombre: e.target.value }))}
                      placeholder="ej. Cliente X"
                      className="field py-1.5 text-[0.78rem]"
                    />
                  </div>
                </div>
                <p className="text-[0.68rem] font-semibold text-gray-500 uppercase tracking-wider pt-1">Administrador inicial</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
                    <input
                      value={formEmpresa.adminNombre}
                      onChange={(e) => setFormEmpresa((f) => ({ ...f, adminNombre: e.target.value }))}
                      placeholder="Nombre completo"
                      className="field py-1.5 text-[0.78rem]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Usuario</label>
                    <input
                      value={formEmpresa.adminUsuario}
                      onChange={(e) => setFormEmpresa((f) => ({ ...f, adminUsuario: e.target.value }))}
                      placeholder="usuario"
                      className="field py-1.5 text-[0.78rem]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-semibold text-gray-500 uppercase tracking-wider">Contraseña</label>
                    <input
                      type="password"
                      value={formEmpresa.adminPassword}
                      onChange={(e) => setFormEmpresa((f) => ({ ...f, adminPassword: e.target.value }))}
                      placeholder="••••••••"
                      className="field py-1.5 text-[0.78rem]"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setMostrarFormEmpresa(false)}>Cancelar</Button>
                  <Button onClick={handleCrearEmpresa} disabled={crearEmpresa.isPending}>
                    {crearEmpresa.isPending ? 'Creando…' : 'Crear empresa'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Editor granular de módulos y acciones */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="section-label">Módulos y funciones</span>
            {!loadingAccesos && (
              <span className="text-[0.7rem] text-gray-400">
                {modulosActivos.length} de {modulos.length} módulo{modulos.length !== 1 ? 's' : ''} habilitado{modulos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {loadingAccesos ? (
            <div className="flex justify-center py-8"><Shield className="h-5 w-5 animate-pulse text-gray-300" /></div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 items-start">
              {modulos.map((m) => {
                const tiene = modulosActivos.includes(m.key)
                const acciones = catalogoAcciones[m.key] ?? []
                const tieneAcciones = acciones.length > 0
                const isExpanded = expandedMod === m.key
                const accionesActuales = accionesPorModulo[m.key] ?? []
                const todasMarcadas = tieneAcciones && acciones.every((a) => accionesActuales.includes(a.key))
                const algunasMarcadas = tieneAcciones && acciones.some((a) => accionesActuales.includes(a.key))

                return (
                  <div
                    key={m.key}
                    className={clsx(
                      'rounded-xl border transition-colors overflow-hidden',
                      isExpanded ? 'border-brand/30 bg-brand/[0.02] lg:col-span-2' : tiene ? 'border-gray-200' : 'border-gray-100',
                    )}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors">
                      <button
                        onClick={() => tieneAcciones && tiene && setExpandedMod(isExpanded ? null : m.key)}
                        disabled={!tieneAcciones || !tiene}
                        title={
                          !tieneAcciones ? 'Este módulo no tiene funciones configurables'
                            : !tiene ? 'Otorga el módulo para configurar sus funciones'
                            : isExpanded ? 'Ocultar funciones' : 'Ver funciones del módulo'
                        }
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left disabled:cursor-default"
                      >
                        <Shield className={clsx('h-4 w-4 flex-shrink-0 transition-colors', tiene ? 'text-emerald-500' : 'text-gray-300')} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.8rem] font-semibold text-gray-800">{m.nombre}</p>
                          {m.descripcion && <p className="text-[0.68rem] text-gray-400 truncate">{m.descripcion}</p>}
                        </div>
                        {tieneAcciones && (
                          tiene ? (
                            <span className={clsx(
                              'flex-shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold',
                              todasMarcadas ? 'bg-emerald-50 text-emerald-600' : algunasMarcadas ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-400',
                            )}>
                              {accionesActuales.length}/{acciones.length}
                            </span>
                          ) : (
                            <span className="flex-shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-[0.62rem] font-semibold text-gray-400">
                              {acciones.length} func.
                            </span>
                          )
                        )}
                        {tieneAcciones && (
                          isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-brand flex-shrink-0" />
                            : <ChevronRight className={clsx('h-3.5 w-3.5 flex-shrink-0', tiene ? 'text-gray-400' : 'text-gray-200')} />
                        )}
                      </button>
                      {puedeGestionar && (
                        <button
                          onClick={() => (tiene ? revoke.mutate(m.key) : grant.mutate(m.key))}
                          className={clsx(
                            'ml-2 flex-shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
                            tiene ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                          )}
                        >
                          {tiene ? 'Revocar' : 'Otorgar'}
                        </button>
                      )}
                    </div>

                    {tieneAcciones && tiene && isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5 animate-fade-in">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="section-label">Funciones del módulo · {accionesActuales.length}/{acciones.length}</span>
                          {puedeGestionar && (
                            <button onClick={() => toggleTodasAcciones(m.key)} className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-brand hover:underline">
                              {todasMarcadas ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                              {todasMarcadas ? 'Quitar todas' : 'Habilitar todas'}
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          {acciones.map((a) => {
                            const activa = accionesActuales.includes(a.key)
                            return (
                              <label
                                key={a.key}
                                className={clsx(
                                  'flex items-start gap-2.5 rounded-lg px-2 py-1.5',
                                  puedeGestionar ? 'cursor-pointer' : 'cursor-default',
                                  activa ? 'bg-white shadow-sm' : puedeGestionar ? 'hover:bg-white' : '',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={activa}
                                  disabled={!puedeGestionar}
                                  onChange={() => toggleAccion(m.key, a.key)}
                                  className="mt-0.5 rounded accent-brand disabled:opacity-50"
                                />
                                <div className="min-w-0">
                                  <p className={clsx('text-[0.75rem] font-medium transition-colors', activa ? 'text-gray-800' : 'text-gray-600')}>{a.nombre}</p>
                                  {a.descripcion && <p className="text-[0.65rem] text-gray-400">{a.descripcion}</p>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!puedeGestionar && (
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[0.72rem] text-amber-700">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" /> Solo puedes consultar estos permisos — no tienes la acción "Accesos: gestionar" habilitada.
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}
