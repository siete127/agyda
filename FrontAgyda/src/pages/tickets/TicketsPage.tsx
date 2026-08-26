import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, MessageCircle,
  Send, LifeBuoy, Clock, CheckCircle2, CircleDot, UserCheck, Star,
  LayoutList, Table2, BarChart2, Timer,
} from 'lucide-react'
import { ticketsService } from '@/services/tickets.service'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  type Ticket, type TicketEstado, type TicketPrioridad,
  PRIORIDAD_COLORS, ESTADO_COLORS, ESTADO_LABELS, SLA_COLORS, SLA_LABELS,
} from '@/types/ticket.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-surface-border bg-white p-4 animate-pulse space-y-2">
      <div className="flex gap-2">
        <div className="h-3 w-12 rounded-full bg-surface" />
        <div className="h-3 w-20 rounded-full bg-surface" />
        <div className="h-3 w-16 rounded-full bg-surface" />
      </div>
      <div className="h-4 w-2/3 rounded-lg bg-surface" />
      <div className="h-3 w-1/3 rounded-lg bg-surface" />
    </div>
  )
}

/* ── Formulario nuevo ticket ── */
function NuevoTicketModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ titulo: '', descripcion: '', prioridad: 'media', area: 'TI', asignadoA: '' })

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['staff-ti'],
    queryFn: () => ticketsService.getStaffTI(),
    staleTime: 60_000,
  })

  const crear = useMutation({
    mutationFn: () => ticketsService.create({
      titulo: form.titulo,
      descripcion: form.descripcion,
      prioridad: form.prioridad,
      area: form.area,
      asignadoA: form.asignadoA ? Number(form.asignadoA) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Ticket creado')
      onClose()
    },
    onError: () => toast.error('No se pudo crear el ticket'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo ticket" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Título</label>
          <input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            className="field"
            placeholder="Describe brevemente el problema"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            rows={4}
            className="field resize-none"
            placeholder="Detalla el problema o solicitud..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Prioridad</label>
            <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="field">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Área</label>
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="field">
              <option value="TI">TI</option>
              <option value="ST">ST</option>
            </select>
          </div>
        </div>

        {/* Asignar a */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Asignar a</label>
          {loadingStaff ? (
            <div className="field flex items-center gap-2 text-ink-tertiary text-sm">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface-border border-t-brand inline-block" />
              Cargando...
            </div>
          ) : (
            <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-surface-border p-2">
              <div
                onClick={() => setForm((f) => ({ ...f, asignadoA: '' }))}
                className={clsx(
                  'flex items-center gap-3 cursor-pointer rounded-lg border px-3 py-2 transition-colors',
                  form.asignadoA === '' ? 'border-brand/40 bg-brand/5' : 'border-surface-border hover:border-brand/30',
                )}
              >
                <div className={clsx('h-3.5 w-3.5 rounded-full border-2 flex-shrink-0', form.asignadoA === '' ? 'border-brand bg-brand' : 'border-surface-border')} />
                <span className="text-[0.78rem] text-ink-secondary italic">Asignación automática</span>
              </div>
              {staff.map((s) => {
                const sid = String(s.usuarioId)
                return (
                  <div
                    key={s.usuarioId}
                    onClick={() => setForm((f) => ({ ...f, asignadoA: sid }))}
                    className={clsx(
                      'flex items-center gap-3 cursor-pointer rounded-lg border px-3 py-2 transition-colors',
                      form.asignadoA === sid ? 'border-brand/40 bg-brand/5' : 'border-surface-border hover:border-brand/30',
                    )}
                  >
                    <div className={clsx('h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 transition-colors', form.asignadoA === sid ? 'border-brand bg-brand' : 'border-surface-border')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.78rem] font-semibold text-ink truncate">{s.nombre}</p>
                      <p className="text-[0.65rem] text-ink-tertiary">{s.area}</p>
                    </div>
                    {s.disponible && <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" title="Disponible" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            isLoading={crear.isPending}
            disabled={!form.titulo.trim() || !form.descripcion.trim()}
            onClick={() => crear.mutate()}
          >
            Crear ticket
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Panel de calificación (solicitante) ── */
function PanelSatisfaccion({ ticket }: { ticket: Ticket }) {
  const qc = useQueryClient()
  const [hover, setHover] = useState(0)
  const [rating, setRating] = useState(0)
  const [comentario, setComentario] = useState('')

  const calificar = useMutation({
    mutationFn: () => ticketsService.registrarSatisfaccion(ticket.id, rating, comentario || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('¡Gracias por tu calificación!')
    },
    onError: () => toast.error('Error al enviar calificación'),
  })

  /* Ya calificado */
  if (ticket.rating !== null) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-[0.72rem] font-semibold text-emerald-700 mb-1">Tu calificación</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={clsx('h-4 w-4', n <= ticket.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-ink-tertiary')}
            />
          ))}
          {ticket.ratingComentario && (
            <span className="ml-2 text-[0.72rem] text-emerald-700 italic">"{ticket.ratingComentario}"</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
      <p className="text-[0.75rem] font-semibold text-amber-800">
        ¿Quedaste satisfecho con la atención? Califica este ticket
      </p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={clsx(
                'h-6 w-6 transition-colors',
                n <= (hover || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-ink-tertiary',
              )}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-[0.72rem] text-ink-secondary">
            {['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'][rating]}
          </span>
        )}
      </div>
      {rating > 0 && (
        <div className="space-y-2">
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="field py-2 text-sm"
            placeholder="Comentario opcional..."
          />
          <Button
            size="sm"
            isLoading={calificar.isPending}
            onClick={() => calificar.mutate()}
          >
            Enviar calificación
          </Button>
        </div>
      )}
    </div>
  )
}

/* ── Panel de transferencia (TI/AD) ── */
function PanelTransferir({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const qc = useQueryClient()
  const [seleccionado, setSeleccionado] = useState<number | null>(null)

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['staff-ti'],
    queryFn: () => ticketsService.getStaffTI(),
    staleTime: 60_000,
  })

  const transferir = useMutation({
    mutationFn: () => ticketsService.transferir(ticket.id, seleccionado!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Ticket transferido')
      onDone()
    },
    onError: () => toast.error('Error al transferir ticket'),
  })

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 space-y-3">
      <p className="text-[0.72rem] font-semibold text-purple-800 uppercase tracking-wide">Transferir a agente TI</p>
      {isLoading ? (
        <div className="space-y-1.5 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-purple-100/60" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <p className="text-[0.75rem] text-purple-600">No hay agentes disponibles</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {staff.map((s) => (
            <div
              key={s.usuarioId}
              onClick={() => setSeleccionado(s.usuarioId)}
              className={clsx(
                'flex items-center gap-3 cursor-pointer rounded-xl border px-3 py-2 transition-colors',
                seleccionado === s.usuarioId
                  ? 'border-purple-400 bg-purple-100'
                  : 'border-purple-200 bg-white hover:border-purple-300',
              )}
            >
              <div className={clsx(
                'h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                seleccionado === s.usuarioId ? 'border-purple-500 bg-purple-500' : 'border-surface-border',
              )}>
                {seleccionado === s.usuarioId && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.78rem] font-semibold text-ink">{s.nombre}</p>
                <p className="text-[0.65rem] text-ink-tertiary">{s.area}</p>
              </div>
              {s.disponible && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" title="Disponible" />
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancelar</Button>
        <Button
          size="sm"
          disabled={!seleccionado}
          isLoading={transferir.isPending}
          onClick={() => transferir.mutate()}
          className="bg-purple-600 hover:bg-purple-700 border-purple-600"
        >
          <UserCheck className="h-3.5 w-3.5" /> Transferir
        </Button>
      </div>
    </div>
  )
}

// ── Labels e íconos de historial ─────────────────────────────────────────
const HIST_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  creado:         { label: 'Ticket creado',       color: 'text-brand',       dot: 'bg-brand'       },
  asignado:       { label: 'Asignado a',           color: 'text-blue-600',    dot: 'bg-blue-500'    },
  transferido:    { label: 'Transferido a',         color: 'text-purple-600',  dot: 'bg-purple-500'  },
  transferido_por:{ label: 'Transferido por',       color: 'text-purple-400',  dot: 'bg-purple-300'  },
  participante:   { label: 'Participante',          color: 'text-ink-secondary',    dot: 'bg-gray-400'    },
  editado:        { label: 'Editado',               color: 'text-orange-600',  dot: 'bg-orange-400'  },
  comentario:     { label: 'Comentario agregado',   color: 'text-ink-secondary',    dot: 'bg-gray-400'    },
  evidencia:      { label: 'Evidencia subida',      color: 'text-teal-600',    dot: 'bg-teal-400'    },
  estado:         { label: 'Estado cambiado a',     color: 'text-emerald-600', dot: 'bg-emerald-500' },
  resolucion:     { label: 'Nota de resolución',    color: 'text-green-700',   dot: 'bg-green-500'   },
  encuesta:       { label: 'Encuesta completada',   color: 'text-yellow-600',  dot: 'bg-yellow-400'  },
}

/* ── Tarjeta de ticket (grid) ── */
function TicketCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  const fmtFecha = (iso: string | null) => {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const fechaCreacion = fmtFecha(ticket.fechaCreacion)

  return (
    <button
      onClick={onOpen}
      className="group flex flex-col items-center gap-2.5 rounded-2xl border border-surface-border bg-white px-4 py-5 text-center transition-colors hover:border-brand/30"
    >
      <span className="text-[0.65rem] font-mono font-bold text-ink-tertiary">#{ticket.id}</span>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <span className={clsx('chip text-[0.62rem]', ESTADO_COLORS[ticket.estado])}>
          {ESTADO_LABELS[ticket.estado]}
        </span>
        <span className={clsx('chip text-[0.62rem]', PRIORIDAD_COLORS[ticket.prioridad])}>
          {ticket.prioridad}
        </span>
        <span className="chip bg-surface text-ink-secondary text-[0.62rem]">{ticket.area}</span>
        {ticket.slaResolucion && (
          <span className={clsx('chip text-[0.62rem]', SLA_COLORS[ticket.slaResolucion])}>
            {SLA_LABELS[ticket.slaResolucion]}
          </span>
        )}
      </div>

      <h3 className="line-clamp-2 text-[0.85rem] font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
        {ticket.titulo}
      </h3>

      <p className="line-clamp-1 text-[0.68rem] text-ink-tertiary">
        {ticket.solicitanteNombre}
      </p>
      <p className="text-[0.62rem] text-ink-tertiary">{fechaCreacion}</p>

      {ticket.asignadoNombre && (
        <p className="line-clamp-1 text-[0.65rem] text-ink-tertiary">→ {ticket.asignadoNombre}</p>
      )}

      <div className="mt-1 flex items-center gap-2.5 text-ink-tertiary">
        {ticket.rating !== null && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />}
        <MessageCircle className="h-3.5 w-3.5" />
      </div>
    </button>
  )
}

/* ── Modal de detalle de ticket ── */
function TicketDetalleModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const [comentario, setComentario] = useState('')
  const [showTransferir, setShowTransferir] = useState(false)
  const [tab, setTab] = useState<'comentarios' | 'historial'>('comentarios')
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isTI  = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const esSolicitante = user?.id === ticket.solicitanteId

  const { data: comentarios = [], isLoading: loadingComents } = useQuery({
    queryKey: ['ticket-comentarios', ticket.id],
    queryFn: () => ticketsService.getComentarios(ticket.id),
  })

  const { data: historial = [], isLoading: loadingHist } = useQuery({
    queryKey: ['ticket-historial', ticket.id],
    queryFn: () => ticketsService.getHistorial(ticket.id),
    enabled: tab === 'historial',
  })

  const addComentario = useMutation({
    mutationFn: (texto: string) => ticketsService.addComentario(ticket.id, texto),
    onSuccess: () => {
      setComentario('')
      qc.invalidateQueries({ queryKey: ['ticket-comentarios', ticket.id] })
    },
    onError: () => toast.error('Error al enviar comentario'),
  })

  const cambiarEstado = useMutation({
    mutationFn: (estado: TicketEstado) => ticketsService.cambiarEstado(ticket.id, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Estado actualizado')
    },
  })

  const fmtFecha = (iso: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  }
  const fechaCreacion = fmtFecha(ticket.fechaCreacion)
  const fechaCierre   = fmtFecha(ticket.fechaCierre)

  return (
    <Modal isOpen onClose={onClose} size="lg" title={`#${ticket.id} · ${ticket.titulo}`}>
      <div className="space-y-4">
        {/* Metadatos */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={clsx('chip text-[0.65rem]', ESTADO_COLORS[ticket.estado])}>
            {ESTADO_LABELS[ticket.estado]}
          </span>
          <span className={clsx('chip text-[0.65rem]', PRIORIDAD_COLORS[ticket.prioridad])}>
            {ticket.prioridad}
          </span>
          <span className="chip bg-surface text-ink-secondary text-[0.65rem]">{ticket.area}</span>
          {ticket.slaRespuesta && (
            <span className={clsx('chip text-[0.65rem]', SLA_COLORS[ticket.slaRespuesta])}>
              Respuesta: {SLA_LABELS[ticket.slaRespuesta]}
            </span>
          )}
          {ticket.slaResolucion && (
            <span className={clsx('chip text-[0.65rem]', SLA_COLORS[ticket.slaResolucion])}>
              Resolución: {SLA_LABELS[ticket.slaResolucion]}
            </span>
          )}
          {ticket.rating !== null && (
            <span className="flex items-center gap-1 text-[0.65rem] text-ink-tertiary">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> Calificado
            </span>
          )}
        </div>
        <p className="text-[0.72rem] text-ink-tertiary">
          {ticket.solicitanteNombre} · {fechaCreacion}
          {ticket.asignadoNombre && ` · → ${ticket.asignadoNombre}`}
          {fechaCierre && <span className="ml-1">· Cerrado: {fechaCierre}</span>}
        </p>

        {/* Descripción */}
        <div className="rounded-xl border border-surface-border bg-surface px-4 py-3 space-y-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-tertiary">Descripción</p>
          <p className="text-[0.83rem] text-ink whitespace-pre-wrap leading-relaxed">
            {ticket.descripcion || <span className="text-ink-tertiary italic">Sin descripción</span>}
          </p>
        </div>

        {/* Cambiar estado — TI */}
        {isTI && ticket.estado !== 'cerrado' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.68rem] font-semibold text-ink-tertiary uppercase tracking-wide mr-1">Mover a:</span>
            {(['asignado', 'en_proceso', 'resuelto', 'cerrado'] as TicketEstado[])
              .filter((e) => e !== ticket.estado)
              .map((e) => (
                <button
                  key={e}
                  onClick={() => cambiarEstado.mutate(e)}
                  className={clsx(
                    'rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold transition-all hover:opacity-100 opacity-70',
                    ESTADO_COLORS[e],
                  )}
                >
                  {ESTADO_LABELS[e]}
                </button>
              ))}

            {/* Botón transferir */}
            <button
              onClick={() => setShowTransferir(!showTransferir)}
              className={clsx(
                'ml-auto flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors',
                showTransferir
                  ? 'border-purple-400 bg-purple-100 text-purple-700'
                  : 'border-purple-200 bg-purple-50 text-purple-600 hover:border-purple-400',
              )}
            >
              <UserCheck className="h-3 w-3" /> Transferir
            </button>
          </div>
        )}

        {/* Panel transferir */}
        {showTransferir && isTI && (
          <PanelTransferir ticket={ticket} onDone={() => setShowTransferir(false)} />
        )}

        {/* Calificación — solicitante, ticket resuelto */}
        {esSolicitante && (ticket.estado === 'resuelto' || ticket.estado === 'cerrado') && (
          <PanelSatisfaccion ticket={ticket} />
        )}

        {/* Tabs: Comentarios / Historial */}
        <div className="border-b border-surface-border flex gap-4">
          {(['comentarios', 'historial'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'pb-1.5 text-[0.75rem] font-semibold border-b-2 transition-colors',
                tab === t
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-tertiary hover:text-ink-secondary',
              )}
            >
              {t === 'comentarios' ? '💬 Comentarios' : '📋 Historial'}
            </button>
          ))}
        </div>

        {/* Pestaña Comentarios */}
        {tab === 'comentarios' && (
          <>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {loadingComents ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="flex gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-surface flex-shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2.5 w-20 rounded-full bg-surface" />
                        <div className="h-2 w-full rounded-full bg-surface" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comentarios.length === 0 ? (
                <p className="text-[0.75rem] text-ink-tertiary text-center py-3">Sin comentarios aún</p>
              ) : (
                comentarios.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[0.62rem] font-bold text-brand">
                      {(c.autorNombre ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 rounded-xl bg-surface border border-surface-border px-3 py-2">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[0.72rem] font-semibold text-ink">{c.autorNombre}</span>
                        <span className="text-[0.62rem] text-ink-tertiary">
                          {new Date(c.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <p className="text-[0.78rem] text-ink-secondary leading-relaxed">{c.comentario}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {ticket.estado !== 'cerrado' && (
              <div className="flex gap-2">
                <input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Agregar comentario..."
                  className="field flex-1 py-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && comentario.trim()) {
                      e.preventDefault()
                      addComentario.mutate(comentario.trim())
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!comentario.trim() || addComentario.isPending}
                  isLoading={addComentario.isPending}
                  onClick={() => addComentario.mutate(comentario.trim())}
                  className="px-3"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Pestaña Historial */}
        {tab === 'historial' && (
          <div className="max-h-64 overflow-y-auto pr-1">
            {loadingHist ? (
              <div className="space-y-2 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="h-2.5 w-2.5 rounded-full bg-surface-border mt-1.5 flex-shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="h-2.5 w-32 rounded-full bg-surface" />
                      <div className="h-2 w-48 rounded-full bg-surface" />
                    </div>
                  </div>
                ))}
              </div>
            ) : historial.length === 0 ? (
              <p className="text-[0.75rem] text-ink-tertiary text-center py-3">Sin historial</p>
            ) : (
              <div className="relative">
                {/* línea vertical */}
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-surface-border" />
                <div className="space-y-3 pl-5">
                  {historial.map((h, idx) => {
                    const cfg = HIST_CONFIG[h.tipo] ?? { label: h.tipo, color: 'text-ink-secondary', dot: 'bg-gray-400' }
                    const prev = historial[idx - 1]
                    const durMs = prev
                      ? new Date(h.createdAt).getTime() - new Date(prev.createdAt).getTime()
                      : null
                    const durStr = durMs !== null && durMs >= 0
                      ? durMs < 60_000
                        ? `${Math.round(durMs / 1000)}s`
                        : durMs < 3_600_000
                        ? `${Math.floor(durMs / 60_000)}m ${Math.round((durMs % 60_000) / 1000)}s`
                        : `${Math.floor(durMs / 3_600_000)}h ${Math.floor((durMs % 3_600_000) / 60_000)}m`
                      : null

                    return (
                      <div key={h.id} className="relative">
                        {/* dot */}
                        <span className={clsx('absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white', cfg.dot)} />

                        <div className="rounded-xl bg-surface border border-surface-border px-3 py-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className={clsx('text-[0.72rem] font-semibold', cfg.color)}>
                              {cfg.label}
                              {h.detalle && (
                                <span className="ml-1 font-normal text-ink-secondary">
                                  {h.tipo === 'estado'
                                    ? `→ ${h.detalle}`
                                    : h.detalle}
                                </span>
                              )}
                            </span>
                            <span className="text-[0.62rem] text-ink-tertiary flex-shrink-0">
                              {new Date(h.createdAt).toLocaleString('es-MX', {
                                day: 'numeric', month: 'short',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                            {h.usuarioNombre && (
                              <span className="text-[0.65rem] text-ink-secondary">
                                por <span className="font-medium">{h.usuarioNombre}</span>
                              </span>
                            )}
                            {durStr && (
                              <span className="text-[0.62rem] text-ink-tertiary ml-auto">
                                +{durStr} desde anterior
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ── Vista productividad ── */
interface PersonaStat {
  id: number | null
  nombre: string
  total: number
  resueltos: number
  cerrados: number
  enProceso: number
  abiertos: number
  tiempoPromMinutos: number | null
}

function ProductividadBar({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((val / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-6 text-right text-[0.72rem] font-bold text-ink">{val}</span>
      <div className="flex-1 h-2.5 rounded-full bg-surface overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ProductividadCard({ p, maxTotal, tipo }: { p: PersonaStat; maxTotal: number; tipo: 'solicitante' | 'solucionador' }) {
  const resueltosPct = p.total > 0 ? Math.round(((p.resueltos + p.cerrados) / p.total) * 100) : 0
  const ringColor = resueltosPct >= 80 ? 'text-emerald-500' : resueltosPct >= 50 ? 'text-amber-500' : 'text-red-400'

  return (
    <div className="rounded-2xl border border-surface-border bg-white p-4 space-y-3">
      {/* Nombre + porcentaje */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.82rem] font-bold text-ink truncate leading-tight">{p.nombre}</p>
          <p className="text-[0.65rem] text-ink-tertiary mt-0.5">{p.total} ticket{p.total !== 1 ? 's' : ''}</p>
        </div>
        <div className={`flex-shrink-0 text-[1rem] font-black ${ringColor}`}>
          {resueltosPct}%
        </div>
      </div>

      {/* Barra total */}
      <div>
        <p className="text-[0.62rem] font-semibold text-ink-tertiary uppercase tracking-wide mb-1">Total vs máximo</p>
        <ProductividadBar label="" val={p.total} max={maxTotal} color="bg-brand/70" />
      </div>

      {/* Barras de estado */}
      <div className="space-y-1.5">
        <p className="text-[0.62rem] font-semibold text-ink-tertiary uppercase tracking-wide">Desglose</p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[0.65rem]">
          <span className="text-emerald-600 font-semibold">Resueltos</span>
          <ProductividadBar label="" val={p.resueltos} max={p.total} color="bg-emerald-400" />
          <span className="text-ink-secondary font-semibold">Cerrados</span>
          <ProductividadBar label="" val={p.cerrados} max={p.total} color="bg-gray-400" />
          <span className="text-amber-600 font-semibold">En proceso</span>
          <ProductividadBar label="" val={p.enProceso} max={p.total} color="bg-amber-400" />
          <span className="text-blue-500 font-semibold">Abiertos</span>
          <ProductividadBar label="" val={p.abiertos} max={p.total} color="bg-brand/50" />
        </div>
      </div>

      {/* Tiempo promedio (solo solucionadores) */}
      {tipo === 'solucionador' && p.tiempoPromMinutos !== null && (
        <div className="rounded-lg bg-surface border border-surface-border px-3 py-1.5 flex items-center justify-between">
          <span className="text-[0.65rem] text-ink-tertiary font-semibold uppercase tracking-wide">T. prom. atención</span>
          <span className="text-[0.75rem] font-black text-ink">{formatDuracion(Math.round(p.tiempoPromMinutos))}</span>
        </div>
      )}
    </div>
  )
}

function VistaProductividad({ tickets }: { tickets: Ticket[] }) {
  const [tab, setTab] = useState<'solicitantes' | 'solucionadores'>('solucionadores')

  const calcStats = (tipo: 'solicitante' | 'solucionador'): PersonaStat[] => {
    const map = new Map<string, PersonaStat>()
    for (const t of tickets) {
      const key = tipo === 'solicitante'
        ? String(t.solicitanteId ?? 'null')
        : String(t.asignadoA ?? 'null')
      const nombre = tipo === 'solicitante'
        ? (t.solicitanteNombre ?? 'Sin nombre')
        : (t.asignadoNombre ?? 'Sin asignar')

      if (!map.has(key)) {
        map.set(key, { id: tipo === 'solicitante' ? t.solicitanteId ?? null : t.asignadoA ?? null, nombre, total: 0, resueltos: 0, cerrados: 0, enProceso: 0, abiertos: 0, tiempoPromMinutos: null })
      }
      const s = map.get(key)!
      s.total++
      if (t.estado === 'resuelto') s.resueltos++
      else if (t.estado === 'cerrado') s.cerrados++
      else if (t.estado === 'en_proceso') s.enProceso++
      else s.abiertos++

      if (tipo === 'solucionador' && t.tiempoAtencionMinutos != null) {
        s.tiempoPromMinutos = (s.tiempoPromMinutos === null ? 0 : s.tiempoPromMinutos) + t.tiempoAtencionMinutos
      }
    }
    // Calcular promedio de tiempo
    const list = Array.from(map.values())
    if (tipo === 'solucionador') {
      for (const s of list) {
        if (s.tiempoPromMinutos !== null && (s.resueltos + s.cerrados) > 0) {
          s.tiempoPromMinutos = s.tiempoPromMinutos / (s.resueltos + s.cerrados)
        } else {
          s.tiempoPromMinutos = null
        }
      }
    }
    return list.filter(s => s.nombre !== 'Sin asignar' || tipo === 'solicitante').sort((a, b) => b.total - a.total)
  }

  const stats = calcStats(tab === 'solicitantes' ? 'solicitante' : 'solucionador')
  const maxTotal = stats[0]?.total ?? 1

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTab('solucionadores')}
          className={clsx(
            'rounded-xl px-4 py-1.5 text-[0.78rem] font-semibold border transition-all',
            tab === 'solucionadores' ? 'bg-brand text-white border-brand' : 'bg-white text-ink-secondary border-surface-border hover:border-brand/40',
          )}
        >
          🛠 Solucionadores
        </button>
        <button
          onClick={() => setTab('solicitantes')}
          className={clsx(
            'rounded-xl px-4 py-1.5 text-[0.78rem] font-semibold border transition-all',
            tab === 'solicitantes' ? 'bg-brand text-white border-brand' : 'bg-white text-ink-secondary border-surface-border hover:border-brand/40',
          )}
        >
          👤 Solicitantes
        </button>
        <span className="ml-auto text-[0.72rem] text-ink-tertiary">{stats.length} persona{stats.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 flex-wrap text-[0.65rem] font-semibold">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-400 inline-block" />Resueltos</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-gray-400 inline-block" />Cerrados</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-amber-400 inline-block" />En proceso</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-brand/50 inline-block" />Abiertos</span>
      </div>

      {/* Grid de cards */}
      {stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-surface-border bg-white py-16 text-ink-tertiary">
          <BarChart2 className="h-10 w-10 text-surface-border" />
          <p className="text-sm">Sin datos</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stats.map((p) => (
            <ProductividadCard key={String(p.id)} p={p} maxTotal={maxTotal} tipo={tab === 'solicitantes' ? 'solicitante' : 'solucionador'} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Vista tabla ── */
function formatDuracion(minutos: number | null) {
  if (minutos === null || minutos === undefined) return '—'
  if (minutos < 60) return `${minutos}m`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function TablaTickets({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-white overflow-x-auto">
      <table className="w-full text-[0.78rem]">
        <thead>
          <tr className="border-b border-surface-border text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
            <th className="px-4 py-2.5 text-left">#</th>
            <th className="px-4 py-2.5 text-left">Título</th>
            <th className="px-4 py-2.5 text-left">Solicitante</th>
            <th className="px-4 py-2.5 text-left">Asignado a</th>
            <th className="px-4 py-2.5 text-left">Estado</th>
            <th className="px-4 py-2.5 text-left">Prioridad</th>
            <th className="px-4 py-2.5 text-left">Área</th>
            <th className="px-4 py-2.5 text-left">Creación</th>
            <th className="px-4 py-2.5 text-left">Cierre</th>
            <th className="px-4 py-2.5 text-left">T. Atención</th>
            <th className="px-4 py-2.5 text-left">SLA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border/60">
          {tickets.map((t) => (
            <tr key={t.id} className="hover:bg-surface transition-colors">
              <td className="px-4 py-2.5 text-ink-tertiary font-mono text-[0.7rem]">#{t.id}</td>
              <td className="px-4 py-2.5 max-w-[220px]">
                <span className="font-medium text-ink line-clamp-1">{t.titulo}</span>
              </td>
              <td className="px-4 py-2.5 text-ink-secondary whitespace-nowrap">{t.solicitanteNombre ?? '—'}</td>
              <td className="px-4 py-2.5 text-ink-secondary whitespace-nowrap">{t.asignadoNombre ?? <span className="text-ink-tertiary">Sin asignar</span>}</td>
              <td className="px-4 py-2.5">
                <span className={clsx('chip text-[0.62rem]', ESTADO_COLORS[t.estado])}>
                  {ESTADO_LABELS[t.estado]}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span className={clsx('chip text-[0.62rem]', PRIORIDAD_COLORS[t.prioridad as TicketPrioridad])}>
                  {t.prioridad}
                </span>
              </td>
              <td className="px-4 py-2.5 text-ink-secondary">{t.area}</td>
              <td className="px-4 py-2.5 text-ink-tertiary whitespace-nowrap text-[0.72rem]">
                <span className="block">{new Date(t.fechaCreacion).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                <span className="text-ink-tertiary">{new Date(t.fechaCreacion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap text-[0.72rem]">
                {t.fechaCierre ? (
                  <>
                    <span className="block text-ink-secondary">{new Date(t.fechaCierre).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                    <span className="text-ink-tertiary">{new Date(t.fechaCierre).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                  </>
                ) : (
                  <span className="text-gray-200">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-secondary whitespace-nowrap font-mono text-[0.7rem]">
                {formatDuracion(t.tiempoAtencionMinutos)}
              </td>
              <td className="px-4 py-2.5">
                {t.slaResolucion ? (
                  <span className={clsx('chip text-[0.62rem]', SLA_COLORS[t.slaResolucion])}>
                    {SLA_LABELS[t.slaResolucion]}
                  </span>
                ) : (
                  <span className="text-gray-300 text-[0.7rem]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tickets.length === 0 && (
        <p className="py-10 text-center text-[0.75rem] text-ink-tertiary">Sin resultados</p>
      )}
    </div>
  )
}

/* ── Página principal ── */
export function TicketsPage() {
  const [searchParams] = useSearchParams()
  const autoOpenId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<TicketEstado | 'todos'>('abierto')
  const [showNuevo, setShowNuevo] = useState(false)
  const [vista, setVista] = useState<'lista' | 'tabla' | 'productividad'>('lista')
  const [selected, setSelected] = useState<Ticket | null>(null)

  const { data: tickets = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => ticketsService.getAll(),
  })

  // Al llegar con ?id= en la URL, abrir ese ticket directamente (sin efecto: se deriva del render)
  const [autoOpenDismissed, setAutoOpenDismissed] = useState(false)
  const autoOpenTicket = !autoOpenDismissed && autoOpenId != null
    ? tickets.find((x) => x.id === autoOpenId) ?? null
    : null
  const activeTicket = selected ?? autoOpenTicket

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase()
    const matchSearch =
      t.titulo.toLowerCase().includes(q) ||
      String(t.id).includes(q) ||
      (t.solicitanteNombre ?? '').toLowerCase().includes(q)
    const matchEstado = filtroEstado === 'todos' || t.estado === filtroEstado
    return matchSearch && matchEstado
  })

  const stats = [
    { label: 'Abiertos',   val: tickets.filter((t) => t.estado === 'abierto').length,    icon: CircleDot    },
    { label: 'En proceso', val: tickets.filter((t) => t.estado === 'en_proceso').length, icon: Clock        },
    { label: 'Resueltos',  val: tickets.filter((t) => t.estado === 'resuelto').length,   icon: CheckCircle2 },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header banner ── */}
      <div className="rounded-2xl border border-surface-border bg-white overflow-hidden">
        <div className="relative overflow-hidden px-6 py-5" style={{ background: 'linear-gradient(135deg, #0B1730 0%, #14274E 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute right-20 bottom-0 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <LifeBuoy className="h-5 w-5 text-brand-muted" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Soporte técnico</h1>
                <p className="mt-0.5 text-xs text-white/50">{tickets.length} tickets en total</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Toggle vista */}
              <div className="flex rounded-lg bg-white/10 p-0.5 gap-0.5">
                <button
                  onClick={() => setVista('lista')}
                  title="Vista lista"
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    vista === 'lista' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80',
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setVista('tabla')}
                  title="Vista tabla"
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    vista === 'tabla' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80',
                  )}
                >
                  <Table2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setVista('productividad')}
                  title="Vista productividad"
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    vista === 'productividad' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80',
                  )}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => refetch()}
                className={clsx(
                  'flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors',
                  isRefetching && 'animate-spin',
                )}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Link
                to="/tickets/sla"
                title="Configurar SLA"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                <Timer className="h-3.5 w-3.5" />
              </Link>
              <Button
                onClick={() => setShowNuevo(true)}
                className="bg-white !text-brand hover:bg-surface !shadow-none border-0 text-[0.78rem] py-1.5 px-3"
              >
                <Plus className="h-3.5 w-3.5" /> Nuevo ticket
              </Button>
            </div>
          </div>
        </div>

        {/* Búsqueda + filtros */}
        <div className="flex flex-col gap-3 border-b border-surface-border px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, #ID o solicitante..."
              className="field py-2 pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {(['todos', 'abierto', 'asignado', 'en_proceso', 'resuelto', 'cerrado'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setFiltroEstado(e)}
                className={clsx(
                  'whitespace-nowrap rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-all',
                  filtroEstado === e
                    ? e === 'todos'
                      ? 'bg-brand text-white'
                      : clsx(ESTADO_COLORS[e as TicketEstado], 'ring-1 ring-inset ring-current/30')
                    : 'bg-surface text-ink-tertiary hover:bg-surface-border/60',
                )}
              >
                {e === 'todos' ? 'Todos' : ESTADO_LABELS[e as TicketEstado]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-surface-border bg-white p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-light">
              <s.icon className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-xl font-bold text-ink leading-none">{s.val}</p>
              <p className="text-[0.7rem] text-ink-tertiary mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Contenido ── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-surface-border bg-white py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light">
            <MessageCircle className="h-7 w-7 text-brand" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-ink">Sin tickets</p>
            <p className="text-xs text-ink-tertiary mt-0.5">
              {(search || filtroEstado !== 'abierto')
                ? 'No hay tickets que coincidan con tu búsqueda'
                : 'No hay tickets registrados aún'}
            </p>
          </div>
          {(search || filtroEstado !== 'abierto') && (
            <button
              onClick={() => { setSearch(''); setFiltroEstado('abierto') }}
              className="text-xs font-medium text-brand hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : vista === 'productividad' ? (
        <VistaProductividad tickets={tickets} />
      ) : vista === 'tabla' ? (
        <>
          <p className="text-[0.72rem] text-ink-tertiary">
            {filtered.length === tickets.length
              ? `${tickets.length} tickets`
              : `${filtered.length} de ${tickets.length} tickets`}
          </p>
          <TablaTickets tickets={filtered} />
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.72rem] text-ink-tertiary">
            {filtered.length === tickets.length
              ? `${tickets.length} tickets`
              : `${filtered.length} de ${tickets.length} tickets`}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => <TicketCard key={t.id} ticket={t} onOpen={() => setSelected(t)} />)}
          </div>
        </div>
      )}

      {showNuevo && <NuevoTicketModal onClose={() => setShowNuevo(false)} />}
      {activeTicket && (
        <TicketDetalleModal
          ticket={tickets.find((t) => t.id === activeTicket.id) ?? activeTicket}
          onClose={() => { setSelected(null); setAutoOpenDismissed(true) }}
        />
      )}
    </div>
  )
}
