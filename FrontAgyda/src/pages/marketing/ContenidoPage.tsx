import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Newspaper, Plus, Trash2, Pencil, X, MessageSquare, Paperclip, FileText, Upload,
  Check, Ban, Clock, Settings2, PenLine, Eye, CheckCircle2, Send,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  contenidoService,
  type PiezaContenido,
  type TipoContenido,
  type EstatusPieza,
  type TipoAdjuntoContenido,
} from '@/services/contenido.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import { useAuthStore } from '@/stores/auth.store'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const ESTATUS_CONFIG: Record<EstatusPieza, { label: string; cls: string; dot: string }> = {
  idea: { label: 'Idea', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  en_redaccion: { label: 'En redacción', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  en_revision: { label: 'En revisión', cls: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  aprobado: { label: 'Aprobado', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  publicado: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Nueva pieza ───────────────────────────────────────────────────────────
function NuevaPiezaModal({ isOpen, onClose, tipos }: { isOpen: boolean; onClose: () => void; tipos: TipoContenido[] }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [tipoId, setTipoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [brief, setBrief] = useState('')
  const [revisorId, setRevisorId] = useState('')
  const [fechaProgramada, setFechaProgramada] = useState('')

  const reset = () => { setTipoId(''); setTitulo(''); setBrief(''); setRevisorId(''); setFechaProgramada('') }

  const mutation = useMutation({
    mutationFn: () => contenidoService.crearPieza({
      tipoId: Number(tipoId), titulo, brief: brief || undefined,
      revisorId: revisorId ? Number(revisorId) : undefined, fechaProgramada: fechaProgramada || undefined,
    }),
    onSuccess: () => {
      toast.success('Pieza de contenido creada')
      queryClient.invalidateQueries({ queryKey: ['contenido-piezas'] })
      queryClient.invalidateQueries({ queryKey: ['contenido-resumen'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear la pieza'),
  })

  if (isOpen && tipos.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Nueva pieza de contenido" variant="corporate" size="md">
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-secondary">
            Todavía no hay tipos de canal configurados. Crea uno primero desde la pestaña <strong>Administrar tipos</strong>.
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva pieza de contenido" variant="corporate" size="lg">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!tipoId || !titulo.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Canal editorial</label>
          <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
            <option value="">Selecciona un canal</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. 5 tips para elegir tu proveedor de TI" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Brief</label>
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Idea, ángulo, público objetivo (opcional)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Revisor</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={revisorId} onChange={(e) => setRevisorId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha programada</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear pieza</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Comentarios ───────────────────────────────────────────────────────────
function ComentariosSection({ piezaId }: { piezaId: number }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['contenido-comentarios', piezaId], queryFn: () => contenidoService.listComentarios(piezaId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contenido-comentarios', piezaId] })

  const crearMutation = useMutation({
    mutationFn: () => contenidoService.crearComentario(piezaId, texto),
    onSuccess: () => { setTexto(''); invalidate() },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => contenidoService.eliminarComentario(id),
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
function AdjuntosSection({ piezaId, tipo, titulo, puedeSubir }: { piezaId: number; tipo: TipoAdjuntoContenido; titulo: string; puedeSubir: boolean }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({ queryKey: ['contenido-adjuntos', piezaId], queryFn: () => contenidoService.listAdjuntos(piezaId) })
  const adjuntos = (data || []).filter((a) => a.tipo === tipo)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contenido-adjuntos', piezaId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => contenidoService.subirAdjuntos(piezaId, files, tipo),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir el adjunto')
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => contenidoService.eliminarAdjunto(id),
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
              const url = contenidoService.getUrlVerAdjunto(ad.id)
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
function PiezaDetalleModal({ pieza, onClose }: { pieza: PiezaContenido | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [motivoCambios, setMotivoCambios] = useState('')
  const [mostrarCambios, setMostrarCambios] = useState(false)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['contenido-piezas'] })
    queryClient.invalidateQueries({ queryKey: ['contenido-resumen'] })
  }

  const enviarRevisionMutation = useMutation({
    mutationFn: () => contenidoService.enviarARevision(pieza!.id),
    onSuccess: () => { toast.success('Enviado a revisión'); invalidateAll() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo enviar a revisión')
    },
  })

  const aprobarMutation = useMutation({
    mutationFn: () => contenidoService.aprobarPieza(pieza!.id),
    onSuccess: () => { toast.success('Pieza aprobada'); invalidateAll() },
    onError: () => toast.error('No se pudo aprobar la pieza'),
  })

  const cambiosMutation = useMutation({
    mutationFn: () => contenidoService.solicitarCambios(pieza!.id, motivoCambios),
    onSuccess: () => { toast.success('Se solicitaron cambios'); invalidateAll(); setMostrarCambios(false); setMotivoCambios('') },
    onError: () => toast.error('No se pudo enviar la solicitud de cambios'),
  })

  const publicarMutation = useMutation({
    mutationFn: () => contenidoService.actualizarPieza(pieza!.id, {
      tipoId: pieza!.tipoId, titulo: pieza!.titulo, brief: pieza!.brief || undefined, contenido: pieza!.contenido || undefined,
      estatus: 'publicado', autorId: pieza!.autorId || undefined, revisorId: pieza!.revisorId || undefined,
      fechaProgramada: pieza!.fechaProgramada || undefined, campaniaId: pieza!.campaniaId || undefined, postId: pieza!.postId || undefined,
    }),
    onSuccess: () => { toast.success('Pieza publicada'); invalidateAll(); onClose() },
    onError: () => toast.error('No se pudo publicar la pieza'),
  })

  if (!pieza) return null

  const cfg = ESTATUS_CONFIG[pieza.estatus]
  const esAutor = pieza.autorId === currentUserId
  const esRevisor = pieza.revisorId === currentUserId

  return (
    <Modal isOpen={!!pieza} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{pieza.tipoNombre}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{pieza.titulo}</h2>
            {pieza.brief && <p className="mt-1 text-sm text-ink-tertiary">{pieza.brief}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
          </span>
          {pieza.fechaProgramada && (
            <span className="flex items-center gap-1 text-[11px] text-ink-tertiary">
              <Clock className="h-3 w-3" /> Programado: {new Date(pieza.fechaProgramada).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Autor</p>
            <p className="mt-0.5 text-ink">{pieza.autorNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Revisor</p>
            <p className="mt-0.5 text-ink">{pieza.revisorNombre || '—'}</p>
          </div>
        </div>

        {pieza.contenido && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Cuerpo</p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink">{pieza.contenido}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
          {(pieza.estatus === 'idea' || pieza.estatus === 'en_redaccion') && esAutor && (
            <Button size="sm" onClick={() => enviarRevisionMutation.mutate()} isLoading={enviarRevisionMutation.isPending}>
              <Send className="h-3.5 w-3.5" /> Enviar a revisión
            </Button>
          )}
          {pieza.estatus === 'en_revision' && esRevisor && !mostrarCambios && (
            <>
              <Button size="sm" onClick={() => aprobarMutation.mutate()} isLoading={aprobarMutation.isPending}>
                <Check className="h-3.5 w-3.5" /> Aprobar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMostrarCambios(true)}>
                <Ban className="h-3.5 w-3.5" /> Solicitar cambios
              </Button>
            </>
          )}
          {pieza.estatus === 'aprobado' && (esAutor || esRevisor) && (
            <Button size="sm" onClick={() => publicarMutation.mutate()} isLoading={publicarMutation.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como publicado
            </Button>
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

        <AdjuntosSection piezaId={pieza.id} tipo="borrador" titulo="Borradores" puedeSubir={esAutor} />
        <AdjuntosSection piezaId={pieza.id} tipo="final" titulo="Versión final" puedeSubir={esAutor || esRevisor} />
        <ComentariosSection piezaId={pieza.id} />
      </div>
    </Modal>
  )
}

// ── Tarjeta compacta ──────────────────────────────────────────────────────
function PiezaCard({ pieza, onClick }: { pieza: PiezaContenido; onClick: () => void }) {
  const cfg = ESTATUS_CONFIG[pieza.estatus]
  return (
    <button onClick={onClick} className="group relative flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span className="mb-1 inline-flex w-fit chip bg-blue-50 text-blue-700">{pieza.tipoNombre}</span>
      <h3 className="text-sm font-semibold text-ink">{pieza.titulo}</h3>
      {pieza.brief && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{pieza.brief}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
      </span>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span className="truncate">{pieza.autorNombre || '—'} → {pieza.revisorNombre || 'sin revisor'}</span>
      </div>
      <p className="mt-1 text-[10px] text-ink-tertiary">
        {pieza.fechaProgramada ? new Date(pieza.fechaProgramada).toLocaleDateString() : new Date(pieza.createdAt).toLocaleDateString()}
      </p>
    </button>
  )
}

// ── Administración de tipos ───────────────────────────────────────────────
function TipoFormModal({ isOpen, onClose, tipo }: { isOpen: boolean; onClose: () => void; tipo: TipoContenido | null }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState(tipo?.nombre || '')
  const [descripcion, setDescripcion] = useState(tipo?.descripcion || '')
  const [color, setColor] = useState(tipo?.color || '#1B4FD8')

  const mutation = useMutation({
    mutationFn: () => {
      const input = { nombre, descripcion: descripcion || undefined, color }
      return (tipo ? contenidoService.actualizarTipo(tipo.id, input) : contenidoService.crearTipo(input)).then(() => undefined)
    },
    onSuccess: () => {
      toast.success(tipo ? 'Tipo actualizado' : 'Tipo creado')
      queryClient.invalidateQueries({ queryKey: ['contenido-tipos'] })
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el tipo de contenido'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tipo ? 'Editar canal editorial' : 'Nuevo canal editorial'} size="md" elevated>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!nombre.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Blog" required />
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
  const [tipoEditando, setTipoEditando] = useState<TipoContenido | null>(null)
  const [nuevoTipoOpen, setNuevoTipoOpen] = useState(false)

  const { data: tipos, isLoading } = useQuery({ queryKey: ['contenido-tipos', 'admin'], queryFn: () => contenidoService.listTipos(false) })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => contenidoService.eliminarTipo(id),
    onSuccess: () => { toast.success('Tipo desactivado'); queryClient.invalidateQueries({ queryKey: ['contenido-tipos'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo desactivar el tipo')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Canales editoriales</h2>
        <Button size="sm" onClick={() => setNuevoTipoOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo canal
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
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
                <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-tertiary">Sin canales editoriales configurados.</td></tr>
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
type Tab = 'todas' | 'redaccion' | 'revision' | 'admin-tipos'

export function ContenidoPage() {
  return <EnConstruccion titulo="Contenido" subtitulo="Piezas de contenido y calendario editorial" />
}

function ContenidoPageContent() {
  const [tab, setTab] = useState<Tab>('todas')
  const [nuevaPiezaOpen, setNuevaPiezaOpen] = useState(false)
  const [piezaActivaId, setPiezaActivaId] = useState<number | null>(null)

  const { data: tipos } = useQuery({ queryKey: ['contenido-tipos'], queryFn: () => contenidoService.listTipos() })
  const { data: resumen } = useQuery({ queryKey: ['contenido-resumen'], queryFn: () => contenidoService.getResumen() })

  const filtroEstatus: EstatusPieza | undefined = tab === 'revision' ? 'en_revision' : undefined
  const { data, isLoading } = useQuery({
    queryKey: ['contenido-piezas', tab],
    queryFn: () => contenidoService.listPiezas(filtroEstatus ? { estatus: filtroEstatus } : undefined),
    enabled: tab !== 'admin-tipos',
    staleTime: 15_000,
  })

  const piezasFiltradas = tab === 'redaccion'
    ? (data || []).filter((p) => p.estatus === 'idea' || p.estatus === 'en_redaccion')
    : data || []

  const piezaActiva = (data || []).find((p) => p.id === piezaActivaId) || null

  const stats: DashboardStat[] = [
    { key: 'redaccion', icon: PenLine, label: 'En redacción', value: resumen?.enRedaccion ?? 0, tone: 'brand' },
    { key: 'revision', icon: Eye, label: 'En revisión', value: resumen?.enRevision ?? 0, tone: 'warn' },
    { key: 'aprobadas', icon: CheckCircle2, label: 'Aprobadas', value: resumen?.aprobadas ?? 0, tone: 'brand' },
    { key: 'publicadas', icon: Newspaper, label: 'Publicadas este mes', value: resumen?.publicadasMes ?? 0, tone: 'success' },
  ]

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'todas', label: 'Todas', icon: Clock },
    { key: 'redaccion', label: 'En redacción', icon: PenLine },
    { key: 'revision', label: 'En revisión', icon: Eye },
    { key: 'admin-tipos', label: 'Administrar tipos', icon: Settings2 },
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Newspaper className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Contenido</h1>
            <p className="text-xs text-blue-200/70">Calendario editorial multicanal: blog, newsletter, video y más</p>
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
          <Button size="sm" onClick={() => setNuevaPiezaOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nueva pieza
          </Button>
        )}
      </div>

      {tab === 'admin-tipos' ? (
        <AdminTiposPanel />
      ) : isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : piezasFiltradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">No hay piezas de contenido en esta vista.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {piezasFiltradas.map((p) => (
            <PiezaCard key={p.id} pieza={p} onClick={() => setPiezaActivaId(p.id)} />
          ))}
        </div>
      )}

      <NuevaPiezaModal isOpen={nuevaPiezaOpen} onClose={() => setNuevaPiezaOpen(false)} tipos={tipos || []} />
      <PiezaDetalleModal pieza={piezaActiva} onClose={() => setPiezaActivaId(null)} />
    </div>
  )
}
