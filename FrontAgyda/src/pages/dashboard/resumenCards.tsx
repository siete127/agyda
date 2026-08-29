/* eslint-disable react-refresh/only-export-components --
   Módulo de catálogo: expone el registro RESUMEN_CARDS junto a los componentes
   que renderiza. No es un módulo de UI con hot-reload crítico. */
import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Ticket, FolderKanban, ClipboardList, MessageSquareWarning, Scale, BookOpenCheck,
  Headset, CalendarClock, Newspaper, PlaneTakeoff, GraduationCap, HeartPulse,
  Users, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { useCurrentUser } from '@/hooks/useAuth'
import { ticketsService } from '@/services/tickets.service'
import { proyectosService } from '@/services/proyectos.service'
import { encuestasService } from '@/services/encuestas.service'
import { legalService } from '@/services/legal.service'
import { livechatService } from '@/services/livechat.service'
import { capacitacionService } from '@/services/capacitacion.service'
import { incapacidadesService } from '@/services/incapacidades.service'

/* ════════════════════════════════════════════════════════════════════════
   CATÁLOGO DE CARDS DE RESUMEN
   ────────────────────────────────────────────────────────────────────────
   Cada card resume un módulo del sistema. Se ofrecen en el catálogo de
   Configuración → Diseño del inicio, y solo aparecen si la empresa tiene el
   módulo activo (moduleKey + isAllowed).

   Contrato: `render()` devuelve el nodo listo; la card gestiona su propio
   fetch (useQuery), es defensiva ante formas de respuesta y degrada bien
   cuando no hay datos.
   ════════════════════════════════════════════════════════════════════════ */

export interface ResumenCardDef {
  id: string
  titulo: string
  descripcion: string
  categoria: 'Operación' | 'Personas' | 'Comercial' | 'Contenido'
  moduleKey: string
  /** Tamaño sugerido al agregarla (grilla de 12 columnas, fila = 64px). */
  size: { w: number; h: number }
  Icon: LucideIcon
  render: () => ReactNode
}

/* ── Shell visual común ─────────────────────────────────────────────── */

function CardShell({
  titulo, Icon, to, verLabel = 'Abrir', children, tono = 'brand',
}: {
  titulo: string
  Icon: LucideIcon
  to: string
  verLabel?: string
  children: ReactNode
  tono?: 'brand' | 'amber' | 'rose' | 'emerald' | 'violet'
}) {
  const navigate = useNavigate()
  const tonos: Record<string, string> = {
    brand: 'text-brand', amber: 'text-amber-500', rose: 'text-rose-500',
    emerald: 'text-emerald-500', violet: 'text-violet-500',
  }
  return (
    <div className="dash-card flex h-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-card">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={clsx('h-4 w-4', tonos[tono])} />
          <h3 className="text-[0.82rem] font-bold text-ink">{titulo}</h3>
        </div>
        <button
          onClick={() => navigate(to)}
          className="flex items-center gap-1 text-[0.68rem] font-semibold text-brand transition-colors hover:text-brand-dark"
        >
          {verLabel} <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  )
}

function BigStat({ value, label, hint, tono = 'brand' }: {
  value: ReactNode; label: string; hint?: string; tono?: string
}) {
  const tonos: Record<string, string> = {
    brand: 'text-brand', amber: 'text-amber-500', rose: 'text-rose-500',
    emerald: 'text-emerald-500', violet: 'text-violet-500',
  }
  return (
    <div>
      <p className={clsx('text-3xl font-black leading-none tabular-nums', tonos[tono])}>{value}</p>
      <p className="mt-1.5 text-[0.78rem] font-semibold text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-[0.68rem] text-ink-tertiary">{hint}</p>}
    </div>
  )
}

function MiniLista({ items }: { items: { k: string; a: string; b?: string }[] }) {
  if (items.length === 0) {
    return <p className="text-center text-[0.72rem] text-ink-tertiary py-4">Sin pendientes 🎉</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-surface-border/60">
      {items.map((it) => (
        <li key={it.k} className="flex items-center justify-between gap-2 py-2">
          <span className="min-w-0 flex-1 truncate text-[0.74rem] text-ink">{it.a}</span>
          {it.b && <span className="flex-shrink-0 text-[0.66rem] font-semibold text-ink-tertiary">{it.b}</span>}
        </li>
      ))}
    </ul>
  )
}

/* Normaliza {data:[...]} | {x:[...]} | [...] → array */
function arr<T = unknown>(d: unknown, ...keys: string[]): T[] {
  if (Array.isArray(d)) return d as T[]
  if (d && typeof d === 'object') {
    for (const k of ['data', ...keys]) {
      const v = (d as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

/* ── Cards ──────────────────────────────────────────────────────────── */

function TicketsResumen() {
  const { data = [] } = useQuery({
    queryKey: ['tickets'], queryFn: () => ticketsService.getAll(), staleTime: 60_000,
  })
  const cerrados = ['cerrado', 'resuelto', 'cancelado']
  const abiertos = data.filter((t) => !cerrados.includes(t.estado?.toLowerCase() ?? ''))
  const sinAsignar = abiertos.filter((t) => !(t as { asignadoA?: unknown }).asignadoA).length
  return (
    <CardShell titulo="Tickets" Icon={Ticket} to="/tickets" verLabel="Ver tickets" tono="amber">
      <BigStat value={abiertos.length} label="tickets abiertos" tono="amber"
        hint={sinAsignar > 0 ? `${sinAsignar} sin asignar` : 'Todos asignados'} />
    </CardShell>
  )
}

function ProyectosResumen() {
  const { data = [] } = useQuery({
    queryKey: ['proyectos'], queryFn: () => proyectosService.getAll(), staleTime: 60_000,
  })
  const activos = data.filter((p) => p.estado === 'Activo')
  return (
    <CardShell titulo="Proyectos" Icon={FolderKanban} to="/proyectos" verLabel="Ver proyectos">
      <BigStat value={activos.length} label="proyectos activos"
        hint={data.length > 0 ? `${data.length} en total` : 'Sin proyectos'} />
    </CardShell>
  )
}

function EncuestasResumen() {
  const user = useCurrentUser()
  const { data = [] } = useQuery({
    queryKey: ['encuestas-mis-pendientes', user?.id],
    queryFn: () => encuestasService.getMisPendientes(user?.id ?? 0),
    enabled: !!user?.id, staleTime: 60_000,
  })
  return (
    <CardShell titulo="Encuestas" Icon={ClipboardList} to="/mis-encuestas" verLabel="Responder" tono="violet">
      <BigStat value={data.length} label="encuestas por responder" tono="violet"
        hint={data.length === 0 ? 'Estás al día' : 'Tienes pendientes'} />
      {data.length > 0 && (
        <div className="mt-3">
          <MiniLista items={data.slice(0, 3).map((e) => ({
            k: String(e.id), a: (e as { titulo?: string }).titulo ?? `Encuesta #${e.id}`,
          }))} />
        </div>
      )}
    </CardShell>
  )
}

function QuejasResumen() {
  const { data } = useQuery({
    queryKey: ['quejas-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/quejas')
      const list = arr<{ estado?: string; estatus?: string }>(data, 'quejas')
      const abiertas = list.filter((q) => {
        const e = (q.estado ?? q.estatus ?? '').toLowerCase()
        return e !== 'cerrada' && e !== 'resuelta' && e !== 'cerrado'
      })
      return { total: list.length, abiertas: abiertas.length }
    },
    staleTime: 60_000,
  })
  return (
    <CardShell titulo="Quejas y sugerencias" Icon={MessageSquareWarning} to="/quejas" verLabel="Ver quejas" tono="rose">
      <BigStat value={data?.abiertas ?? 0} label="quejas abiertas" tono="rose"
        hint={data ? `${data.total} en total` : ''} />
    </CardShell>
  )
}

function LegalesResumen() {
  const { data } = useQuery({
    queryKey: ['legal-dashboard'], queryFn: () => legalService.getDashboard(), staleTime: 120_000,
  })
  const d = data as unknown as Record<string, number> | undefined
  const pendientes = d?.pendientesFirma ?? d?.porFirmar ?? d?.pendientes ?? 0
  return (
    <CardShell titulo="Legal" Icon={Scale} to="/legal" verLabel="Ver documentos">
      <BigStat value={pendientes} label="documentos por firmar"
        hint={pendientes === 0 ? 'Todo firmado' : 'Requieren tu firma'} />
    </CardShell>
  )
}

function ReglamentoResumen() {
  const { data } = useQuery({
    queryKey: ['reglamento-mi-estado'],
    queryFn: async () => {
      const { data } = await api.get('/reglamento/mi-estado').catch(() => ({ data: null }))
      return data as { aceptado?: boolean; pendiente?: boolean } | null
    },
    staleTime: 120_000,
  })
  const pendiente = data ? (data.pendiente ?? data.aceptado === false) : false
  return (
    <CardShell titulo="Reglamento interno" Icon={BookOpenCheck} to="/reglamento" verLabel="Abrir">
      <BigStat
        value={pendiente ? '1' : '0'}
        label={pendiente ? 'lectura pendiente' : 'sin pendientes'}
        tono={pendiente ? 'amber' : 'emerald'}
        hint={pendiente ? 'Debes aceptar el reglamento' : 'Reglamento al día'}
      />
    </CardShell>
  )
}

function LivechatResumen() {
  const { data = [] } = useQuery({
    queryKey: ['livechat-mis-conversaciones-resumen'],
    queryFn: () => livechatService.getMisConversaciones('activa').catch(() => []),
    staleTime: 20_000, refetchInterval: 30_000,
  })
  return (
    <CardShell titulo="Chat en vivo" Icon={Headset} to="/atencion-cliente" verLabel="Atender" tono="emerald">
      <BigStat value={data.length} label="conversaciones activas" tono="emerald"
        hint={data.length === 0 ? 'Sin chats en curso' : 'Requieren atención'} />
    </CardShell>
  )
}

function PausasHoyResumen() {
  const { data } = useQuery({
    queryKey: ['pausa-hoy'],
    queryFn: async () => {
      const { data } = await api.get('/reports/pausa/hoy')
      return data.data as Record<number, number>
    },
    staleTime: 30_000, refetchInterval: 60_000,
  })
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
  }
  const total = data ? Object.values(data).reduce((a, b) => a + b, 0) : 0
  const LABELS: Record<number, string> = { 2: 'Comida', 3: 'Baño', 5: 'Capacitación', 6: 'Permiso' }
  return (
    <CardShell titulo="Mis pausas de hoy" Icon={CalendarClock} to="/reportes/pausas" verLabel="Reporte">
      <BigStat value={fmt(total)} label="tiempo en pausa hoy" />
      {data && (
        <div className="mt-3">
          <MiniLista items={Object.entries(data)
            .filter(([, s]) => s > 0)
            .map(([sid, s]) => ({ k: sid, a: LABELS[Number(sid)] ?? `Estado ${sid}`, b: fmt(s) }))} />
        </div>
      )}
    </CardShell>
  )
}

function VacacionesResumen() {
  const { data } = useQuery({
    queryKey: ['vacaciones-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/vacaciones/solicitudes').catch(() => ({ data: [] }))
      const list = arr<{ estado?: string; estatus?: string }>(data, 'solicitudes')
      const pend = list.filter((s) => (s.estado ?? s.estatus ?? '').toLowerCase().includes('pend'))
      return { total: list.length, pendientes: pend.length }
    },
    staleTime: 120_000,
  })
  return (
    <CardShell titulo="Vacaciones" Icon={PlaneTakeoff} to="/vacaciones" verLabel="Ver solicitudes" tono="emerald">
      <BigStat value={data?.pendientes ?? 0} label="solicitudes por aprobar" tono="emerald"
        hint={data ? `${data.total} registradas` : ''} />
    </CardShell>
  )
}

function CapacitacionResumen() {
  const { data = [] } = useQuery({
    queryKey: ['capacitacion-mis-cursos'],
    queryFn: () => capacitacionService.getMisCursos().catch(() => []),
    staleTime: 120_000,
  })
  const pendientes = data.filter((c) => {
    const done = (c as { completado?: boolean; estado?: string }).completado
      ?? (c as { estado?: string }).estado === 'completado'
    return !done
  })
  return (
    <CardShell titulo="Capacitación" Icon={GraduationCap} to="/capacitacion" verLabel="Ir a cursos" tono="violet">
      <BigStat value={pendientes.length} label="cursos en curso" tono="violet"
        hint={data.length > 0 ? `${data.length} inscritos` : 'Sin cursos asignados'} />
    </CardShell>
  )
}

function IncapacidadesResumen() {
  const { data = [] } = useQuery({
    queryKey: ['incapacidades-mis'],
    queryFn: () => incapacidadesService.getMisIncapacidades().catch(() => []),
    staleTime: 120_000,
  })
  const activas = data.filter((i) => {
    const e = (i as { estado?: string }).estado?.toLowerCase() ?? ''
    return e === 'aprobada' || e === 'pendiente'
  })
  return (
    <CardShell titulo="Incapacidades" Icon={HeartPulse} to="/incapacidades" verLabel="Ver" tono="rose">
      <BigStat value={activas.length} label="incapacidades vigentes" tono="rose"
        hint={data.length > 0 ? `${data.length} en tu historial` : 'Sin registros'} />
    </CardShell>
  )
}

function NoticiasNuevasResumen() {
  const { data } = useQuery({
    queryKey: ['noticias-nuevas-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/noticias').catch(() => ({ data: [] }))
      const list = arr<{ id: number; leida?: boolean; vista?: boolean; fecha?: string; fechaPublicacion?: string }>(data, 'noticias')
      const noLeidas = list.filter((n) => n.leida === false || n.vista === false).length
      return { total: list.length, noLeidas }
    },
    staleTime: 60_000,
  })
  return (
    <CardShell titulo="Noticias" Icon={Newspaper} to="/noticias" verLabel="Leer">
      <BigStat value={data?.noLeidas ?? 0} label="noticias sin leer"
        hint={data ? `${data.total} publicadas` : ''} />
    </CardShell>
  )
}

function VacantesResumen() {
  const { data } = useQuery({
    queryKey: ['vacantes-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/vacantes/dashboard-stats').catch(() => ({ data: null }))
      return (data?.data ?? data) as Record<string, number> | null
    },
    staleTime: 120_000,
  })
  const abiertas = data?.vacantesAbiertas ?? data?.abiertas ?? 0
  const postulantes = data?.postulantesNuevos ?? data?.postulantes ?? 0
  return (
    <CardShell titulo="Reclutamiento" Icon={Users} to="/vacantes" verLabel="Ver vacantes">
      <BigStat value={abiertas} label="vacantes abiertas"
        hint={postulantes > 0 ? `${postulantes} postulantes nuevos` : 'Sin postulantes nuevos'} />
    </CardShell>
  )
}

/* ── Registro del catálogo ──────────────────────────────────────────── */

export const RESUMEN_CARDS: ResumenCardDef[] = [
  { id: 'r-tickets', titulo: 'Resumen de Tickets', descripcion: 'Tickets abiertos y sin asignar.', categoria: 'Operación', moduleKey: 'tickets', size: { w: 3, h: 3 }, Icon: Ticket, render: () => <TicketsResumen /> },
  { id: 'r-proyectos', titulo: 'Resumen de Proyectos', descripcion: 'Proyectos activos de tu empresa.', categoria: 'Operación', moduleKey: 'proyectos', size: { w: 3, h: 3 }, Icon: FolderKanban, render: () => <ProyectosResumen /> },
  { id: 'r-encuestas', titulo: 'Encuestas pendientes', descripcion: 'Encuestas que te falta responder.', categoria: 'Contenido', moduleKey: 'encuestas', size: { w: 3, h: 4 }, Icon: ClipboardList, render: () => <EncuestasResumen /> },
  { id: 'r-quejas', titulo: 'Quejas abiertas', descripcion: 'Quejas y sugerencias sin resolver.', categoria: 'Operación', moduleKey: 'quejas', size: { w: 3, h: 3 }, Icon: MessageSquareWarning, render: () => <QuejasResumen /> },
  { id: 'r-legal', titulo: 'Legal — por firmar', descripcion: 'Documentos legales que requieren tu firma.', categoria: 'Contenido', moduleKey: 'legal', size: { w: 3, h: 3 }, Icon: Scale, render: () => <LegalesResumen /> },
  { id: 'r-reglamento', titulo: 'Reglamento interno', descripcion: 'Estado de aceptación del reglamento.', categoria: 'Personas', moduleKey: 'reglamento', size: { w: 3, h: 3 }, Icon: BookOpenCheck, render: () => <ReglamentoResumen /> },
  { id: 'r-livechat', titulo: 'Chat en vivo — cola', descripcion: 'Conversaciones activas asignadas a ti.', categoria: 'Operación', moduleKey: 'livechat', size: { w: 3, h: 3 }, Icon: Headset, render: () => <LivechatResumen /> },
  { id: 'r-pausas', titulo: 'Mis pausas de hoy', descripcion: 'Tiempo acumulado en pausa hoy por tipo.', categoria: 'Personas', moduleKey: 'reports', size: { w: 3, h: 4 }, Icon: CalendarClock, render: () => <PausasHoyResumen /> },
  { id: 'r-vacaciones', titulo: 'Vacaciones', descripcion: 'Solicitudes de vacaciones por aprobar.', categoria: 'Personas', moduleKey: 'vacaciones', size: { w: 3, h: 3 }, Icon: PlaneTakeoff, render: () => <VacacionesResumen /> },
  { id: 'r-capacitacion', titulo: 'Capacitación', descripcion: 'Tus cursos en curso e inscritos.', categoria: 'Personas', moduleKey: 'capacitacion', size: { w: 3, h: 3 }, Icon: GraduationCap, render: () => <CapacitacionResumen /> },
  { id: 'r-incapacidades', titulo: 'Incapacidades', descripcion: 'Incapacidades vigentes.', categoria: 'Personas', moduleKey: 'incapacidades', size: { w: 3, h: 3 }, Icon: HeartPulse, render: () => <IncapacidadesResumen /> },
  { id: 'r-noticias', titulo: 'Noticias sin leer', descripcion: 'Publicaciones que aún no has visto.', categoria: 'Contenido', moduleKey: 'noticias', size: { w: 3, h: 3 }, Icon: Newspaper, render: () => <NoticiasNuevasResumen /> },
  { id: 'r-vacantes', titulo: 'Reclutamiento', descripcion: 'Vacantes abiertas y postulantes nuevos.', categoria: 'Personas', moduleKey: 'vacantes', size: { w: 3, h: 3 }, Icon: Users, render: () => <VacantesResumen /> },
]

export const RESUMEN_CARD_IDS = RESUMEN_CARDS.map((c) => c.id)
