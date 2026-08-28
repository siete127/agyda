import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, FolderOpen, Upload, Download, Trash2, FileText, X, Eye, Loader2, User, Users, Share2 } from 'lucide-react'
import { api } from '@/lib/axios'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { useAuthStore } from '@/stores/auth.store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { createPortal } from 'react-dom'

interface DocExpediente {
  id: number
  nombre: string
  tipo: string
  tamano: number
  fechaSubida: string
  subidoPor: string
}

interface UsuarioSimple {
  id: number
  nombres: string
  apellidos: string
  puesto: string
  tipoUsuario: string
}

/* Etiquetas y colores de rol — mismas convenciones que Usuarios / Accesos / Asistencia */
const ROLES_LABEL: Record<string, string> = {
  AD: 'Administración',
  TI: 'Tecnología',
  CC: 'Call Center',
  CL: 'Clientes',
  ST: 'Staff',
  VE: 'Ventas',
}

const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700',
  TI: 'bg-blue-100 text-blue-700',
  CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600',
  ST: 'bg-green-100 text-green-700',
  VE: 'bg-amber-100 text-amber-700',
}

const ROL_AVATAR: Record<string, string> = {
  AD: 'bg-red-50 text-red-600',
  TI: 'bg-blue-50 text-blue-600',
  CC: 'bg-purple-50 text-purple-600',
  CL: 'bg-gray-100 text-gray-500',
  ST: 'bg-green-50 text-green-600',
  VE: 'bg-amber-50 text-amber-600',
}

/* Iniciales para el avatar de la tarjeta */
function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return 'U'
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase()
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase()
}

function parseDoc(r: Record<string, unknown>): DocExpediente {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['docId'] ?? r['DOC_ID'] ?? 0),
    nombre: s(['nombre', 'NOMBRE', 'filename', 'DOC_NOMBRE_ORIGINAL', 'name']),
    tipo: s(['tipo', 'TIPO', 'extension', 'ext', 'DOC_MIME', 'mimetype']),
    tamano: Number(r['tamano'] ?? r['TAMANO'] ?? r['DOC_TAMANO_BYTES'] ?? r['size'] ?? 0),
    fechaSubida: s(['fechaSubida', 'FECHA_SUBIDA', 'DOC_FECHA_SUBIDA', 'createdAt', 'uploadedAt']),
    subidoPor: s(['subidoPor', 'SUBIDO_POR', 'DOC_SUBIDO_POR', 'uploadedBy', 'nombre']),
  }
}

function isViewable(tipo: string) {
  return /pdf|image\//i.test(tipo)
}

async function fetchDocBlob(path: string): Promise<{ url: string; mime: string; filename: string }> {
  const res = await api.get(path, { responseType: 'blob' })
  const mime = String(res.headers['content-type'] || 'application/octet-stream')
  const disposition = String(res.headers['content-disposition'] || '')
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : `documento`
  const url = URL.createObjectURL(new Blob([res.data], { type: mime }))
  return { url, mime, filename }
}

function DocViewer({ doc, downloadPath, onClose }: { doc: DocExpediente; downloadPath: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let url: string | null = null
    fetchDocBlob(downloadPath)
      .then((res) => { url = res.url; setBlobUrl(res.url) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [downloadPath])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative flex flex-col w-full max-w-4xl h-[90vh] rounded-2xl bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-brand flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-white" />
            <span className="text-sm font-bold text-white truncate max-w-xs">{doc.nombre}</span>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 bg-gray-100 overflow-auto">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-gray-400 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando documento…
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center text-sm text-red-500">
              No se pudo cargar el documento.
            </div>
          )}
          {blobUrl && !loading && (
            /image\//i.test(doc.tipo)
              ? <img src={blobUrl} alt={doc.nombre} className="max-w-full mx-auto mt-4 rounded shadow" />
              : <iframe src={blobUrl} className="h-full w-full border-0" title={doc.nombre} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function SkeletonUserCard() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="h-11 w-11 rounded-full bg-gray-100 mb-3" />
      <div className="h-3.5 w-28 rounded-lg bg-gray-100 mb-2" />
      <div className="h-2.5 w-20 rounded-full bg-gray-100" />
    </div>
  )
}

function SkeletonDocRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-gray-100 animate-pulse flex-shrink-0" />
          <div className="h-3.5 w-40 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      </td>
      <td className="px-4 py-3"><div className="h-3 w-12 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

// ── Tabla de documentos reutilizable ──────────────────────────────────────────
interface DocTableProps {
  docs: DocExpediente[]
  loading: boolean
  downloadPathFn: (docId: number) => string
  onDelete?: (docId: number) => void
  deletingId?: number | null
  canDelete?: boolean
  onEnlazar?: (doc: DocExpediente) => void
  enlazandoId?: number | null
}

function DocTable({ docs, loading, downloadPathFn, onDelete, deletingId, canDelete = true, onEnlazar, enlazandoId }: DocTableProps) {
  const [viewingDoc, setViewingDoc] = useState<{ doc: DocExpediente; path: string } | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  const handleDownload = async (doc: DocExpediente) => {
    setDownloadingId(doc.id)
    try {
      const { url, filename } = await fetchDocBlob(downloadPathFn(doc.id))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch {
      toast.error('Error al descargar el documento')
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) {
    return (
      <table className="w-full">
        <tbody className="divide-y divide-gray-50">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonDocRow key={i} />)}
        </tbody>
      </table>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
          <FileText className="h-6 w-6 text-gray-300" />
        </div>
        <p className="text-sm text-gray-400">Sin documentos en el expediente</p>
      </div>
    )
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Documento</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tamaño</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {docs.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50 transition-colors group">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <span className="text-[0.82rem] font-semibold text-gray-800 truncate max-w-[180px] block">{doc.nombre}</span>
                    {doc.tipo && <p className="text-[0.65rem] text-gray-400 uppercase">{doc.tipo}</p>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-[0.72rem] text-gray-500">{doc.tamano ? fmtSize(doc.tamano) : '—'}</td>
              <td className="px-4 py-3 text-[0.72rem] text-gray-400">
                {doc.fechaSubida ? new Date(doc.fechaSubida).toLocaleDateString('es-MX') : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isViewable(doc.tipo) && (
                    <button
                      onClick={() => setViewingDoc({ doc, path: downloadPathFn(doc.id) })}
                      className="rounded-xl p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Ver documento"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="rounded-xl p-1.5 text-gray-400 hover:text-brand hover:bg-brand/8 transition-colors disabled:opacity-40"
                    title="Descargar"
                  >
                    {downloadingId === doc.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                  </button>
                  {onEnlazar && (
                    <button
                      onClick={() => onEnlazar(doc)}
                      disabled={enlazandoId === doc.id}
                      className="rounded-xl p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                      title="Enlazar como carta responsiva"
                    >
                      {enlazandoId === doc.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Share2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      onClick={() => onDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="rounded-xl p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                      title="Eliminar"
                    >
                      {deletingId === doc.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {viewingDoc && (
        <DocViewer
          doc={viewingDoc.doc}
          downloadPath={viewingDoc.path}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </>
  )
}

// ── Pestaña Mi Expediente ─────────────────────────────────────────────────────
function MiExpedienteTab() {
  const [confirmDocId, setConfirmDocId] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['mi-expediente'],
    queryFn: async () => {
      const { data } = await api.get('/expedientes/mi/documentos')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.documentos ?? [])
      return (list as Record<string, unknown>[]).map(parseDoc)
    },
  })

  const subirDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api.post('/expedientes/mi/documentos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      qc.invalidateQueries({ queryKey: ['mi-expediente'] })
      toast.success('Documento subido')
    } catch {
      toast.error('Error al subir documento')
    }
    e.target.value = ''
  }

  const eliminarDoc = useMutation({
    mutationFn: (docId: number) => api.delete(`/expedientes/mi/documentos/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mi-expediente'] })
      toast.success('Documento eliminado')
      setConfirmDocId(null)
    },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <div>
          <p className="text-[0.85rem] font-bold text-gray-900">Mi expediente</p>
          <p className="text-[0.7rem] text-gray-400 mt-0.5">
            {isLoading ? '…' : `${documentos.length} documento${documentos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <label className="cursor-pointer">
          <input type="file" className="hidden" onChange={subirDoc} />
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[0.73rem] font-semibold text-white hover:bg-brand-muted transition-colors shadow-glow">
            <Upload className="h-3.5 w-3.5" /> Subir documento
          </span>
        </label>
      </div>

      <DocTable
        docs={documentos}
        loading={isLoading}
        downloadPathFn={(id) => `/expedientes/mi/documentos/${id}/download`}
        onDelete={(id) => setConfirmDocId(id)}
        deletingId={eliminarDoc.isPending ? confirmDocId : null}
        canDelete={true}
      />

      <ConfirmDialog
        isOpen={confirmDocId !== null}
        onClose={() => setConfirmDocId(null)}
        onConfirm={() => { if (confirmDocId !== null) eliminarDoc.mutate(confirmDocId) }}
        title="Eliminar documento"
        message="¿Seguro que deseas eliminar este documento de tu expediente? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        isPending={eliminarDoc.isPending}
      />
    </div>
  )
}

// ── Pestaña Expedientes (admin AD) ────────────────────────────────────────────
function ExpedientesAdminTab() {
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UsuarioSimple | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmDocId, setConfirmDocId] = useState<number | null>(null)
  const [enlazandoId, setEnlazandoId] = useState<number | null>(null)
  const qc = useQueryClient()

  // Traer activos del usuario seleccionado para saber a cuál activo enlazar
  const { data: activosUsuario = [] } = useQuery<{ id: number; cartaDocId: number | null }[]>({
    queryKey: ['activos-generales-usuario', selectedUser?.id],
    queryFn: async () => {
      const { data } = await api.get(`/activos/generales/usuario/${selectedUser!.id}`)
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id'] ?? 0),
        cartaDocId: r['cartaDocId'] != null ? Number(r['cartaDocId']) : null,
      }))
    },
    enabled: !!selectedUser,
  })

  const enlazarCarta = async (doc: DocExpediente) => {
    if (!selectedUser || activosUsuario.length === 0) {
      toast.error('El usuario no tiene activos registrados para enlazar')
      return
    }
    setEnlazandoId(doc.id)
    try {
      const activoId = activosUsuario[0].id
      await api.patch(`/activos/generales/${activoId}/carta-doc`, { docId: doc.id })
      qc.invalidateQueries({ queryKey: ['activos-generales-usuario', selectedUser.id] })
      toast.success(`Carta responsiva enlazada: ${doc.nombre}`)
    } catch {
      toast.error('Error al enlazar la carta')
    } finally {
      setEnlazandoId(null)
    }
  }

  const { data: usuarios = [], isLoading: loadUsers } = useQuery({
    queryKey: ['usuarios-expediente'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id'] ?? r['ID'] ?? 0),
        nombres: String(r['nombres'] ?? r['nombre'] ?? ''),
        apellidos: String(r['apellidos'] ?? ''),
        puesto: String(r['puesto'] ?? r['PUESTO'] ?? r['cargo'] ?? ''),
        tipoUsuario: String(r['tipoUsuario'] ?? r['tipo_usuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
      })) as UsuarioSimple[]
    },
  })

  const { data: documentos = [], isLoading: loadDocs } = useQuery({
    queryKey: ['expediente-docs', selectedUser?.id],
    queryFn: async () => {
      const { data } = await api.get(`/expedientes/${selectedUser!.id}/documentos`)
      const list = Array.isArray(data) ? data : (data?.data ?? data?.documentos ?? [])
      return (list as Record<string, unknown>[]).map(parseDoc)
    },
    enabled: !!selectedUser,
  })

  const subirDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedUser) return
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api.post(`/expedientes/${selectedUser.id}/documentos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      qc.invalidateQueries({ queryKey: ['expediente-docs', selectedUser.id] })
      toast.success('Documento subido')
    } catch {
      toast.error('Error al subir documento')
    }
    e.target.value = ''
  }

  const eliminarDoc = useMutation({
    mutationFn: (docId: number) => api.delete(`/expedientes/documentos/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expediente-docs', selectedUser?.id] })
      toast.success('Documento eliminado')
      setConfirmDocId(null)
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const filteredUsers = usuarios.filter((u) =>
    `${u.nombres} ${u.apellidos} ${u.puesto}`.toLowerCase().includes(search.toLowerCase())
  )

  /* Agrupa por rol: los conocidos en el orden de ROLES_LABEL, el resto al final */
  const grupos = useMemo(() => {
    const ordenConocido = Object.keys(ROLES_LABEL)
    const mapa = new Map<string, UsuarioSimple[]>()

    for (const u of filteredUsers) {
      const rol = u.tipoUsuario || 'SIN_ROL'
      const actual = mapa.get(rol)
      if (actual) actual.push(u)
      else mapa.set(rol, [u])
    }

    return [...mapa.entries()]
      .sort(([a], [b]) => {
        const ia = ordenConocido.indexOf(a)
        const ib = ordenConocido.indexOf(b)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.localeCompare(b)
      })
      .map(([rol, lista]) => ({ rol, lista }))
  }, [filteredUsers])

  const abrirExpediente = (u: UsuarioSimple) => {
    setSelectedUser(u)
    setModalOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar empleado..."
          className="field pl-9 text-sm"
        />
      </div>

      {/* Tarjetas de empleados agrupadas por rol */}
      {loadUsers ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonUserCard key={i} />)}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-12">
          <FolderOpen className="h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">Sin resultados</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ rol, lista }) => (
            <section key={rol} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className={clsx('chip', ROL_COLORS[rol] ?? 'bg-gray-100 text-gray-600')}>
                  {rol === 'SIN_ROL' ? 'Sin rol' : rol}
                </span>
                <h2 className="text-[0.82rem] font-bold text-gray-700">
                  {rol === 'SIN_ROL' ? 'Sin rol asignado' : (ROLES_LABEL[rol] ?? rol)}
                </h2>
                <span className="flex items-center gap-1 text-[0.68rem] font-semibold text-gray-400">
                  <Users className="h-3 w-3" />
                  {lista.length}
                </span>
                <div className="h-px flex-1 bg-gray-200/70" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {lista.map((u) => {
                  const nombre = `${u.nombres} ${u.apellidos}`.trim()
                  const isActive = selectedUser?.id === u.id
                  return (
                    <button
                      key={u.id}
                      onClick={() => abrirExpediente(u)}
                      className={clsx(
                        'group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200',
                        isActive
                          ? 'border-brand/40 bg-brand/[0.06] shadow-card-md'
                          : 'border-gray-200/60 bg-card shadow-sm hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-card-md',
                      )}
                    >
                      <div
                        className={clsx(
                          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[0.8rem] font-bold transition-colors',
                          isActive ? 'bg-brand text-white' : (ROL_AVATAR[rol] ?? 'bg-brand-light text-brand'),
                        )}
                      >
                        {iniciales(nombre)}
                      </div>

                      <div className="min-w-0 w-full">
                        <p
                          className={clsx(
                            'truncate text-[0.85rem] font-semibold transition-colors',
                            isActive ? 'text-brand' : 'text-gray-800 group-hover:text-brand',
                          )}
                          title={nombre}
                        >
                          {nombre}
                        </p>
                        <p className="mt-0.5 truncate text-[0.68rem] text-gray-400" title={u.puesto}>
                          {u.puesto || 'Sin puesto asignado'}
                        </p>
                      </div>

                      <span
                        className={clsx(
                          'mt-auto inline-flex items-center gap-1.5 text-[0.68rem] font-semibold transition-colors',
                          isActive ? 'text-brand' : 'text-gray-400 group-hover:text-brand',
                        )}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Ver expediente
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Modal expediente */}
      <Modal
        isOpen={modalOpen && !!selectedUser}
        onClose={() => setModalOpen(false)}
        title="Expediente digital"
        size="xl"
        variant="corporate"
      >
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={clsx(
                    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[0.8rem] font-bold',
                    ROL_AVATAR[selectedUser.tipoUsuario] ?? 'bg-brand-light text-brand',
                  )}
                >
                  {iniciales(`${selectedUser.nombres} ${selectedUser.apellidos}`)}
                </div>
                <div className="min-w-0">
                  <p className="text-[0.9rem] font-bold text-gray-900 truncate">
                    {selectedUser.nombres} {selectedUser.apellidos}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {selectedUser.tipoUsuario && (
                      <span className={clsx('chip', ROL_COLORS[selectedUser.tipoUsuario] ?? 'bg-gray-100 text-gray-600')}>
                        {ROLES_LABEL[selectedUser.tipoUsuario] ?? selectedUser.tipoUsuario}
                      </span>
                    )}
                    {selectedUser.puesto && (
                      <span className="text-[0.7rem] text-gray-400">{selectedUser.puesto}</span>
                    )}
                    <span className="text-[0.7rem] text-gray-400">
                      · {loadDocs ? '…' : `${documentos.length} documento${documentos.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>
              </div>
              <label className="cursor-pointer flex-shrink-0">
                <input type="file" className="hidden" onChange={subirDoc} />
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[0.73rem] font-semibold text-white hover:bg-brand-dark transition-colors">
                  <Upload className="h-3.5 w-3.5" /> Subir documento
                </span>
              </label>
            </div>

            <DocTable
              docs={documentos}
              loading={loadDocs}
              downloadPathFn={(id) => `/expedientes/documentos/${id}/download`}
              onDelete={(id) => setConfirmDocId(id)}
              deletingId={eliminarDoc.isPending ? confirmDocId : null}
              canDelete={true}
              onEnlazar={enlazarCarta}
              enlazandoId={enlazandoId}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirmDocId !== null}
        onClose={() => setConfirmDocId(null)}
        onConfirm={() => { if (confirmDocId !== null) eliminarDoc.mutate(confirmDocId) }}
        title="Eliminar documento"
        message="¿Seguro que deseas eliminar este documento del expediente? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        isPending={eliminarDoc.isPending}
        elevated
      />
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
type TabKey = 'admin' | 'mi'

export function ExpedientePage() {
  const { user } = useAuthStore()
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD'
  const [activeTab, setActiveTab] = useState<TabKey>(isAdmin ? 'admin' : 'mi')

  const nombreCompleto = user?.nombres ?? 'Mi expediente'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner con cabecera de identidad */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <FolderOpen className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Expediente</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">Documentos digitales de empleados</p>
              </div>
            </div>
            {activeTab !== 'admin' && (
              <div className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2">
                <Avatar name={nombreCompleto} size="sm" />
                <div className="min-w-0">
                  <p className="text-[0.78rem] font-semibold text-white truncate">{nombreCompleto}</p>
                  <p className="text-[0.65rem] text-white/60">Expediente personal</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pestañas — solo documentos; los datos personales viven en Mi perfil */}
      {isAdmin && (
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          <button
            onClick={() => setActiveTab('admin')}
            title="Ver y gestionar el expediente de otros empleados"
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.78rem] font-semibold transition-all',
              activeTab === 'admin' ? 'bg-card text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Expedientes
          </button>
          <button
            onClick={() => setActiveTab('mi')}
            title="Mis propios documentos"
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.78rem] font-semibold transition-all',
              activeTab === 'mi' ? 'bg-card text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <User className="h-3.5 w-3.5" />
            Mi expediente
          </button>
        </div>
      )}

      {/* Contenido */}
      {activeTab === 'admin' && isAdmin && <ExpedientesAdminTab />}
      {activeTab === 'mi' && <MiExpedienteTab />}
    </div>
  )
}
