import { useState } from 'react'
import { clsx } from 'clsx'
import {
  Calendar, ChevronRight, ChevronLeft, Clock, Plus, Video, CalendarPlus,
  CalendarClock, History, Settings, Lightbulb, Quote, MoreVertical, Search,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'

// --- Datos de ejemplo — reemplazar por datos reales del backend cuando el
// panel se conecte al endpoint de reuniones. ---

const PROXIMA_REUNION = {
  dia: 'Jue', numero: 17, mes: 'Sep',
  titulo: 'Revisión de avances',
  hora: '10:00 a.m. - 11:00 a.m.',
  plataforma: 'Google Meet',
  con: 'Equipo AGYDA',
  equipo: ['A', 'M', 'R'],
  extra: 2,
}

interface Reunion {
  dia: string
  numero: number
  mes: string
  hora: string
  titulo: string
  plataforma: string
  equipo: string[]
  extra?: number
  accion: 'unirme' | 'detalles'
}

const REUNIONES: Reunion[] = [
  { dia: 'Jue', numero: 17, mes: 'Sep', hora: '10:00 a.m. - 11:00 a.m.', titulo: 'Revisión de avances', plataforma: 'Google Meet', equipo: ['A', 'M', 'R'], extra: 2, accion: 'unirme' },
  { dia: 'Vie', numero: 18, mes: 'Sep', hora: '02:00 p.m. - 03:00 p.m.', titulo: 'Planeación Q4', plataforma: 'Microsoft Teams', equipo: ['C', 'L'], accion: 'detalles' },
  { dia: 'Lun', numero: 21, mes: 'Sep', hora: '11:00 a.m. - 12:00 p.m.', titulo: 'Revisión de campaña', plataforma: 'Google Meet', equipo: ['A', 'M'], accion: 'detalles' },
  { dia: 'Mié', numero: 23, mes: 'Sep', hora: '04:00 p.m. - 05:00 p.m.', titulo: 'Seguimiento de proyecto', plataforma: 'Zoom', equipo: ['R', 'C'], extra: 1, accion: 'detalles' },
]

const DIAS_CON_REUNION = new Set(REUNIONES.map((r) => r.numero))
const DIA_SELECCIONADO = 17

const ENLACES_RAPIDOS = [
  { icon: CalendarPlus, titulo: 'Agendar reunión', desc: 'Crea una nueva reunión' },
  { icon: History, titulo: 'Mis reuniones', desc: 'Consulta tu historial' },
  { icon: Settings, titulo: 'Configuración', desc: 'Ajusta tus preferencias' },
]

const CONSEJOS = [
  'Llega unos minutos antes',
  'Prepara los temas a tratar',
  'Comparte la agenda con anticipación',
  'Mantén la reunión enfocada',
]

const TABS = ['Próximas', 'Historial', 'Canceladas'] as const
const FILTROS = ['Todas', 'Hoy', 'Esta semana', 'Este mes'] as const

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Reuniones</span>
    </div>
  )
}

function HeaderReuniones() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Calendar className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Reuniones</h1>
          <p className="text-sm font-bold text-[#19b6bc]">Conecta, colabora y avanza.</p>
          <p className="mt-1 max-w-md text-sm text-ink-tertiary">
            Gestiona tus reuniones, consulta tu agenda y accede rápidamente a tus sesiones.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nueva reunión
        </button>
        <div className="max-w-[220px] text-right">
          <p className="text-sm italic text-ink-tertiary">
            &ldquo;Las mejores decisiones nacen de buenas conversaciones.&rdquo;
          </p>
          <span className="mt-2 inline-block h-0.5 w-10 rounded-full bg-[#19b6bc]" />
        </div>
      </div>
    </div>
  )
}

function CardHeader({ icon, title, cta }: { icon: React.ReactNode; title: string; cta?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      {cta && (
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function AvatarStack({ equipo, extra }: { equipo: string[]; extra?: number }) {
  const colores = ['bg-[#19b6bc]', 'bg-[#00537f]', 'bg-emerald-500']
  return (
    <div className="flex -space-x-2">
      {equipo.map((letra, i) => (
        <span
          key={i}
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[11px] font-bold text-white',
            colores[i % colores.length]
          )}
        >
          {letra}
        </span>
      ))}
      {!!extra && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface text-[11px] font-bold text-ink-tertiary">
          +{extra}
        </span>
      )}
    </div>
  )
}

function ProximaReunionCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <CardHeader icon={<Calendar className="h-4 w-4 text-brand" />} title="Próxima reunión" cta="Ver detalles" />
      <div className="flex gap-3">
        <div className="flex w-16 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-surface py-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand">{PROXIMA_REUNION.dia}</span>
          <span className="text-xl font-extrabold text-ink">{PROXIMA_REUNION.numero}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">{PROXIMA_REUNION.mes}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{PROXIMA_REUNION.titulo}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            {PROXIMA_REUNION.hora}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Video className="h-3.5 w-3.5 flex-shrink-0" />
            {PROXIMA_REUNION.plataforma}
          </p>
          <p className="mt-1 text-xs text-ink-tertiary">Con: {PROXIMA_REUNION.con}</p>
        </div>
      </div>

      <div className="mt-3">
        <AvatarStack equipo={PROXIMA_REUNION.equipo} extra={PROXIMA_REUNION.extra} />
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] py-2.5 text-xs font-bold text-white hover:opacity-90"
        >
          <Video className="h-3.5 w-3.5" />
          Unirme ahora
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-bold text-ink-secondary hover:bg-surface"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Agregar al calendario
        </button>
      </div>
    </div>
  )
}

// Genera la grilla del mes (Lunes a Domingo) incluyendo los días grises del
// mes anterior/siguiente para completar semanas — sin dependencias extra.
function useCalendarGrid(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, monthIndex, 0).getDate()
  // getDay(): 0=domingo..6=sabado → convertir a 0=lunes..6=domingo
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7

  const cells: { day: number; current: boolean }[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, current: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true })
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstWeekday - daysInMonth + 1, current: false })
  return cells
}

function AgendaCalendario() {
  const [mesIndex] = useState(8) // Septiembre (0-indexado)
  const anio = 2026
  const celdas = useCalendarGrid(anio, mesIndex)
  const nombreMes = new Date(anio, mesIndex, 1).toLocaleDateString('es-MX', { month: 'long' })

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Tu agenda</h3>
        <div className="flex items-center gap-1 text-xs font-semibold text-ink-secondary">
          <button type="button" className="rounded-full p-1 hover:bg-surface" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="capitalize">{nombreMes} {anio}</span>
          <button type="button" className="rounded-full p-1 hover:bg-surface" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="text-[11px] font-bold text-ink-tertiary">{d}</span>
        ))}
        {celdas.map((c, i) => {
          const esSeleccionado = c.current && c.day === DIA_SELECCIONADO
          const tieneReunion = c.current && DIAS_CON_REUNION.has(c.day) && !esSeleccionado
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 py-1">
              <span
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                  !c.current && 'text-ink-tertiary/40',
                  c.current && !esSeleccionado && 'text-ink-secondary',
                  esSeleccionado && 'bg-brand text-white'
                )}
              >
                {c.day}
              </span>
              <span className={clsx('h-1 w-1 rounded-full', tieneReunion ? 'bg-[#19b6bc]' : 'bg-transparent')} />
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-border pt-4 text-[11px] text-ink-tertiary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Hoy</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#19b6bc]" />Con reunión</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Seleccionado</span>
      </div>
    </div>
  )
}

function EnlacesRapidosCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-ink">Enlaces rápidos</h3>
      <div className="flex flex-col">
        {ENLACES_RAPIDOS.map((e, i) => (
          <button
            key={e.titulo}
            type="button"
            className={clsx(
              'flex items-center gap-3 py-2.5 text-left hover:opacity-80',
              i !== 0 && 'border-t border-surface-border'
            )}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <e.icon className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">{e.titulo}</span>
              <span className="block text-xs text-ink-tertiary">{e.desc}</span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
          </button>
        ))}
      </div>
    </div>
  )
}

function NecesitasReunionCard() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-700 p-5 text-white shadow-card">
      <p className="text-sm font-bold">¿Necesitas una reunión con nuestro equipo?</p>
      <p className="mt-1.5 text-xs text-white/80">
        Solicita una reunión con un asesor y te ayudaremos en lo que necesites.
      </p>
      <button
        type="button"
        className="mt-4 w-full rounded-full bg-white py-2.5 text-xs font-bold text-violet-700 hover:bg-white/90"
      >
        Solicitar reunión
      </button>
    </div>
  )
}

function ConsejosCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold text-ink">Consejos para reuniones efectivas</h3>
      </div>
      <ul className="flex flex-col gap-1.5">
        {CONSEJOS.map((c) => (
          <li key={c} className="flex items-start gap-2 text-xs text-ink-secondary">
            <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-brand" />
            {c}
          </li>
        ))}
      </ul>
      <button type="button" className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
        Ver más consejos
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function QuoteCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <Quote className="h-5 w-5 text-brand" />
      <p className="mt-2 text-sm italic text-ink-secondary">
        &ldquo;Reunirse es un comienzo, permanecer juntos es un progreso, trabajar juntos es un éxito.&rdquo;
      </p>
      <p className="mt-2 text-xs font-semibold text-ink-tertiary">— Henry Ford</p>
    </div>
  )
}

function EnlacesRapidos() {
  return (
    <div className="flex flex-col gap-5">
      <EnlacesRapidosCard />
      <NecesitasReunionCard />
      <ConsejosCard />
      <QuoteCard />
    </div>
  )
}

function ReunionRow({ r }: { r: Reunion }) {
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border border-surface-border p-3">
      <div className="flex w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-surface py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-wide text-brand">{r.dia}</span>
        <span className="text-base font-extrabold text-ink">{r.numero}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-ink-tertiary">{r.mes}</span>
      </div>

      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-bold text-ink">{r.titulo}</p>
        <p className="mt-0.5 text-xs text-ink-tertiary">{r.hora}</p>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
        <Video className="h-3.5 w-3.5" />
        {r.plataforma}
      </div>

      <AvatarStack equipo={r.equipo} extra={r.extra} />

      {r.accion === 'unirme' ? (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          <Video className="h-3.5 w-3.5" />
          Unirme
        </button>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1 rounded-full border border-surface-border px-4 py-2 text-xs font-bold text-ink-secondary hover:bg-surface"
        >
          Ver detalles
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <button type="button" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface" aria-label="Más opciones">
        <MoreVertical className="h-4 w-4" />
      </button>
    </li>
  )
}

function ListaReuniones() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Próximas')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todas')
  const [busqueda, setBusqueda] = useState('')

  const reunionesFiltradas = REUNIONES.filter((r) =>
    r.titulo.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-5 border-b border-surface-border">
          {TABS.map((t) => (
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

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar reuniones..."
            className="w-56 rounded-full border border-surface-border bg-surface py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filtro === f ? 'bg-brand text-white' : 'bg-surface text-ink-tertiary hover:bg-surface/70'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {tab === 'Próximas' ? (
        <ul className="flex flex-col gap-3">
          {reunionesFiltradas.map((r) => (
            <ReunionRow key={r.titulo} r={r} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">Todavía no hay reuniones en {tab.toLowerCase()}.</p>
        </div>
      )}
    </div>
  )
}

export function PortalClienteReunionesPage() {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderReuniones />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1fr_320px]">
        <Reveal index={0}><ProximaReunionCard /></Reveal>
        <Reveal index={1}><AgendaCalendario /></Reveal>
        <Reveal index={2}><EnlacesRapidos /></Reveal>
      </div>

      <Reveal index={3}><ListaReuniones /></Reveal>
    </div>
  )
}
