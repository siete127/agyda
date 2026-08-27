import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck, SlidersHorizontal, ChevronRight, X } from 'lucide-react'
import { api } from '@/lib/axios'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import { PermisosUsuarioModal } from '../usuarios/PermisosUsuarioModal'

interface Usuario {
  id: number
  nombres: string
  apellidos: string
  login: string
  correo: string
  tipoUsuario: string
  activo: boolean
  status: boolean
  fotoPerfil: string | null
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
    activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? r['active'] ?? true),
    status: Boolean(r['status'] ?? r['STATUS'] ?? r['NEUS_STATUS'] ?? false),
    fotoPerfil: s(['fotoPerfil', 'foto_perfil', 'FOTO_PERFIL', 'foto', 'fotoUrl', 'FOTO_URL']) || null,
  }
}

const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700', TI: 'bg-blue-100 text-blue-700', CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600', ST: 'bg-emerald-100 text-emerald-700', VE: 'bg-amber-100 text-amber-700',
}
const ROL_DOT: Record<string, string> = {
  AD: 'bg-red-500', TI: 'bg-blue-500', CC: 'bg-purple-500',
  CL: 'bg-gray-400', ST: 'bg-emerald-500', VE: 'bg-amber-500',
}
const PAGE_SIZES = [10, 25, 50]
type Orden = 'nombre' | 'rol' | 'recientes'

function fotoSrc(foto: string | null): string | undefined {
  if (!foto) return undefined
  return /^https?:\/\//i.test(foto) ? foto : `/uploads/${foto}`
}

// Editor de permisos por usuario individual (módulos y funciones granulares).
// Esta pantalla es el selector de "a quién editarle permisos".
export function PermisosTab() {
  const [search, setSearch] = useState('')
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null)
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtroRol, setFiltroRol] = useState('todos')
  const [orden, setOrden] = useState<Orden>('nombre')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map(parseUsuario)
    },
  })

  const rolesDisponibles = useMemo(
    () => Array.from(new Set(usuarios.map((u) => u.tipoUsuario.toUpperCase()).filter(Boolean))).sort(),
    [usuarios],
  )

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    const arr = usuarios.filter((u) => {
      const matchTexto = !q || `${u.nombres} ${u.apellidos} ${u.login} ${u.correo}`.toLowerCase().includes(q)
      const matchRol = filtroRol === 'todos' || u.tipoUsuario.toUpperCase() === filtroRol
      return matchTexto && matchRol
    })
    arr.sort((a, b) => {
      if (orden === 'rol') return a.tipoUsuario.localeCompare(b.tipoUsuario) || a.nombres.localeCompare(b.nombres)
      if (orden === 'recientes') return b.id - a.id
      return `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`)
    })
    return arr
  }, [usuarios, search, filtroRol, orden])

  // Reset de página al cambiar filtros (sin useEffect).
  const key = `${search}|${filtroRol}|${orden}|${pageSize}`
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) { setPrevKey(key); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize))
  const pageClamped = Math.min(page, totalPages)
  const pageRows = filtrados.slice((pageClamped - 1) * pageSize, pageClamped * pageSize)

  const filtrosActivos = filtroRol !== 'todos' ? 1 : 0

  return (
    <div className="space-y-4">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[1.1rem] font-bold text-gray-900">Permisos</h2>
          {!isLoading && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.7rem] font-bold text-brand">
              {usuarios.length}
            </span>
          )}
        </div>
      </div>
      <p className="-mt-2 text-[0.8rem] text-gray-400">
        Elige un usuario para configurar qué módulos y funciones puede usar.
      </p>

      {/* ── Buscador + Filtros + Ordenar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuario…"
            className="field w-full pl-9 text-[0.82rem]"
          />
        </div>
        <button
          onClick={() => setShowFiltros((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-[0.78rem] font-semibold transition-colors',
            showFiltros || filtrosActivos ? 'border-brand/40 bg-brand/[0.04] text-brand' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtros
          {filtrosActivos > 0 && <span className="rounded-full bg-brand px-1.5 text-[0.6rem] font-bold text-white">{filtrosActivos}</span>}
        </button>
        <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <span className="text-[0.72rem] text-gray-400">Ordenar por</span>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="bg-transparent text-[0.78rem] font-semibold text-gray-700 outline-none"
          >
            <option value="nombre">Nombre (A-Z)</option>
            <option value="rol">Rol</option>
            <option value="recientes">Más recientes</option>
          </select>
        </div>
      </div>

      {/* ── Panel de filtros ── */}
      {showFiltros && rolesDisponibles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-card animate-fade-in">
          <span className="mr-1 text-[0.7rem] font-semibold uppercase tracking-wider text-gray-400">Rol</span>
          <button
            onClick={() => setFiltroRol('todos')}
            className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
              filtroRol === 'todos' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            Todos <span className="opacity-70">({usuarios.length})</span>
          </button>
          {rolesDisponibles.map((rol) => {
            const count = usuarios.filter((u) => u.tipoUsuario.toUpperCase() === rol).length
            const active = filtroRol === rol
            return (
              <button
                key={rol}
                onClick={() => setFiltroRol(rol)}
                className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors',
                  active ? (ROL_COLORS[rol] ?? 'bg-gray-200 text-gray-700') : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
              >
                {rol} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
          {filtrosActivos > 0 && (
            <button onClick={() => setFiltroRol('todos')} className="ml-1 flex items-center gap-1 text-[0.7rem] font-semibold text-gray-400 hover:text-gray-600">
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* ── Card lista ── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-gray-50 px-5 py-4">
          <h3 className="text-[0.92rem] font-bold text-gray-900">Lista de usuarios</h3>
          {!isLoading && (
            <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-brand">
              {filtrados.length}
            </span>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-12"><ShieldCheck className="h-5 w-5 animate-pulse text-gray-300" /></div>
          ) : pageRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">
              {usuarios.length === 0 ? 'Sin usuarios' : 'Sin resultados'}
            </p>
          ) : (
            pageRows.map((u) => {
              const rolUpper = u.tipoUsuario.toUpperCase()
              return (
                <button
                  key={u.id}
                  onClick={() => setSeleccionado(u)}
                  className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-gray-50/70"
                >
                  <Avatar src={fotoSrc(u.fotoPerfil)} name={`${u.nombres} ${u.apellidos}`} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.88rem] font-semibold text-gray-900">{u.nombres} {u.apellidos}</p>
                    <p className="truncate text-[0.72rem] text-gray-400">@{u.login}{u.correo ? ` · ${u.correo}` : ''}</p>
                  </div>

                  <span className="hidden items-center gap-1.5 text-[0.75rem] font-medium sm:inline-flex">
                    <span className={clsx('h-1.5 w-1.5 rounded-full', u.activo ? 'bg-emerald-500' : 'bg-gray-300')} />
                    <span className={u.activo ? 'text-emerald-700' : 'text-gray-400'}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                  </span>

                  {rolUpper && (
                    <span className="inline-flex items-center gap-1.5 rounded-full pr-0.5">
                      <span className={clsx('h-1.5 w-1.5 rounded-full', ROL_DOT[rolUpper] ?? 'bg-gray-400')} />
                      <span className={clsx('rounded-full px-2.5 py-1 text-[0.72rem] font-bold', ROL_COLORS[rolUpper] ?? 'bg-gray-100 text-gray-600')}>
                        {rolUpper}
                      </span>
                    </span>
                  )}

                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </button>
              )
            })
          )}
        </div>

        {/* ── Paginación ── */}
        {!isLoading && filtrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-50 px-5 py-3">
            <p className="text-[0.72rem] text-gray-400">
              Mostrando {(pageClamped - 1) * pageSize + 1} a {Math.min(pageClamped * pageSize, filtrados.length)} de {filtrados.length} usuarios
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageClamped === 1}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Anterior
                </button>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-brand px-2 text-[0.72rem] font-bold text-white">
                  {pageClamped}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageClamped === totalPages}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  Siguiente <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[0.72rem] text-gray-400">Por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[0.72rem] font-semibold text-gray-700 outline-none focus:border-brand"
                >
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {seleccionado && (
        <PermisosUsuarioModal
          usuarioId={seleccionado.id}
          nombre={`${seleccionado.nombres} ${seleccionado.apellidos}`.trim()}
          tipoUsuario={seleccionado.tipoUsuario}
          login={seleccionado.login}
          fotoPerfil={seleccionado.fotoPerfil}
          activo={seleccionado.activo}
          status={seleccionado.status}
          onClose={() => setSeleccionado(null)}
        />
      )}
    </div>
  )
}
