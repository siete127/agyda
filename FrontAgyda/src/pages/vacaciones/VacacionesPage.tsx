import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Umbrella, Clock, CheckCircle, XCircle, CalendarDays, ShieldAlert, AlertTriangle, BanknoteX, BarChart2 } from 'lucide-react'
import { api } from '@/lib/axios'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ResumenVacacionesTab } from './ResumenVacacionesTab'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Saldo {
  elegible: boolean
  razon?: string
  sinPool: boolean
  mesesAntigüedad?: number
  diasUsados: number
  diasDisponibles: number
  poolTotal: number
  anios: number
}

interface Solicitud {
  id: number
  tipo: string
  tipoLabel: string
  fechaInicio: string
  fechaFin: string
  dias: number
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'
  comentario: string
  motivo: string
  solicitanteNombre: string
  fechaSolicitud: string
  numeroPersonal: string
}

function parseSolicitud(r: Record<string, unknown>): Solicitud {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  const tipo = s(['tipo_solicitud', 'tipo', 'TIPO', 'tipoPermiso'])
  const tipoLabel =
    tipo === '0100' ? 'Permiso' :
    tipo === '0200' ? 'Vacaciones' :
    tipo.replace(/_/g, ' ')
  return {
    id: Number(r['id'] ?? 0),
    tipo,
    tipoLabel,
    fechaInicio: s(['fecha_inicio', 'fechaInicio']),
    fechaFin: s(['fecha_fin', 'fechaFin']),
    dias: Number(r['dias_solicitados'] ?? r['dias'] ?? 1),
    estado: (s(['estado', 'ESTADO', 'estatus']) || 'PENDIENTE').toUpperCase() as Solicitud['estado'],
    comentario: s(['comentario_admin', 'comentario']),
    motivo: s(['motivo', 'MOTIVO']),
    solicitanteNombre: s(['nombre_empleado', 'solicitanteNombre', 'nombres']),
    fechaSolicitud: s(['fecha_solicitud', 'fechaSolicitud']),
    numeroPersonal: s(['numero_personal', 'numeroPersonal']),
  }
}

const ESTADO_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  PENDIENTE:  { label: 'Pendiente',  cls: 'bg-yellow-100 text-yellow-700',   Icon: Clock },
  APROBADA:   { label: 'Aprobada',   cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
  RECHAZADA:  { label: 'Rechazada',  cls: 'bg-red-100 text-red-700',         Icon: XCircle },
  CANCELADA:  { label: 'Cancelada',  cls: 'bg-gray-100 text-gray-500',       Icon: XCircle },
}

// ── Saldo bar ────────────────────────────────────────────────────────────────

function SaldoBar({ saldo }: { saldo: Saldo }) {
  const pct = saldo.poolTotal > 0 ? Math.min(100, (saldo.diasUsados / saldo.poolTotal) * 100) : 0
  const color = saldo.diasDisponibles > 6 ? 'bg-emerald-500' : saldo.diasDisponibles > 2 ? 'bg-amber-400' : 'bg-red-500'

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand" />
          <span className="text-[0.78rem] font-bold text-ink">Días disponibles este año</span>
        </div>
        <span className="text-[0.78rem] font-bold text-brand">{saldo.diasDisponibles} / {saldo.poolTotal} días</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[0.68rem] text-ink-tertiary">
        {saldo.diasUsados} día{saldo.diasUsados !== 1 ? 's' : ''} usados · pool compartido entre vacaciones y permisos
      </p>
    </div>
  )
}

// ── Tabla solicitudes ─────────────────────────────────────────────────────────

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// No usar `new Date(d).toLocaleDateString(...)`: el backend guarda fechas
// puras (sin hora) que se serializan como medianoche UTC. toLocaleDateString
// las reconvierte a la zona horaria local del navegador — en México (UTC-6)
// eso resta horas y muestra la fecha un día antes del valor real guardado.
// Se parsea el string directamente en vez de pasar por conversión de huso.
const fmtFecha = (d: string) => {
  if (!d) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!match) return d
  const [, anio, mes, dia] = match
  const mesIdx = Number(mes) - 1
  if (mesIdx < 0 || mesIdx > 11) return d
  return `${Number(dia)} ${MESES_ABREV[mesIdx]} ${anio}`
}

function TablaSolicitudes({ solicitudes, isAdmin, puedeAprobar, showAcciones = true, onResponder }: {
  solicitudes: Solicitud[]
  isAdmin: boolean
  puedeAprobar: boolean
  showAcciones?: boolean
  onResponder: (p: { id: number; accion: 'APROBADA' | 'RECHAZADA' }) => void
}) {
  const mostrarAcciones = puedeAprobar && showAcciones
  return (
    <div className="rounded-2xl border border-surface-border bg-card overflow-x-auto">
      <table className="w-full text-[0.78rem]">
        <thead>
          <tr className="border-b border-surface-border text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
            <th className="px-4 py-2.5 text-left">Estado</th>
            <th className="px-4 py-2.5 text-left">Tipo</th>
            {isAdmin && <th className="px-4 py-2.5 text-left">Solicitante</th>}
            <th className="px-4 py-2.5 text-left">Fechas</th>
            <th className="px-4 py-2.5 text-left">Días</th>
            <th className="px-4 py-2.5 text-left">Motivo</th>
            <th className="px-4 py-2.5 text-left">Solicitado</th>
            {mostrarAcciones && <th className="px-4 py-2.5 text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border/60">
          {solicitudes.map((s) => {
            const cfg = ESTADO_CONFIG[s.estado] ?? ESTADO_CONFIG['PENDIENTE']
            const Icon = cfg.Icon
            return (
              <tr key={s.id} className="hover:bg-surface/60 transition-colors">
                <td className="px-4 py-3">
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold', cfg.cls)}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold bg-brand-light text-brand capitalize">
                    {s.tipoLabel}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{s.solicitanteNombre || '—'}</td>
                )}
                <td className="px-4 py-3 text-ink whitespace-nowrap">
                  {fmtFecha(s.fechaInicio)} → {fmtFecha(s.fechaFin)}
                </td>
                <td className="px-4 py-3 text-ink-secondary whitespace-nowrap">
                  {s.dias} día{s.dias !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 max-w-[240px]">
                  <span className="line-clamp-1 text-ink-secondary">{s.motivo || <span className="text-ink-tertiary italic">—</span>}</span>
                  {s.comentario && <span className="block line-clamp-1 text-[0.7rem] text-ink-tertiary italic">"{s.comentario}"</span>}
                </td>
                <td className="px-4 py-3 text-ink-tertiary whitespace-nowrap text-[0.72rem]">{fmtFecha(s.fechaSolicitud)}</td>
                {mostrarAcciones && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => onResponder({ id: s.id, accion: 'APROBADA' })} className="rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                        Aprobar
                      </button>
                      <button onClick={() => onResponder({ id: s.id, accion: 'RECHAZADA' })} className="rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-colors">
                        Rechazar
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Lista solicitudes ─────────────────────────────────────────────────────────

function ListaSolicitudes({ solicitudes, isLoading, isAdmin, puedeAprobar, tipoFiltro, onResponder }: {
  solicitudes: Solicitud[]
  isLoading: boolean
  isAdmin: boolean
  puedeAprobar: boolean
  tipoFiltro: '0100' | '0200'
  onResponder: (p: { id: number; accion: 'APROBADA' | 'RECHAZADA' }) => void
}) {
  const filtradas = useMemo(() =>
    solicitudes.filter((s) => isAdmin || s.tipo === tipoFiltro),
    [solicitudes, isAdmin, tipoFiltro]
  )

  const pendientes = filtradas.filter((s) => s.estado === 'PENDIENTE')
  const resueltas  = filtradas.filter((s) => s.estado !== 'PENDIENTE')

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-surface-border bg-card p-4 animate-pulse space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <div className="h-5 w-20 rounded-full bg-surface" />
            <div className="h-4 flex-1 rounded-lg bg-surface" />
          </div>
        ))}
      </div>
    )
  }

  if (filtradas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-surface-border bg-card py-14">
        <Umbrella className="h-8 w-8 text-surface-border" />
        <p className="text-sm text-ink-tertiary">Sin solicitudes</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {pendientes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-1 rounded-full bg-yellow-400" />
            <h2 className="text-[0.75rem] font-bold text-ink-secondary uppercase tracking-widest">Pendientes</h2>
          </div>
          <TablaSolicitudes solicitudes={pendientes} isAdmin={isAdmin} puedeAprobar={puedeAprobar} onResponder={onResponder} />
        </section>
      )}
      {resueltas.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-1 rounded-full bg-surface-border" />
            <h2 className="text-[0.75rem] font-bold text-ink-secondary uppercase tracking-widest">Historial</h2>
          </div>
          <TablaSolicitudes solicitudes={resueltas} isAdmin={isAdmin} puedeAprobar={puedeAprobar} showAcciones={false} onResponder={onResponder} />
        </section>
      )}
    </div>
  )
}

// ── Modal nueva solicitud ─────────────────────────────────────────────────────

function NuevaSolicitudModal({ tipo, saldo, onClose }: {
  tipo: '0100' | '0200'
  saldo: Saldo
  onClose: () => void
}) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState({ fechaInicio: '', fechaFin: '', motivo: '' })
  const [confirmDescuento, setConfirmDescuento] = useState(false)

  const sinPool = saldo.sinPool
  const diasDisponibles = saldo.diasDisponibles

  const diasSolicitados = useMemo(() => {
    if (!form.fechaInicio || !form.fechaFin) return 0
    const d1 = new Date(form.fechaInicio)
    const d2 = new Date(form.fechaFin)
    if (d2 < d1) return 0
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }, [form.fechaInicio, form.fechaFin])

  const excede = !sinPool && diasSolicitados > diasDisponibles

  const crear = useMutation({
    mutationFn: () => api.post('/vacaciones/solicitud', {
      numeroPersonal: user?.id,
      nombreEmpleado: user?.nombres ?? '',
      puesto: user?.tipoUsuario ?? '',
      departamento: '',
      tipoSolicitud: tipo,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      diasSolicitados,
      turnoOriginal: '',
      emailSolicitante: '',
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['vacaciones-solicitudes'] })
      qc.invalidateQueries({ queryKey: ['mi-saldo'] })
      const descuento = res.data?.descuentoNomina
      const notificadoPorCorreo = res.data?.notificadoPorCorreo
      const sufijoNotificacion = notificadoPorCorreo
        ? ' Se te notificará por AGYDA y correo.'
        : ' Se te notificará solo por AGYDA — agrega un correo en tu perfil para recibir también notificaciones por email.'
      if (descuento) {
        toast('Solicitud enviada. Este día se descontará de tu nómina ya que aún no cumples 1 año de antigüedad.' + sufijoNotificacion, {
          icon: '⚠️',
          duration: 8000,
          style: { background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d' },
        })
      } else {
        toast.success('Solicitud enviada correctamente.' + sufijoNotificacion, { duration: 6000 })
      }
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al enviar'
      toast.error(msg, { duration: 6000 })
    },
  })

  const label = tipo === '0100' ? 'Permiso' : 'Vacaciones'

  const puedeEnviar = form.fechaInicio && form.fechaFin && diasSolicitados > 0 && !excede
    && (!sinPool || confirmDescuento)

  return (
    <Modal isOpen onClose={onClose} title={`Solicitar ${label}`} size="md">
      <div className="space-y-4">

        {/* Aviso descuento nómina — solo para permisos sin pool */}
        {sinPool && tipo === '0100' && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <BanknoteX className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[0.8rem] font-semibold text-amber-800">Este día se descontará de tu nómina</p>
                <p className="text-[0.72rem] text-amber-700 mt-0.5 leading-relaxed">
                  Aún no cumples 1 año de antigüedad ({saldo.mesesAntigüedad ?? 0} mes{(saldo.mesesAntigüedad ?? 0) !== 1 ? 'es' : ''}).
                  Al solicitar este permiso, el día de ausencia se descontará de tu pago ya que no cuentas con el pool de días disponibles que se otorga al cumplir el primer año.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmDescuento}
                onChange={(e) => setConfirmDescuento(e.target.checked)}
                className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-[0.75rem] font-medium text-amber-800">Entiendo que este día se descontará de mi nómina</span>
            </label>
          </div>
        )}

        {/* Saldo agotado (con pool pero sin días) */}
        {!sinPool && diasDisponibles <= 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            No tienes días disponibles en tu pool de 12 días anuales.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" min={new Date().toISOString().slice(0, 10)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Fecha fin</label>
            <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} className="field" min={form.fechaInicio || new Date().toISOString().slice(0, 10)} />
          </div>
        </div>

        {diasSolicitados > 0 && (
          <div className={clsx('rounded-xl px-4 py-2.5 text-sm font-medium', excede ? 'bg-red-50 text-red-700' : sinPool ? 'bg-amber-50 text-amber-700' : 'bg-brand/8 text-brand')}>
            {excede
              ? `Excede tu saldo: solicitas ${diasSolicitados} días pero solo tienes ${diasDisponibles} disponibles.`
              : sinPool
                ? `${diasSolicitados} día${diasSolicitados !== 1 ? 's' : ''} · se descontará de tu nómina`
                : `${diasSolicitados} día${diasSolicitados !== 1 ? 's' : ''} · te quedarán ${diasDisponibles - diasSolicitados} días`}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary uppercase tracking-wide">Motivo</label>
          <textarea value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} rows={3} className="field resize-none" placeholder={tipo === '0100' ? 'Ej: Cita médica, asunto personal...' : 'Ej: Viaje de descanso...'} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            isLoading={crear.isPending}
            disabled={!puedeEnviar}
            onClick={() => crear.mutate()}
          >
            Enviar solicitud
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

type Tab = 'vacaciones' | 'permisos' | 'resumen'

export function VacacionesPage() {
  const [tab, setTab] = useState<Tab>('permisos')
  const [showNueva, setShowNueva] = useState(false)
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const { can } = useActionAccess()
  const puedeAprobar = isAdmin && can('vacaciones', 'aprobar-rechazar')
  const qc = useQueryClient()

  const { data: saldo, isLoading: loadSaldo } = useQuery<Saldo>({
    queryKey: ['mi-saldo'],
    queryFn: async () => {
      const { data } = await api.get('/vacaciones/mi-saldo')
      return data?.data ?? data
    },
  })

  // Refresco en tiempo real: si un admin marca/quita vacaciones o resuelve una
  // solicitud (incluso desde Asistencia), esta pantalla se actualiza sola.
  useEffect(() => {
    const socket = getSocket()
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['mi-saldo'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-solicitudes'] })
    }
    socket.on('vacaciones:diasActualizados', handler)
    return () => { socket.off('vacaciones:diasActualizados', handler) }
  }, [qc])

  const { data: solicitudes = [], isLoading: loadSolicitudes, refetch, isRefetching } = useQuery({
    queryKey: ['vacaciones-solicitudes'],
    queryFn: async () => {
      const { data } = await api.get('/vacaciones/solicitudes')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.solicitudes ?? [])
      return (list as Record<string, unknown>[]).map(parseSolicitud)
    },
  })

  const responder = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'APROBADA' | 'RECHAZADA' }) =>
      api.put(`/vacaciones/solicitudes/${id}/responder`, { estado: accion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-solicitudes'] })
      qc.invalidateQueries({ queryKey: ['mi-saldo'] })
      toast.success('Solicitud actualizada')
    },
    onError: () => toast.error('Error al responder'),
  })

  const sinPool = saldo?.sinPool === true
  const noElegible = saldo && !saldo.elegible

  // Si está en tab Vacaciones pero no tiene pool, forzar a Permisos
  const tabEfectiva: Tab = (tab === 'vacaciones' && sinPool) ? 'permisos' : tab
  const tipoFiltro = tabEfectiva === 'vacaciones' ? '0200' : '0100'
  const enResumen = tabEfectiva === 'resumen'

  // Mostrar botón nueva solicitud:
  // - con pool: siempre (vacaciones y permisos)
  // - sin pool: solo en tab Permisos
  const puedeNuevaSolicitud = !enResumen && saldo?.elegible && (tabEfectiva === 'permisos' || !sinPool)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Banner */}
      <div className="rounded-2xl border border-surface-border bg-card overflow-hidden">
        <div className="relative overflow-hidden px-6 py-5" style={{ background: 'linear-gradient(135deg, #0B1730 0%, #14274E 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Umbrella className="h-5 w-5 text-brand-muted" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Vacaciones y Permisos</h1>
                <p className="mt-0.5 text-xs text-white/50">
                  {enResumen ? 'Pool de días por agente' : sinPool ? 'Permisos disponibles · los días se descuentan de nómina' : 'Pool compartido de 12 días anuales'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!enResumen && (
                <button onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['mi-saldo'] }) }} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              {puedeNuevaSolicitud && (
                <Button onClick={() => setShowNueva(true)} className="bg-card !text-brand hover:bg-surface !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Plus className="h-3.5 w-3.5" /> Nueva solicitud
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 rounded-xl bg-surface p-1 w-fit">
        {([['permisos', 'Permisos'], ['vacaciones', 'Vacaciones']] as [Tab, string][]).map(([key, label]) => {
          const bloqueada = key === 'vacaciones' && sinPool
          return (
            <button
              key={key}
              onClick={() => !bloqueada && setTab(key)}
              disabled={bloqueada}
              title={bloqueada ? 'Disponible al cumplir 1 año de antigüedad' : undefined}
              className={clsx(
                'rounded-lg px-5 py-2 text-[0.78rem] font-semibold transition-all',
                tabEfectiva === key ? 'bg-card text-brand' : 'text-ink-secondary hover:text-ink',
                bloqueada && 'opacity-40 cursor-not-allowed hover:text-ink-secondary',
              )}
            >
              {label}
              {bloqueada && <span className="ml-1.5 text-[0.6rem] font-normal">(1 año requerido)</span>}
            </button>
          )
        })}
        {isAdmin && (
          <button
            onClick={() => setTab('resumen')}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-5 py-2 text-[0.78rem] font-semibold transition-all',
              tabEfectiva === 'resumen' ? 'bg-card text-brand' : 'text-ink-secondary hover:text-ink',
            )}
          >
            <BarChart2 className="h-3.5 w-3.5" /> Días por agente
          </button>
        )}
      </div>

      {enResumen ? (
        <ResumenVacacionesTab />
      ) : (
        <>
          {/* Usuario inactivo */}
          {noElegible && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No puedes solicitar días</p>
                <p className="text-xs text-amber-600 mt-0.5">{saldo?.razon}</p>
              </div>
            </div>
          )}

          {/* Aviso sin pool — usuario activo pero < 1 año */}
          {!noElegible && sinPool && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <BanknoteX className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Aún no tienes pool de días</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Llevas {saldo?.mesesAntigüedad ?? 0} mes{(saldo?.mesesAntigüedad ?? 0) !== 1 ? 'es' : ''} en la empresa. Al cumplir 1 año recibirás 12 días anuales para vacaciones y permisos sin descuento.
                  Por ahora puedes solicitar permisos, pero el día de ausencia <strong>se descontará de tu nómina</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Saldo (solo si tiene pool) */}
          {!loadSaldo && saldo?.elegible && !sinPool && <SaldoBar saldo={saldo} />}

          {/* Lista */}
          <ListaSolicitudes
            solicitudes={solicitudes}
            isLoading={loadSolicitudes}
            isAdmin={isAdmin}
            puedeAprobar={puedeAprobar}
            tipoFiltro={tipoFiltro}
            onResponder={responder.mutate}
          />

          {showNueva && saldo?.elegible && (
            <NuevaSolicitudModal
              tipo={tipoFiltro}
              saldo={saldo}
              onClose={() => setShowNueva(false)}
            />
          )}
        </>
      )}
    </div>
  )
}
