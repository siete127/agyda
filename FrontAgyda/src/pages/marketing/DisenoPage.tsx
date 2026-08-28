import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Palette, Plus, Trash2, Pencil, X, MessageSquare, Paperclip, FileText, Upload,
  Check, Ban, Clock, Settings2, Inbox, Send, Briefcase, PackageCheck,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  disenoService,
  type SolicitudDiseno,
  type TipoSolicitudDiseno,
  type EstatusSolicitud,
  type Prioridad,
  type TipoAdjunto,
} from '@/services/diseno.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import { useAuthStore } from '@/stores/auth.store'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const ESTATUS_CONFIG: Record<EstatusSolicitud, { label: string; cls: string; dot: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  en_proceso: { label: 'En proceso', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  revision: { label: 'En revisión', cls: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  entregado: { label: 'Entregado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

const PRIORIDAD_LABEL: Record<Prioridad, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Nueva solicitud ──────────────────────────────────────────────────────
function NuevaSolicitudModal({ isOpen, onClose, tipos }: { isOpen: boolean; onClose: () => void; tipos: TipoSolicitudDiseno[] }) {
  const queryClient = useQueryClient()
  const [tipoId, setTipoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('normal')
  const [fechaLimite, setFechaLimite] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])

  const reset = () => {
    setTipoId(''); setTitulo(''); setDescripcion(''); setPrioridad('normal'); setFechaLimite(''); setArchivos([])
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { id } = await disenoService.crearSolicitud({
        tipoId: Number(tipoId), titulo, descripcion: descripcion || undefined, prioridad, fechaLimite: fechaLimite || undefined,
      })
      if (archivos.length) await disenoService.subirAdjuntos(id, archivos, 'referencia')
      return id
    },
    onSuccess: () => {
      toast.success('Solicitud creada')
      queryClient.invalidateQueries({ queryKey: ['diseno-solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['diseno-resumen'] })
      reset()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo crear la solicitud')
    },
  })

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      setArchivos((prev) => [...prev, ...files])
    }
    input.click()
  }

  if (isOpen && tipos.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Nueva solicitud de diseño" variant="corporate" size="md">
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-secondary">
            Todavía no hay tipos de solicitud configurados. Crea uno primero desde la pestaña <strong>Administrar tipos</strong>.
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva solicitud de diseño" variant="corporate" size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (!tipoId || !titulo.trim()) return; mutation.mutate() }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo de solicitud</label>
          <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
            <option value="">Selecciona un tipo</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Banner para campaña de verano" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Brief / descripción</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalles, medidas, referencias, uso previsto (opcional)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Prioridad</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)}>
              {(Object.keys(PRIORIDAD_LABEL) as Prioridad[]).map((p) => <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha límite (opcional)</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Referencias (opcional)</label>
          <div className="flex flex-wrap gap-2">
            {archivos.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {f.name}
                <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={pickFiles}>
            <Upload className="h-3.5 w-3.5" /> Adjuntar referencia
          </Button>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Enviar solicitud</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Comentarios ───────────────────────────────────────────────────────────
function ComentariosSection({ solicitudId }: { solicitudId: number }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['diseno-comentarios', solicitudId], queryFn: () => disenoService.listComentarios(solicitudId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['diseno-comentarios', solicitudId] })

  const crearMutation = useMutation({
    mutationFn: () => disenoService.crearComentario(solicitudId, texto),
    onSuccess: () => { setTexto(''); invalidate() },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => disenoService.eliminarComentario(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el comentario'),
  })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <MessageSquare className="h-3.5 w-3.5" /> Comentarios
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {data?.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink">{c.texto}</p>
                  <p className="mt-1 text-[11px] text-ink-tertiary">{c.autorNombre || 'Usuario'} · {new Date(c.createdAt).toLocaleString()}</p>
                </div>
                {c.usuarioId === currentUserId && (
                  <button onClick={() => eliminarMutation.mutate(c.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin comentarios aún.</p>}
        </ul>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!texto.trim()) return; crearMutation.mutate() }}>
        <input className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Agregar comentario..." />
        <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Comentar</Button>
      </form>
    </div>
  )
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
function AdjuntosSection({ solicitudId, tipo, titulo, puedeSubir }: { solicitudId: number; tipo: TipoAdjunto; titulo: string; puedeSubir: boolean }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({ queryKey: ['diseno-adjuntos', solicitudId], queryFn: () => disenoService.listAdjuntos(solicitudId) })
  const adjuntos = (data || []).filter((a) => a.tipo === tipo)
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['diseno-adjuntos', solicitudId] })
    queryClient.invalidateQueries({ queryKey: ['diseno-solicitudes'] })
  }

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => disenoService.subirAdjuntos(solicitudId, files, tipo),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir el adjunto')
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => disenoService.eliminarAdjunto(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el adjunto'),
  })

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      if (files.length) subirMutation.mutate(files)
    }
    input.click()
  }

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <Paperclip className="h-3.5 w-3.5" /> {titulo}
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {adjuntos.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = disenoService.getUrlVerAdjunto(ad.id)
              return (
                <div key={ad.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <button onClick={() => window.open(url, '_blank')} className="flex h-full w-full items-center justify-center" title={ad.nombreOriginal}>
                    {esImagen ? (
                      <img src={url} alt={ad.nombreOriginal} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-gray-400" />
                        <span className="line-clamp-2 text-[10px] text-ink-tertiary">{ad.nombreOriginal}</span>
                      </div>
                    )}
                  </button>
                  {(ad.usuarioId === currentUserId) && (
                    <button
                      onClick={() => eliminarMutation.mutate(ad.id)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">{formatBytes(ad.tamanio)}</span>
                </div>
              )
            })}
            {adjuntos.length === 0 && <p className="col-span-full text-xs text-ink-tertiary">Sin archivos aún.</p>}
          </div>
          {puedeSubir && (
            <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> Subir archivo
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle ──────────────────────────────────────────────────────
function SolicitudDetalleModal({ solicitud, onClose }: { solicitud: SolicitudDiseno | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [motivoCambios, setMotivoCambios] = useState('')
  const [mostrarCambios, setMostrarCambios] = useState(false)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['diseno-solicitudes'] })
    queryClient.invalidateQueries({ queryKey: ['diseno-resumen'] })
  }

  const tomarMutation = useMutation({
    mutationFn: () => disenoService.tomarSolicitud(solicitud!.id),
    onSuccess: () => { toast.success('Solicitud tomada'); invalidateAll() },
    onError: () => toast.error('No se pudo tomar la solicitud'),
  })

  const enviarRevisionMutation = useMutation({
    mutationFn: () => disenoService.enviarARevision(solicitud!.id),
    onSuccess: () => { toast.success('Enviado a revisión'); invalidateAll() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo enviar a revisión')
    },
  })

  const aprobarMutation = useMutation({
    mutationFn: () => disenoService.aprobarEntrega(solicitud!.id),
    onSuccess: () => { toast.success('Entrega aprobada'); invalidateAll(); onClose() },
    onError: () => toast.error('No se pudo aprobar la entrega'),
  })

  const cambiosMutation = useMutation({
    mutationFn: () => disenoService.solicitarCambios(solicitud!.id, motivoCambios),
    onSuccess: () => { toast.success('Se solicitaron cambios'); invalidateAll(); setMostrarCambios(false); setMotivoCambios('') },
    onError: () => toast.error('No se pudo enviar la solicitud de cambios'),
  })

  const cancelarMutation = useMutation({
    mutationFn: () => disenoService.cancelarSolicitud(solicitud!.id),
    onSuccess: () => { toast.success('Solicitud cancelada'); invalidateAll(); onClose() },
    onError: () => toast.error('No se pudo cancelar la solicitud'),
  })

  if (!solicitud) return null

  const cfg = ESTATUS_CONFIG[solicitud.estatus]
  const esSolicitante = solicitud.solicitanteId === currentUserId
  const esAsignado = solicitud.asignadoId === currentUserId

  return (
    <Modal isOpen={!!solicitud} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{solicitud.tipoNombre}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{solicitud.titulo}</h2>
            {solicitud.descripcion && <p className="mt-1 text-sm text-ink-tertiary">{solicitud.descripcion}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
          </span>
          <span className="chip bg-gray-100 text-gray-600">{PRIORIDAD_LABEL[solicitud.prioridad]}</span>
          {solicitud.fechaLimite && (
            <span className="flex items-center gap-1 text-[11px] text-ink-tertiary">
              <Clock className="h-3 w-3" /> Límite: {new Date(solicitud.fechaLimite).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Solicitante</p>
            <p className="mt-0.5 text-ink">{solicitud.solicitanteNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Asignado</p>
            <p className="mt-0.5 text-ink">{solicitud.asignadoNombre || 'Sin asignar'}</p>
          </div>
        </div>

        {solicitud.motivoResolucion && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Motivo del último cambio</p>
            <p className="mt-0.5 text-xs text-ink">{solicitud.motivoResolucion}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
          {solicitud.estatus === 'pendiente' && (
            <>
              <Button size="sm" onClick={() => tomarMutation.mutate()} isLoading={tomarMutation.isPending}>
                <Briefcase className="h-3.5 w-3.5" /> Tomar solicitud
              </Button>
              {esSolicitante && (
                <Button size="sm" variant="secondary" onClick={() => cancelarMutation.mutate()} isLoading={cancelarMutation.isPending}>
                  Cancelar solicitud
                </Button>
              )}
            </>
          )}
          {solicitud.estatus === 'en_proceso' && esAsignado && (
            <Button size="sm" onClick={() => enviarRevisionMutation.mutate()} isLoading={enviarRevisionMutation.isPending}>
              <PackageCheck className="h-3.5 w-3.5" /> Enviar a revisión
            </Button>
          )}
          {solicitud.estatus === 'revision' && esSolicitante && !mostrarCambios && (
            <>
              <Button size="sm" onClick={() => aprobarMutation.mutate()} isLoading={aprobarMutation.isPending}>
                <Check className="h-3.5 w-3.5" /> Aprobar entrega
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMostrarCambios(true)}>
                <Ban className="h-3.5 w-3.5" /> Solicitar cambios
              </Button>
            </>
          )}
        </div>

        {mostrarCambios && (
          <form
            className="space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3"
            onSubmit={(e) => { e.preventDefault(); if (!motivoCambios.trim()) return; cambiosMutation.mutate() }}
          >
            <label className="block text-xs font-semibold text-ink-secondary">Motivo de los cambios solicitados</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={motivoCambios} onChange={(e) => setMotivoCambios(e.target.value)} required />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setMostrarCambios(false)}>Cancelar</Button>
              <Button type="submit" size="sm" isLoading={cambiosMutation.isPending}>Confirmar</Button>
            </div>
          </form>
        )}

        <AdjuntosSection solicitudId={solicitud.id} tipo="referencia" titulo="Referencias del solicitante" puedeSubir={esSolicitante || esAsignado} />
        <AdjuntosSection solicitudId={solicitud.id} tipo="entregable" titulo="Entregables de diseño" puedeSubir={esAsignado} />
        <ComentariosSection solicitudId={solicitud.id} />
      </div>
    </Modal>
  )
}

// ── Tarjeta compacta ──────────────────────────────────────────────────────
function SolicitudCard({ solicitud, onClick }: { solicitud: SolicitudDiseno; onClick: () => void }) {
  const cfg = ESTATUS_CONFIG[solicitud.estatus]
  return (
    <button onClick={onClick} className="group relative flex flex-col rounded-2xl border border-gray-100 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span className="mb-1 inline-flex w-fit chip bg-blue-50 text-blue-700">{solicitud.tipoNombre}</span>
      <h3 className="text-sm font-semibold text-ink">{solicitud.titulo}</h3>
      {solicitud.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{solicitud.descripcion}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
      </span>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span className="truncate">{solicitud.solicitanteNombre || '—'} → {solicitud.asignadoNombre || 'sin asignar'}</span>
      </div>
      <p className="mt-1 text-[10px] text-ink-tertiary">{new Date(solicitud.createdAt).toLocaleDateString()}</p>
    </button>
  )
}

// ── Administración de tipos ───────────────────────────────────────────────
function TipoFormModal({ isOpen, onClose, tipo }: { isOpen: boolean; onClose: () => void; tipo: TipoSolicitudDiseno | null }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState(tipo?.nombre || '')
  const [descripcion, setDescripcion] = useState(tipo?.descripcion || '')
  const [color, setColor] = useState(tipo?.color || '#1B4FD8')

  const mutation = useMutation({
    mutationFn: () => {
      const input = { nombre, descripcion: descripcion || undefined, color }
      return (tipo ? disenoService.actualizarTipo(tipo.id, input) : disenoService.crearTipo(input)).then(() => undefined)
    },
    onSuccess: () => {
      toast.success(tipo ? 'Tipo actualizado' : 'Tipo creado')
      queryClient.invalidateQueries({ queryKey: ['diseno-tipos'] })
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el tipo de solicitud'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tipo ? 'Editar tipo de solicitud' : 'Nuevo tipo de solicitud'} size="md" elevated>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!nombre.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Banner" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Color</label>
          <input type="color" className="h-9 w-full rounded-lg border border-gray-200" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function AdminTiposPanel() {
  const queryClient = useQueryClient()
  const [tipoEditando, setTipoEditando] = useState<TipoSolicitudDiseno | null>(null)
  const [nuevoTipoOpen, setNuevoTipoOpen] = useState(false)

  const { data: tipos, isLoading } = useQuery({ queryKey: ['diseno-tipos', 'admin'], queryFn: () => disenoService.listTipos(false) })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => disenoService.eliminarTipo(id),
    onSuccess: () => { toast.success('Tipo desactivado'); queryClient.invalidateQueries({ queryKey: ['diseno-tipos'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo desactivar el tipo')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Tipos de solicitud</h2>
        <Button size="sm" onClick={() => setNuevoTipoOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo tipo
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
              <tr>
                <th className="px-4 py-2 font-semibold">Nombre</th>
                <th className="px-4 py-2 font-semibold">Descripción</th>
                <th className="px-4 py-2 font-semibold">Estatus</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tipos?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color || '#1B4FD8' }} />
                      {t.nombre}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-tertiary">{t.descripcion || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', t.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                      {t.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setTipoEditando(t)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {t.activo && (
                        <button onClick={() => eliminarMutation.mutate(t.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Desactivar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!tipos || tipos.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-tertiary">Sin tipos de solicitud configurados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <TipoFormModal isOpen={nuevoTipoOpen} onClose={() => setNuevoTipoOpen(false)} tipo={null} />
      <TipoFormModal isOpen={!!tipoEditando} onClose={() => setTipoEditando(null)} tipo={tipoEditando} />
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
type Tab = 'disponibles' | 'mias' | 'asignadas' | 'todas' | 'admin-tipos'

export function DisenoPage() {
  return <EnConstruccion titulo="Diseño" subtitulo="Solicitudes y entregables de diseño" />
}

function DisenoPageContent() {
  const [tab, setTab] = useState<Tab>('disponibles')
  const [nuevaSolicitudOpen, setNuevaSolicitudOpen] = useState(false)
  const [solicitudActivaId, setSolicitudActivaId] = useState<number | null>(null)

  const { data: tipos } = useQuery({ queryKey: ['diseno-tipos'], queryFn: () => disenoService.listTipos() })
  const { data: resumen } = useQuery({ queryKey: ['diseno-resumen'], queryFn: () => disenoService.getResumen() })

  const bandeja = tab === 'admin-tipos' ? 'todas' : tab
  const { data, isLoading } = useQuery({
    queryKey: ['diseno-solicitudes', bandeja],
    queryFn: () => disenoService.listSolicitudes({ bandeja }),
    enabled: tab !== 'admin-tipos',
    staleTime: 15_000,
  })

  const solicitudActiva = (data || []).find((s) => s.id === solicitudActivaId) || null

  const stats: DashboardStat[] = [
    { key: 'disponibles', icon: Inbox, label: 'Disponibles', value: resumen?.disponibles ?? 0, tone: 'warn' },
    { key: 'en-proceso', icon: Send, label: 'Mis solicitudes en proceso', value: resumen?.misEnProceso ?? 0, tone: 'brand' },
    { key: 'revision', icon: Clock, label: 'En revisión', value: resumen?.enRevision ?? 0, tone: 'brand' },
    { key: 'entregadas', icon: Check, label: 'Entregadas este mes', value: resumen?.entregadasMes ?? 0, tone: 'success' },
  ]

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'disponibles', label: 'Disponibles', icon: Inbox },
    { key: 'mias', label: 'Mis solicitudes', icon: Send },
    { key: 'asignadas', label: 'Asignadas a mí', icon: Briefcase },
    { key: 'todas', label: 'Todas', icon: Clock },
    { key: 'admin-tipos', label: 'Administrar tipos', icon: Settings2 },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Palette className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Diseño</h1>
            <p className="text-xs text-blue-200/70">Solicitudes y entregables de diseño</p>
          </div>
        </div>
      </div>

      <DashboardStatRow stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', tab === t.key ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-50')}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
        {tab !== 'admin-tipos' && (
          <Button size="sm" onClick={() => setNuevaSolicitudOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nueva solicitud
          </Button>
        )}
      </div>

      {tab === 'admin-tipos' ? (
        <AdminTiposPanel />
      ) : isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">No hay solicitudes en esta bandeja.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <SolicitudCard key={s.id} solicitud={s} onClick={() => setSolicitudActivaId(s.id)} />
          ))}
        </div>
      )}

      <NuevaSolicitudModal isOpen={nuevaSolicitudOpen} onClose={() => setNuevaSolicitudOpen(false)} tipos={tipos || []} />
      <SolicitudDetalleModal solicitud={solicitudActiva} onClose={() => setSolicitudActivaId(null)} />
    </div>
  )
}
