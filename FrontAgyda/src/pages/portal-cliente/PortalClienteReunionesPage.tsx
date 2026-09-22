import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  Calendar, ChevronRight, ChevronLeft, ChevronDown, Clock, Plus, Video,
  RefreshCcw, MoreVertical, Search, Filter, CalendarClock, FileText,
  StickyNote, CalendarPlus, Link2, ClipboardCopy, XCircle, Download,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Modal } from '@/components/ui/Modal'
import reunionesHero from '@/assets/reuniones-hero.png'

// --- Datos de ejemplo — reemplazar por datos reales del backend cuando el
// panel se conecte al endpoint de reuniones. ---

interface Participante {
  nombre: string
  rol?: string
}

type Estatus = 'Confirmada' | 'Pendiente' | 'Cancelada' | 'Realizada' | 'No realizada'

// Cuáles estatus corresponden a cada pestaña — una reunión "Cancelada" ya no
// aparece en Próximas, pasa directo a Historial junto con lo ya ocurrido.
const ESTATUS_PROXIMAS: Estatus[] = ['Confirmada', 'Pendiente']
const ESTATUS_HISTORIAL: Estatus[] = ['Realizada', 'Cancelada', 'No realizada']

interface DocumentoReunion {
  nombre: string
  fecha: string
  tamano: string
}

interface Reunion {
  id: string
  fecha: Date
  titulo: string
  proyecto: string
  tipo: string
  horaTexto: string
  duracionTexto?: string
  duracionMinutos?: number
  plataforma: string
  enlace?: string
  estatus: Estatus
  equipo: string[]
  extra?: number
  descripcion: string
  recordatorio?: string
  objetivo?: string
  acuerdos?: string[]
  participantes: Participante[]
  documentos: number
  documentosDetalle?: DocumentoReunion[]
  notas: number
}

const REUNIONES_INICIALES: Reunion[] = [
  {
    id: '1', fecha: new Date(2026, 8, 17, 10, 0),
    titulo: 'Revisión de avances', proyecto: 'Reclutamiento TOTIS', tipo: 'Seguimiento',
    horaTexto: '10:00 a.m. - 11:00 a.m.', plataforma: 'Google Meet', estatus: 'Confirmada',
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
    id: '2', fecha: new Date(2026, 8, 18, 14, 0),
    titulo: 'Planeación Q4', proyecto: 'Canales', tipo: 'Planeación',
    horaTexto: '02:00 p.m. - 03:00 p.m.', plataforma: 'Microsoft Teams', estatus: 'Pendiente',
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
    id: '3', fecha: new Date(2026, 8, 21, 11, 0),
    titulo: 'Revisión de campaña', proyecto: 'Marketing', tipo: 'Seguimiento',
    horaTexto: '11:00 a.m. - 12:00 p.m.', plataforma: 'Google Meet', estatus: 'Confirmada',
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
    id: '4', fecha: new Date(2026, 8, 23, 16, 0),
    titulo: 'Seguimiento de proyecto', proyecto: 'Desarrollo', tipo: 'Seguimiento',
    horaTexto: '04:00 p.m. - 05:00 p.m.', plataforma: 'Zoom', estatus: 'Confirmada',
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

// Reuniones que ya ocurrieron — alimentan la pestaña Historial. Son registros
// aparte de REUNIONES_INICIALES (esas son las próximas) aunque compartan
// proyecto/tipo, porque representan hechos ya cerrados, con su propio
// objetivo, acuerdos y documentos entregados.
const HISTORIAL_INICIAL: Reunion[] = [
  {
    id: 'h1', fecha: new Date(2026, 8, 17, 10, 0),
    titulo: 'Revisión de avances', proyecto: 'Reclutamiento TOTIS', tipo: 'Seguimiento',
    horaTexto: '10:00 a.m. - 11:00 a.m.', duracionTexto: '1 h', duracionMinutos: 60,
    plataforma: 'Google Meet', enlace: 'https://meet.google.com/abc-defg-hij', estatus: 'Realizada',
    equipo: ['A', 'M', 'R'], extra: 2,
    descripcion: 'Se analizaron los resultados del mes, los candidatos en proceso y se ajustaron algunas etapas del proyecto para mejorar tiempos de respuesta.',
    objetivo: 'Revisar avances del proceso de reclutamiento y definir los próximos pasos.',
    acuerdos: [
      'Continuar con la evaluación de candidatos en fase final.',
      'Enviar propuesta de ajustes al proceso de selección.',
      'Programar siguiente reunión de seguimiento.',
    ],
    participantes: [
      { nombre: 'Ana Torres', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
      { nombre: 'Carla Ruiz' },
      { nombre: 'Jorge Ramírez' },
      { nombre: 'Sofía Campos' },
    ],
    documentos: 1, notas: 3,
    documentosDetalle: [{ nombre: 'Minuta - Revisión de avances', fecha: '17 sep 2026', tamano: '320 KB' }],
  },
  {
    id: 'h2', fecha: new Date(2026, 8, 10, 12, 30),
    titulo: 'Seguimiento de candidatos', proyecto: 'Reclutamiento TOTIS', tipo: 'Seguimiento',
    horaTexto: '12:30 p.m. - 01:30 p.m.', duracionTexto: '1 h', duracionMinutos: 60,
    plataforma: 'Microsoft Teams', estatus: 'Realizada',
    equipo: ['A', 'M'], extra: 1,
    descripcion: 'Revisión puntual del avance de candidatos en la etapa de entrevistas técnicas.',
    objetivo: 'Dar seguimiento a los candidatos en proceso de entrevista técnica.',
    acuerdos: [
      'Agendar segunda ronda con los 3 candidatos finalistas.',
      'Compartir resultados de las pruebas técnicas al equipo.',
    ],
    participantes: [
      { nombre: 'Ana Torres', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
      { nombre: 'Jorge Ramírez' },
    ],
    documentos: 1, notas: 1,
    documentosDetalle: [{ nombre: 'Resultados mensuales', fecha: '10 sep 2026', tamano: '1.2 MB' }],
  },
  {
    id: 'h3', fecha: new Date(2026, 8, 2, 9, 0),
    titulo: 'Presentación de resultados', proyecto: 'Marketing', tipo: 'Presentación',
    horaTexto: '09:00 a.m. - 10:00 a.m.', duracionTexto: '1 h', duracionMinutos: 60,
    plataforma: 'Google Meet', estatus: 'Cancelada',
    equipo: ['C', 'L'],
    descripcion: 'Presentación de resultados de la campaña de marketing del trimestre.',
    objetivo: 'Compartir resultados de campaña con el equipo directivo.',
    participantes: [
      { nombre: 'Carla Ruiz', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
    ],
    documentos: 0, notas: 0,
  },
  {
    id: 'h4', fecha: new Date(2026, 7, 29, 11, 0),
    titulo: 'Planeación Q4', proyecto: 'Desarrollo', tipo: 'Planeación',
    horaTexto: '11:00 a.m. - 12:00 p.m.', duracionTexto: '1 h', duracionMinutos: 60,
    plataforma: 'Zoom', estatus: 'Realizada',
    equipo: ['R', 'C'], extra: 1,
    descripcion: 'Definición de objetivos de desarrollo para el último trimestre del año.',
    objetivo: 'Planear las prioridades técnicas del equipo para Q4.',
    acuerdos: [
      'Priorizar la migración del módulo de facturación.',
      'Reservar una semana de buffer para pruebas.',
    ],
    participantes: [
      { nombre: 'Jorge Ramírez', rol: 'Organizador' },
      { nombre: 'Carla Ruiz' },
      { nombre: 'Sofía Campos' },
    ],
    documentos: 1, notas: 2,
    documentosDetalle: [{ nombre: 'Estrategia Q4', fecha: '02 sep 2026', tamano: '850 KB' }],
  },
  {
    id: 'h5', fecha: new Date(2026, 7, 12, 16, 0),
    titulo: 'Revisión de estrategia', proyecto: 'Marketing', tipo: 'Seguimiento',
    horaTexto: '04:00 p.m. - 05:00 p.m.', duracionTexto: '1 h', duracionMinutos: 60,
    plataforma: 'Google Meet', estatus: 'No realizada',
    equipo: ['C', 'L'], extra: 1,
    descripcion: 'Reunión programada para revisar la estrategia de marketing del semestre.',
    objetivo: 'Revisar y ajustar la estrategia de marketing vigente.',
    participantes: [
      { nombre: 'Carla Ruiz', rol: 'Organizadora' },
      { nombre: 'Luis Mendoza' },
      { nombre: 'Sofía Campos' },
    ],
    documentos: 0, notas: 0,
  },
]

const PROYECTOS = Array.from(new Set(REUNIONES_INICIALES.map((r) => r.proyecto)))
const TIPOS = Array.from(new Set(REUNIONES_INICIALES.map((r) => r.tipo)))
const PLATAFORMAS = Array.from(new Set(REUNIONES_INICIALES.map((r) => r.plataforma)))
const ORGANIZADORES = Array.from(
  new Set(
    REUNIONES_INICIALES.flatMap((r) => r.participantes.filter((p) => p.rol?.startsWith('Organizad')).map((p) => p.nombre))
  )
)

const PROYECTOS_HISTORIAL = Array.from(new Set(HISTORIAL_INICIAL.map((r) => r.proyecto)))
const TIPOS_HISTORIAL = Array.from(new Set(HISTORIAL_INICIAL.map((r) => r.tipo)))

const SUBTABS = ['Detalles', 'Participantes', 'Documentos', 'Notas'] as const
const SUBTABS_HISTORIAL = ['Resumen', 'Participantes', 'Documentos', 'Notas'] as const
const COLORES_AVATAR = ['bg-[#19b6bc]', 'bg-[#00537f]', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500']

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function formatoFecha(fecha: Date) {
  const dia = fecha.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')
  return {
    dia: dia.charAt(0).toUpperCase() + dia.slice(1),
    numero: fecha.getDate(),
    mes: fecha.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '').toUpperCase(),
  }
}

// --- Popover genérico: cierra al hacer click afuera. Usado para los
// dropdowns de filtro, filtros avanzados y el menú "⋮" de cada reunión —
// evita repetir la misma lógica de apertura/cierre en cada uno. ---
function usePopover() {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [abierto])

  return { abierto, setAbierto, ref }
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
            Conecta, colabora y avanza. Gestiona tus reuniones en un solo lugar.
          </p>
        </div>
      </div>
    </div>
  )
}

function EstatusBadge({ estatus }: { estatus: Estatus }) {
  const estilos: Record<Estatus, string> = {
    Confirmada: 'bg-emerald-500/10 text-emerald-500',
    Pendiente: 'bg-amber-500/10 text-amber-500',
    Cancelada: 'bg-red-500/10 text-red-500',
    Realizada: 'bg-emerald-500/10 text-emerald-500',
    'No realizada': 'bg-slate-500/10 text-slate-500',
  }
  return (
    <span className={clsx('flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', estilos[estatus])}>
      {estatus}
    </span>
  )
}

function DateBadge({ fecha, small }: { fecha: Date; small?: boolean }) {
  const f = formatoFecha(fecha)
  return (
    <div className={clsx('flex flex-shrink-0 flex-col items-center justify-center rounded-lg bg-surface', small ? 'w-12 py-1.5' : 'w-14 py-2')}>
      <span className="text-[9px] font-bold uppercase tracking-wide text-brand">{f.dia}</span>
      <span className={clsx('font-extrabold text-ink', small ? 'text-sm' : 'text-lg')}>{f.numero}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-tertiary">{f.mes}</span>
    </div>
  )
}

function AvatarStack({ equipo, extra }: { equipo: string[]; extra?: number }) {
  return (
    <div className="flex -space-x-2">
      {equipo.map((letra, i) => (
        <span key={i} className={clsx('flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[11px] font-bold text-white', COLORES_AVATAR[i % COLORES_AVATAR.length])}>
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

// --- Dropdown de selección única (Proyecto / Tipo / Periodo). Cada uno
// existe para resolver un recorte concreto de la lista, por eso filtran de
// verdad en vez de ser solo decorativos. ---
function FiltroDropdown({
  icon, valor, opciones, etiquetaTodos, onCambiar,
}: {
  icon?: React.ReactNode
  valor: string
  opciones: string[]
  etiquetaTodos: string
  onCambiar: (v: string) => void
}) {
  const { abierto, setAbierto, ref } = usePopover()
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 whitespace-nowrap rounded-full border border-surface-border bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        {icon}
        {valor}
        <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
      </button>
      {abierto && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
          <button
            type="button"
            onClick={() => { onCambiar(etiquetaTodos); setAbierto(false) }}
            className={clsx('block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-surface', valor === etiquetaTodos ? 'text-brand' : 'text-ink-secondary')}
          >
            {etiquetaTodos}
          </button>
          {opciones.map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => { onCambiar(op); setAbierto(false) }}
              className={clsx('block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-surface', valor === op ? 'text-brand' : 'text-ink-secondary')}
            >
              {op}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface FiltrosAvanzadosState {
  estado: 'Todas' | Estatus
  plataformas: Set<string>
  organizador: string
}

function FiltrosAvanzadosPopover({
  filtros, onAplicar, estados = ['Confirmada', 'Pendiente', 'Cancelada'], plataformas = PLATAFORMAS, organizadores = ORGANIZADORES,
}: {
  filtros: FiltrosAvanzadosState
  onAplicar: (f: FiltrosAvanzadosState) => void
  estados?: Estatus[]
  plataformas?: string[]
  organizadores?: string[]
}) {
  const { abierto, setAbierto, ref } = usePopover()
  const [borrador, setBorrador] = useState(filtros)

  useEffect(() => { if (abierto) setBorrador(filtros) }, [abierto, filtros])

  const activo = filtros.estado !== 'Todas' || filtros.plataformas.size > 0 || filtros.organizador !== 'Todos'

  function alternarPlataforma(p: string) {
    setBorrador((b) => {
      const nuevas = new Set(b.plataformas)
      if (nuevas.has(p)) nuevas.delete(p)
      else nuevas.add(p)
      return { ...b, plataformas: nuevas }
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Filtros avanzados"
        className={clsx(
          'relative rounded-full border p-2.5 hover:bg-surface',
          activo ? 'border-brand text-brand' : 'border-surface-border text-ink-secondary'
        )}
      >
        <Filter className="h-4 w-4" />
        {activo && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand" />}
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-surface-border bg-card p-4 shadow-card-lg">
          <p className="mb-2 text-xs font-bold text-ink">Estado</p>
          <div className="mb-3 flex flex-col gap-1.5">
            {(['Todas', ...estados] as const).map((e) => (
              <label key={e} className="flex items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="radio"
                  name="estado"
                  checked={borrador.estado === e}
                  onChange={() => setBorrador((b) => ({ ...b, estado: e }))}
                  className="accent-brand"
                />
                {e}
              </label>
            ))}
          </div>

          <p className="mb-2 text-xs font-bold text-ink">Plataforma</p>
          <div className="mb-3 flex flex-col gap-1.5">
            {plataformas.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs text-ink-secondary">
                <input type="checkbox" checked={borrador.plataformas.has(p)} onChange={() => alternarPlataforma(p)} className="accent-brand" />
                {p}
              </label>
            ))}
          </div>

          <p className="mb-1.5 text-xs font-bold text-ink">Organizador</p>
          <select
            value={borrador.organizador}
            onChange={(e) => setBorrador((b) => ({ ...b, organizador: e.target.value }))}
            className="mb-4 w-full rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
          >
            <option>Todos</option>
            {organizadores.map((o) => <option key={o}>{o}</option>)}
          </select>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { const limpio: FiltrosAvanzadosState = { estado: 'Todas', plataformas: new Set(), organizador: 'Todos' }; setBorrador(limpio); onAplicar(limpio); setAbierto(false) }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-tertiary hover:bg-surface"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => { onAplicar(borrador); setAbierto(false) }}
              className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-dark"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface Filtros {
  busqueda: string
  proyecto: string
  tipo: string
  periodo: string
  avanzados: FiltrosAvanzadosState
  orden: 'proximas' | 'lejanas'
}

function BarraFiltros({
  filtros, onCambiar,
}: { filtros: Filtros; onCambiar: (f: Partial<Filtros>) => void }) {
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
      <FiltroDropdown valor={filtros.proyecto} opciones={PROYECTOS} etiquetaTodos="Todos los proyectos" onCambiar={(v) => onCambiar({ proyecto: v })} />
      <FiltroDropdown valor={filtros.tipo} opciones={TIPOS} etiquetaTodos="Todos los tipos" onCambiar={(v) => onCambiar({ tipo: v })} />
      <FiltroDropdown
        icon={<Calendar className="h-3.5 w-3.5 text-ink-tertiary" />}
        valor={filtros.periodo}
        opciones={['Hoy', 'Esta semana', 'Este mes']}
        etiquetaTodos="Cualquier fecha"
        onCambiar={(v) => onCambiar({ periodo: v })}
      />
      <FiltrosAvanzadosPopover filtros={filtros.avanzados} onAplicar={(avanzados) => onCambiar({ avanzados })} />
    </div>
  )
}

interface FiltrosHistorial {
  busqueda: string
  proyecto: string
  tipo: string
  anio: string
  avanzados: FiltrosAvanzadosState
  orden: 'recientes' | 'antiguas'
}

const ANIOS_HISTORIAL = Array.from(new Set(HISTORIAL_INICIAL.map((r) => String(r.fecha.getFullYear()))))

function BarraFiltrosHistorial({
  filtros, onCambiar,
}: { filtros: FiltrosHistorial; onCambiar: (f: Partial<FiltrosHistorial>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          value={filtros.busqueda}
          onChange={(e) => onCambiar({ busqueda: e.target.value })}
          placeholder="Buscar en historial..."
          className="w-full rounded-full border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
      <FiltroDropdown valor={filtros.proyecto} opciones={PROYECTOS_HISTORIAL} etiquetaTodos="Todos los proyectos" onCambiar={(v) => onCambiar({ proyecto: v })} />
      <FiltroDropdown valor={filtros.tipo} opciones={TIPOS_HISTORIAL} etiquetaTodos="Todos los tipos" onCambiar={(v) => onCambiar({ tipo: v })} />
      <FiltroDropdown
        icon={<Calendar className="h-3.5 w-3.5 text-ink-tertiary" />}
        valor={filtros.anio}
        opciones={ANIOS_HISTORIAL}
        etiquetaTodos="Todos los años"
        onCambiar={(v) => onCambiar({ anio: v })}
      />
      <button
        type="button"
        onClick={() => onCambiar({ orden: filtros.orden === 'recientes' ? 'antiguas' : 'recientes' })}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-border bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        {filtros.orden === 'recientes' ? 'Más recientes' : 'Más antiguas'}
        <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
      </button>
      <FiltrosAvanzadosPopover
        filtros={filtros.avanzados}
        onAplicar={(avanzados) => onCambiar({ avanzados })}
        estados={['Realizada', 'No realizada', 'Cancelada']}
        plataformas={Array.from(new Set(HISTORIAL_INICIAL.map((r) => r.plataforma)))}
        organizadores={Array.from(new Set(HISTORIAL_INICIAL.flatMap((r) => r.participantes.filter((p) => p.rol?.startsWith('Organizad')).map((p) => p.nombre))))}
      />
    </div>
  )
}

function ReunionListItem({ r, seleccionada, onClick }: { r: Reunion; seleccionada: boolean; onClick: () => void }) {
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
        <DateBadge fecha={r.fecha} small />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-ink">{r.titulo}</p>
            <EstatusBadge estatus={r.estatus} />
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-tertiary">Proyecto: {r.proyecto}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-tertiary">
            <span>{r.horaTexto}</span>
            <span className="flex items-center gap-1"><Video className="h-3 w-3" />{r.plataforma}</span>
          </div>
        </div>
        <AvatarStack equipo={r.equipo} extra={r.extra} />
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
      </button>
    </li>
  )
}

function ListaReuniones({
  reuniones, seleccionadaId, onSeleccionar, orden, onOrden,
}: { reuniones: Reunion[]; seleccionadaId: string; onSeleccionar: (id: string) => void; orden: Filtros['orden']; onOrden: (o: Filtros['orden']) => void }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Próximas reuniones ({reuniones.length})</h3>
        <button
          type="button"
          onClick={() => onOrden(orden === 'proximas' ? 'lejanas' : 'proximas')}
          className="flex items-center gap-1 text-xs font-semibold text-ink-tertiary hover:text-ink-secondary"
        >
          {orden === 'proximas' ? 'Más próximas' : 'Más lejanas'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {reuniones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">No se encontraron reuniones con estos filtros.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reuniones.map((r) => (
            <ReunionListItem key={r.id} r={r} seleccionada={r.id === seleccionadaId} onClick={() => onSeleccionar(r.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function nombreMesAnio(fecha: Date) {
  const texto = fecha.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function ListaHistorial({
  reuniones, seleccionadaId, onSeleccionar,
}: { reuniones: Reunion[]; seleccionadaId: string; onSeleccionar: (id: string) => void }) {
  const grupos: { etiqueta: string; items: Reunion[] }[] = []
  for (const r of reuniones) {
    const etiqueta = nombreMesAnio(r.fecha)
    const grupo = grupos.find((g) => g.etiqueta === etiqueta)
    if (grupo) grupo.items.push(r)
    else grupos.push({ etiqueta, items: [r] })
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-3 text-sm font-bold text-ink">Historial de reuniones ({reuniones.length})</h3>

      {reuniones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <CalendarClock className="h-8 w-8" />
          <p className="text-sm">No se encontraron reuniones con estos filtros.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((g) => (
            <div key={g.etiqueta}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">{g.etiqueta}</p>
              <ul className="flex flex-col gap-3">
                {g.items.map((r) => (
                  <ReunionListItem key={r.id} r={r} seleccionada={r.id === seleccionadaId} onClick={() => onSeleccionar(r.id)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AccionesMenu({ onCancelar }: { onCancelar: () => void }) {
  const { abierto, setAbierto, ref } = usePopover()
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-label="Más opciones" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface">
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
          <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
            <CalendarPlus className="h-4 w-4" />
            Agregar a mi calendario
          </button>
          <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
            <Link2 className="h-4 w-4" />
            Copiar enlace
          </button>
          <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
            <ClipboardCopy className="h-4 w-4" />
            Copiar información
          </button>
          <div className="my-1 border-t border-surface-border" />
          <button
            type="button"
            onClick={() => { onCancelar(); setAbierto(false) }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-500 hover:bg-red-500/10"
          >
            <XCircle className="h-4 w-4" />
            Cancelar reunión
          </button>
        </div>
      )}
    </div>
  )
}

function DetalleReunion({ r, onCancelar, onReprogramar }: { r: Reunion; onCancelar: () => void; onReprogramar: () => void }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Detalles')

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <DateBadge fecha={r.fecha} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{r.titulo}</h3>
            <EstatusBadge estatus={r.estatus} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5" />
            {r.horaTexto}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Video className="h-3.5 w-3.5" />
            {r.plataforma}
          </p>
        </div>
        <AccionesMenu onCancelar={onCancelar} />
      </div>

      {/* Unirme es la acción principal (mayor peso visual) — el resto de
         acciones (reprogramar, cancelar) tiene menos jerarquía a propósito. */}
      <button
        type="button"
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] py-2.5 text-xs font-bold text-white hover:opacity-90"
      >
        <Video className="h-3.5 w-3.5" />
        Unirme
      </button>

      <button
        type="button"
        onClick={onReprogramar}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Reprogramar
      </button>

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

function AccionesMenuHistorial() {
  const { abierto, setAbierto, ref } = usePopover()
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-label="Más opciones" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface">
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
          <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
            <ClipboardCopy className="h-4 w-4" />
            Copiar información
          </button>
          <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
            <FileText className="h-4 w-4" />
            Exportar resumen
          </button>
        </div>
      )}
    </div>
  )
}

const BANNER_RESULTADO: Record<Estatus, { texto: string; clase: string } | null> = {
  Confirmada: null,
  Pendiente: null,
  Realizada: { texto: 'Esta reunión se realizó correctamente. Gracias por tu participación.', clase: 'bg-emerald-500/10 text-emerald-600' },
  Cancelada: { texto: 'Esta reunión fue cancelada y no se llevó a cabo.', clase: 'bg-red-500/10 text-red-600' },
  'No realizada': { texto: 'Esta reunión no se realizó.', clase: 'bg-slate-500/10 text-slate-500' },
}

function DetalleHistorial({ r }: { r: Reunion }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS_HISTORIAL)[number]>('Resumen')
  const organizador = r.participantes.find((p) => p.rol?.startsWith('Organizad'))?.nombre ?? '—'
  const banner = BANNER_RESULTADO[r.estatus]

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <DateBadge fecha={r.fecha} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{r.titulo}</h3>
            <EstatusBadge estatus={r.estatus} />
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Clock className="h-3.5 w-3.5" />
            {r.horaTexto}{r.duracionTexto ? ` (${r.duracionTexto})` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-tertiary">
            <Video className="h-3.5 w-3.5" />
            {r.plataforma}
          </p>
        </div>
        <AccionesMenuHistorial />
      </div>

      {banner && (
        <div className={clsx('mt-4 rounded-xl px-4 py-2.5 text-xs font-semibold', banner.clase)}>
          {banner.texto}
        </div>
      )}

      <div className="mt-5 flex gap-5 overflow-x-auto border-b border-surface-border">
        {SUBTABS_HISTORIAL.map((t) => {
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
        {subtab === 'Resumen' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Proyecto</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.proyecto}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Tipo de reunión</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.tipo}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Organizador</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{organizador}</p>
              </div>
            </div>
            {r.objetivo && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Objetivo</p>
                <p className="mt-0.5 text-sm text-ink-secondary">{r.objetivo}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Descripción</p>
              <p className="mt-0.5 text-sm text-ink-secondary">{r.descripcion}</p>
            </div>
            {r.acuerdos && r.acuerdos.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Acuerdos principales</p>
                <ul className="flex flex-col gap-1.5">
                  {r.acuerdos.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-secondary">
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">✓</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {subtab === 'Participantes' && <ListaParticipantes participantes={r.participantes} completa />}

        {subtab === 'Documentos' && (
          r.documentosDetalle && r.documentosDetalle.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {r.documentosDetalle.map((d) => (
                <li key={d.nombre} className="flex items-center gap-2.5 rounded-lg border border-surface-border p-2.5">
                  <FileText className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">{d.nombre}</span>
                    <span className="block text-[11px] text-ink-tertiary">{d.fecha} · {d.tamano}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVacioSubtab icon={<FileText className="h-6 w-6" />} texto="No se compartieron documentos para esta reunión." />
          )
        )}

        {subtab === 'Notas' && (
          <EstadoVacioSubtab icon={<StickyNote className="h-6 w-6" />} texto="No hay notas registradas para esta reunión." />
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
            <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', COLORES_AVATAR[i % COLORES_AVATAR.length])}>
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

// "Hoy" fijo de la demo — coincide con la fecha real del entorno (2026-09-21)
// para que las reuniones de ejemplo (17-23 sep) queden alrededor de hoy.
const HOY_DEMO = new Date(2026, 8, 21)

/**
 * Cada elemento del calendario resuelve algo puntual, no es solo decorativo:
 * - Flechas de mes: navegar entre meses (cambian que reuniones se listan).
 * - Día con punto "con reunión": escaneo rápido de qué días tienen algo,
 *   sin necesidad de hacer click.
 * - Anillo "hoy": ubica la fecha real de hoy en el mes, sea cual sea el día
 *   que se tenga seleccionado.
 * - Relleno "seleccionado": el día que se está inspeccionando ahora mismo.
 * - Lista debajo: el detalle concreto de ESE día — para qué sirve haberlo
 *   seleccionado. Cada fila lleva directo al panel de detalle principal.
 */
function VistaCalendario({ reuniones, onSeleccionarReunion }: { reuniones: Reunion[]; onSeleccionarReunion: (id: string) => void }) {
  const [mesIndex, setMesIndex] = useState(HOY_DEMO.getMonth())
  const [anio, setAnio] = useState(HOY_DEMO.getFullYear())
  const [diaSeleccionado, setDiaSeleccionado] = useState(HOY_DEMO.getDate())

  const celdas = useCalendarGrid(anio, mesIndex)
  const nombreMes = new Date(anio, mesIndex, 1).toLocaleDateString('es-MX', { month: 'long' })
  const esMesDeHoy = mesIndex === HOY_DEMO.getMonth() && anio === HOY_DEMO.getFullYear()

  const reunionesDelMes = reuniones.filter((r) => r.fecha.getMonth() === mesIndex && r.fecha.getFullYear() === anio)
  const diasConReunion = new Set(reunionesDelMes.map((r) => r.fecha.getDate()))
  const reunionesDelDia = reunionesDelMes
    .filter((r) => r.fecha.getDate() === diaSeleccionado)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

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
          const esHoy = c.current && esMesDeHoy && c.day === HOY_DEMO.getDate()
          const esSeleccionado = c.current && c.day === diaSeleccionado
          const tieneReunion = c.current && diasConReunion.has(c.day) && !esSeleccionado
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
              <span className={clsx('h-1 w-1 rounded-full', tieneReunion ? 'bg-[#19b6bc]' : 'bg-transparent')} />
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
        {reunionesDelDia.length === 0 ? (
          <p className="text-xs text-ink-tertiary">No hay reuniones este día.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reunionesDelDia.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionarReunion(r.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-surface-border p-2 text-left hover:bg-surface"
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#19b6bc]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">{r.titulo}</span>
                    <span className="block text-[11px] text-ink-tertiary">{r.horaTexto}</span>
                  </span>
                  <EstatusBadge estatus={r.estatus} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const COLORES_BARRA = ['bg-[#19b6bc]', 'bg-[#00537f]', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500']

/**
 * Cada estadística se calcula a partir de las reuniones reales del historial
 * en el mes seleccionado, no son cifras fijas — así el panel siempre refleja
 * lo que efectivamente ocurrió ese mes.
 */
function ResumenPeriodo({ historial }: { historial: Reunion[] }) {
  const mesesDisponibles = Array.from(new Set(historial.map((r) => nombreMesAnio(r.fecha))))
  const [mesSeleccionado, setMesSeleccionado] = useState(mesesDisponibles[0] ?? nombreMesAnio(HOY_DEMO))

  const delMes = historial.filter((r) => nombreMesAnio(r.fecha) === mesSeleccionado)
  const realizadas = delMes.filter((r) => r.estatus === 'Realizada')
  const minutosTotales = realizadas.reduce((acc, r) => acc + (r.duracionMinutos ?? 0), 0)
  const horas = Math.floor(minutosTotales / 60)
  const minutos = minutosTotales % 60
  const proyectosTratados = new Set(delMes.map((r) => r.proyecto))
  const participantesTotales = new Set(delMes.flatMap((r) => r.participantes.map((p) => p.nombre)))

  const distribucion = Array.from(proyectosTratados).map((proyecto) => ({
    proyecto,
    total: delMes.filter((r) => r.proyecto === proyecto).length,
  })).sort((a, b) => b.total - a.total)
  const maxDistribucion = Math.max(1, ...distribucion.map((d) => d.total))

  const documentosRecientes = delMes
    .flatMap((r) => r.documentosDetalle ?? [])
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">Resumen del período</h3>
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface px-2 py-1 text-xs font-semibold text-ink-secondary focus:border-brand focus:outline-none"
          >
            {mesesDisponibles.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-extrabold text-ink">{realizadas.length}</p>
            <p className="text-[11px] text-ink-tertiary">Reuniones realizadas</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-extrabold text-ink">{horas}h {minutos > 0 ? `${minutos}m` : ''}</p>
            <p className="text-[11px] text-ink-tertiary">Tiempo en reuniones</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-extrabold text-ink">{proyectosTratados.size}</p>
            <p className="text-[11px] text-ink-tertiary">Proyectos tratados</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-lg font-extrabold text-ink">{participantesTotales.size}</p>
            <p className="text-[11px] text-ink-tertiary">Participantes totales</p>
          </div>
        </div>

        {distribucion.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-bold text-ink">Distribución por proyecto</p>
            <div className="flex flex-col gap-2">
              {distribucion.map((d, i) => (
                <div key={d.proyecto}>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-ink-tertiary">
                    <span className="truncate">{d.proyecto}</span>
                    <span>{d.total}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={clsx('h-full rounded-full', COLORES_BARRA[i % COLORES_BARRA.length])}
                      style={{ width: `${(d.total / maxDistribucion) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-bold text-ink">Documentos recientes</p>
        {documentosRecientes.length === 0 ? (
          <p className="text-xs text-ink-tertiary">No hay documentos este período.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documentosRecientes.map((d) => (
              <li key={d.nombre} className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{d.nombre}</span>
                  <span className="block text-[11px] text-ink-tertiary">{d.fecha} · {d.tamano}</span>
                </span>
                <Download className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-secondary">{label}</span>
      {children}
    </label>
  )
}

const inputClase = 'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none'

function ModalSolicitarReunion({
  abierto, onCerrar, onEnviar,
}: { abierto: boolean; onCerrar: () => void; onEnviar: (datos: { motivo: string; proyecto: string; descripcion: string; fecha: string; horario: string }) => void }) {
  const [motivo, setMotivo] = useState(TIPOS[0])
  const [proyecto, setProyecto] = useState(PROYECTOS[0])
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState('')
  const [horario, setHorario] = useState('Por la mañana')

  function enviar() {
    onEnviar({ motivo, proyecto, descripcion, fecha, horario })
    setDescripcion('')
    setFecha('')
  }

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title="Solicitar reunión" size="sm">
      <div className="flex flex-col gap-4">
        <Campo label="¿Sobre qué quieres hablar?">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClase}>
            {TIPOS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Proyecto">
          <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={inputClase}>
            {PROYECTOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo label="Cuéntanos brevemente el motivo">
          <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={clsx(inputClase, 'resize-none')} />
        </Campo>
        <Campo label="Fecha preferida">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClase} />
        </Campo>
        <Campo label="Horario preferido">
          <select value={horario} onChange={(e) => setHorario(e.target.value)} className={inputClase}>
            <option>Por la mañana</option>
            <option>Por la tarde</option>
            <option>Por la noche</option>
          </select>
        </Campo>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-tertiary hover:bg-surface">
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={!fecha} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50">
            Enviar solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ModalReprogramar({ abierto, onCerrar, reunion }: { abierto: boolean; onCerrar: () => void; reunion: Reunion | null }) {
  const [fecha, setFecha] = useState('')
  const [horario, setHorario] = useState('')
  const [motivo, setMotivo] = useState('')

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title="Solicitar reprogramación" size="sm">
      <div className="flex flex-col gap-4">
        {reunion && <p className="text-xs text-ink-tertiary">Reunión actual: <span className="font-semibold text-ink-secondary">{reunion.titulo}</span></p>}
        <Campo label="Fecha preferida">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputClase} />
        </Campo>
        <Campo label="Horario">
          <input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} className={inputClase} />
        </Campo>
        <Campo label="Motivo">
          <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={clsx(inputClase, 'resize-none')} />
        </Campo>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-tertiary hover:bg-surface">
            Cancelar
          </button>
          <button type="button" onClick={onCerrar} disabled={!fecha || !horario} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50">
            Enviar solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}

const TABS_PRINCIPALES = ['Próximas', 'Historial'] as const

export function PortalClienteReunionesPage() {
  const [tab, setTab] = useState<(typeof TABS_PRINCIPALES)[number]>('Próximas')
  const [reuniones, setReuniones] = useState<Reunion[]>(REUNIONES_INICIALES)
  const [historial, setHistorial] = useState<Reunion[]>(HISTORIAL_INICIAL)
  const [seleccionadaId, setSeleccionadaId] = useState(REUNIONES_INICIALES[0].id)
  const [seleccionadaHistorialId, setSeleccionadaHistorialId] = useState(HISTORIAL_INICIAL[0].id)
  const [modalSolicitar, setModalSolicitar] = useState(false)
  const [modalReprogramar, setModalReprogramar] = useState(false)

  const [filtros, setFiltros] = useState<Filtros>({
    busqueda: '', proyecto: 'Todos los proyectos', tipo: 'Todos los tipos', periodo: 'Cualquier fecha',
    avanzados: { estado: 'Todas', plataformas: new Set(), organizador: 'Todos' },
    orden: 'proximas',
  })

  const [filtrosHistorial, setFiltrosHistorial] = useState<FiltrosHistorial>({
    busqueda: '', proyecto: 'Todos los proyectos', tipo: 'Todos los tipos', anio: 'Todos los años',
    avanzados: { estado: 'Todas', plataformas: new Set(), organizador: 'Todos' },
    orden: 'recientes',
  })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  function actualizarFiltrosHistorial(cambio: Partial<FiltrosHistorial>) {
    setFiltrosHistorial((f) => ({ ...f, ...cambio }))
  }

  const ahora = new Date(2026, 8, 21) // "hoy" fijo dentro de la demo, coincide con los datos de ejemplo

  const proximas = reuniones
    .filter((r) => ESTATUS_PROXIMAS.includes(r.estatus))
    .filter((r) => r.titulo.toLowerCase().includes(filtros.busqueda.toLowerCase()) || r.proyecto.toLowerCase().includes(filtros.busqueda.toLowerCase()))
    .filter((r) => filtros.proyecto === 'Todos los proyectos' || r.proyecto === filtros.proyecto)
    .filter((r) => filtros.tipo === 'Todos los tipos' || r.tipo === filtros.tipo)
    .filter((r) => {
      if (filtros.periodo === 'Cualquier fecha') return true
      const dias = Math.floor((r.fecha.getTime() - ahora.getTime()) / 86400000)
      if (filtros.periodo === 'Hoy') return dias === 0
      if (filtros.periodo === 'Esta semana') return dias >= 0 && dias <= 7
      if (filtros.periodo === 'Este mes') return r.fecha.getMonth() === ahora.getMonth() && r.fecha.getFullYear() === ahora.getFullYear()
      return true
    })
    .filter((r) => filtros.avanzados.estado === 'Todas' || r.estatus === filtros.avanzados.estado)
    .filter((r) => filtros.avanzados.plataformas.size === 0 || filtros.avanzados.plataformas.has(r.plataforma))
    .filter((r) => filtros.avanzados.organizador === 'Todos' || r.participantes.some((p) => p.nombre === filtros.avanzados.organizador && p.rol?.startsWith('Organizad')))
    .sort((a, b) => (filtros.orden === 'proximas' ? a.fecha.getTime() - b.fecha.getTime() : b.fecha.getTime() - a.fecha.getTime()))

  const seleccionada = proximas.find((r) => r.id === seleccionadaId) ?? proximas[0] ?? null

  const historialCompleto = [...historial, ...reuniones.filter((r) => r.estatus === 'Cancelada')]

  const historialFiltrado = historialCompleto
    .filter((r) => r.titulo.toLowerCase().includes(filtrosHistorial.busqueda.toLowerCase()) || r.proyecto.toLowerCase().includes(filtrosHistorial.busqueda.toLowerCase()))
    .filter((r) => filtrosHistorial.proyecto === 'Todos los proyectos' || r.proyecto === filtrosHistorial.proyecto)
    .filter((r) => filtrosHistorial.tipo === 'Todos los tipos' || r.tipo === filtrosHistorial.tipo)
    .filter((r) => filtrosHistorial.anio === 'Todos los años' || String(r.fecha.getFullYear()) === filtrosHistorial.anio)
    .filter((r) => filtrosHistorial.avanzados.estado === 'Todas' || r.estatus === filtrosHistorial.avanzados.estado)
    .filter((r) => filtrosHistorial.avanzados.plataformas.size === 0 || filtrosHistorial.avanzados.plataformas.has(r.plataforma))
    .filter((r) => filtrosHistorial.avanzados.organizador === 'Todos' || r.participantes.some((p) => p.nombre === filtrosHistorial.avanzados.organizador && p.rol?.startsWith('Organizad')))
    .sort((a, b) => (filtrosHistorial.orden === 'recientes' ? b.fecha.getTime() - a.fecha.getTime() : a.fecha.getTime() - b.fecha.getTime()))

  const seleccionadaHistorial = historialFiltrado.find((r) => r.id === seleccionadaHistorialId) ?? historialFiltrado[0] ?? null

  function cancelarReunion(id: string) {
    setReuniones((rs) => rs.map((r) => (r.id === id ? { ...r, estatus: 'Cancelada' as const } : r)))
  }

  function enviarSolicitud(datos: { motivo: string; proyecto: string; descripcion: string; fecha: string; horario: string }) {
    const [anio, mes, dia] = datos.fecha.split('-').map(Number)
    const nueva: Reunion = {
      id: crypto.randomUUID(),
      fecha: new Date(anio, mes - 1, dia, 9, 0),
      titulo: datos.descripcion || datos.motivo,
      proyecto: datos.proyecto,
      tipo: datos.motivo,
      horaTexto: datos.horario,
      plataforma: 'Google Meet',
      estatus: 'Pendiente',
      equipo: ['A'],
      descripcion: datos.descripcion || `Solicitud de reunión: ${datos.motivo}.`,
      recordatorio: '15 minutos antes',
      participantes: [{ nombre: 'Ana Torres', rol: 'Organizadora' }],
      documentos: 0, notas: 0,
    }
    setReuniones((rs) => [nueva, ...rs])
    setSeleccionadaId(nueva.id)
    setModalSolicitar(false)
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
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
          onClick={() => setModalSolicitar(true)}
          className="mb-2 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Solicitar reunión
        </button>
      </div>

      {tab === 'Próximas' && (
        <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
          {/* El buscador y los filtros quedan acotados al ancho de la lista
             + el detalle; el calendario es una columna aparte al costado. */}
          <div className="flex flex-col gap-5">
            <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <ListaReuniones
                reuniones={proximas}
                seleccionadaId={seleccionada?.id ?? ''}
                onSeleccionar={setSeleccionadaId}
                orden={filtros.orden}
                onOrden={(orden) => actualizarFiltros({ orden })}
              />
              {seleccionada ? (
                <DetalleReunion
                  r={seleccionada}
                  onCancelar={() => cancelarReunion(seleccionada.id)}
                  onReprogramar={() => setModalReprogramar(true)}
                />
              ) : (
                <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
                  <EstadoVacioSubtab icon={<CalendarClock className="h-6 w-6" />} texto="Selecciona una reunión de la lista para ver su detalle." />
                </div>
              )}
            </div>
          </div>
          <VistaCalendario reuniones={reuniones} onSeleccionarReunion={setSeleccionadaId} />
        </Reveal>
      )}

      {tab === 'Historial' && (
        <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-5">
            <BarraFiltrosHistorial filtros={filtrosHistorial} onCambiar={actualizarFiltrosHistorial} />
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
              <ListaHistorial
                reuniones={historialFiltrado}
                seleccionadaId={seleccionadaHistorial?.id ?? ''}
                onSeleccionar={setSeleccionadaHistorialId}
              />
              {seleccionadaHistorial ? (
                <DetalleHistorial r={seleccionadaHistorial} />
              ) : (
                <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
                  <EstadoVacioSubtab icon={<CalendarClock className="h-6 w-6" />} texto="Selecciona una reunión del historial para ver su detalle." />
                </div>
              )}
            </div>
          </div>
          <ResumenPeriodo historial={historialCompleto} />
        </Reveal>
      )}

      <ModalSolicitarReunion abierto={modalSolicitar} onCerrar={() => setModalSolicitar(false)} onEnviar={enviarSolicitud} />
      <ModalReprogramar abierto={modalReprogramar} onCerrar={() => setModalReprogramar(false)} reunion={seleccionada} />
    </div>
  )
}
