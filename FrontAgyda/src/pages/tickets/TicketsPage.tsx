import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, RefreshCw, MessageCircle,
  Send, LifeBuoy, Clock, CheckCircle2, CircleDot, UserCheck, Star,
  LayoutList, Table2, BarChart2, Timer, Paperclip, Trash2, Users, Download, Columns3, Gauge,
} from 'lucide-react'
import { ticketsService } from '@/services/tickets.service'
import { FichaUsuarioModal } from './FichaUsuarioModal'
import { kbService, combinarContenidoKb } from '@/services/kb.service'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  type Ticket, type TicketEstado, type TicketPrioridad,
  type TicketClasificacion, type TicketImpacto, type TicketUrgencia, type TicketMotivoEspera,
  PRIORIDAD_COLORS, PRIORIDAD_LABELS, ESTADO_COLORS, ESTADO_LABELS, SLA_COLORS, SLA_LABELS,
  CANAL_ORIGEN_LABELS, calcularPrioridad,
} from '@/types/ticket.types'
import { catalogosTiService } from '@/services/catalogosTi.service'
import { activosGeneralesService } from '@/services/activosGenerales.service'
import { camposPersonalizadosService } from '@/services/camposPersonalizados.service'
import { SlaTab } from '@/pages/configuracion/tecnologia/SlaTab'
import { KpisTab } from '@/pages/tickets/KpisTab'
import { TecnicosTab } from '@/pages/configuracion/tecnologia/TecnicosTab'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-4 animate-pulse space-y-2">
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
  const [form, setForm] = useState({
    titulo: '', descripcion: '', area: 'TI', asignadoA: '',
    clasificacion: '' as TicketClasificacion | '',
    categoria: '', subcategoria: '', elemento: '',
    sede: '', activoAfectado: '', servicioAfectado: '',
    activoAfectadoId: '' as number | '', servicioAfectadoId: '' as number | '',
    impacto: '' as TicketImpacto | '', urgencia: '' as TicketUrgencia | '',
  })
  const [valoresCampos, setValoresCampos] = useState<Record<number, string>>({})
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null)

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ['staff-ti'],
    queryFn: () => ticketsService.getStaffTI(),
    staleTime: 60_000,
  })

  const { data: categorias = [] } = useQuery({
    queryKey: ['catalogos-ti-categorias'],
    queryFn: () => catalogosTiService.getCategorias(),
    staleTime: 5 * 60_000,
  })
  const { data: sedes = [] } = useQuery({
    queryKey: ['catalogos-ti-sedes'],
    queryFn: () => catalogosTiService.getSedes(),
    staleTime: 5 * 60_000,
  })
  const { data: servicios = [] } = useQuery({
    queryKey: ['catalogos-ti-servicios'],
    queryFn: () => catalogosTiService.getServicios(),
    staleTime: 5 * 60_000,
  })
  const { data: activosGenerales = [] } = useQuery({
    queryKey: ['activos-generales'],
    queryFn: () => activosGeneralesService.getActivosGenerales(),
    staleTime: 5 * 60_000,
  })
  const { data: clasificaciones = [] } = useQuery({
    queryKey: ['ticket-clasificaciones'],
    queryFn: () => catalogosTiService.getClasificaciones(),
    staleTime: 5 * 60_000,
  })
  const { data: impactos = [] } = useQuery({
    queryKey: ['ticket-impactos'],
    queryFn: () => catalogosTiService.getImpactos(),
    staleTime: 5 * 60_000,
  })
  const { data: urgencias = [] } = useQuery({
    queryKey: ['ticket-urgencias'],
    queryFn: () => catalogosTiService.getUrgencias(),
    staleTime: 5 * 60_000,
  })
  const { data: matrizPrioridad = [] } = useQuery({
    queryKey: ['ticket-matriz-prioridad'],
    queryFn: () => catalogosTiService.getMatrizPrioridad(),
    staleTime: 5 * 60_000,
  })
  const prioridadCalculada = (
    (form.impacto &&
      form.urgencia &&
      matrizPrioridad.find((c) => c.impacto === form.impacto && c.urgencia === form.urgencia)?.prioridad) ||
    calcularPrioridad(form.impacto, form.urgencia)
  ) as TicketPrioridad | null | '' | undefined
  const subcategoriasDisponibles = categorias.find((c) => c.nombre === form.categoria)?.subcategorias ?? []
  const categoriaSeleccionadaId = categorias.find((c) => c.nombre === form.categoria)?.id ?? null
  const elementosDisponibles = subcategoriasDisponibles.find((s) => s.nombre === form.subcategoria)?.elementos ?? []

  const { data: camposPersonalizadosDisponibles = [] } = useQuery({
    queryKey: ['campos-personalizados-por-categoria', categoriaSeleccionadaId],
    queryFn: () => camposPersonalizadosService.getCamposPorCategoria(categoriaSeleccionadaId!),
    enabled: categoriaSeleccionadaId != null,
  })

  const crear = useMutation({
    mutationFn: () => ticketsService.create({
      titulo: form.titulo,
      descripcion: form.descripcion,
      area: form.area,
      asignadoA: form.asignadoA ? Number(form.asignadoA) : undefined,
      clasificacion: form.clasificacion || undefined,
      categoria: form.categoria || undefined,
      subcategoria: form.subcategoria || undefined,
      elemento: form.elemento || undefined,
      sede: form.sede || undefined,
      activoAfectado: form.activoAfectado || undefined,
      servicioAfectado: form.servicioAfectado || undefined,
      activoAfectadoId: form.activoAfectadoId || undefined,
      servicioAfectadoId: form.servicioAfectadoId || undefined,
      impacto: form.impacto || undefined,
      urgencia: form.urgencia || undefined,
      camposPersonalizados: Object.keys(valoresCampos).length ? valoresCampos : undefined,
    }),
    onSuccess: async (nuevoTicket) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      // La evidencia se sube en un segundo request al mismo endpoint que ya
      // existe para adjuntar evidencia a un ticket existente (uploadEvidencia)
      // — no hay forma de mandar el archivo en el mismo POST de creación
      // porque el ticket todavía no tiene ID hasta que el primero responde.
      if (evidenciaFile) {
        try {
          await ticketsService.uploadEvidencia(nuevoTicket.id, evidenciaFile)
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status
          toast.error(
            status === 403
              ? 'El ticket se creó, pero tu perfil no tiene permiso para adjuntar evidencia — pídele a un técnico que la suba desde el detalle del ticket'
              : 'El ticket se creó, pero no se pudo subir la evidencia adjunta',
          )
        }
      }
      toast.success('Ticket creado')
      onClose()
    },
    onError: () => toast.error('No se pudo crear el ticket'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo ticket" size="md">
      <div className="space-y-4">
        {/* ── Esencial ── */}
        <div className="space-y-4 border-b-2 border-brand/10 pb-4">
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
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Área</label>
              <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="field">
                <option value="TI">TI</option>
                <option value="ST">ST</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Categoría</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value, subcategoria: '', elemento: '' })}
                className="field"
              >
                <option value="">Seleccionar...</option>
                {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Clasificación adicional ── */}
        <div className="rounded-xl border border-surface-border bg-surface/60 p-3.5">
          <p className="mb-3 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Clasificación adicional
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Clasificación</label>
                <select value={form.clasificacion} onChange={(e) => setForm({ ...form, clasificacion: e.target.value as TicketClasificacion })} className="field">
                  <option value="">Seleccionar...</option>
                  {clasificaciones.map((c) => (
                    <option key={c.id} value={c.clave}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Subcategoría</label>
                <select
                  value={form.subcategoria}
                  onChange={(e) => setForm({ ...form, subcategoria: e.target.value, elemento: '' })}
                  className="field"
                  disabled={!form.categoria}
                >
                  <option value="">{form.categoria ? 'Seleccionar...' : 'Elegí una categoría primero'}</option>
                  {subcategoriasDisponibles.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            {elementosDisponibles.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Elemento</label>
                <select
                  value={form.elemento}
                  onChange={(e) => setForm({ ...form, elemento: e.target.value })}
                  className="field"
                >
                  <option value="">Ninguno / no aplica</option>
                  {elementosDisponibles.map((el) => <option key={el.id} value={el.nombre}>{el.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Servicio afectado</label>
              <select
                value={form.servicioAfectadoId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : ''
                  const servicio = servicios.find((s) => s.id === id)
                  setForm({ ...form, servicioAfectadoId: id, servicioAfectado: servicio?.nombre || '' })
                }}
                className="field"
              >
                <option value="">Ninguno / no aplica</option>
                {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>

            {camposPersonalizadosDisponibles.length > 0 && camposPersonalizadosDisponibles.map((campo) => (
              <div key={campo.id}>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                  {campo.nombre} {campo.requerido && <span className="text-red-500">*</span>}
                </label>
                {campo.tipo === 'lista' ? (
                  <select
                    value={valoresCampos[campo.id] ?? ''}
                    onChange={(e) => setValoresCampos((v) => ({ ...v, [campo.id]: e.target.value }))}
                    className="field"
                  >
                    <option value="">Seleccionar...</option>
                    {campo.opciones.map((op) => <option key={op} value={op}>{op}</option>)}
                  </select>
                ) : (
                  <input
                    type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'fecha' ? 'date' : 'text'}
                    value={valoresCampos[campo.id] ?? ''}
                    onChange={(e) => setValoresCampos((v) => ({ ...v, [campo.id]: e.target.value }))}
                    className="field"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Ubicación ── */}
        <div className="rounded-xl border border-surface-border bg-surface/60 p-3.5">
          <p className="mb-3 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Ubicación
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Sede</label>
              <select value={form.sede} onChange={(e) => setForm({ ...form, sede: e.target.value })} className="field">
                <option value="">Seleccionar...</option>
                {sedes.map((s) => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Activo afectado</label>
              <select
                value={form.activoAfectadoId}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : ''
                  const activo = activosGenerales.find((a) => a.id === id)
                  setForm({ ...form, activoAfectadoId: id, activoAfectado: activo?.nombreEquipo || '' })
                }}
                className="field"
              >
                <option value="">Ninguno / no aplica</option>
                {activosGenerales.map((a) => {
                  const dueno = a.asignadoNombre
                    ? `${a.asignadoNombre}${a.asignadoId ? ` #${a.asignadoId}` : ''}`
                    : 'Sin asignar'
                  const area = a.departamento || 'Sin área'
                  return (
                    <option key={a.id} value={a.id}>
                      {a.nombreEquipo || `Activo #${a.id}`}{a.numeroSerie ? ` (${a.numeroSerie})` : ''} — {dueno} · {area}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>

        {/* ── Prioridad y asignación ── */}
        <div className="rounded-xl border border-surface-border bg-surface/60 p-3.5">
          <p className="mb-3 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Prioridad y asignación
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Impacto</label>
                <select value={form.impacto} onChange={(e) => setForm({ ...form, impacto: e.target.value as TicketImpacto })} className="field">
                  <option value="">Seleccionar...</option>
                  {impactos.map((i) => (
                    <option key={i.id} value={i.clave}>{i.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Urgencia</label>
                <select value={form.urgencia} onChange={(e) => setForm({ ...form, urgencia: e.target.value as TicketUrgencia })} className="field">
                  <option value="">Seleccionar...</option>
                  {urgencias.map((u) => (
                    <option key={u.id} value={u.clave}>{u.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {prioridadCalculada && (
              <div className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', PRIORIDAD_COLORS[prioridadCalculada])}>
                <span className="font-semibold">Prioridad resultante:</span>
                <span>{PRIORIDAD_LABELS[prioridadCalculada]}</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Asignar a</label>
              {loadingStaff ? (
                <div className="field flex items-center gap-2 text-ink-tertiary text-sm">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface-border border-t-brand inline-block" />
                  Cargando...
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-surface-border bg-white p-2">
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

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Evidencia (opcional)</label>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:border-teal-400 w-fit">
                <Paperclip className="h-3.5 w-3.5" />
                {evidenciaFile ? evidenciaFile.name : 'Adjuntar archivo'}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setEvidenciaFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
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

  /* Solo se puede calificar después de confirmar que la solución funcionó */
  if (ticket.validadoUsuario !== true) return null

  /* Este ticket no amerita encuesta según la regla configurada por prioridad/área
     (Configuración > Encuestas) — no se ofrece, aunque ya haya sido validado. */
  if (!ticket.encuestaAplica) return null

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

/* ── Panel de validación de solución (solicitante) ── */
function PanelValidacion({ ticket }: { ticket: Ticket }) {
  const qc = useQueryClient()
  const [rechazando, setRechazando] = useState(false)
  const [comentario, setComentario] = useState('')

  const validar = useMutation({
    mutationFn: (confirma: boolean) => ticketsService.validar(ticket.id, confirma, comentario || undefined),
    onSuccess: (_data, confirma) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(confirma ? '¡Gracias por confirmar!' : 'Ticket reabierto, el técnico fue notificado')
    },
    onError: () => toast.error('Error al registrar tu respuesta'),
  })

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
      <p className="text-[0.75rem] font-semibold text-blue-800">¿El servicio ya funciona correctamente?</p>
      {(ticket.diagnostico || ticket.accionesRealizadas) && (
        <div className="rounded-lg bg-white/60 px-3 py-2 text-[0.72rem] text-ink-secondary space-y-1">
          {ticket.diagnostico && <p><span className="font-semibold">Diagnóstico:</span> {ticket.diagnostico}</p>}
          {ticket.accionesRealizadas && <p><span className="font-semibold">Acciones:</span> {ticket.accionesRealizadas}</p>}
        </div>
      )}
      {!rechazando ? (
        <div className="flex gap-2">
          <Button size="sm" isLoading={validar.isPending} onClick={() => validar.mutate(true)}>Sí, funciona</Button>
          <Button size="sm" variant="ghost" onClick={() => setRechazando(true)}>No, sigue el problema</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="field py-2 text-sm"
            placeholder="Cuéntanos qué sigue fallando..."
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" isLoading={validar.isPending} onClick={() => validar.mutate(false)}>Reabrir ticket</Button>
            <Button size="sm" variant="ghost" onClick={() => setRechazando(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Panel de resolución estructurada (TI) ── */
function PanelResolver({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const qc = useQueryClient()
  const [diagnostico, setDiagnostico] = useState('')
  const [accionesRealizadas, setAccionesRealizadas] = useState('')
  const [causaRaiz, setCausaRaiz] = useState('')
  const [codigoCierre, setCodigoCierre] = useState<string>('')
  const [buscarKb, setBuscarKb] = useState('')
  const [articuloKbId, setArticuloKbId] = useState<number | null>(null)
  const [modoKb, setModoKb] = useState<'vincular' | 'crear' | null>(null)
  const [nuevoTituloKb, setNuevoTituloKb] = useState('')
  const [nuevoProblemaKb, setNuevoProblemaKb] = useState('')
  const [nuevoSolucionKb, setNuevoSolucionKb] = useState('')
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null)

  const { data: codigos = [] } = useQuery({
    queryKey: ['ticket-codigos-cierre'],
    queryFn: () => ticketsService.getCodigosCierre(),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: articulosKb = [] } = useQuery({
    queryKey: ['kb-articulos', buscarKb, ticket.categoria],
    queryFn: () => kbService.getArticulos({ q: buscarKb || undefined, categoria: ticket.categoria || undefined }),
    staleTime: 30_000,
  })

  const resolver = useMutation({
    mutationFn: () => ticketsService.resolver(ticket.id, {
      diagnostico, accionesRealizadas, causaRaiz: causaRaiz || undefined,
      codigoCierre: codigoCierre || undefined,
      articuloKbId: modoKb === 'vincular' ? (articuloKbId ?? undefined) : undefined,
      nuevoArticuloKb: modoKb === 'crear' && nuevoTituloKb.trim() && nuevoSolucionKb.trim()
        ? { titulo: nuevoTituloKb.trim(), contenido: combinarContenidoKb(nuevoProblemaKb, nuevoSolucionKb), categoria: ticket.categoria || undefined }
        : undefined,
    }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      // Mismo endpoint que ya existe para adjuntar evidencia a un ticket
      // existente — resolverTicket no acepta multipart, así que se sube en
      // un segundo request justo después de marcar como resuelto.
      if (evidenciaFile) {
        try {
          await ticketsService.uploadEvidencia(ticket.id, evidenciaFile)
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status
          toast.error(
            status === 403
              ? 'El ticket se resolvió, pero tu perfil no tiene permiso para adjuntar evidencia'
              : 'El ticket se resolvió, pero no se pudo subir la evidencia de la solución',
          )
        }
      }
      toast.success('Ticket marcado como resuelto')
      onDone()
    },
    onError: () => toast.error('Error al resolver el ticket'),
  })

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-3">
      <p className="text-[0.72rem] font-semibold text-emerald-800 uppercase tracking-wide">Marcar como resuelto</p>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">Diagnóstico</label>
        <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={2} className="field resize-none text-sm" placeholder="¿Cuál era el problema?" />
      </div>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">Acciones realizadas</label>
        <textarea value={accionesRealizadas} onChange={(e) => setAccionesRealizadas(e.target.value)} rows={2} className="field resize-none text-sm" placeholder="¿Qué se hizo para resolverlo?" />
      </div>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">Causa raíz (opcional)</label>
        <textarea value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} rows={2} className="field resize-none text-sm" placeholder="Causa raíz, si aplica" />
      </div>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">Código de cierre</label>
        <select value={codigoCierre} onChange={(e) => setCodigoCierre(e.target.value)} className="field text-sm">
          <option value="">Seleccionar...</option>
          {codigos.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">ArdaWiki (opcional)</label>
        <div className="mb-1.5 flex gap-1.5">
          <button
            type="button"
            className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition-colors', modoKb === 'vincular' ? 'bg-emerald-600 text-white' : 'bg-card text-ink-secondary border border-emerald-200')}
            onClick={() => setModoKb(modoKb === 'vincular' ? null : 'vincular')}
          >
            Vincular existente
          </button>
          <button
            type="button"
            className={clsx('rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition-colors', modoKb === 'crear' ? 'bg-emerald-600 text-white' : 'bg-card text-ink-secondary border border-emerald-200')}
            onClick={() => setModoKb(modoKb === 'crear' ? null : 'crear')}
          >
            Crear artículo nuevo
          </button>
        </div>

        {modoKb === 'vincular' && (
          <>
            <input
              value={buscarKb}
              onChange={(e) => setBuscarKb(e.target.value)}
              className="field text-sm mb-1.5"
              placeholder="Buscar artículo..."
            />
            {articulosKb.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto rounded-lg border border-emerald-200 bg-card p-1.5">
                {articulosKb.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => setArticuloKbId(articuloKbId === a.id ? null : a.id)}
                    className={clsx(
                      'cursor-pointer rounded-md px-2 py-1.5 text-[0.72rem] transition-colors',
                      articuloKbId === a.id ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'text-ink-secondary hover:bg-surface',
                    )}
                  >
                    {a.titulo}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {modoKb === 'crear' && (
          <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-card p-2">
            <input
              value={nuevoTituloKb}
              onChange={(e) => setNuevoTituloKb(e.target.value)}
              className="field text-sm"
              placeholder="Título del artículo"
            />
            <textarea
              value={nuevoProblemaKb}
              onChange={(e) => setNuevoProblemaKb(e.target.value)}
              rows={2}
              className="field resize-none text-sm"
              placeholder="Problema: ¿qué le pasaba al usuario?"
            />
            <textarea
              value={nuevoSolucionKb}
              onChange={(e) => setNuevoSolucionKb(e.target.value)}
              rows={3}
              className="field resize-none text-sm"
              placeholder="Solución: ¿cómo se resolvió?"
            />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-ink-secondary uppercase tracking-wide">Evidencia de la solución (opcional)</label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:border-teal-400 w-fit">
          <Paperclip className="h-3.5 w-3.5" />
          {evidenciaFile ? evidenciaFile.name : 'Adjuntar archivo'}
          <input
            type="file"
            className="hidden"
            onChange={(e) => setEvidenciaFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <Button
        size="sm"
        isLoading={resolver.isPending}
        disabled={!diagnostico.trim() || !accionesRealizadas.trim()}
        onClick={() => resolver.mutate()}
      >
        Marcar como resuelto
      </Button>
    </div>
  )
}

/* ── Panel de escalamiento N1→N2→N3 (TI/AD) ── */
function PanelEscalar({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [proveedorId, setProveedorId] = useState<number | ''>('')
  const siguienteNivel = Math.min(ticket.nivelActual + 1, 3)

  // Solo N3 puede involucrar a un proveedor externo (Especialista/Desarrollo
  // interno vs. Proveedor — ver diagrama de Soporte por Niveles).
  const { data: proveedores = [] } = useQuery({
    queryKey: ['catalogos-ti-proveedores'],
    queryFn: () => catalogosTiService.getProveedores(),
    enabled: siguienteNivel === 3,
  })

  const escalar = useMutation({
    mutationFn: () => ticketsService.escalar(ticket.id, siguienteNivel, motivo || undefined, proveedorId || undefined),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success(`Ticket escalado a Nivel ${siguienteNivel}${r.proveedorNombre ? ` — ${r.proveedorNombre}` : ''}`)
      onDone()
    },
    onError: () => toast.error('Error al escalar el ticket'),
  })

  if (ticket.nivelActual >= 3) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-[0.72rem] text-ink-tertiary">
        Este ticket ya está en el nivel máximo de soporte (N3).
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 space-y-3">
      <p className="text-[0.72rem] font-semibold text-orange-800 uppercase tracking-wide">
        Escalar de Nivel {ticket.nivelActual} a Nivel {siguienteNivel}
      </p>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="field py-2 text-sm"
        placeholder="Motivo del escalamiento (opcional)"
      />
      {siguienteNivel === 3 && (
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold text-orange-800 uppercase tracking-wide">Proveedor externo (opcional)</label>
          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value ? Number(e.target.value) : '')}
            className="field py-2 text-sm"
          >
            <option value="">Ninguno / se atiende internamente</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      )}
      <Button size="sm" isLoading={escalar.isPending} onClick={() => escalar.mutate()}>
        Escalar a Nivel {siguienteNivel}
      </Button>
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
                  : 'border-purple-200 bg-card hover:border-purple-300',
              )}
            >
              <div className={clsx(
                'h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                seleccionado === s.usuarioId ? 'border-purple-500 bg-purple-500' : 'border-surface-border',
              )}>
                {seleccionado === s.usuarioId && <div className="h-1.5 w-1.5 rounded-full bg-card" />}
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
  escalado:       { label: 'Escalado de nivel',     color: 'text-orange-600',  dot: 'bg-orange-500'  },
  validado:       { label: 'Solución confirmada',   color: 'text-blue-600',    dot: 'bg-blue-500'    },
  reabierto:      { label: 'Ticket reabierto',      color: 'text-red-600',     dot: 'bg-red-500'     },
  en_espera:      { label: 'Puesto en espera',      color: 'text-amber-600',   dot: 'bg-amber-500'   },
  salio_espera:   { label: 'Retomado',              color: 'text-emerald-600', dot: 'bg-emerald-500' },
}

/* ── Vista Kanban: columnas por estado, cada tarjeta abre el detalle completo
   para cambiar de estado ahí (reutiliza los flujos de resolver/espera/validar
   ya existentes en vez de duplicar esa lógica en la tarjeta). ── */
const KANBAN_COLUMNAS: TicketEstado[] = ['abierto', 'asignado', 'en_proceso', 'en_espera', 'resuelto', 'cerrado']

function KanbanCard({ ticket, onOpen }: { ticket: Ticket; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-1.5 rounded-xl border border-surface-border bg-card p-3 text-left transition-colors hover:border-brand/30"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[0.62rem] font-mono font-bold text-ink-tertiary">#{ticket.id}</span>
        <span className={clsx('chip text-[0.6rem]', PRIORIDAD_COLORS[ticket.prioridad])}>{ticket.prioridad}</span>
      </div>
      <p className="line-clamp-2 text-[0.78rem] font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
        {ticket.titulo}
      </p>
      <p className="line-clamp-1 text-[0.65rem] text-ink-tertiary">{ticket.solicitanteNombre}</p>
      {ticket.asignadoNombre && (
        <p className="line-clamp-1 text-[0.62rem] text-ink-tertiary">→ {ticket.asignadoNombre}</p>
      )}
      {ticket.slaResolucion && (
        <span className={clsx('chip w-fit text-[0.58rem]', SLA_COLORS[ticket.slaResolucion])}>
          {SLA_LABELS[ticket.slaResolucion]}
        </span>
      )}
    </button>
  )
}

function VistaKanban({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (t: Ticket) => void }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNAS.map((estado) => {
        const enColumna = tickets.filter((t) => t.estado === estado)
        return (
          <div key={estado} className="flex w-64 flex-shrink-0 flex-col rounded-2xl border border-surface-border bg-surface/40">
            <div className={clsx('flex items-center justify-between rounded-t-2xl border-b border-surface-border px-3 py-2', ESTADO_COLORS[estado])}>
              <span className="text-[0.72rem] font-semibold">{ESTADO_LABELS[estado]}</span>
              <span className="text-[0.68rem] font-bold">{enColumna.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '65vh' }}>
              {enColumna.length === 0 ? (
                <p className="py-6 text-center text-[0.68rem] text-ink-tertiary">Sin tickets</p>
              ) : (
                enColumna.map((t) => <KanbanCard key={t.id} ticket={t} onOpen={() => onOpen(t)} />)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
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
      className="group flex flex-col items-center gap-2.5 rounded-2xl border border-surface-border bg-card px-4 py-5 text-center transition-colors hover:border-brand/30"
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
function fmtDuracionMinutos(min: number | null): string {
  if (min === null || min === undefined) return '—'
  if (min <= 0) return '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const mm = min % 60
  return mm > 0 ? `${h} h ${mm} min` : `${h} h`
}

/* ── Resumen de cierre (técnico, código, causa raíz, tiempos, SLA, calificación) ── */
function ResumenCierre({ ticket }: { ticket: Ticket }) {
  const fecha = ticket.fechaCierre ?? ticket.fechaResolucionPropuesta
  const fechaFmt = fecha
    ? new Date(fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  // tiempoAtencionMinutos solo se calcula en el backend hasta el CIERRE real
  // (se usa también en reportes de tiempo promedio); mientras el ticket está
  // "resuelto" pero no cerrado, se estima aquí con la fecha de resolución.
  const tiempoMinutos = ticket.tiempoAtencionMinutos ?? (
    fecha ? Math.round((new Date(fecha).getTime() - new Date(ticket.fechaCreacion).getTime()) / 60000) : null
  )

  const { data: articuloVinculado } = useQuery({
    queryKey: ['kb-articulo', ticket.articuloKbId],
    queryFn: () => kbService.getById(ticket.articuloKbId!),
    enabled: ticket.articuloKbId != null,
    staleTime: 5 * 60_000,
  })

  return (
    <div className="rounded-xl border border-surface-border bg-surface px-4 py-3 space-y-2">
      <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-tertiary">Resumen de cierre</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.78rem]">
        <div><span className="text-ink-tertiary">Técnico:</span> <span className="text-ink font-medium">{ticket.asignadoNombre ?? '—'}</span></div>
        <div><span className="text-ink-tertiary">Fecha:</span> <span className="text-ink font-medium">{fechaFmt ?? '—'}</span></div>
        <div><span className="text-ink-tertiary">Código de cierre:</span> <span className="text-ink font-medium">{ticket.codigoCierre ?? '—'}</span></div>
        <div><span className="text-ink-tertiary">Tiempo total:</span> <span className="text-ink font-medium">{fmtDuracionMinutos(tiempoMinutos)}</span></div>
      </div>
      {ticket.causaRaiz && (
        <div className="text-[0.78rem]"><span className="text-ink-tertiary">Causa raíz:</span> <span className="text-ink">{ticket.causaRaiz}</span></div>
      )}
      {articuloVinculado && (
        <div className="text-[0.78rem]">
          <span className="text-ink-tertiary">ArdaWiki:</span>{' '}
          <Link
            to={`/kb?q=${encodeURIComponent(articuloVinculado.titulo)}`}
            className="text-brand underline decoration-dotted hover:text-brand/80"
            title="Ver artículo en ArdaWiki"
          >
            {articuloVinculado.titulo}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {ticket.slaResolucion && (
          <span className={clsx('chip text-[0.62rem]', SLA_COLORS[ticket.slaResolucion])}>
            SLA resolución: {SLA_LABELS[ticket.slaResolucion]}
          </span>
        )}
        {ticket.rating !== null && (
          <span className="flex items-center gap-1 text-[0.72rem] text-ink-tertiary">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={clsx('h-3 w-3', n <= ticket.rating! ? 'fill-yellow-400 text-yellow-400' : 'text-ink-tertiary')} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Panel de evidencias (subir/ver/eliminar) ── */
function PanelEvidencias({ ticket, isTI, userId }: { ticket: Ticket; isTI: boolean; userId: number | null }) {
  const qc = useQueryClient()

  const { data: historial = [] } = useQuery({
    queryKey: ['ticket-historial', ticket.id],
    queryFn: () => ticketsService.getHistorial(ticket.id),
  })
  const evidencias = historial.filter((h) => h.tipo === 'evidencia')

  const subir = useMutation({
    mutationFn: (file: File) => ticketsService.uploadEvidencia(ticket.id, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-historial', ticket.id] })
      toast.success('Evidencia subida')
    },
    onError: () => toast.error('Error al subir evidencia'),
  })

  const eliminar = useMutation({
    mutationFn: (histId: number) => ticketsService.deleteEvidencia(ticket.id, histId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-historial', ticket.id] })
      toast.success('Evidencia eliminada')
    },
    onError: () => toast.error('Error al eliminar evidencia'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) subir.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-tertiary">Evidencias</p>
        {ticket.estado !== 'cerrado' && (
          <label className="flex cursor-pointer items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[0.68rem] font-semibold text-teal-700 hover:border-teal-400">
            <Paperclip className="h-3 w-3" /> Adjuntar
            <input type="file" className="hidden" onChange={handleFile} disabled={subir.isPending} />
          </label>
        )}
      </div>
      {evidencias.length === 0 ? (
        <p className="text-[0.72rem] text-ink-tertiary italic">Sin evidencias adjuntas</p>
      ) : (
        <ul className="space-y-1">
          {evidencias.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-2 rounded-lg bg-card border border-surface-border px-2.5 py-1.5">
              <a href={ev.detalle ?? '#'} target="_blank" rel="noreferrer" className="truncate text-[0.72rem] text-brand hover:underline">
                {ev.detalle?.split('/').pop() ?? `Evidencia #${ev.id}`}
              </a>
              {(isTI || userId === ev.userId) && (
                <button onClick={() => eliminar.mutate(ev.id)} className="text-ink-tertiary hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TicketDetalleModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const [comentario, setComentario] = useState('')
  const [showTransferir, setShowTransferir] = useState(false)
  const [showEscalar, setShowEscalar] = useState(false)
  const [showResolver, setShowResolver] = useState(false)
  const [showEspera, setShowEspera] = useState(false)
  const [showFichaUsuario, setShowFichaUsuario] = useState(false)
  const [tab, setTab] = useState<'comentarios' | 'historial'>('comentarios')
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isTI  = ['AD', 'TI', 'ST'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
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

  const { data: motivosEspera = [] } = useQuery({
    queryKey: ['ticket-motivos-espera'],
    queryFn: () => catalogosTiService.getMotivosEspera(),
    staleTime: 5 * 60_000,
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

  const ponerEnEspera = useMutation({
    mutationFn: (motivo: TicketMotivoEspera) => ticketsService.ponerEnEspera(ticket.id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Ticket puesto en espera')
      setShowEspera(false)
    },
    onError: () => toast.error('Error al poner el ticket en espera'),
  })

  const salirDeEspera = useMutation({
    mutationFn: () => ticketsService.salirDeEspera(ticket.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      toast.success('Ticket retomado')
    },
    onError: () => toast.error('Error al salir de espera'),
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
    <>
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
          <span className="chip bg-surface text-ink-secondary text-[0.65rem]">N{ticket.nivelActual}</span>
          {ticket.canalOrigen && (
            <span className="chip bg-surface text-ink-secondary text-[0.65rem]" title="Canal de origen">
              {CANAL_ORIGEN_LABELS[ticket.canalOrigen]}
            </span>
          )}
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
          {ticket.estado === 'cerrado' && ticket.minutosTrabajados !== null && (
            <span className="chip bg-surface text-ink-secondary text-[0.65rem]" title="Tiempo trabajado (creación → cierre, sin contar espera)">
              {ticket.minutosTrabajados < 60
                ? `${ticket.minutosTrabajados} min trabajados`
                : `${(ticket.minutosTrabajados / 60).toFixed(1)} h trabajadas`}
            </span>
          )}
          {ticket.chatRelacionadoId && (
            <Link
              to="/livechat"
              title={`Chat #${ticket.chatRelacionadoId} · ${ticket.chatRelacionadoEstado ?? ''}`}
              className="chip flex items-center gap-1 bg-surface text-[0.65rem] text-ink-secondary hover:bg-brand/10 hover:text-brand"
            >
              <MessageCircle className="h-3 w-3" /> Chat relacionado
            </Link>
          )}
        </div>
        <p className="text-[0.72rem] text-ink-tertiary">
          <button
            type="button"
            onClick={() => setShowFichaUsuario(true)}
            className="font-medium text-ink-secondary underline decoration-dotted hover:text-brand"
            title="Ver ficha del usuario"
          >
            {ticket.solicitanteNombre}
          </button>
          {' · '}{fechaCreacion}
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

        {/* Resumen de cierre — visible cuando el ticket ya fue resuelto o cerrado */}
        {['resuelto', 'cerrado'].includes(ticket.estado) && (
          <ResumenCierre ticket={ticket} />
        )}

        {/* Evidencias */}
        <PanelEvidencias ticket={ticket} isTI={isTI} userId={user?.id ?? null} />

        {/* Ticket en espera — TI puede retomarlo (vuelve a en_proceso, se acumula el tiempo pausado) */}
        {isTI && ticket.estado === 'en_espera' && (
          <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="text-[0.78rem] text-amber-800">
              {ticket.motivoEspera
                ? (motivosEspera.find((m) => m.clave === ticket.motivoEspera)?.nombre ?? ticket.motivoEspera)
                : 'En espera'}
            </span>
            <Button size="sm" isLoading={salirDeEspera.isPending} onClick={() => salirDeEspera.mutate()}>Retomar</Button>
          </div>
        )}

        {/* Cambiar estado — TI */}
        {isTI && !['cerrado', 'resuelto', 'en_espera'].includes(ticket.estado) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.68rem] font-semibold text-ink-tertiary uppercase tracking-wide mr-1">Mover a:</span>
            {(['asignado', 'en_proceso'] as TicketEstado[])
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

            {/* Botón resolver */}
            <button
              onClick={() => setShowResolver(!showResolver)}
              className={clsx(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors',
                showResolver
                  ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-400',
              )}
            >
              <CheckCircle2 className="h-3 w-3" /> Resolver
            </button>

            {/* Botón escalar */}
            {ticket.nivelActual < 3 && (
              <button
                onClick={() => setShowEscalar(!showEscalar)}
                className={clsx(
                  'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors',
                  showEscalar
                    ? 'border-orange-400 bg-orange-100 text-orange-700'
                    : 'border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-400',
                )}
              >
                Escalar
              </button>
            )}

            {/* Botón poner en espera */}
            <button
              onClick={() => setShowEspera(!showEspera)}
              className={clsx(
                'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors',
                showEspera
                  ? 'border-amber-400 bg-amber-100 text-amber-700'
                  : 'border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-400',
              )}
            >
              En espera
            </button>

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

        {/* Panel resolver */}
        {showResolver && isTI && (
          <PanelResolver ticket={ticket} onDone={() => setShowResolver(false)} />
        )}

        {/* Panel escalar */}
        {showEscalar && isTI && (
          <PanelEscalar ticket={ticket} onDone={() => setShowEscalar(false)} />
        )}

        {/* Panel transferir */}
        {showTransferir && isTI && (
          <PanelTransferir ticket={ticket} onDone={() => setShowTransferir(false)} />
        )}

        {/* Panel poner en espera */}
        {showEspera && isTI && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <p className="text-[0.72rem] font-semibold text-amber-800 uppercase tracking-wide">¿Por qué motivo?</p>
            <div className="flex flex-wrap gap-1.5">
              {motivosEspera.map((m) => (
                <button
                  key={m.id}
                  onClick={() => ponerEnEspera.mutate(m.clave as TicketMotivoEspera)}
                  disabled={ponerEnEspera.isPending}
                  className="rounded-full border border-amber-300 bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-amber-700 hover:border-amber-400 disabled:opacity-50"
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Reabrir — TI puede retomar un ticket reabierto por el solicitante */}
        {isTI && ticket.estado === 'reabierto' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[0.68rem] font-semibold text-ink-tertiary uppercase tracking-wide mr-1">Retomar:</span>
            <button
              onClick={() => cambiarEstado.mutate('en_proceso')}
              className={clsx('rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', ESTADO_COLORS['en_proceso'])}
            >
              En proceso
            </button>
          </div>
        )}

        {/* Validación de la solución — solicitante, ticket resuelto sin validar */}
        {esSolicitante && ticket.estado === 'resuelto' && ticket.validadoUsuario === null && (
          <PanelValidacion ticket={ticket} />
        )}

        {/* Calificación — solicitante, después de confirmar que la solución funcionó */}
        {esSolicitante && ticket.validadoUsuario === true && (
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
              <div className="space-y-1.5">
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
    {showFichaUsuario && (
      <FichaUsuarioModal userId={ticket.solicitanteId} onClose={() => setShowFichaUsuario(false)} />
    )}
    </>
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

function ProductividadBar({ val, max, color }: { val: number; max: number; color: string }) {
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
    <div className="rounded-2xl border border-surface-border bg-card p-4 space-y-3">
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
        <ProductividadBar val={p.total} max={maxTotal} color="bg-brand/70" />
      </div>

      {/* Barras de estado */}
      <div className="space-y-1.5">
        <p className="text-[0.62rem] font-semibold text-ink-tertiary uppercase tracking-wide">Desglose</p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 text-[0.65rem]">
          <span className="text-emerald-600 font-semibold">Resueltos</span>
          <ProductividadBar val={p.resueltos} max={p.total} color="bg-emerald-400" />
          <span className="text-ink-secondary font-semibold">Cerrados</span>
          <ProductividadBar val={p.cerrados} max={p.total} color="bg-gray-400" />
          <span className="text-amber-600 font-semibold">En proceso</span>
          <ProductividadBar val={p.enProceso} max={p.total} color="bg-amber-400" />
          <span className="text-blue-500 font-semibold">Abiertos</span>
          <ProductividadBar val={p.abiertos} max={p.total} color="bg-brand/50" />
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
            tab === 'solucionadores' ? 'bg-brand text-white border-brand' : 'bg-card text-ink-secondary border-surface-border hover:border-brand/40',
          )}
        >
          🛠 Técnicos
        </button>
        <button
          onClick={() => setTab('solicitantes')}
          className={clsx(
            'rounded-xl px-4 py-1.5 text-[0.78rem] font-semibold border transition-all',
            tab === 'solicitantes' ? 'bg-brand text-white border-brand' : 'bg-card text-ink-secondary border-surface-border hover:border-brand/40',
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
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-surface-border bg-card py-16 text-ink-tertiary">
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
    <div className="rounded-2xl border border-surface-border bg-card overflow-x-auto">
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
  const [filtroEstado, setFiltroEstado] = useState<TicketEstado | 'todos'>('todos')
  const [showNuevo, setShowNuevo] = useState(false)
  const [showKpis, setShowKpis] = useState(false)
  const [showSla, setShowSla] = useState(false)
  const [showTecnicos, setShowTecnicos] = useState(false)
  const [showFiltrosAvanzados, setShowFiltrosAvanzados] = useState(false)
  const [filtroPrioridad, setFiltroPrioridad] = useState<TicketPrioridad | ''>('')
  const [filtroArea, setFiltroArea] = useState<'' | 'TI' | 'ST'>('')
  const [filtroAsignadoA, setFiltroAsignadoA] = useState<number | ''>('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [vista, setVista] = useState<'lista' | 'tabla' | 'kanban' | 'productividad'>('productividad')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const currentUser = useAuthStore((s) => s.user)
  const esAD = currentUser?.tipoUsuario?.toUpperCase() === 'AD'

  const filtrosBackend = {
    prioridad: filtroPrioridad || undefined,
    area: filtroArea || undefined,
    asignadoA: filtroAsignadoA || undefined,
    fechaDesde: filtroFechaDesde || undefined,
    fechaHasta: filtroFechaHasta || undefined,
    limit: 200,
  }
  const hayFiltrosAvanzados = !!(filtroPrioridad || filtroArea || filtroAsignadoA || filtroFechaDesde || filtroFechaHasta)

  const { data: tickets = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['tickets', filtrosBackend],
    queryFn: () => ticketsService.getAll(filtrosBackend),
  })

  const { data: staffFiltro = [] } = useQuery({
    queryKey: ['staff-ti'],
    queryFn: () => ticketsService.getStaffTI(),
    staleTime: 60_000,
    enabled: showFiltrosAvanzados,
  })

  const exportarCsv = useMutation({
    mutationFn: () => ticketsService.exportTicketsCsv({
      from: filtroFechaDesde || undefined,
      to: filtroFechaHasta || undefined,
      area: filtroArea || undefined,
    }),
    onError: () => toast.error('No se pudo exportar el CSV'),
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
      <div className="rounded-2xl border border-surface-border bg-card overflow-hidden">
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
                  onClick={() => { setVista('kanban'); if (filtroEstado !== 'todos') setFiltroEstado('todos') }}
                  title="Vista kanban"
                  className={clsx(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                    vista === 'kanban' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80',
                  )}
                >
                  <Columns3 className="h-3.5 w-3.5" />
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
              <button
                onClick={() => setShowKpis(true)}
                title="KPIs de Tickets"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                <Gauge className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowSla(true)}
                title="Configurar SLA"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                <Timer className="h-3.5 w-3.5" />
              </button>
              {esAD && (
                <button
                  onClick={() => setShowTecnicos(true)}
                  title="Administrar técnicos"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                >
                  <Users className="h-3.5 w-3.5" />
                </button>
              )}
              <Button
                onClick={() => setShowNuevo(true)}
                className="bg-card !text-brand hover:bg-surface !shadow-none border-0 text-[0.78rem] py-1.5 px-3"
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
            {(['todos', 'abierto', 'asignado', 'en_proceso', 'en_espera', 'resuelto', 'reabierto', 'cerrado'] as const).map((e) => (
              <button
                key={e}
                onClick={() => {
                  setFiltroEstado(e)
                  if (vista === 'productividad') setVista('lista')
                }}
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
          <button
            onClick={() => setShowFiltrosAvanzados((v) => !v)}
            className={clsx(
              'whitespace-nowrap rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-all',
              hayFiltrosAvanzados ? 'bg-brand text-white' : 'bg-surface text-ink-tertiary hover:bg-surface-border/60',
            )}
          >
            Filtros{hayFiltrosAvanzados ? ' ●' : ''}
          </button>
        </div>

        {showFiltrosAvanzados && (
          <div className="grid grid-cols-2 gap-2 border-b border-surface-border px-5 py-3.5 sm:grid-cols-5">
            <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value as TicketPrioridad | '')} className="field py-1.5 text-xs">
              <option value="">Cualquier prioridad</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
              <option value="P4">P4</option>
            </select>
            <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value as '' | 'TI' | 'ST')} className="field py-1.5 text-xs">
              <option value="">Cualquier área</option>
              <option value="TI">TI</option>
              <option value="ST">ST</option>
            </select>
            <select
              value={filtroAsignadoA}
              onChange={(e) => setFiltroAsignadoA(e.target.value ? Number(e.target.value) : '')}
              className="field py-1.5 text-xs"
            >
              <option value="">Cualquier técnico</option>
              {staffFiltro.map((s) => <option key={s.usuarioId} value={s.usuarioId}>{s.nombre}</option>)}
            </select>
            <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} className="field py-1.5 text-xs" placeholder="Desde" />
            <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} className="field py-1.5 text-xs" placeholder="Hasta" />
            <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-5">
              {hayFiltrosAvanzados ? (
                <button
                  className="text-left text-[0.7rem] text-ink-tertiary hover:text-ink"
                  onClick={() => { setFiltroPrioridad(''); setFiltroArea(''); setFiltroAsignadoA(''); setFiltroFechaDesde(''); setFiltroFechaHasta('') }}
                >
                  Limpiar filtros
                </button>
              ) : <span />}
              {esAD && (
                <button
                  className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[0.7rem]"
                  disabled={exportarCsv.isPending}
                  onClick={() => exportarCsv.mutate()}
                >
                  <Download className="h-3 w-3" /> Exportar CSV
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-surface-border bg-card p-4">
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
      ) : vista === 'productividad' ? (
        <VistaProductividad tickets={tickets} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-surface-border bg-card py-20">
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
      ) : vista === 'tabla' ? (
        <>
          <p className="text-[0.72rem] text-ink-tertiary">
            {filtered.length === tickets.length
              ? `${tickets.length} tickets`
              : `${filtered.length} de ${tickets.length} tickets`}
          </p>
          <TablaTickets tickets={filtered} />
        </>
      ) : vista === 'kanban' ? (
        <VistaKanban tickets={filtered} onOpen={(t) => setSelected(t)} />
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

      <Modal isOpen={showKpis} onClose={() => setShowKpis(false)} title="KPIs de Tickets" size="xl">
        <KpisTab />
      </Modal>

      <Modal isOpen={showSla} onClose={() => setShowSla(false)} title="SLA de Tickets" size="xl">
        <SlaTab />
      </Modal>

      <Modal isOpen={showTecnicos} onClose={() => setShowTecnicos(false)} title="Administrar técnicos" size="xl">
        <TecnicosTab />
      </Modal>
      {activeTicket && (
        <TicketDetalleModal
          ticket={tickets.find((t) => t.id === activeTicket.id) ?? activeTicket}
          onClose={() => { setSelected(null); setAutoOpenDismissed(true) }}
        />
      )}
    </div>
  )
}
