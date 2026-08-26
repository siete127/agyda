import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, RefreshCw, UserPlus, Edit2, Trash2, Users, ShieldCheck, UserX, UserCheck } from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { PermisosUsuarioModal } from './PermisosUsuarioModal'

interface Usuario {
  id: number
  nombres: string
  apellidos: string
  login: string
  correo: string
  tipoUsuario: string
  genero: 'M' | 'F' | ''
  activo: boolean
  status: boolean
  puesto: string
  departamento: string
  fotoPerfil: string | null
  campana: string | null
}

function parseUsuario(r: Record<string, unknown>): Usuario {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['usuarioId'] ?? 0),
    nombres: s(['nombres', 'NOMBRES', 'nombre', 'firstName']),
    apellidos: s(['apellidos', 'APELLIDOS', 'lastName']),
    login: s(['usuario', 'USUARIO', 'login', 'username']),
    correo: s(['correo', 'CORREO', 'email', 'EMAIL']),
    tipoUsuario: s(['tipoUsuario', 'tipo_usuario', 'TIPO_USUARIO', 'rol', 'role']),
    genero: (s(['genero', 'GENERO', 'gender']).toUpperCase() === 'F' ? 'F' : s(['genero', 'GENERO', 'gender']).toUpperCase() === 'M' ? 'M' : ''),
    activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? r['active'] ?? true),
    status: Boolean(r['status'] ?? r['STATUS'] ?? r['NEUS_STATUS'] ?? false),
    puesto: s(['puesto', 'PUESTO', 'cargo', 'position']),
    departamento: s(['departamento', 'DEPARTAMENTO', 'area', 'department']),
    fotoPerfil: s(['fotoPerfil', 'foto_perfil', 'FOTO_PERFIL', 'foto']) || null,
    campana: s(['campana', 'CAMPANA']) || null,
  }
}

const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700',
  TI: 'bg-blue-100 text-blue-700',
  CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600',
  ST: 'bg-green-100 text-green-700',
  VE: 'bg-amber-100 text-amber-700',
}

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-2.5 w-36 rounded-full bg-gray-100 animate-pulse" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded-lg bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-5 w-10 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

/* ── Modal usuario ── */
function UsuarioModal({ usuario, onClose }: { usuario: Usuario | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    nombres:      usuario?.nombres ?? '',
    apellidos:    usuario?.apellidos ?? '',
    usuario:      usuario?.login ?? '',
    correo:       usuario?.correo ?? '',
    tipoUsuario:  usuario?.tipoUsuario ?? 'CC',
    genero:       usuario?.genero ?? '',
    puesto:       usuario?.puesto ?? '',
    departamento: usuario?.departamento ?? '',
    contra:       '',
  })

  const guardar = useMutation({
    mutationFn: () => {
      if (usuario) {
        // En edición: enviar nombres completo y el campo usuario (login)
        const payload = {
          nombres:     `${form.nombres} ${form.apellidos}`.trim(),
          usuario:     form.usuario.trim() || usuario.login,
          correo:      form.correo,
          tipoUsuario: form.tipoUsuario,
          genero:      form.genero || null,
          puesto:      form.puesto,
          departamento: form.departamento,
          activo:      true,
          status:      false,
          ...(form.contra.trim() ? { contra: form.contra.trim() } : {}),
        }
        return api.put(`/usuarios/${usuario.id}`, payload)
      }
      // Al crear: nombres completo = nombres + apellidos, usuario = login
      const payload = {
        nombres:     `${form.nombres} ${form.apellidos}`.trim(),
        usuario:     form.usuario.trim(),
        contra:      form.contra,
        tipoUsuario: form.tipoUsuario,
        genero:      form.genero || null,
        activo:      true,
        status:      false,
      }
      return api.post('/usuarios', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      toast.success(usuario ? 'Usuario actualizado' : 'Usuario creado')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const editFields: { label: string; key: keyof typeof form; colSpan?: boolean; type?: string }[] = [
    { label: 'Nombres',      key: 'nombres' },
    { label: 'Apellidos',    key: 'apellidos' },
    { label: 'Usuario (login)', key: 'usuario', colSpan: true },
    { label: 'Correo',       key: 'correo',      colSpan: true },
    { label: 'Puesto',       key: 'puesto' },
    { label: 'Departamento', key: 'departamento' },
    { label: 'Nueva contraseña (opcional)', key: 'contra', colSpan: true, type: 'password' },
  ]

  return (
    <Modal isOpen onClose={onClose} title={usuario ? 'Editar usuario' : 'Nuevo usuario'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {usuario ? (
            editFields.map(({ label, key, colSpan, type }) => (
              <div key={key} className={colSpan ? 'col-span-2' : ''}>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
                <input
                  type={type ?? 'text'}
                  value={form[key] as string}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="field"
                />
              </div>
            ))
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre(s)</label>
                <input type="text" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} className="field" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Apellidos</label>
                <input type="text" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} className="field" />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Usuario (login)</label>
                <input type="text" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} className="field" placeholder="Ej: CC 0299" />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Rol</label>
            <select value={form.tipoUsuario} onChange={(e) => setForm({ ...form, tipoUsuario: e.target.value })} className="field">
              <option value="AD">AD — Administrador</option>
              <option value="TI">TI — Técnico</option>
              <option value="CC">CC — Call Center</option>
              <option value="ST">ST — Staff</option>
              <option value="VE">VE — Ventas</option>
              <option value="CL">CL — Cliente</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Género</label>
            <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value as 'M' | 'F' | '' })} className="field">
              <option value="">Sin especificar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>
          {!usuario && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Contraseña inicial</label>
              <input type="password" value={form.contra} onChange={(e) => setForm({ ...form, contra: e.target.value })} className="field" />
            </div>
          )}
          {/* El campo de contraseña en edición se muestra vía editFields */}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
            {usuario ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Página ── */
export function UsuariosPage() {
  const [search, setSearch] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [tab, setTab] = useState<'activos' | 'desactivados'>('activos')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Usuario | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Usuario | null>(null)
  const [accesoUsuario, setAccesoUsuario] = useState<Usuario | null>(null)
  const qc = useQueryClient()

  const { data: usuarios = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map(parseUsuario)
    },
  })

  const { data: desactivados = [], isLoading: loadingDesact, refetch: refetchDesact } = useQuery({
    queryKey: ['usuarios-desactivados'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/desactivados')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseUsuario)
    },
    enabled: tab === 'desactivados',
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/usuarios/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); toast.success('Usuario eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  const reactivar = useMutation({
    mutationFn: (id: number) => api.put(`/usuarios/${id}/activo`, { activo: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['usuarios-desactivados'] })
      toast.success('Usuario reactivado')
    },
    onError: () => toast.error('Error al reactivar'),
  })

  const lista = tab === 'activos' ? usuarios : desactivados
  const loading = tab === 'activos' ? isLoading : loadingDesact

  const rolesDisponibles = Array.from(new Set(lista.map((u) => u.tipoUsuario).filter(Boolean))).sort()

  const filtered = lista.filter((u) => {
    const matchSearch = `${u.nombres} ${u.apellidos} ${u.correo} ${u.tipoUsuario}`.toLowerCase().includes(search.toLowerCase())
    const matchRol = filtroRol === 'todos' || u.tipoUsuario === filtroRol
    return matchSearch && matchRol
  })

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
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Usuarios</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">{usuarios.length} usuarios registrados</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { tab === 'activos' ? refetch() : refetchDesact() }}
                className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', (isRefetching) && 'animate-spin')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button onClick={() => { setSelected(null); setShowModal(true) }} className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <UserPlus className="h-3.5 w-3.5" /> Nuevo usuario
              </Button>
            </div>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setTab('activos'); setSearch(''); setFiltroRol('todos') }}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-[0.78rem] font-semibold border-b-2 transition-colors',
              tab === 'activos'
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Activos
            <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', tab === 'activos' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500')}>
              {usuarios.length}
            </span>
          </button>
          <button
            onClick={() => { setTab('desactivados'); setSearch(''); setFiltroRol('todos') }}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-[0.78rem] font-semibold border-b-2 transition-colors',
              tab === 'desactivados'
                ? 'border-red-500 text-red-500'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            )}
          >
            <UserX className="h-3.5 w-3.5" />
            Desactivados
            {desactivados.length > 0 && (
              <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', tab === 'desactivados' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500')}>
                {desactivados.length}
              </span>
            )}
          </button>
        </div>

        {/* Buscador */}
        <div className="px-5 py-3.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'activos' ? 'Buscar por nombre, correo o rol...' : 'Buscar usuario desactivado...'}
              className="field py-2 pl-9 text-sm"
            />
          </div>
        </div>

        {/* Filtro por rol */}
        {rolesDisponibles.length > 0 && (
          <div className="px-5 py-3 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFiltroRol('todos')}
              className={clsx(
                'rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                filtroRol === 'todos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              Todos <span className="opacity-70">({lista.length})</span>
            </button>
            {rolesDisponibles.map((rol) => {
              const count = lista.filter((u) => u.tipoUsuario === rol).length
              const active = filtroRol === rol
              return (
                <button
                  key={rol}
                  onClick={() => setFiltroRol(rol)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                    active ? (ROL_COLORS[rol] ?? 'bg-gray-200 text-gray-700') : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                    active && 'ring-1 ring-inset ring-black/5',
                  )}
                >
                  {rol} <span className="opacity-70">({count})</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Tabla ── */}
      {loading ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <tbody className="divide-y divide-gray-50">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className={clsx('flex h-14 w-14 items-center justify-center rounded-2xl', tab === 'desactivados' ? 'bg-red-50' : 'bg-brand/8')}>
            {tab === 'desactivados'
              ? <UserX className="h-7 w-7 text-red-300" />
              : <Users className="h-7 w-7 text-brand/40" />}
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">
              {tab === 'desactivados' ? 'Sin usuarios desactivados' : 'Sin usuarios'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">No se encontraron resultados</p>
          </div>
          {search && (
            <button onClick={() => setSearch('')} className="text-xs font-medium text-brand hover:underline">
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-[0.72rem] text-gray-400">
              {filtered.length === lista.length ? `${lista.length} usuarios` : `${filtered.length} de ${lista.length} usuarios`}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Puesto</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr key={u.id} className={clsx('transition-colors group', tab === 'desactivados' ? 'hover:bg-red-50/40 opacity-75 hover:opacity-100' : 'hover:bg-gray-50')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.fotoPerfil ? `/uploads/${u.fotoPerfil}` : undefined} name={`${u.nombres} ${u.apellidos}`} size="sm" />
                      <div>
                        <p className="text-[0.82rem] font-semibold text-gray-900">{u.nombres} {u.apellidos}</p>
                        <p className="text-[0.68rem] text-gray-400">{u.correo || u.login}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[0.78rem] text-gray-600">{u.puesto || '—'}</p>
                    {u.departamento && <p className="text-[0.68rem] text-gray-400">{u.departamento}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className={clsx('chip text-[0.65rem]', ROL_COLORS[u.tipoUsuario] ?? ROL_COLORS['CL'])}>
                        {u.tipoUsuario}
                      </span>
                      {u.campana && (
                        <span className="chip text-[0.6rem] bg-amber-50 text-amber-700">
                          {u.campana}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('chip text-[0.65rem]', u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {tab === 'desactivados' ? (
                        <button
                          onClick={() => reactivar.mutate(u.id)}
                          disabled={reactivar.isPending}
                          title="Reactivar usuario"
                          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[0.72rem] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Reactivar
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setAccesoUsuario(u)}
                            title="Permisos y accesos"
                            className="rounded-xl p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setSelected(u); setShowModal(true) }} className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDelete(u)} className="rounded-xl p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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

      {accesoUsuario && (
        <PermisosUsuarioModal
          usuarioId={accesoUsuario.id}
          nombre={`${accesoUsuario.nombres} ${accesoUsuario.apellidos}`.trim()}
          tipoUsuario={accesoUsuario.tipoUsuario}
          login={accesoUsuario.login}
          fotoPerfil={accesoUsuario.fotoPerfil}
          activo={accesoUsuario.activo}
          status={accesoUsuario.status}
          onClose={() => setAccesoUsuario(null)}
        />
      )}
      {showModal && <UsuarioModal usuario={selected} onClose={() => setShowModal(false)} />}

      {confirmDelete && (
        <Modal isOpen onClose={() => setConfirmDelete(null)} title="Eliminar usuario" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ¿Seguro que deseas eliminar a <span className="font-semibold text-gray-900">{confirmDelete.nombres} {confirmDelete.apellidos}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button
                isLoading={eliminar.isPending}
                onClick={() => { eliminar.mutate(confirmDelete.id); setConfirmDelete(null) }}
                className="bg-red-600 hover:bg-red-700 border-red-600"
              >
                Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
