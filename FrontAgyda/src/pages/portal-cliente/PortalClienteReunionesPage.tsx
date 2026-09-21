import { useState } from 'react'
import { clsx } from 'clsx'
import {
  Calendar, ChevronRight, ChevronLeft, ChevronDown, Clock, Plus, Video,
  Pencil, RefreshCcw, XCircle, MoreVertical, Search, Filter, CalendarClock,
  FileText, StickyNote,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'

// --- Datos de ejemplo — reemplazar por datos reales del backend cuando el
// panel se conecte al endpoint de reuniones. ---

interface Participante {
  nombre: string
  rol?: string
}

interface Reunion {
  id: string
  dia: string
  numero: number
  mes: string
  titulo: string
  proyecto: string
  tipo: string
  hora: string
  plataforma: string
  estatus: 'Confirmada' | 'En espera'
  equipo: string[]
  extra?: number
  descripcion: string
  recordatorio: string
  participantes: Participante[]
  documentos: number
  notas: number
}

const REUNIONES: Reunion[] = [
  {
    id: '1', dia: 'Jue', numero: 17, mes: 'Sep',
    titulo: 'Revisión de avances', proyecto: 'Reclutamiento TOTIS', tipo: 'Seguimiento',
    hora: '10:00 a.m. - 11:00 a.m.', plataforma: 'Google Meet', estatus: 'Confirmada',
    equipo: ['A', 'M', 'R'], extra: 2,
    descripcion: 'Revisar avances del reclutamiento, métricas del último mes y próximos pasos.',
    recordatorio: '15 minutos antes',
    participantes: [
      { nombre: 'Ana Torres', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
      { nombre: 'Carla Ruiz' },
      { nombre: 'Jorge Ramírez' },
      { nombre: 'Sofía Campos' },
    ],
    documentos: 2, notas: 1,
  },
  {
    id: '2', dia: 'Vie', numero: 18, mes: 'Sep',
    titulo: 'Planeación Q4', proyecto: 'Canales', tipo: 'Planeación',
    hora: '02:00 p.m. - 03:00 p.m.', plataforma: 'Microsoft Teams', estatus: 'En espera',
    equipo: ['C', 'L'],
    descripcion: 'Definir objetivos y prioridades de canales para el último trimestre del año.',
    recordatorio: '10 minutos antes',
    participantes: [
      { nombre: 'Carla Ruiz', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
    ],
    documentos: 1, notas: 0,
  },
  {
    id: '3', dia: 'Lun', numero: 21, mes: 'Sep',
    titulo: 'Revisión de campaña', proyecto: 'Marketing', tipo: 'Seguimiento',
    hora: '11:00 a.m. - 12:00 p.m.', plataforma: 'Google Meet', estatus: 'Confirmada',
    equipo: ['A', 'M'],
    descripcion: 'Analizar resultados de la campaña de reclutamiento y ajustar la estrategia.',
    recordatorio: '15 minutos antes',
    participantes: [
      { nombre: 'Ana Torres', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
    ],
    documentos: 0, notas: 0,
  },
  {
    id: '4', dia: 'Mié', numero: 23, mes: 'Sep',
    titulo: 'Seguimiento de proyecto', proyecto: 'Desarrollo', tipo: 'Seguimiento',
    hora: '04:00 p.m. - 05:00 p.m.', plataforma: 'Zoom', estatus: 'Confirmada',
    equipo: ['R', 'C'], extra: 1,
    descripcion: 'Actualización del estado del proyecto y bloqueos actuales del equipo.',
    recordatorio: '5 minutos antes',
    participantes: [
      { nombre: 'Jorge Ramírez', rol: 'Organizador' },
      { nombre: 'Carla Ruiz' },
      { nombre: 'Sofía Campos' },
    ],
    documentos: 3, notas: 2,
  },
]

const DIAS_CON_REUNION = new Set(REUNIONES.map((r) => r.numero))
const DIA_SELECCIONADO = 17

const TABS_PRINCIPALES = ['Próximas', 'Historial'] as const
const SUBTABS = ['Detalles', 'Participantes', 'Documentos', 'Notas'] as const

const COLORES_AVATAR = ['bg-[#19b6bc]', 'bg-[#00537f]', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500']

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

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
          <p className="mt-0.5 text-sm text-ink-tertiary">
            Conecta, colabora y avanza. Gestiona tus reuniones en un solo lugar.
          </p>
        </div>
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Nueva reunión
      </button>
    </div>
  )
}

function EstatusBadge({ estatus }: { estatus: Reunion['estatus'] }) {
  return (
    <span
      className={clsx(
        'flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold',
        estatus === 'Confirmada' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
      )}
    >
      {estatus}
    </span>
  )
}

function DateBadge({ r, small }: { r: Pick<Reunion, 'dia' | 'numero' | 'mes'>; small?: boolean }) {
  return (
    <div
      className={clsx(
        'flex flex-shrink-0 flex-col items-center justify-center rounded-lg bg-surface',
        small ? 'w-12 py-1.5' : 'w-14 py-2'
      )}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-brand">{r.dia}</span>
      <span className={clsx('font-extrabold text-ink', small ? 'text-sm' : 'text-lg')}>{r.numero}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-tertiary">{r.mes}</span>
    </div>
  )
}

function AvatarStack({ equipo, extra }: { equipo: string[]; extra?: number }) {
  return (
    <div className="flex -space-x-2">
      {equipo.map((letra, i) => (
        <span
          key={i}
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[11px] font-bold text-white',
            COLORES_AVATAR[i % COLORES_AVATAR.length]
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

function FiltroBoton({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-full border border-surface-border bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
    >
      {icon}
      {label}
      <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
    </button>
  )
}

function BarraFiltros({ busqueda, onBusqueda }: { busqueda: string; onBusqueda: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          placeholder="Buscar reuniones..."
          className="w-full rounded-full border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
      <FiltroBoton label="Todos los proyectos" />
      <FiltroBoton label="Todos los tipos" />
      <FiltroBoton icon={<Calendar className="h-3.5 w-3.5 text-ink-tertiary" />} label="Este mes" />
      <button
        type="button"
        aria-label="Más filtros"
        className="rounded-full border border-surface-border bg-card p-2.5 text-ink-secondary hover:bg-surface"
      >
        <Filter className="h-4 w-4" />
      </button>
    </div>
  )
}

function ReunionListItem({
  r, seleccionada, onClick,
}: { r: Reunion; seleccionada: boolean; onClick: () => void }) {
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
        <DateBadge r={r} small />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-ink">{r.titulo}</p>
            <EstatusBadge estatus={r.estatus} />
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-tertiary">Proyecto: {r.proyecto}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-tertiary">
            <span>{r.hora}</span>
            <span className="flex items-center gap-1">
              <Video className="h-3 w-3" />
              {r.plataforma}
            </span>
          </div>
        </div>
        <AvatarStack equipo={r.equipo} extra={r.extra} />
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
      </button>
    </li>
  )
}

function ListaReuniones({
  reuniones, seleccionadaId, onSeleccionar,
}: { reuniones: Reunion[]; seleccionadaId: string; onSeleccionar: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Próximas reuniones ({reuniones.length})</h3>
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-ink-tertiary hover:text-ink-secondary">
          Más próximas
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {reuniones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">No se encontraron reuniones.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reuniones.map((r) => (
            <ReunionListItem key={r.id} r={r} seleccionada={r.id === seleccionadaId} onClick={() => onSeleccionar(r.id)} />
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-center gap-1.5">
        <button type="button" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface" aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">1</button>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-ink-secondary hover:bg-surface">2</button>
        <button type="button" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface" aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function AccionIcono({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-surface-border py-2.5 text-[11px] font-semibold text-ink-secondary hover:bg-surface"
    >
      {icon}
      {label}
    </button>
  )
}

function DetalleReunion({ r }: { r: Reunion }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Detalles')

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <DateBadge r={r} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{r.titulo}</h3>
            <EstatusBadge estatus={r.estatus} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5" />
            {r.hora}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Video className="h-3.5 w-3.5" />
            {r.plataforma}
          </p>
        </div>
        <button type="button" aria-label="Más opciones" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] py-2.5 text-xs font-bold text-white hover:opacity-90"
      >
        <Video className="h-3.5 w-3.5" />
        Unirme
      </button>

      <div className="mt-3 flex gap-2">
        <AccionIcono icon={<Pencil className="h-4 w-4" />} label="Editar" />
        <AccionIcono icon={<RefreshCcw className="h-4 w-4" />} label="Reprogramar" />
        <AccionIcono icon={<XCircle className="h-4 w-4" />} label="Cancelar" />
      </div>

      <div className="mt-5 flex gap-5 overflow-x-auto border-b border-surface-border">
        {SUBTABS.map((t) => {
          const contador = t === 'Participantes' ? r.participantes.length : t === 'Documentos' ? r.documentos : t === 'Notas' ? r.notas : null
          return (
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
              {contador !== null && ` (${contador})`}
              {subtab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        {subtab === 'Detalles' && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Proyecto</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.proyecto}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Tipo de reunión</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.tipo}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Descripción</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.descripcion}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Recordatorio</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.recordatorio}</p>
              </div>
            </div>
            <ListaParticipantes participantes={r.participantes} />
          </div>
        )}

        {subtab === 'Participantes' && <ListaParticipantes participantes={r.participantes} completa />}

        {subtab === 'Documentos' && (
          <EstadoVacioSubtab icon={<FileText className="h-6 w-6" />} texto="Todavía no se han compartido documentos para esta reunión." />
        )}

        {subtab === 'Notas' && (
          <EstadoVacioSubtab icon={<StickyNote className="h-6 w-6" />} texto="Todavía no hay notas registradas para esta reunión." />
        )}
      </div>
    </div>
  )
}

function ListaParticipantes({ participantes, completa }: { participantes: Participante[]; completa?: boolean }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Participantes</p>
      <ul className={clsx('flex flex-col gap-2.5', completa && 'sm:grid sm:grid-cols-2 sm:gap-x-6')}>
        {participantes.map((p, i) => (
          <li key={p.nombre} className="flex items-center gap-2.5">
            <span
              className={clsx(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white',
                COLORES_AVATAR[i % COLORES_AVATAR.length]
              )}
            >
              {inicialesDe(p.nombre)}
            </span>
            <span>
              <span className="block text-sm text-ink-secondary">{p.nombre}</span>
              {p.rol && <span className="block text-[11px] text-ink-tertiary">{p.rol}</span>}
            </span>
          </li>
        ))}
      </ul>
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

// Genera la grilla del mes (Lunes a Domingo) incluyendo los días grises del
// mes anterior/siguiente para completar semanas — sin dependencias extra.
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

function VistaCalendario() {
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

      <div className="mx-auto grid max-w-md grid-cols-7 gap-y-1.5 text-center">
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
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-surface-border pt-4 text-[11px] text-ink-tertiary">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Hoy</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#19b6bc]" />Con reunión</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" />Seleccionado</span>
      </div>
    </div>
  )
}

export function PortalClienteReunionesPage() {
  const [tab, setTab] = useState<(typeof TABS_PRINCIPALES)[number]>('Próximas')
  const [busqueda, setBusqueda] = useState('')
  const [seleccionadaId, setSeleccionadaId] = useState(REUNIONES[0].id)

  const reunionesFiltradas = REUNIONES.filter((r) => r.titulo.toLowerCase().includes(busqueda.toLowerCase()))
  const seleccionada = REUNIONES.find((r) => r.id === seleccionadaId) ?? REUNIONES[0]

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderReuniones />

      <div className="flex gap-5 border-b border-surface-border">
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

      {tab === 'Próximas' && (
        <Reveal index={0} className="flex flex-col gap-5">
          <BarraFiltros busqueda={busqueda} onBusqueda={setBusqueda} />
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1fr_320px]">
            <ListaReuniones reuniones={reunionesFiltradas} seleccionadaId={seleccionadaId} onSeleccionar={setSeleccionadaId} />
            <DetalleReunion r={seleccionada} />
            <VistaCalendario />
          </div>
        </Reveal>
      )}

      {tab === 'Historial' && (
        <Reveal index={0} className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
          <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
            <CalendarClock className="h-8 w-8" />
            <p className="text-sm">Todavía no hay reuniones en el historial.</p>
          </div>
        </Reveal>
      )}

    </div>
  )
}
