import { Fragment, useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, UserPlus, Edit2, Trash2, Users, UserX, UserCheck, RefreshCw,
  SlidersHorizontal, MoreVertical, ShieldCheck, UserCog, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, X,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { type Usuario, parseUsuario, fotoUsuarioSrc, ROL_COLORS } from '../usuarios/usuario.model'
import { UsuarioModal } from '../usuarios/UsuarioModal'
import { UsuarioFichaExpandida } from '../usuarios/UsuarioFichaExpandida'

const PAGE_SIZES = [10, 25, 50, 100]

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Tarjeta de estadística ── */
function StatCard({
  icon: Icon, label, value, sub, tone, progress,
}: {
  icon: typeof Users
  label: string
  value: string | number
  sub?: string
  tone: 'blue' | 'emerald' | 'purple' | 'amber'
  progress?: number
}) {
  const tones = {
    blue:    { soft: 'bg-blue-50',    text: 'text-blue-500',    bar: 'bg-blue-400' },
    emerald: { soft: 'bg-emerald-50', text: 'text-emerald-500', bar: 'bg-emerald-400' },
    purple:  { soft: 'bg-purple-50',  text: 'text-purple-500',  bar: 'bg-purple-400' },
    amber:   { soft: 'bg-amber-50',   text: 'text-amber-500',   bar: 'bg-amber-400' },
  }[tone]
  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', tones.soft)}>
          <Icon className={clsx('h-4 w-4', tones.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-medium text-gray-400">{label}</p>
          <p className="mt-0.5 text-[1.35rem] font-bold leading-none text-gray-900">{value}</p>
          {sub && <p className="mt-1 text-[0.68rem] text-gray-400">{sub}</p>}
        </div>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-gray-100">
          <div className={clsx('h-full rounded-full transition-all', tones.bar)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </div>
  )
}

/* ── Menú de acciones (3 puntos) ── */
function RowMenu({
  onEdit, onDelete, onReactivate, esDesactivado,
}: {
  onEdit?: () => void
  onDelete?: () => void
  onReactivate?: () => void
  esDesactivado: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-gray-100 bg-card py-1 shadow-lg animate-fade-in">
          {esDesactivado ? (
            <button
              onClick={() => { onReactivate?.(); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-[0.78rem] font-medium text-emerald-600 hover:bg-emerald-50"
            >
              <UserCheck className="h-3.5 w-3.5" /> Reactivar
            </button>
          ) : (
            <>
              <button
                onClick={() => { onEdit?.(); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[0.78rem] font-medium text-gray-600 hover:bg-gray-50"
              >
                <Edit2 className="h-3.5 w-3.5" /> Editar
              </button>
              <button
                onClick={() => { onDelete?.(); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-[0.78rem] font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Gestión de usuarios integrada en el mapa de Configuración: fila de KPIs,
// buscador con panel de filtros plegable, tabla paginada y menú de acciones.
// Comparte modal de alta/edición y parser con ../usuarios/UsuariosPage.
export function UsuariosTab() {
  const [search, setSearch] = useState('')
  const [filtroRol, setFiltroRol] = useState('todos')
  const [showFiltros, setShowFiltros] = useState(false)
  const [tab, setTab] = useState<'activos' | 'desactivados'>('activos')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState<Usuario | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Usuario | null>(null)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const qc = useQueryClient()

  const { data: usuarios = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map(parseUsuario)
    },
  })

  const { data: desactivados = [], isLoading: loadingDesact, refetch: refetchDesact, isRefetching: isRefetchingDesact } = useQuery({
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
  const refrescando = tab === 'activos' ? isRefetching : isRefetchingDesact

  const rolesDisponibles = useMemo(
    () => Array.from(new Set(lista.map((u) => u.tipoUsuario).filter(Boolean))).sort(),
    [lista],
  )

  // ── KPIs (sobre el universo completo de usuarios) ──
  const totalRegistrados = usuarios.length + desactivados.length
  const conCampana = usuarios.filter((u) => u.campana).length
  const rolesAsignados = useMemo(
    () => Array.from(new Set(usuarios.map((u) => u.tipoUsuario).filter(Boolean))),
    [usuarios],
  )

  const filtered = useMemo(() => lista.filter((u) => {
    const matchSearch = `${u.nombres} ${u.apellidos} ${u.correo} ${u.tipoUsuario} ${u.login}`.toLowerCase().includes(search.toLowerCase())
    const matchRol = filtroRol === 'todos' || u.tipoUsuario === filtroRol
    return matchSearch && matchRol
  }), [lista, search, filtroRol])

  // ── Paginación ──
  // Reset a la página 1 durante el render cuando cambia cualquier filtro/tab,
  // sin useEffect (evita el render en cascada). Ver react.dev "you-might-not-need-an-effect".
  const filtrosKey = `${search}|${filtroRol}|${tab}|${pageSize}`
  const [prevFiltrosKey, setPrevFiltrosKey] = useState(filtrosKey)
  if (filtrosKey !== prevFiltrosKey) {
    setPrevFiltrosKey(filtrosKey)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClamped = Math.min(page, totalPages)
  const pageRows = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize)

  const filtrosActivos = filtroRol !== 'todos' ? 1 : 0

  const limpiarFiltros = () => { setFiltroRol('todos') }

  return (
    <div className="space-y-4">
      {/* ── Encabezado con acción ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8rem] text-gray-400">Gestiona los usuarios que tienen acceso al sistema</p>
        <button
          onClick={() => { setSelected(null); setShowModal(true) }}
          className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[0.78rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98]"
        >
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          tone="blue"
          label="Cuentas habilitadas"
          value={usuarios.length}
          sub={`De ${totalRegistrados} registradas`}
          progress={totalRegistrados ? (usuarios.length / totalRegistrados) * 100 : 0}
        />
        <StatCard
          icon={UserX}
          tone="amber"
          label="Cuentas deshabilitadas"
          value={desactivados.length}
          sub={totalRegistrados ? `${Math.round((desactivados.length / totalRegistrados) * 100)}% del total` : '—'}
          progress={totalRegistrados ? (desactivados.length / totalRegistrados) * 100 : 0}
        />
        <StatCard
          icon={UserCog}
          tone="purple"
          label="Roles en uso"
          value={rolesAsignados.length}
          sub={rolesAsignados.slice(0, 4).join(', ') + (rolesAsignados.length > 4 ? ' y más' : '')}
        />
        <StatCard
          icon={ShieldCheck}
          tone="emerald"
          label="Asignados a campaña"
          value={conCampana}
          sub={usuarios.length ? `${Math.round((conCampana / usuarios.length) * 100)}% de habilitadas` : '—'}
          progress={usuarios.length ? (conCampana / usuarios.length) * 100 : 0}
        />
      </div>

      {/* ── Pestañas ── */}
      <div className="flex gap-5 border-b border-gray-100">
        <button
          onClick={() => setTab('activos')}
          className={clsx(
            'flex items-center gap-2 border-b-2 pb-2.5 text-[0.8rem] font-semibold transition-colors',
            tab === 'activos' ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600',
          )}
        >
          Activos
          <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', tab === 'activos' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500')}>
            {usuarios.length}
          </span>
        </button>
        <button
          onClick={() => setTab('desactivados')}
          className={clsx(
            'flex items-center gap-2 border-b-2 pb-2.5 text-[0.8rem] font-semibold transition-colors',
            tab === 'desactivados' ? 'border-red-500 text-red-500' : 'border-transparent text-gray-400 hover:text-gray-600',
          )}
        >
          Desactivados
          <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', tab === 'desactivados' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500')}>
            {desactivados.length}
          </span>
        </button>
      </div>

      {/* ── Buscador + Filtros + refrescar ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'activos' ? 'Buscar por nombre, correo o rol…' : 'Buscar usuario desactivado…'}
            className="field w-full pl-9 text-[0.82rem]"
          />
        </div>
        <button
          onClick={() => setShowFiltros((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[0.78rem] font-semibold transition-colors',
            showFiltros || filtrosActivos > 0
              ? 'border-brand/40 bg-brand/[0.04] text-brand'
              : 'border-gray-200 bg-card text-gray-600 hover:bg-gray-50',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {filtrosActivos > 0 && (
            <span className="rounded-full bg-brand px-1.5 text-[0.6rem] font-bold text-white">{filtrosActivos}</span>
          )}
        </button>
        <button
          onClick={() => { if (tab === 'activos') refetch(); else refetchDesact() }}
          title="Actualizar"
          className={clsx(
            'flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-gray-200 bg-card text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors',
            refrescando && 'animate-spin',
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Panel de filtros plegable ── */}
      {showFiltros && (
        <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="section-label">Filtros</span>
            {filtrosActivos > 0 && (
              <button onClick={limpiarFiltros} className="flex items-center gap-1 text-[0.7rem] font-semibold text-gray-400 hover:text-gray-600">
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-gray-400">Rol</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setFiltroRol('todos')}
                className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                  filtroRol === 'todos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
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
                    className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                      active ? (ROL_COLORS[rol] ?? 'bg-gray-200 text-gray-700') : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      active && 'ring-1 ring-inset ring-black/5')}
                  >
                    {rol} <span className="opacity-70">({count})</span>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── Tabla ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        {loading ? (
          <div className="flex justify-center py-16"><Users className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl', tab === 'desactivados' ? 'bg-red-50' : 'bg-brand/[0.08]')}>
              {tab === 'desactivados' ? <UserX className="h-6 w-6 text-red-300" /> : <Users className="h-6 w-6 text-brand/40" />}
            </div>
            <p className="text-sm font-semibold text-gray-500">
              {tab === 'desactivados' ? 'Sin usuarios desactivados' : 'Sin resultados'}
            </p>
            {(search || filtrosActivos > 0) && (
              <button onClick={() => { setSearch(''); limpiarFiltros() }} className="text-xs font-medium text-brand hover:underline">
                Limpiar búsqueda y filtros
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                    <th className="px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Usuario</th>
                    <th className="px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Puesto</th>
                    <th className="px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Rol</th>
                    <th className="px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Cuenta</th>
                    <th className="px-4 py-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Ingreso</th>
                    <th className="px-4 py-2.5 text-right text-[0.65rem] font-semibold uppercase tracking-wider text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map((u) => {
                    const abierto = expandido === u.id
                    return (
                    <Fragment key={u.id}>
                    <tr
                      onClick={() => tab === 'activos' && setExpandido(abierto ? null : u.id)}
                      className={clsx(
                        'transition-colors',
                        tab === 'desactivados' ? 'opacity-75 hover:opacity-100 hover:bg-red-50/40' : 'cursor-pointer hover:bg-gray-50',
                        abierto && 'bg-gray-50',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {tab === 'activos' && (
                            <ChevronDown className={clsx('h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-transform', abierto && 'rotate-180 text-brand')} />
                          )}
                          <Avatar src={fotoUsuarioSrc(u.fotoPerfil)} name={`${u.nombres} ${u.apellidos}`} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[0.82rem] font-semibold text-gray-900">{u.nombres} {u.apellidos}</p>
                            <p className="truncate text-[0.68rem] text-gray-400">
                              {u.login}{u.correo ? ` · ${u.correo}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[0.78rem] text-gray-600">{u.puesto || '—'}</p>
                        {u.departamento && <p className="text-[0.66rem] text-gray-400">{u.departamento}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={clsx('chip text-[0.65rem]', ROL_COLORS[u.tipoUsuario] ?? ROL_COLORS['CL'])}>
                            {u.tipoUsuario}
                          </span>
                          {u.campana && (
                            <span className="chip bg-amber-50 text-amber-700 text-[0.6rem]">{u.campana}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'chip text-[0.65rem]',
                          u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
                        )}>
                          {u.activo ? 'Habilitada' : 'Deshabilitada'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-gray-500">
                          <Clock className="h-3 w-3 text-gray-300" />
                          {fmtFecha(u.fechaIngreso)}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <RowMenu
                            esDesactivado={tab === 'desactivados'}
                            onEdit={() => { setSelected(u); setShowModal(true) }}
                            onDelete={() => setConfirmDelete(u)}
                            onReactivate={() => reactivar.mutate(u.id)}
                          />
                        </div>
                      </td>
                    </tr>
                    {abierto && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <UsuarioFichaExpandida usuarioId={u.id} puedeEditar />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )})}
                </tbody>
              </table>
            </div>

            {/* ── Paginación ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <p className="text-[0.72rem] text-gray-400">
                Mostrando {(pageClamped - 1) * pageSize + 1} a {Math.min(pageClamped * pageSize, filtered.length)} de {filtered.length} usuarios
              </p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(1)}
                    disabled={pageClamped === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronsLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pageClamped === 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - pageClamped) <= 1)
                    .map((p, i, arr) => (
                      <span key={p} className="flex items-center">
                        {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-gray-300">…</span>}
                        <button
                          onClick={() => setPage(p)}
                          className={clsx(
                            'flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[0.72rem] font-semibold transition-colors',
                            p === pageClamped ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-100',
                          )}
                        >
                          {p}
                        </button>
                      </span>
                    ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={pageClamped === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={pageClamped === totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.72rem] text-gray-600 outline-none focus:border-brand"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n} por página</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

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
