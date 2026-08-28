import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileStack, Plus, Trash2, X, FileText, Upload, FileDown, FileSpreadsheet, History, Pencil,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  controlDocumentalService,
  type DocumentoControl,
  type CategoriaDocumento,
  type EstadoVigenciaDocumento,
} from '@/services/controlDocumental.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const CATEGORIA_LABEL: Record<CategoriaDocumento, string> = {
  politica: 'Política', contrato_tipo: 'Contrato tipo', formato: 'Formato',
  plantilla: 'Plantilla', manual: 'Manual', otro: 'Otro',
}

const ESTADO_VIGENCIA_CONFIG: Record<EstadoVigenciaDocumento, { label: string; cls: string; dot: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  en_revision: { label: 'En revisión', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  obsoleto: { label: 'Obsoleto', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

const ACCEPT_ARCHIVO = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Crear documento (con versión 1) ──────────────────────────────────────
function DocumentoFormModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState<CategoriaDocumento>('politica')
  const [descripcion, setDescripcion] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [notaCambio, setNotaCambio] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)

  const reset = () => {
    setTitulo(''); setCategoria('politica'); setDescripcion(''); setResponsableId(''); setNotaCambio(''); setArchivo(null)
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!archivo) throw new Error('Archivo requerido')
      return controlDocumentalService.crearDocumento({
        titulo, categoria, descripcion: descripcion || undefined,
        responsableId: responsableId ? Number(responsableId) : undefined,
        notaCambio: notaCambio || undefined, archivo,
      })
    },
    onSuccess: () => {
      toast.success('Documento creado')
      queryClient.invalidateQueries({ queryKey: ['control-documental'] })
      queryClient.invalidateQueries({ queryKey: ['control-documental-resumen'] })
      reset()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo crear el documento')
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo documento" variant="corporate" size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!titulo.trim()) return
          if (!archivo) { toast.error('Selecciona un archivo para la versión inicial'); return }
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Política de vacaciones" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categoría</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDocumento)}>
              {(Object.keys(CATEGORIA_LABEL) as CategoriaDocumento[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Archivo (versión 1)</label>
          <input type="file" accept={ACCEPT_ARCHIVO} className="w-full text-xs" onChange={(e) => setArchivo(e.target.files?.[0] || null)} required />
          <p className="mt-1 text-[11px] text-ink-tertiary">PDF, imagen, Word o Excel — máximo 10MB.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nota de la versión inicial</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={notaCambio} onChange={(e) => setNotaCambio(e.target.value)} placeholder="Ej. Versión inicial (opcional)" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear documento</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Editar metadata ───────────────────────────────────────────────────────
function EditarMetadataModal({ isOpen, onClose, documento }: { isOpen: boolean; onClose: () => void; documento: DocumentoControl | null }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState(documento?.titulo || '')
  const [categoria, setCategoria] = useState<CategoriaDocumento>(documento?.categoria || 'politica')
  const [descripcion, setDescripcion] = useState(documento?.descripcion || '')
  const [responsableId, setResponsableId] = useState(documento?.responsableId ? String(documento.responsableId) : '')

  const mutation = useMutation({
    mutationFn: () => controlDocumentalService.actualizarMetadata(documento!.id, {
      titulo, categoria, descripcion: descripcion || undefined, responsableId: responsableId ? Number(responsableId) : undefined,
    }),
    onSuccess: () => {
      toast.success('Documento actualizado')
      queryClient.invalidateQueries({ queryKey: ['control-documental'] })
      onClose()
    },
    onError: () => toast.error('No se pudo actualizar el documento'),
  })

  if (!documento) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar documento" size="md" elevated>
      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (!titulo.trim()) return; mutation.mutate() }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categoría</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaDocumento)}>
              {(Object.keys(CATEGORIA_LABEL) as CategoriaDocumento[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Subir nueva versión (mini-formulario inline) ──────────────────────────
function SubirVersionForm({ documentoId, onDone }: { documentoId: number; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [notaCambio, setNotaCambio] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      if (!archivo) throw new Error('Archivo requerido')
      return controlDocumentalService.subirNuevaVersion(documentoId, archivo, notaCambio)
    },
    onSuccess: () => {
      toast.success('Nueva versión subida')
      queryClient.invalidateQueries({ queryKey: ['control-documental'] })
      queryClient.invalidateQueries({ queryKey: ['control-documental-versiones', documentoId] })
      onDone()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir la nueva versión')
    },
  })

  return (
    <form
      className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!archivo) { toast.error('Selecciona un archivo'); return }
        if (!notaCambio.trim()) { toast.error('La nota de cambio es requerida'); return }
        mutation.mutate()
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-secondary">Archivo de la nueva versión</label>
        <input type="file" accept={ACCEPT_ARCHIVO} className="w-full text-xs" onChange={(e) => setArchivo(e.target.files?.[0] || null)} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nota de cambio</label>
        <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={notaCambio} onChange={(e) => setNotaCambio(e.target.value)} placeholder="Qué cambió en esta versión" required />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>Cancelar</Button>
        <Button type="submit" size="sm" isLoading={mutation.isPending}>Subir versión</Button>
      </div>
    </form>
  )
}

// ── Historial de versiones ────────────────────────────────────────────────
function HistorialVersionesSection({ documentoId }: { documentoId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['control-documental-versiones', documentoId], queryFn: () => controlDocumentalService.listVersiones(documentoId) })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <History className="h-3.5 w-3.5" /> Historial de versiones
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="space-y-2">
          {data?.map((v) => (
            <li key={v.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', v.esVigente ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    v{v.numeroVersion}{v.esVigente ? ' · Vigente' : ''}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink">
                    <FileText className="h-3 w-3 text-gray-400" /> {v.nombreOriginal}
                  </span>
                </div>
                <button
                  onClick={() => window.open(controlDocumentalService.getUrlVerVersion(v.id), '_blank')}
                  className="text-[11px] font-semibold text-brand hover:underline"
                >
                  Ver / Descargar
                </button>
              </div>
              {v.notaCambio && <p className="mt-1 text-xs text-ink-secondary">{v.notaCambio}</p>}
              <p className="mt-1 text-[11px] text-ink-tertiary">
                {v.usuarioNombre || 'Usuario'} · {new Date(v.createdAt).toLocaleString()} · {formatBytes(v.tamanio)}
              </p>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin versiones registradas aún.</p>}
        </ul>
      )}
    </div>
  )
}

// ── Modal de detalle ─────────────────────────────────────────────────────
function DocumentoDetalleModal({ documento, onClose, onEditar, puedeEditar, puedeSubirVersion }: {
  documento: DocumentoControl | null
  onClose: () => void
  onEditar: () => void
  puedeEditar: boolean
  puedeSubirVersion: boolean
}) {
  const queryClient = useQueryClient()
  const [mostrarSubirVersion, setMostrarSubirVersion] = useState(false)

  const cambiarEstadoMutation = useMutation({
    mutationFn: (estadoVigencia: EstadoVigenciaDocumento) => controlDocumentalService.cambiarEstadoVigencia(documento!.id, estadoVigencia),
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['control-documental'] })
      queryClient.invalidateQueries({ queryKey: ['control-documental-resumen'] })
    },
    onError: () => toast.error('No se pudo actualizar el estado'),
  })

  if (!documento) return null
  const cfg = ESTADO_VIGENCIA_CONFIG[documento.estadoVigencia]

  return (
    <Modal isOpen={!!documento} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{CATEGORIA_LABEL[documento.categoria]}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{documento.titulo}</h2>
            {documento.descripcion && <p className="mt-0.5 text-xs text-ink-tertiary">{documento.descripcion}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
          </span>
          <span className="chip bg-gray-100 text-gray-600">v{documento.versionVigente || 0} vigente</span>
          <span className="chip bg-gray-100 text-gray-600">{documento.totalVersiones} versión{documento.totalVersiones !== 1 ? 'es' : ''}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable</p>
            <p className="mt-0.5 text-ink">{documento.responsableNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Última actualización</p>
            <p className="mt-0.5 text-ink">{new Date(documento.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
            <Button size="sm" variant="secondary" onClick={onEditar}>
              <Pencil className="h-3.5 w-3.5" /> Editar metadata
            </Button>
            {puedeSubirVersion && !mostrarSubirVersion && (
              <Button size="sm" onClick={() => setMostrarSubirVersion(true)}>
                <Upload className="h-3.5 w-3.5" /> Subir nueva versión
              </Button>
            )}
            <select
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              value={documento.estadoVigencia}
              onChange={(e) => cambiarEstadoMutation.mutate(e.target.value as EstadoVigenciaDocumento)}
            >
              {(Object.keys(ESTADO_VIGENCIA_CONFIG) as EstadoVigenciaDocumento[]).map((s) => <option key={s} value={s}>{ESTADO_VIGENCIA_CONFIG[s].label}</option>)}
            </select>
          </div>
        )}

        {mostrarSubirVersion && (
          <SubirVersionForm documentoId={documento.id} onDone={() => setMostrarSubirVersion(false)} />
        )}

        <HistorialVersionesSection documentoId={documento.id} />
      </div>
    </Modal>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────
function TablaDocumentos({ documentos, onSelect, onEliminar, puedeEliminar }: {
  documentos: DocumentoControl[]
  onSelect: (d: DocumentoControl) => void
  onEliminar: (id: number) => void
  puedeEliminar: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
          <tr>
            <th className="px-4 py-2 font-semibold">Documento</th>
            <th className="px-4 py-2 font-semibold">Categoría</th>
            <th className="px-4 py-2 font-semibold">Estado</th>
            <th className="px-4 py-2 font-semibold">Versión</th>
            <th className="px-4 py-2 font-semibold">Responsable</th>
            <th className="px-4 py-2 font-semibold">Última actualización</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {documentos.map((d) => {
            const cfg = ESTADO_VIGENCIA_CONFIG[d.estadoVigencia]
            return (
              <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onSelect(d)}>
                <td className="px-4 py-2.5"><p className="font-medium text-ink">{d.titulo}</p></td>
                <td className="px-4 py-2.5"><span className="chip bg-blue-50 text-blue-700">{CATEGORIA_LABEL[d.categoria]}</span></td>
                <td className="px-4 py-2.5">
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-ink-tertiary">v{d.versionVigente || 0}</td>
                <td className="px-4 py-2.5 text-ink-tertiary">{d.responsableNombre || '—'}</td>
                <td className="px-4 py-2.5 text-ink-tertiary">{new Date(d.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-2.5">
                  {puedeEliminar && (
                    <button onClick={(e) => { e.stopPropagation(); onEliminar(d.id) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {documentos.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-tertiary">No hay documentos registrados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function ControlDocumentalPage() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [documentoActivoId, setDocumentoActivoId] = useState<number | null>(null)
  const [documentoEditandoId, setDocumentoEditandoId] = useState<number | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaDocumento | ''>('')
  const [filtroEstado, setFiltroEstado] = useState<EstadoVigenciaDocumento | ''>('')
  const [busqueda, setBusqueda] = useState('')
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const queryClient = useQueryClient()
  const { can } = useActionAccess()

  const puedeCrear = can('legal', 'documento-crear')
  const puedeEditar = can('legal', 'documento-editar')
  const puedeEliminar = can('legal', 'documento-eliminar')
  const puedeSubirVersion = can('legal', 'documento-subir-version')
  const puedeExportar = can('legal', 'documento-exportar')

  const { data: resumen } = useQuery({ queryKey: ['control-documental-resumen'], queryFn: () => controlDocumentalService.getResumen(), staleTime: 30_000 })
  const { data, isLoading } = useQuery({ queryKey: ['control-documental'], queryFn: () => controlDocumentalService.listDocumentos(), staleTime: 30_000 })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => controlDocumentalService.eliminarDocumento(id),
    onSuccess: () => {
      toast.success('Documento eliminado')
      queryClient.invalidateQueries({ queryKey: ['control-documental'] })
      queryClient.invalidateQueries({ queryKey: ['control-documental-resumen'] })
    },
    onError: () => toast.error('No se pudo eliminar el documento'),
  })

  const documentosFiltrados = useMemo(() => {
    return (data || []).filter((d) => {
      if (filtroCategoria && d.categoria !== filtroCategoria) return false
      if (filtroEstado && d.estadoVigencia !== filtroEstado) return false
      if (busqueda && !d.titulo.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
  }, [data, filtroCategoria, filtroEstado, busqueda])

  const documentoActivo = (data || []).find((d) => d.id === documentoActivoId) || null
  const documentoEditando = (data || []).find((d) => d.id === documentoEditandoId) || null

  const stats: DashboardStat[] = resumen ? [
    { key: 'total', icon: FileStack, label: 'Total documentos', value: resumen.total, tone: 'brand' },
    { key: 'vigentes', icon: FileStack, label: 'Vigentes', value: resumen.vigentes, tone: 'success' },
    { key: 'en-revision', icon: FileStack, label: 'En revisión', value: resumen.enRevision, tone: 'warn' },
    { key: 'obsoletos', icon: FileStack, label: 'Obsoletos', value: resumen.obsoletos, tone: 'critical' },
  ] : []

  const hayFiltrosActivos = !!filtroCategoria || !!filtroEstado || !!busqueda

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await controlDocumentalService.exportarPdf()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'control_documental.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = () => {
    if (documentosFiltrados.length === 0) {
      toast.error('No hay documentos para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Título', 'Categoría', 'Estado', 'Versión vigente', 'Responsable', 'Última actualización'],
      ...documentosFiltrados.map((d) => [
        d.titulo, CATEGORIA_LABEL[d.categoria], ESTADO_VIGENCIA_CONFIG[d.estadoVigencia].label,
        `v${d.versionVigente || 0}`, d.responsableNombre || '', new Date(d.updatedAt).toLocaleDateString(),
      ]),
    ])
    sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Documentos')
    XLSX.writeFile(wb, 'control_documental.xlsx')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <FileStack className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Control documental</h1>
            <p className="text-xs text-blue-200/70">Repositorio de documentos legales con control de versiones</p>
          </div>
        </div>
      </div>

      {resumen && <DashboardStatRow stats={stats} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Documentos</h2>
        <div className="flex items-center gap-2">
          {puedeExportar && (
            <>
              <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={() => setNuevoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nuevo documento
            </Button>
          )}
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-card p-3">
          <input
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            placeholder="Buscar por título..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaDocumento | '')}>
            <option value="">Todas las categorías</option>
            {(Object.keys(CATEGORIA_LABEL) as CategoriaDocumento[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as EstadoVigenciaDocumento | '')}>
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_VIGENCIA_CONFIG) as EstadoVigenciaDocumento[]).map((s) => <option key={s} value={s}>{ESTADO_VIGENCIA_CONFIG[s].label}</option>)}
          </select>
          {hayFiltrosActivos && (
            <button onClick={() => { setFiltroCategoria(''); setFiltroEstado(''); setBusqueda('') }} className="ml-auto text-[11px] font-semibold text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay documentos registrados.</p>
        </div>
      ) : (
        <TablaDocumentos
          documentos={documentosFiltrados}
          onSelect={(d) => setDocumentoActivoId(d.id)}
          onEliminar={(id) => eliminarMutation.mutate(id)}
          puedeEliminar={puedeEliminar}
        />
      )}

      {puedeCrear && <DocumentoFormModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} />}
      {puedeEditar && <EditarMetadataModal isOpen={!!documentoEditando} onClose={() => setDocumentoEditandoId(null)} documento={documentoEditando} />}
      <DocumentoDetalleModal
        documento={documentoActivo}
        onClose={() => setDocumentoActivoId(null)}
        onEditar={() => { setDocumentoEditandoId(documentoActivo!.id); setDocumentoActivoId(null) }}
        puedeEditar={puedeEditar}
        puedeSubirVersion={puedeSubirVersion}
      />
    </div>
  )
}
