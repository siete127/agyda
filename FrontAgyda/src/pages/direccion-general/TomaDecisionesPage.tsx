import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gavel, Plus, Trash2, Pencil, X, FileDown, FileSpreadsheet, MessageSquare, Paperclip,
  FileText, Upload, Check, Ban, Clock, Settings2, Inbox, Send,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  decisionesService,
  type Decision,
  type TipoDecision,
  type EstatusDecision,
  type Prioridad,
  type BandejaDecision,
} from '@/services/decisiones.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'
import { useUsuariosSimple } from './useUsuariosSimple'

const ESTATUS_CONFIG: Record<EstatusDecision, { label: string; cls: string; dot: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  aprobada: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Nueva solicitud ──────────────────────────────────────────────────────
function NuevaDecisionModal({ isOpen, onClose, tipos }: { isOpen: boolean; onClose: () => void; tipos: TipoDecision[] }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [tipoId, setTipoId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [aprobadorId, setAprobadorId] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('normal')
  const [fechaLimite, setFechaLimite] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])

  const tipoSeleccionado = tipos.find((t) => String(t.id) === tipoId) || null

  const reset = () => {
    setTipoId('')
    setTitulo('')
    setDescripcion('')
    setAprobadorId('')
    setPrioridad('normal')
    setFechaLimite('')
    setArchivos([])
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { id } = await decisionesService.crearDecision({
        tipoId: Number(tipoId),
        titulo,
        descripcion: descripcion || undefined,
        aprobadorId: aprobadorId ? Number(aprobadorId) : undefined,
        prioridad,
        fechaLimite: fechaLimite || undefined,
      })
      if (archivos.length) await decisionesService.subirAdjuntos(id, archivos)
      return id
    },
    onSuccess: () => {
      toast.success('Solicitud creada')
      queryClient.invalidateQueries({ queryKey: ['decisiones'] })
      queryClient.invalidateQueries({ queryKey: ['decisiones-resumen'] })
      reset()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo crear la solicitud')
    },
  })

  const handleTipoChange = (id: string) => {
    setTipoId(id)
    const tipo = tipos.find((t) => String(t.id) === id)
    if (tipo?.aprobadorDefaultId) setAprobadorId(String(tipo.aprobadorDefaultId))
  }

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
      <Modal isOpen={isOpen} onClose={onClose} title="Nueva solicitud de decisión" variant="corporate" size="md">
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-secondary">
            Todavía no hay tipos de decisión configurados. Crea uno primero desde la pestaña <strong>Administrar tipos</strong> para poder generar solicitudes.
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>Entendido</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva solicitud de decisión" variant="corporate" size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!tipoId || !titulo.trim() || !aprobadorId) return
          if (tipoSeleccionado?.requiereAdjunto && archivos.length === 0) {
            toast.error('Este tipo de decisión requiere al menos un adjunto')
            return
          }
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo de decisión</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={tipoId}
            onChange={(e) => handleTipoChange(e.target.value)}
            required
          >
            <option value="">Selecciona un tipo</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {tipoSeleccionado?.requiereAdjunto && (
            <p className="mt-1 text-[11px] text-amber-600">Este tipo requiere al menos un archivo adjunto.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Aprobación de presupuesto de campaña Q3"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Contexto y detalles de la solicitud (opcional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Aprobador</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={aprobadorId}
              onChange={(e) => setAprobadorId(e.target.value)}
              required
            >
              <option value="">Selecciona un aprobador</option>
              {usuarios?.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Prioridad</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as Prioridad)}
            >
              {(Object.keys(PRIORIDAD_LABEL) as Prioridad[]).map((p) => (
                <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha límite (opcional)</label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Adjuntos</label>
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
            <Upload className="h-3.5 w-3.5" /> Adjuntar archivo
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
function ComentariosSection({ decisionId, puedeComentar }: { decisionId: number; puedeComentar: boolean }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['decision-comentarios', decisionId],
    queryFn: () => decisionesService.listComentarios(decisionId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['decision-comentarios', decisionId] })

  const crearMutation = useMutation({
    mutationFn: () => decisionesService.crearComentario(decisionId, texto),
    onSuccess: () => {
      setTexto('')
      invalidate()
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => decisionesService.eliminarComentario(id),
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
                  <p className="mt-1 text-[11px] text-ink-tertiary">
                    {c.autorNombre || 'Usuario'} · {new Date(c.createdAt).toLocaleString()}
                  </p>
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
      {puedeComentar && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            crearMutation.mutate()
          }}
        >
          <input
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Agregar comentario..."
          />
          <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Comentar</Button>
        </form>
      )}
    </div>
  )
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
function AdjuntosSection({ decisionId, puedeSubir }: { decisionId: number; puedeSubir: boolean }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({
    queryKey: ['decision-adjuntos', decisionId],
    queryFn: () => decisionesService.listAdjuntos(decisionId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['decision-adjuntos', decisionId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => decisionesService.subirAdjuntos(decisionId, files),
    onSuccess: () => {
      toast.success('Adjunto subido')
      invalidate()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir el adjunto')
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => decisionesService.eliminarAdjunto(id),
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
        <Paperclip className="h-3.5 w-3.5" /> Adjuntos
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = decisionesService.getUrlVerAdjunto(ad.id)
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
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">
                    {formatBytes(ad.tamanio)}
                  </span>
                </div>
              )
            })}
            {(!data || data.length === 0) && (
              <p className="col-span-full text-xs text-ink-tertiary">Sin adjuntos aún.</p>
            )}
          </div>
          {puedeSubir && (
            <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> Subir adjunto
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle ─────────────────────────────────────────────────────
function DecisionDetalleModal({ decision, onClose, puedeComentar }: {
  decision: Decision | null
  onClose: () => void
  puedeComentar: boolean
}) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [mostrarRechazo, setMostrarRechazo] = useState(false)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['decisiones'] })
    queryClient.invalidateQueries({ queryKey: ['decisiones-resumen'] })
  }

  const aprobarMutation = useMutation({
    mutationFn: () => decisionesService.aprobarDecision(decision!.id),
    onSuccess: () => {
      toast.success('Solicitud aprobada')
      invalidateAll()
      onClose()
    },
    onError: () => toast.error('No se pudo aprobar la solicitud'),
  })

  const rechazarMutation = useMutation({
    mutationFn: () => decisionesService.rechazarDecision(decision!.id, motivoRechazo),
    onSuccess: () => {
      toast.success('Solicitud rechazada')
      invalidateAll()
      onClose()
    },
    onError: () => toast.error('No se pudo rechazar la solicitud'),
  })

  const cancelarMutation = useMutation({
    mutationFn: () => decisionesService.cancelarDecision(decision!.id),
    onSuccess: () => {
      toast.success('Solicitud cancelada')
      invalidateAll()
      onClose()
    },
    onError: () => toast.error('No se pudo cancelar la solicitud'),
  })

  if (!decision) return null

  const cfg = ESTATUS_CONFIG[decision.estatus]
  const esAprobador = decision.aprobadorId === currentUserId
  const esSolicitante = decision.solicitanteId === currentUserId
  const pendiente = decision.estatus === 'pendiente'

  return (
    <Modal isOpen={!!decision} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{decision.tipoNombre}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{decision.titulo}</h2>
            {decision.descripcion && <p className="mt-1 text-sm text-ink-tertiary">{decision.descripcion}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
            {cfg.label}
          </span>
          <span className="chip bg-gray-100 text-gray-600">{PRIORIDAD_LABEL[decision.prioridad]}</span>
          {decision.fechaLimite && (
            <span className="flex items-center gap-1 text-[11px] text-ink-tertiary">
              <Clock className="h-3 w-3" /> Límite: {new Date(decision.fechaLimite).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Solicitante</p>
            <p className="mt-0.5 text-ink">{decision.solicitanteNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Aprobador</p>
            <p className="mt-0.5 text-ink">{decision.aprobadorNombre || '—'}</p>
          </div>
        </div>

        {decision.motivoResolucion && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Motivo de resolución</p>
            <p className="mt-0.5 text-xs text-ink">{decision.motivoResolucion}</p>
          </div>
        )}

        {pendiente && (esAprobador || esSolicitante) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
            {esAprobador && !mostrarRechazo && (
              <>
                <Button size="sm" onClick={() => aprobarMutation.mutate()} isLoading={aprobarMutation.isPending}>
                  <Check className="h-3.5 w-3.5" /> Aprobar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setMostrarRechazo(true)}>
                  <Ban className="h-3.5 w-3.5" /> Rechazar
                </Button>
              </>
            )}
            {esSolicitante && (
              <Button size="sm" variant="secondary" onClick={() => cancelarMutation.mutate()} isLoading={cancelarMutation.isPending}>
                Cancelar solicitud
              </Button>
            )}
          </div>
        )}

        {mostrarRechazo && (
          <form
            className="space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!motivoRechazo.trim()) return
              rechazarMutation.mutate()
            }}
          >
            <label className="block text-xs font-semibold text-ink-secondary">Motivo de rechazo</label>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              rows={2}
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setMostrarRechazo(false)}>Cancelar</Button>
              <Button type="submit" size="sm" isLoading={rechazarMutation.isPending}>Confirmar rechazo</Button>
            </div>
          </form>
        )}

        <AdjuntosSection decisionId={decision.id} puedeSubir={esAprobador || esSolicitante} />
        <ComentariosSection decisionId={decision.id} puedeComentar={puedeComentar} />
      </div>
    </Modal>
  )
}

// ── Tarjeta compacta ──────────────────────────────────────────────────────
function DecisionCard({ decision, onClick }: { decision: Decision; onClick: () => void }) {
  const cfg = ESTATUS_CONFIG[decision.estatus]
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className="mb-1 inline-flex w-fit chip bg-blue-50 text-blue-700">{decision.tipoNombre}</span>
      <h3 className="text-sm font-semibold text-ink">{decision.titulo}</h3>
      {decision.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{decision.descripcion}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
      </span>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span className="truncate">{decision.solicitanteNombre || '—'} → {decision.aprobadorNombre || '—'}</span>
      </div>
      <p className="mt-1 text-[10px] text-ink-tertiary">{new Date(decision.createdAt).toLocaleDateString()}</p>
    </button>
  )
}

// ── Administración de tipos ───────────────────────────────────────────────
function TipoFormModal({ isOpen, onClose, tipo }: { isOpen: boolean; onClose: () => void; tipo: TipoDecision | null }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [nombre, setNombre] = useState(tipo?.nombre || '')
  const [descripcion, setDescripcion] = useState(tipo?.descripcion || '')
  const [color, setColor] = useState(tipo?.color || '#1B4FD8')
  const [aprobadorDefaultId, setAprobadorDefaultId] = useState(tipo?.aprobadorDefaultId ? String(tipo.aprobadorDefaultId) : '')
  const [requiereAdjunto, setRequiereAdjunto] = useState(tipo?.requiereAdjunto || false)

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        nombre,
        descripcion: descripcion || undefined,
        color,
        aprobadorDefaultId: aprobadorDefaultId ? Number(aprobadorDefaultId) : undefined,
        requiereAdjunto,
      }
      return (tipo ? decisionesService.actualizarTipo(tipo.id, input) : decisionesService.crearTipo(input)).then(() => undefined)
    },
    onSuccess: () => {
      toast.success(tipo ? 'Tipo actualizado' : 'Tipo creado')
      queryClient.invalidateQueries({ queryKey: ['decisiones-tipos'] })
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el tipo de decisión'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tipo ? 'Editar tipo de decisión' : 'Nuevo tipo de decisión'} size="md" elevated>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim()) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Aprobación de gasto"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Color</label>
            <input
              type="color"
              className="h-9 w-full rounded-lg border border-gray-200"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Aprobador por defecto</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={aprobadorDefaultId}
              onChange={(e) => setAprobadorDefaultId(e.target.value)}
            >
              <option value="">Sin aprobador por defecto</option>
              {usuarios?.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input type="checkbox" checked={requiereAdjunto} onChange={(e) => setRequiereAdjunto(e.target.checked)} />
          Requiere al menos un adjunto obligatorio
        </label>
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
  const [tipoEditando, setTipoEditando] = useState<TipoDecision | null>(null)
  const [nuevoTipoOpen, setNuevoTipoOpen] = useState(false)

  const { data: tipos, isLoading } = useQuery({
    queryKey: ['decisiones-tipos', 'admin'],
    queryFn: () => decisionesService.listTipos(false),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => decisionesService.eliminarTipo(id),
    onSuccess: () => {
      toast.success('Tipo desactivado')
      queryClient.invalidateQueries({ queryKey: ['decisiones-tipos'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo desactivar el tipo')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Tipos de decisión</h2>
        <Button size="sm" onClick={() => setNuevoTipoOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nuevo tipo
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
                <th className="px-4 py-2 font-semibold">Aprobador por defecto</th>
                <th className="px-4 py-2 font-semibold">Adjunto obligatorio</th>
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
                  <td className="px-4 py-2.5 text-ink-tertiary">{t.aprobadorDefaultId ? `#${t.aprobadorDefaultId}` : '—'}</td>
                  <td className="px-4 py-2.5 text-ink-tertiary">{t.requiereAdjunto ? 'Sí' : 'No'}</td>
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
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">Sin tipos de decisión configurados.</td>
                </tr>
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
type Tab = 'por-aprobar' | 'mias' | 'todas' | 'admin-tipos'

export function TomaDecisionesPage() {
  const [tab, setTab] = useState<Tab>('por-aprobar')
  const [nuevaDecisionOpen, setNuevaDecisionOpen] = useState(false)
  const [decisionActivaId, setDecisionActivaId] = useState<number | null>(null)
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const { can } = useActionAccess()
  const puedeComentar = can('direccion-general', 'decision-comentar')
  const puedeAdminTipos = can('direccion-general', 'decision-admin-tipos')

  const { data: tipos } = useQuery({
    queryKey: ['decisiones-tipos'],
    queryFn: () => decisionesService.listTipos(),
  })

  const { data: resumen } = useQuery({
    queryKey: ['decisiones-resumen'],
    queryFn: () => decisionesService.getResumen(),
  })

  const bandeja: BandejaDecision = tab === 'admin-tipos' ? 'todas' : tab
  const { data, isLoading } = useQuery({
    queryKey: ['decisiones', bandeja],
    queryFn: () => decisionesService.listDecisiones({ bandeja }),
    enabled: tab !== 'admin-tipos',
    staleTime: 15_000,
  })

  const decisionActiva = (data || []).find((d) => d.id === decisionActivaId) || null

  const stats: DashboardStat[] = [
    { key: 'por-aprobar', icon: Inbox, label: 'Por aprobar', value: resumen?.pendientesPorAprobar ?? 0, tone: 'warn' },
    { key: 'mias', icon: Send, label: 'Mis pendientes', value: resumen?.misPendientes ?? 0, tone: 'brand' },
    { key: 'resueltas', icon: Check, label: 'Resueltas este mes', value: resumen?.resueltasMes ?? 0, tone: 'success' },
    { key: 'activas', icon: Clock, label: 'Total activas', value: resumen?.totalActivas ?? 0, tone: 'brand' },
  ]

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await decisionesService.exportarPdf({ bandeja })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'toma_decisiones.pdf'
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
    if (!data || data.length === 0) {
      toast.error('No hay solicitudes para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Título', 'Tipo', 'Solicitante', 'Aprobador', 'Estatus', 'Prioridad', 'Creada'],
      ...data.map((d) => [
        d.titulo,
        d.tipoNombre,
        d.solicitanteNombre || '',
        d.aprobadorNombre || '',
        ESTATUS_CONFIG[d.estatus].label,
        PRIORIDAD_LABEL[d.prioridad],
        new Date(d.createdAt).toLocaleDateString(),
      ]),
    ])
    sheet['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Decisiones')
    XLSX.writeFile(wb, 'toma_decisiones.xlsx')
  }

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'por-aprobar', label: 'Por aprobar', icon: Inbox },
    { key: 'mias', label: 'Mis solicitudes', icon: Send },
    { key: 'todas', label: 'Todas', icon: Clock },
    ...(puedeAdminTipos ? [{ key: 'admin-tipos' as Tab, label: 'Administrar tipos', icon: Settings2 }] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Gavel className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Toma de decisiones</h1>
            <p className="text-xs text-blue-200/70">Registro y seguimiento de solicitudes de decisión ejecutiva</p>
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" onClick={() => setNuevaDecisionOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva solicitud
            </Button>
          </div>
        )}
      </div>

      {tab === 'admin-tipos' ? (
        <AdminTiposPanel />
      ) : isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">No hay solicitudes en esta bandeja.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <DecisionCard key={d.id} decision={d} onClick={() => setDecisionActivaId(d.id)} />
          ))}
        </div>
      )}

      <NuevaDecisionModal isOpen={nuevaDecisionOpen} onClose={() => setNuevaDecisionOpen(false)} tipos={tipos || []} />
      <DecisionDetalleModal decision={decisionActiva} onClose={() => setDecisionActivaId(null)} puedeComentar={puedeComentar} />
    </div>
  )
}
