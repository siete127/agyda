import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FolderOpen, File, Upload, Trash2, Download,
  ChevronLeft, FolderPlus, HardDrive,
  FileText, Sheet, Image, Film, Music, Archive,
  Share2, X, Check, Search, UserPlus, Shield,
  ChevronDown,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Carpeta {
  id: number
  nombre: string
  esPublica: boolean
  creadaPor: number
}

interface Archivo {
  id: number
  nombre: string
  extension: string
  tamano: number
  carpetaId: number | null
  creadoPor: number
  url: string
}

interface Usuario {
  id: number
  nombre: string
  usuario: string
  rol: string
}

interface Acceso {
  id: number
  usuarioId: number
  nombre: string
  usuario: string
  rol: string
  permiso: Permiso
}

type Permiso = 'todo' | 'ver' | 'descargar' | 'eliminar'

const PERMISOS: Record<Permiso, { label: string; desc: string; color: string; dot: string }> = {
  todo:       { label: 'Acceso total',  desc: 'Ver, descargar, eliminar y subir',  color: 'text-purple-700',  dot: 'bg-purple-500' },
  ver:        { label: 'Solo ver',      desc: 'Puede abrir y leer archivos',        color: 'text-blue-700',    dot: 'bg-blue-500' },
  descargar:  { label: 'Descargar',     desc: 'Ver y descargar archivos',           color: 'text-emerald-700', dot: 'bg-emerald-500' },
  eliminar:   { label: 'Eliminar',      desc: 'Ver, descargar y eliminar archivos', color: 'text-red-700',     dot: 'bg-red-500' },
}

const ROLES_LABEL: Record<string, string> = {
  AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', ST: 'Staff', VE: 'Ventas',
}

function parseCarpeta(r: Record<string, unknown>): Carpeta {
  return {
    id: Number(r['id'] ?? r['ID'] ?? 0),
    nombre: String(r['nombre'] ?? r['NOMBRE'] ?? r['name'] ?? ''),
    esPublica: Boolean(r['esPublica'] ?? r['es_publica'] ?? r['publica'] ?? false),
    creadaPor: Number(r['creadaPor'] ?? r['creado_por'] ?? r['usuarioId'] ?? 0),
  }
}

function parseArchivo(r: Record<string, unknown>): Archivo {
  const nombre = String(r['nombre'] ?? r['NOMBRE'] ?? r['name'] ?? r['filename'] ?? '')
  const ext = String(r['extension'] ?? r['ext'] ?? '').replace('.', '')
  return {
    id: Number(r['id'] ?? r['ID'] ?? 0),
    nombre,
    extension: ext,
    tamano: Number(r['tamano'] ?? r['size'] ?? r['TAMANO'] ?? 0),
    carpetaId: Number(r['carpetaId'] ?? r['carpeta_id'] ?? null) || null,
    creadoPor: Number(r['creadoPor'] ?? r['creado_por'] ?? 0),
    url: String(r['url'] ?? r['ruta'] ?? r['path'] ?? ''),
  }
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function FileIcon({ ext, className }: { ext: string; className?: string }) {
  const e = ext.toLowerCase()
  if (['pdf'].includes(e)) return <FileText className={clsx('text-red-500', className)} />
  if (['doc', 'docx', 'txt'].includes(e)) return <FileText className={clsx('text-blue-500', className)} />
  if (['xls', 'xlsx', 'csv'].includes(e)) return <Sheet className={clsx('text-emerald-500', className)} />
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(e)) return <Image className={clsx('text-purple-500', className)} />
  if (['mp4', 'avi', 'mov'].includes(e)) return <Film className={clsx('text-orange-500', className)} />
  if (['mp3', 'wav'].includes(e)) return <Music className={clsx('text-pink-500', className)} />
  if (['zip', 'rar', '7z'].includes(e)) return <Archive className={clsx('text-yellow-600', className)} />
  return <File className={clsx('text-gray-400', className)} />
}

function SkeletonFolder() {
  return (
    <div className="card p-4 animate-pulse space-y-3">
      <div className="h-8 w-8 rounded-xl bg-gray-100" />
      <div className="h-3 w-3/4 rounded-lg bg-gray-100" />
      <div className="h-2.5 w-1/2 rounded-full bg-gray-100" />
    </div>
  )
}

/* ──────────────────────────────────────────────
   Modal de gestión de accesos
────────────────────────────────────────────── */
function CompartirModal({
  tipo, id, nombre, onClose,
}: {
  tipo: 'carpeta' | 'archivo'
  id: number
  nombre: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [seleccionados, setSeleccionados] = useState<Map<number, Permiso>>(new Map())
  const [permisoDropOpen, setPermisoDropOpen] = useState<number | null>(null)

  // Lista de todos los usuarios
  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['drive-usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/drive/usuarios')
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 60_000,
  })

  // Accesos actuales del item
  const { data: accesos = [], isLoading: loadAccesos } = useQuery<Acceso[]>({
    queryKey: ['drive-accesos', tipo, id],
    queryFn: async () => {
      const endpoint = tipo === 'carpeta' ? `/drive/carpetas/${id}/compartidos` : `/drive/archivos/${id}/compartidos`
      const { data } = await api.get(endpoint)
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
  })

  const accesosPorUsuario = useMemo(() =>
    new Map(accesos.map(a => [a.usuarioId, a])), [accesos])

  const usuariosFiltrados = useMemo(() =>
    usuarios.filter(u =>
      u.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.usuario.toLowerCase().includes(busqueda.toLowerCase())
    ), [usuarios, busqueda])

  const revocar = useMutation({
    mutationFn: (usuarioId: number) => {
      const endpoint = tipo === 'carpeta'
        ? `/drive/carpetas/${id}/compartidos/${usuarioId}`
        : `/drive/archivos/${id}/compartidos/${usuarioId}`
      return api.delete(endpoint)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive-accesos', tipo, id] })
      toast.success('Acceso revocado')
    },
    onError: () => toast.error('Error al revocar acceso'),
  })

  const compartir = useMutation({
    mutationFn: () => {
      const endpoint = tipo === 'carpeta'
        ? `/drive/carpetas/${id}/compartir`
        : `/drive/archivos/${id}/compartir`
      const body = {
        usuarios: Array.from(seleccionados.entries()).map(([uid, permiso]) => ({ id: uid, permiso })),
      }
      return api.post(endpoint, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive-accesos', tipo, id] })
      setSeleccionados(new Map())
      toast.success('Acceso concedido')
    },
    onError: () => toast.error('Error al compartir'),
  })

  function toggleSeleccion(uid: number) {
    setSeleccionados(prev => {
      const next = new Map(prev)
      if (next.has(uid)) next.delete(uid)
      else next.set(uid, 'ver')
      return next
    })
  }

  function setPermiso(uid: number, p: Permiso) {
    setSeleccionados(prev => {
      const next = new Map(prev)
      next.set(uid, p)
      return next
    })
    setPermisoDropOpen(null)
  }

  const iconoTipo = tipo === 'carpeta'
    ? <FolderOpen className="h-4 w-4 text-brand" />
    : <File className="h-4 w-4 text-gray-500" />

  return (
    <Modal isOpen onClose={onClose} title="Gestionar accesos" size="lg">
      <div className="space-y-5">

        {/* Nombre del item */}
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
          {iconoTipo}
          <span className="text-sm font-semibold text-gray-700 truncate">{nombre}</span>
          <span className="ml-auto text-[0.68rem] text-gray-400 capitalize">{tipo}</span>
        </div>

        {/* Accesos actuales */}
        <div>
          <p className="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Accesos actuales
          </p>
          {loadAccesos ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : accesos.length === 0 ? (
            <p className="text-[0.75rem] text-gray-400 text-center py-3 bg-gray-50 rounded-xl">
              Solo el dueño tiene acceso
            </p>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
              {accesos.map(a => {
                const cfg = PERMISOS[a.permiso] ?? PERMISOS.ver
                return (
                  <div key={a.usuarioId} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-card px-3 py-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.65rem] font-bold text-brand">
                      {a.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.78rem] font-semibold text-gray-800 truncate">{a.nombre}</p>
                      <p className="text-[0.65rem] text-gray-400">{ROLES_LABEL[a.rol] ?? a.rol}</p>
                    </div>
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold bg-gray-50 border border-gray-100', cfg.color)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => revocar.mutate(a.usuarioId)}
                      disabled={revocar.isPending}
                      className="flex-shrink-0 rounded-lg p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Revocar acceso"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="border-t border-gray-100" />

        {/* Agregar acceso */}
        <div>
          <p className="text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <UserPlus className="h-3 w-3" /> Agregar acceso
          </p>

          {/* Buscador */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar colaborador..."
              className="field pl-9 py-2 text-sm"
            />
          </div>

          {/* Lista de usuarios */}
          <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
            {usuariosFiltrados.length === 0 ? (
              <p className="text-[0.75rem] text-gray-400 text-center py-4">Sin resultados</p>
            ) : usuariosFiltrados.map(u => {
              const yaAcceso = accesosPorUsuario.has(u.id)
              const selec = seleccionados.has(u.id)
              const permisoActual = seleccionados.get(u.id) ?? 'ver'
              const cfgPermiso = PERMISOS[permisoActual]

              return (
                <div
                  key={u.id}
                  className={clsx(
                    'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                    yaAcceso
                      ? 'border-gray-100 bg-gray-50 opacity-60'
                      : selec
                        ? 'border-brand/30 bg-brand/5'
                        : 'border-gray-100 bg-card hover:border-gray-200 cursor-pointer'
                  )}
                  onClick={() => !yaAcceso && toggleSeleccion(u.id)}
                >
                  {/* Avatar */}
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[0.65rem] font-bold text-gray-500">
                    {u.nombre.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.78rem] font-semibold text-gray-800 truncate">{u.nombre}</p>
                    <p className="text-[0.62rem] text-gray-400">{ROLES_LABEL[u.rol] ?? u.rol}</p>
                  </div>

                  {yaAcceso ? (
                    <span className="text-[0.65rem] text-gray-400 italic">Ya tiene acceso</span>
                  ) : selec ? (
                    /* Selector de permiso para este usuario */
                    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <button
                          onClick={() => setPermisoDropOpen(permisoDropOpen === u.id ? null : u.id)}
                          className={clsx(
                            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.7rem] font-semibold transition-colors',
                            'border-gray-200 bg-card hover:bg-gray-50', cfgPermiso.color
                          )}
                        >
                          <span className={clsx('h-1.5 w-1.5 rounded-full', cfgPermiso.dot)} />
                          {cfgPermiso.label}
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </button>
                        {permisoDropOpen === u.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setPermisoDropOpen(null)} />
                            <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-gray-200 bg-card shadow-xl overflow-hidden">
                              {(Object.entries(PERMISOS) as [Permiso, typeof PERMISOS[Permiso]][]).map(([key, cfg]) => (
                                <button
                                  key={key}
                                  onClick={() => setPermiso(u.id, key)}
                                  className={clsx(
                                    'w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50',
                                    key === permisoActual ? 'bg-gray-50' : ''
                                  )}
                                >
                                  <span className={clsx('mt-0.5 h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} />
                                  <div>
                                    <p className={clsx('text-[0.78rem] font-semibold', cfg.color)}>{cfg.label}</p>
                                    <p className="text-[0.65rem] text-gray-400">{cfg.desc}</p>
                                  </div>
                                  {key === permisoActual && <Check className="ml-auto h-3.5 w-3.5 text-brand self-center" />}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); toggleSeleccion(u.id) }}
                        className="rounded-lg p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[0.68rem] text-gray-300">Clic para agregar</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        {seleccionados.size > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-[0.75rem] text-gray-500">
              {seleccionados.size} {seleccionados.size === 1 ? 'colaborador' : 'colaboradores'} seleccionado{seleccionados.size !== 1 ? 's' : ''}
            </span>
            <Button
              isLoading={compartir.isPending}
              onClick={() => compartir.mutate()}
              className="text-[0.78rem] py-1.5 px-4"
            >
              <Share2 className="h-3.5 w-3.5" /> Compartir
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ──────────────────────────────────────────────
   Lista de archivos
────────────────────────────────────────────── */
function ArchivosList({ archivos, isTI, onEliminar, onCompartir }: {
  archivos: Archivo[]
  isTI: boolean
  onEliminar: (id: number) => void
  onCompartir: (a: Archivo) => void
}) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivo</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamaño</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {archivos.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileIcon ext={a.extension} className="h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-800 text-[0.82rem]">{a.nombre}</p>
                    {a.extension && (
                      <p className="text-[0.65rem] text-gray-400 uppercase">{a.extension}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-[0.75rem] text-gray-400">
                {a.tamano ? fmtSize(a.tamano) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={`${import.meta.env.VITE_API_URL ?? '/api'}/drive/archivos/${a.id}/descargar`}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors"
                    title="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {isTI && (
                    <>
                      <button
                        onClick={() => onCompartir(a)}
                        className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors"
                        title="Gestionar accesos"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEliminar(a.id)}
                        className="rounded-xl p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
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
  )
}

/* ──────────────────────────────────────────────
   Página principal
────────────────────────────────────────────── */
export function DrivePage() {
  const [carpetaActual, setCarpetaActual] = useState<Carpeta | null>(null)
  const [showNuevaCarpeta, setShowNuevaCarpeta] = useState(false)
  const [nombreCarpeta, setNombreCarpeta] = useState('')
  const [confirmArchivoId, setConfirmArchivoId] = useState<number | null>(null)
  const [confirmCarpetaId, setConfirmCarpetaId] = useState<number | null>(null)

  // Modal compartir: puede ser carpeta o archivo
  const [compartirTarget, setCompartirTarget] = useState<
    { tipo: 'carpeta'; item: Carpeta } | { tipo: 'archivo'; item: Archivo } | null
  >(null)

  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isTI = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')

  const { data: carpetas = [], isLoading: loadCarpetas } = useQuery({
    queryKey: ['drive-carpetas'],
    queryFn: async () => {
      const { data } = await api.get('/drive/carpetas')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseCarpeta)
    },
  })

  const { data: archivos = [], isLoading: loadArchivos } = useQuery({
    queryKey: ['drive-archivos', carpetaActual?.id],
    queryFn: async () => {
      const params = carpetaActual ? { carpetaId: carpetaActual.id } : {}
      const { data } = await api.get('/drive/archivos', { params })
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseArchivo)
    },
  })

  const crearCarpeta = useMutation({
    mutationFn: () => api.post('/drive/carpetas', { nombre: nombreCarpeta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive-carpetas'] })
      setNombreCarpeta('')
      setShowNuevaCarpeta(false)
      toast.success('Carpeta creada')
    },
    onError: () => toast.error('Error al crear carpeta'),
  })

  const eliminarCarpeta = useMutation({
    mutationFn: (id: number) => api.delete(`/drive/carpetas/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drive-carpetas'] }); toast.success('Carpeta eliminada') },
    onError: () => toast.error('Error al eliminar carpeta'),
  })

  const eliminarArchivo = useMutation({
    mutationFn: (id: number) => api.delete(`/drive/archivos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drive-archivos', carpetaActual?.id] }); toast.success('Archivo eliminado') },
    onError: () => toast.error('Error al eliminar archivo'),
  })

  const subirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('archivo', file)
    if (carpetaActual) fd.append('carpetaId', String(carpetaActual.id))
    try {
      await api.post('/drive/archivos', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['drive-archivos', carpetaActual?.id] })
      toast.success('Archivo subido')
    } catch {
      toast.error('Error al subir archivo')
    }
    e.target.value = ''
  }

  const isLoading = loadCarpetas || loadArchivos

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
              {carpetaActual && (
                <button
                  onClick={() => setCarpetaActual(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <HardDrive className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">
                  {carpetaActual ? carpetaActual.nombre : 'Drive'}
                </h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {carpetaActual
                    ? `${archivos.length} archivo${archivos.length !== 1 ? 's' : ''}`
                    : `${carpetas.length} carpeta${carpetas.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isTI && !carpetaActual && (
                <Button
                  onClick={() => setShowNuevaCarpeta(true)}
                  className="bg-white/10 border border-white/20 text-white hover:bg-white/20 !shadow-none text-[0.78rem] py-1.5 px-3"
                >
                  <FolderPlus className="h-3.5 w-3.5" /> Nueva carpeta
                </Button>
              )}
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={subirArchivo} />
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-1.5 text-[0.78rem] font-semibold text-brand hover:bg-blue-50 transition-colors cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Subir archivo
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonFolder key={i} />)}
        </div>
      ) : !carpetaActual ? (
        <div className="space-y-5">
          {carpetas.length === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-4 py-20">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
                <HardDrive className="h-7 w-7 text-brand/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Drive vacío</p>
                <p className="text-xs text-gray-400 mt-0.5">No hay carpetas creadas aún</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {carpetas.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setCarpetaActual(c)}
                  className="group card flex flex-col gap-3 p-4 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-card-md hover:border-gray-300/60"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/8">
                      <FolderOpen className="h-5 w-5 text-brand" />
                    </div>
                    {isTI && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCompartirTarget({ tipo: 'carpeta', item: c })
                          }}
                          className="rounded-xl p-1.5 text-gray-300 hover:text-brand hover:bg-brand/8 transition-all"
                          title="Gestionar accesos"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmCarpetaId(c.id)
                          }}
                          className="rounded-xl p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[0.82rem] font-semibold text-gray-800 truncate">{c.nombre}</p>
                    <p className="text-[0.68rem] text-gray-400 mt-0.5">{c.esPublica ? 'Pública' : 'Privada'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {archivos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-gray-300" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Archivos raíz</h2>
              </div>
              <ArchivosList
                archivos={archivos}
                isTI={isTI}
                onEliminar={(id) => setConfirmArchivoId(id)}
                onCompartir={(a) => setCompartirTarget({ tipo: 'archivo', item: a })}
              />
            </div>
          )}
        </div>
      ) : archivos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
            <File className="h-7 w-7 text-gray-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Carpeta vacía</p>
            <p className="text-xs text-gray-400 mt-0.5">Sube el primer archivo con el botón de arriba</p>
          </div>
        </div>
      ) : (
        <ArchivosList
          archivos={archivos}
          isTI={isTI}
          onEliminar={(id) => setConfirmArchivoId(id)}
          onCompartir={(a) => setCompartirTarget({ tipo: 'archivo', item: a })}
        />
      )}

      {/* ── Modal nueva carpeta ── */}
      {showNuevaCarpeta && (
        <Modal isOpen onClose={() => setShowNuevaCarpeta(false)} title="Nueva carpeta" size="sm">
          <div className="space-y-3">
            <input
              value={nombreCarpeta}
              onChange={(e) => setNombreCarpeta(e.target.value)}
              placeholder="Nombre de la carpeta"
              className="field"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && nombreCarpeta.trim() && crearCarpeta.mutate()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNuevaCarpeta(false)}>Cancelar</Button>
              <Button isLoading={crearCarpeta.isPending} disabled={!nombreCarpeta.trim()} onClick={() => crearCarpeta.mutate()}>
                Crear
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal gestión de accesos ── */}
      {compartirTarget && (
        <CompartirModal
          tipo={compartirTarget.tipo}
          id={compartirTarget.item.id}
          nombre={compartirTarget.item.nombre}
          onClose={() => setCompartirTarget(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmArchivoId !== null}
        onClose={() => setConfirmArchivoId(null)}
        onConfirm={() => { if (confirmArchivoId !== null) eliminarArchivo.mutate(confirmArchivoId) }}
        title="Eliminar archivo"
        message="¿Seguro que deseas eliminar este archivo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        isPending={eliminarArchivo.isPending}
      />

      <ConfirmDialog
        isOpen={confirmCarpetaId !== null}
        onClose={() => setConfirmCarpetaId(null)}
        onConfirm={() => { if (confirmCarpetaId !== null) eliminarCarpeta.mutate(confirmCarpetaId) }}
        title="Eliminar carpeta"
        message="¿Seguro que deseas eliminar esta carpeta y todos sus archivos?"
        confirmLabel="Eliminar"
        isPending={eliminarCarpeta.isPending}
      />
    </div>
  )
}
