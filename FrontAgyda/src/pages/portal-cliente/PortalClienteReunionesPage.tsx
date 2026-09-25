import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Calendar, ChevronRight, ChevronLeft, ChevronDown, Clock, Plus, Video, MapPin,
  Check, Search, CalendarClock, FileText, StickyNote, Lock, X,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { PortalBreadcrumb } from '@/pages/portal-cliente/components/PortalBreadcrumb'
import { Modal } from '@/components/ui/Modal'
import { portalClienteService } from '@/services/portalCliente.service'
import { usePortalAcciones } from '@/hooks/usePortalAcciones'
import type { PortalCita } from '@/types/portalCliente.types'
import reunionesHero from '@/assets/reuniones-hero.png'

// --- Conectada a datos reales (portalCliente.service.ts -> GET
// /portal-cliente/citas y /citas/historial). El modelo real ("cita", no
// "reunión" genérica de proyecto) no tiene proyecto/tipo/plataforma libre,
// equipo/avatares, documentos ni notas — sí tiene modalidad, enlace,
// teléfono y, cuando aplica, tratamiento/número de sesión. Esas secciones
// sin dato real se dejan visibles pero deshabilitadas ("no disponible
// aún"), igual que en Facturas. No existe endpoint para crear una cita
// nueva desde cero: solo confirmar o solicitar cambio (reprogramar /
// cancelar) sobre una cita ya agendada por AGYDA. ---

const SUBTABS = ['Detalles', 'Documentos', 'Notas'] as const

function usePopover() {
  const [abierto, setAbierto] = useState(false)
  return { abierto, setAbierto }
}

function HeaderReuniones() {
  return (
    <div
      className="relative flex h-[170px] flex-shrink-0 items-center overflow-hidden rounded-3xl bg-cover bg-center px-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${reunionesHero})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Calendar className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Reuniones</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Conecta, colabora y avanza. Consulta tus citas con nosotros.
          </p>
        </div>
      </div>
    </div>
  )
}

const ESTATUS_ESTILO: Record<string, string> = {
  confirmada: 'bg-emerald-500/10 text-emerald-500',
  pendiente: 'bg-amber-500/10 text-amber-500',
  cancelada: 'bg-red-500/10 text-red-500',
  asistio: 'bg-emerald-500/10 text-emerald-500',
  no_asistio: 'bg-slate-500/10 text-slate-500',
}

function EstatusBadge({ estatus }: { estatus: string }) {
  return (
    <span className={clsx('flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', ESTATUS_ESTILO[estatus.toLowerCase()] ?? 'bg-surface text-ink-tertiary')}>
      {estatus.replace('_', ' ')}
    </span>
  )
}

function DateBadge({ fechaHora, small }: { fechaHora: string; small?: boolean }) {
  const fecha = new Date(fechaHora)
  const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')
  const mes = fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
  return (
    <div className={clsx('flex flex-shrink-0 flex-col items-center justify-center rounded-lg bg-surface', small ? 'w-12 py-1.5' : 'w-14 py-2')}>
      <span className="text-[9px] font-bold uppercase tracking-wide text-brand">{dia.charAt(0).toUpperCase() + dia.slice(1)}</span>
      <span className={clsx('font-extrabold text-ink', small ? 'text-sm' : 'text-lg')}>{fecha.getDate()}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-tertiary">{mes.toUpperCase()}</span>
    </div>
  )
}

function horaTexto(fechaHora: string) {
  return new Date(fechaHora).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
}

interface Filtros {
  busqueda: string
  orden: 'proximas' | 'lejanas'
}

function BarraFiltros({ filtros, onCambiar }: { filtros: Filtros; onCambiar: (f: Partial<Filtros>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          value={filtros.busqueda}
          onChange={(e) => onCambiar({ busqueda: e.target.value })}
          placeholder="Buscar reuniones..."
          className="w-full rounded-full border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
    </div>
  )
}

function CitaListItem({ c, seleccionada, onClick }: { c: PortalCita; seleccionada: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
          seleccionada ? 'border-brand bg-brand/5' : 'border-surface-border hover:bg-surface'
        )}
      >
        <DateBadge fechaHora={c.fechaHora} small />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-ink">{c.titulo}</p>
            <EstatusBadge estatus={c.estatus} />
          </div>
          {c.tratamientoNombre && (
            <p className="mt-0.5 truncate text-xs text-ink-tertiary">
              {c.tratamientoNombre}{c.numeroSesion ? ` — Sesión ${c.numeroSesion}${c.tratamientoTotalSesiones ? `/${c.tratamientoTotalSesiones}` : ''}` : ''}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-tertiary">
            <span>{horaTexto(c.fechaHora)}</span>
            <span className="flex items-center gap-1 capitalize">
              {c.modalidad === 'videollamada' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
              {c.modalidad}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
      </button>
    </li>
  )
}

function ListaCitas({
  citas, seleccionadaId, onSeleccionar, orden, onOrden,
}: { citas: PortalCita[]; seleccionadaId: number; onSeleccionar: (id: number) => void; orden: Filtros['orden']; onOrden: (o: Filtros['orden']) => void }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Próximas reuniones ({citas.length})</h3>
        <button
          type="button"
          onClick={() => onOrden(orden === 'proximas' ? 'lejanas' : 'proximas')}
          className="flex items-center gap-1 text-xs font-semibold text-ink-tertiary hover:text-ink-secondary"
        >
          {orden === 'proximas' ? 'Más próximas' : 'Más lejanas'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {citas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">No tienes reuniones próximas.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {citas.map((c) => (
            <CitaListItem key={c.id} c={c} seleccionada={c.id === seleccionadaId} onClick={() => onSeleccionar(c.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function nombreMesAnio(fechaHora: string) {
  const texto = new Date(fechaHora).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function ListaHistorial({
  citas, seleccionadaId, onSeleccionar,
}: { citas: PortalCita[]; seleccionadaId: number; onSeleccionar: (id: number) => void }) {
  const grupos: { etiqueta: string; items: PortalCita[] }[] = []
  for (const c of citas) {
    const etiqueta = nombreMesAnio(c.fechaHora)
    const grupo = grupos.find((g) => g.etiqueta === etiqueta)
    if (grupo) grupo.items.push(c)
    else grupos.push({ etiqueta, items: [c] })
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-ink">Historial de reuniones ({citas.length})</h3>

      {citas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">Sin reuniones pasadas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((g) => (
            <div key={g.etiqueta}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">{g.etiqueta}</p>
              <ul className="flex flex-col gap-3">
                {g.items.map((c) => (
                  <CitaListItem key={c.id} c={c} seleccionada={c.id === seleccionadaId} onClick={() => onSeleccionar(c.id)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EstadoVacioSubtab({ icon, texto }: { icon: React.ReactNode; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-tertiary">
      {icon}
      <p className="max-w-xs text-sm">{texto}</p>
    </div>
  )
}

function CambioModal({ cita, onClose }: { cita: PortalCita; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<'reprogramar' | 'cancelar'>('reprogramar')
  const [fechaPropuesta, setFechaPropuesta] = useState('')
  const [motivo, setMotivo] = useState('')

  const enviar = useMutation({
    mutationFn: () => portalClienteService.solicitarCambioCita(cita.id, {
      tipo, fechaPropuesta: tipo === 'reprogramar' ? fechaPropuesta || undefined : undefined, motivo: motivo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-citas'] })
      toast.success('Solicitud enviada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo enviar la solicitud'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Solicitar cambio de cita" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => setTipo('reprogramar')} className={clsx('flex-1 rounded-xl border py-2 text-xs font-semibold', tipo === 'reprogramar' ? 'border-brand bg-brand/5 text-brand' : 'border-surface-border text-ink-tertiary')}>Reprogramar</button>
          <button type="button" onClick={() => setTipo('cancelar')} className={clsx('flex-1 rounded-xl border py-2 text-xs font-semibold', tipo === 'cancelar' ? 'border-brand bg-brand/5 text-brand' : 'border-surface-border text-ink-tertiary')}>Cancelar</button>
        </div>
        {tipo === 'reprogramar' && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha propuesta</span>
            <input type="datetime-local" value={fechaPropuesta} onChange={(e) => setFechaPropuesta(e.target.value)} className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-secondary">Motivo (opcional)</span>
          <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full resize-none rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-tertiary hover:bg-surface">Cancelar</button>
          <button type="button" onClick={() => enviar.mutate()} disabled={enviar.isPending} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50">
            Enviar solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DetalleCita({ c }: { c: PortalCita }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Detalles')
  const [modalCambio, setModalCambio] = useState(false)
  const qc = useQueryClient()
  const { puede } = usePortalAcciones()
  const puedeGestionarCitas = puede('gestionar-citas')

  const confirmar = useMutation({
    mutationFn: () => portalClienteService.confirmarCita(c.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-citas'] })
      toast.success('Cita confirmada')
    },
    onError: () => toast.error('No se pudo confirmar'),
  })

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <DateBadge fechaHora={c.fechaHora} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{c.titulo}</h3>
            <EstatusBadge estatus={c.estatus} />
          </div>
          {c.tratamientoNombre && (
            <p className="mt-0.5 text-xs text-ink-tertiary">
              {c.tratamientoNombre}{c.numeroSesion ? ` — Sesión ${c.numeroSesion}${c.tratamientoTotalSesiones ? `/${c.tratamientoTotalSesiones}` : ''}` : ''}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5" />
            {new Date(c.fechaHora).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs capitalize text-ink-tertiary">
            {c.modalidad === 'videollamada' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
            {c.modalidad}{c.telefono ? ` · ${c.telefono}` : ''}
          </p>
        </div>
      </div>

      {c.solicitudPendienteTipo && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          Ya tienes una solicitud de {c.solicitudPendienteTipo === 'cancelar' ? 'cancelación' : 'reprogramación'} pendiente de revisión.
        </p>
      )}

      {c.enlace && (
        <a
          href={c.enlace}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] py-2.5 text-xs font-bold text-white hover:opacity-90"
        >
          <Video className="h-3.5 w-3.5" />
          Unirme
        </a>
      )}

      {!c.confirmadaPorCliente && puedeGestionarCitas && (
        <button
          type="button"
          onClick={() => confirmar.mutate()}
          disabled={confirmar.isPending}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-emerald-500 py-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Confirmar
        </button>
      )}

      {!c.solicitudPendienteTipo && puedeGestionarCitas && (
        <button
          type="button"
          onClick={() => setModalCambio(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface"
        >
          Solicitar cambio
        </button>
      )}

      <div className="mt-5 flex gap-5 overflow-x-auto border-b border-surface-border">
        {SUBTABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubtab(t)}
            className={clsx(
              'relative flex-shrink-0 whitespace-nowrap pb-2.5 text-xs font-semibold transition-colors',
              subtab === t ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary'
            )}
          >
            {t}
            {subtab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {subtab === 'Detalles' && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Título</p>
              <p className="mt-0.5 text-sm text-ink-secondary">{c.titulo}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Duración</p>
              <p className="mt-0.5 text-sm text-ink-secondary">{c.duracionMin ? `${c.duracionMin} min` : '—'}</p>
            </div>
          </div>
        )}
        {subtab === 'Documentos' && <EstadoVacioSubtab icon={<Lock className="h-6 w-6" />} texto="Los documentos de la reunión no están disponibles aún." />}
        {subtab === 'Notas' && <EstadoVacioSubtab icon={<Lock className="h-6 w-6" />} texto="Las notas de la reunión no están disponibles aún." />}
      </div>

      {modalCambio && <CambioModal cita={c} onClose={() => setModalCambio(false)} />}
    </div>
  )
}

const HISTORIAL_BANNER: Record<string, { texto: string; clase: string } | undefined> = {
  asistio: { texto: 'Esta reunión se realizó correctamente. Gracias por tu participación.', clase: 'bg-emerald-500/10 text-emerald-600' },
  cancelada: { texto: 'Esta reunión fue cancelada y no se llevó a cabo.', clase: 'bg-red-500/10 text-red-600' },
  no_asistio: { texto: 'Esta reunión no se realizó.', clase: 'bg-slate-500/10 text-slate-500' },
}

function DetalleHistorial({ c }: { c: PortalCita }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Detalles')
  const banner = HISTORIAL_BANNER[c.estatus.toLowerCase()]

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <DateBadge fechaHora={c.fechaHora} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{c.titulo}</h3>
            <EstatusBadge estatus={c.estatus} />
          </div>
          {c.tratamientoNombre && (
            <p className="mt-0.5 text-xs text-ink-tertiary">
              {c.tratamientoNombre}{c.numeroSesion ? ` — Sesión ${c.numeroSesion}` : ''}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5" />
            {new Date(c.fechaHora).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      {banner && <div className={clsx('mt-4 rounded-xl px-4 py-2.5 text-xs font-semibold', banner.clase)}>{banner.texto}</div>}

      <div className="mt-5 flex gap-5 overflow-x-auto border-b border-surface-border">
        {SUBTABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubtab(t)}
            className={clsx(
              'relative flex-shrink-0 whitespace-nowrap pb-2.5 text-xs font-semibold transition-colors',
              subtab === t ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary'
            )}
          >
            {t}
            {subtab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {subtab === 'Detalles' && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Modalidad</p>
            <p className="mt-0.5 text-sm capitalize text-ink-secondary">{c.modalidad}</p>
          </div>
        )}
        {subtab === 'Documentos' && <EstadoVacioSubtab icon={<Lock className="h-6 w-6" />} texto="Los documentos de la reunión no están disponibles aún." />}
        {subtab === 'Notas' && <EstadoVacioSubtab icon={<Lock className="h-6 w-6" />} texto="Las notas de la reunión no están disponibles aún." />}
      </div>
    </div>
  )
}

function useCalendarGrid(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate()
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7

  const cells: { day: number; current: boolean }[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, current: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true })
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstWeekday - daysInMonth + 1, current: false })
  return cells
}

function VistaCalendario({ citas, onSeleccionarCita }: { citas: PortalCita[]; onSeleccionarCita: (id: number) => void }) {
  const hoy = new Date()
  const [mesIndex, setMesIndex] = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [diaSeleccionado, setDiaSeleccionado] = useState(hoy.getDate())

  const celdas = useCalendarGrid(anio, mesIndex)
  const nombreMes = new Date(anio, mesIndex, 1).toLocaleDateString('es-MX', { month: 'long' })
  const esMesDeHoy = mesIndex === hoy.getMonth() && anio === hoy.getFullYear()

  const citasDelMes = citas.filter((c) => {
    const f = new Date(c.fechaHora)
    return f.getMonth() === mesIndex && f.getFullYear() === anio
  })
  const diasConCita = new Set(citasDelMes.map((c) => new Date(c.fechaHora).getDate()))
  const citasDelDia = citasDelMes
    .filter((c) => new Date(c.fechaHora).getDate() === diaSeleccionado)
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())

  function cambiarMes(delta: number) {
    let m = mesIndex + delta
    let a = anio
    if (m < 0) { m = 11; a -= 1 }
    if (m > 11) { m = 0; a += 1 }
    setMesIndex(m)
    setAnio(a)
    setDiaSeleccionado(1)
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Tu agenda</h3>
        <div className="flex items-center gap-1 text-xs font-semibold text-ink-secondary">
          <button type="button" onClick={() => cambiarMes(-1)} className="rounded-full p-1 hover:bg-surface" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="capitalize">{nombreMes} {anio}</span>
          <button type="button" onClick={() => cambiarMes(1)} className="rounded-full p-1 hover:bg-surface" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-md grid-cols-7 gap-y-1.5 text-center">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="text-[11px] font-bold text-ink-tertiary">{d}</span>
        ))}
        {celdas.map((c, i) => {
          const esHoy = c.current && esMesDeHoy && c.day === hoy.getDate()
          const esSeleccionado = c.current && c.day === diaSeleccionado
          const tieneCita = c.current && diasConCita.has(c.day) && !esSeleccionado
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 py-1">
              <button
                type="button"
                disabled={!c.current}
                onClick={() => setDiaSeleccionado(c.day)}
                className={clsx(
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  !c.current && 'text-ink-tertiary/40',
                  c.current && !esSeleccionado && 'text-ink-secondary hover:bg-surface',
                  esHoy && !esSeleccionado && 'ring-2 ring-brand ring-inset',
                  esSeleccionado && 'bg-brand text-white'
                )}
              >
                {c.day}
              </button>
              <span className={clsx('h-1 w-1 rounded-full', tieneCita ? 'bg-[#19b6bc]' : 'bg-transparent')} />
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-ink-tertiary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full ring-2 ring-brand ring-inset" />Hoy</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#19b6bc]" />Con reunión</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Seleccionado</span>
      </div>

      <div className="mt-4 border-t border-surface-border pt-4">
        <p className="mb-2 text-xs font-bold text-ink">
          Reuniones del {diaSeleccionado} de {nombreMes}
        </p>
        {citasDelDia.length === 0 ? (
          <p className="text-xs text-ink-tertiary">No hay reuniones este día.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {citasDelDia.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionarCita(c.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-surface-border p-2 text-left hover:bg-surface"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#19b6bc]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">{c.titulo}</span>
                    <span className="block text-[11px] text-ink-tertiary">{horaTexto(c.fechaHora)}</span>
                  </span>
                  <EstatusBadge estatus={c.estatus} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const TABS_PRINCIPALES = ['Próximas', 'Historial'] as const

export function PortalClienteReunionesPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<(typeof TABS_PRINCIPALES)[number]>('Próximas')
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)
  const [seleccionadaHistorialId, setSeleccionadaHistorialId] = useState<number | null>(null)
  const [filtros, setFiltros] = useState<Filtros>({ busqueda: '', orden: 'proximas' })

  const proximasQuery = useQuery({ queryKey: ['portal-citas'], queryFn: () => portalClienteService.getCitas(), enabled: tab === 'Próximas' })
  const historialQuery = useQuery({ queryKey: ['portal-citas-historial'], queryFn: () => portalClienteService.getCitasHistorial(), enabled: tab === 'Historial' })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  const proximas = (proximasQuery.data ?? [])
    .filter((c) => c.titulo.toLowerCase().includes(filtros.busqueda.toLowerCase()))
    .sort((a, b) => {
      const diff = new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
      return filtros.orden === 'proximas' ? diff : -diff
    })

  const seleccionada = proximas.find((c) => c.id === seleccionadaId) ?? proximas[0] ?? null
  const historial = historialQuery.data ?? []
  const seleccionadaHistorial = historial.find((c) => c.id === seleccionadaHistorialId) ?? historial[0] ?? null

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PortalBreadcrumb seccion="Reuniones" />
      <HeaderReuniones />

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border">
        <div className="flex gap-5">
          {TABS_PRINCIPALES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={clsx(
                'relative pb-3 text-sm font-semibold transition-colors',
                tab === t ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary'
              )}
            >
              {t}
              {tab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/portal-cliente/atencion/nueva')}
          className="mb-2 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Solicitar reunión
        </button>
      </div>

      {tab === 'Próximas' && (
        proximasQuery.isLoading ? (
          <div className="h-96 animate-pulse rounded-2xl bg-surface" />
        ) : (
          <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-5">
              <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <ListaCitas
                  citas={proximas}
                  seleccionadaId={seleccionada?.id ?? -1}
                  onSeleccionar={setSeleccionadaId}
                  orden={filtros.orden}
                  onOrden={(orden) => actualizarFiltros({ orden })}
                />
                {seleccionada ? (
                  <DetalleCita c={seleccionada} />
                ) : (
                  <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
                    <EstadoVacioSubtab icon={<CalendarClock className="h-6 w-6" />} texto="Selecciona una reunión de la lista para ver su detalle." />
                  </div>
                )}
              </div>
            </div>
            <VistaCalendario citas={proximas} onSeleccionarCita={setSeleccionadaId} />
          </Reveal>
        )
      )}

      {tab === 'Historial' && (
        historialQuery.isLoading ? (
          <div className="h-96 animate-pulse rounded-2xl bg-surface" />
        ) : (
          <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <ListaHistorial
              citas={historial}
              seleccionadaId={seleccionadaHistorial?.id ?? -1}
              onSeleccionar={setSeleccionadaHistorialId}
            />
            {seleccionadaHistorial ? (
              <DetalleHistorial c={seleccionadaHistorial} />
            ) : (
              <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
                <EstadoVacioSubtab icon={<CalendarClock className="h-6 w-6" />} texto="Selecciona una reunión del historial para ver su detalle." />
              </div>
            )}
          </Reveal>
        )
      )}
    </div>
  )
}
