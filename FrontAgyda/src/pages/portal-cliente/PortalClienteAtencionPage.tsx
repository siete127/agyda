import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  Headphones, ChevronRight, ChevronDown, Search, Filter, Calendar,
  Plus, Paperclip, Send, HelpCircle, MessageCircle,
  FileText, Settings, Users, Monitor, ClipboardList, CheckCircle2, XCircle,
  Clock, Briefcase, Tag, UserCircle,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Modal } from '@/components/ui/Modal'
import atencionHero from '@/assets/atencion-hero.png'

// --- Datos de ejemplo — reemplazar por datos reales del backend cuando el
// panel se conecte al endpoint de solicitudes de atención/soporte. ---

type EstatusSolicitud = 'En proceso' | 'Resuelta' | 'Cerrada' | 'Esperando respuesta'

interface MensajeConversacion {
  autor: string
  esUsuario: boolean
  texto: string
  fecha: string
}

interface Solicitud {
  id: string
  folio: string
  titulo: string
  estatus: EstatusSolicitud
  creada: Date
  creadaTexto: string
  proyecto: string
  categoria: string
  asignadoA: string
  descripcion: string
  conversacion: MensajeConversacion[]
}

const SOLICITUDES_INICIALES: Solicitud[] = [
  {
    id: '1', folio: '#AT-124', titulo: 'Problema de acceso al portal', estatus: 'En proceso',
    creada: new Date(2026, 8, 21, 10, 24), creadaTexto: 'Hace 2 horas',
    proyecto: 'Reclutamiento TOTIS', categoria: 'Soporte técnico', asignadoA: 'Equipo AGYDA',
    descripcion: 'No puedo acceder al portal. Al ingresar con mi usuario me aparece un error de autenticación. ¿Podrían ayudarme a revisar?',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'Tengo problemas para ingresar al portal. Me aparece un error de autenticación.', fecha: '21 sep · 10:24 a.m.' },
      { autor: 'Soporte AGYDA', esUsuario: false, texto: 'Hola, gracias por tu mensaje.\nYa estamos revisando tu caso y te compartiremos una actualización en breve.', fecha: '21 sep · 11:03 a.m.' },
    ],
  },
  {
    id: '2', folio: '#AT-123', titulo: 'Cambio en campaña', estatus: 'Resuelta',
    creada: new Date(2026, 8, 20, 9, 0), creadaTexto: 'Ayer',
    proyecto: 'Campaña reclutamiento', categoria: 'Campañas', asignadoA: 'Equipo AGYDA',
    descripcion: 'Necesito modificar el alcance mensual configurado en la campaña activa.',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'Necesito modificar el alcance mensual configurado en la campaña activa.', fecha: '20 sep · 09:00 a.m.' },
      { autor: 'Soporte AGYDA', esUsuario: false, texto: 'Listo, ya actualizamos el alcance mensual a 400. Cualquier otro ajuste avísanos.', fecha: '20 sep · 11:20 a.m.' },
    ],
  },
  {
    id: '3', folio: '#AT-121', titulo: 'Duda sobre factura', estatus: 'Cerrada',
    creada: new Date(2026, 8, 18, 15, 0), creadaTexto: '18 sep 2026',
    proyecto: 'Reclutamiento TOTIS', categoria: 'Facturación', asignadoA: 'Equipo AGYDA',
    descripcion: 'Tengo una duda sobre el desglose de IVA en la factura FAC-00127.',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'Tengo una duda sobre el desglose de IVA en la factura FAC-00127.', fecha: '18 sep · 03:00 p.m.' },
      { autor: 'Soporte AGYDA', esUsuario: false, texto: 'Te compartimos el desglose por correo. Quedamos atentos.', fecha: '18 sep · 04:10 p.m.' },
    ],
  },
  {
    id: '4', folio: '#AT-120', titulo: 'Solicitud de reunión', estatus: 'Esperando respuesta',
    creada: new Date(2026, 8, 16, 12, 0), creadaTexto: '16 sep 2026',
    proyecto: 'Desarrollo', categoria: 'Reuniones', asignadoA: 'Equipo AGYDA',
    descripcion: 'Quisiera agendar una reunión adicional para revisar el avance del sitio web corporativo.',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'Quisiera agendar una reunión adicional para revisar el avance del sitio web corporativo.', fecha: '16 sep · 12:00 p.m.' },
    ],
  },
  {
    id: '5', folio: '#AT-118', titulo: 'Configuración de usuarios', estatus: 'Resuelta',
    creada: new Date(2026, 8, 12, 10, 0), creadaTexto: '12 sep 2026',
    proyecto: 'Reclutamiento TOTIS', categoria: 'Soporte técnico', asignadoA: 'Equipo AGYDA',
    descripcion: 'Necesito agregar dos usuarios nuevos con acceso de solo lectura.',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'Necesito agregar dos usuarios nuevos con acceso de solo lectura.', fecha: '12 sep · 10:00 a.m.' },
      { autor: 'Soporte AGYDA', esUsuario: false, texto: 'Usuarios creados y configurados con acceso de solo lectura.', fecha: '12 sep · 01:40 p.m.' },
    ],
  },
  {
    id: '6', folio: '#AT-117', titulo: 'Error en reporte', estatus: 'Cerrada',
    creada: new Date(2026, 8, 10, 9, 0), creadaTexto: '10 sep 2026',
    proyecto: 'Campaña reclutamiento', categoria: 'Soporte técnico', asignadoA: 'Equipo AGYDA',
    descripcion: 'El reporte mensual de alcance mostraba una cifra incorrecta en agosto.',
    conversacion: [
      { autor: 'Tú', esUsuario: true, texto: 'El reporte mensual de alcance mostraba una cifra incorrecta en agosto.', fecha: '10 sep · 09:00 a.m.' },
      { autor: 'Soporte AGYDA', esUsuario: false, texto: 'Corregimos el cálculo y regeneramos el reporte de agosto.', fecha: '10 sep · 02:15 p.m.' },
    ],
  },
]

const PROYECTOS = Array.from(new Set(SOLICITUDES_INICIALES.map((s) => s.proyecto)))
const CATEGORIAS = Array.from(new Set(SOLICITUDES_INICIALES.map((s) => s.categoria)))
const ESTADOS: EstatusSolicitud[] = ['En proceso', 'Resuelta', 'Cerrada', 'Esperando respuesta']

const CATEGORIA_ICONO: Record<string, React.ComponentType<{ className?: string }>> = {
  'Soporte técnico': Monitor,
  Campañas: Settings,
  Facturación: FileText,
  Reuniones: Users,
}

function iconoCategoria(categoria: string) {
  return CATEGORIA_ICONO[categoria] ?? ClipboardList
}

const FAQS = [
  { pregunta: '¿Cómo restablezco mi contraseña del portal?', respuesta: 'Ve a la pantalla de inicio de sesión y da clic en "¿Olvidaste tu contraseña?". Recibirás un correo con instrucciones para crear una nueva.' },
  { pregunta: '¿Cuánto tarda en responderse una solicitud?', respuesta: 'El tiempo promedio de primera respuesta es de 2 a 4 horas hábiles. Solicitudes marcadas como urgentes se priorizan.' },
  { pregunta: '¿Puedo agregar archivos a mis solicitudes?', respuesta: 'Sí, puedes adjuntar imágenes o documentos desde el campo de mensaje dentro de cada conversación.' },
  { pregunta: '¿Cómo cancelo o cierro una solicitud?', respuesta: 'Una solicitud se cierra automáticamente cuando confirmas que tu problema fue resuelto, o puedes pedirle a soporte que la cierre por ti.' },
  { pregunta: '¿Dónde veo el historial de mis solicitudes anteriores?', respuesta: 'En la pestaña "Mis solicitudes" puedes ver todas tus solicitudes, incluidas las resueltas y cerradas, usando los filtros de estado.' },
]

// --- Popover genérico: cierra al hacer click afuera. ---
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
      <span className="font-semibold text-ink">Atención</span>
    </div>
  )
}

function HeaderAtencion() {
  return (
    <div
      className="relative flex h-[170px] flex-shrink-0 items-center overflow-hidden rounded-3xl bg-cover bg-center px-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${atencionHero})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Headphones className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Atención</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Estamos para ayudarte. Consulta y da seguimiento a tus solicitudes.
          </p>
        </div>
      </div>
    </div>
  )
}

const ESTATUS_ESTILO: Record<EstatusSolicitud, string> = {
  'En proceso': 'bg-blue-500/10 text-blue-500',
  Resuelta: 'bg-emerald-500/10 text-emerald-500',
  Cerrada: 'bg-slate-500/10 text-slate-500',
  'Esperando respuesta': 'bg-amber-500/10 text-amber-500',
}

function EstatusBadge({ estatus }: { estatus: EstatusSolicitud }) {
  return (
    <span className={clsx('flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold', ESTATUS_ESTILO[estatus])}>
      {estatus}
    </span>
  )
}

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

interface Filtros {
  busqueda: string
  estado: string
  proyecto: string
  periodo: string
  orden: 'recientes' | 'antiguas'
}

function ResumenSolicitudes({ solicitudes }: { solicitudes: Solicitud[] }) {
  const stats = [
    { label: 'Total de solicitudes', valor: solicitudes.length, icon: FileText, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
    { label: 'En proceso', valor: solicitudes.filter((s) => s.estatus === 'En proceso').length, icon: Clock, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Esperando tu respuesta', valor: solicitudes.filter((s) => s.estatus === 'Esperando respuesta').length, icon: MessageCircle, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'Resueltas', valor: solicitudes.filter((s) => s.estatus === 'Resuelta').length, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Cerradas', valor: solicitudes.filter((s) => s.estatus === 'Cerrada').length, icon: XCircle, color: 'text-slate-500 bg-slate-500/10' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-surface-border bg-card p-4 shadow-card">
          <span className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', s.color)}>
            <s.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-bold text-ink">{s.valor}</p>
            <p className="truncate text-[11px] leading-tight text-ink-tertiary">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function BarraFiltros({ filtros, onCambiar }: { filtros: Filtros; onCambiar: (f: Partial<Filtros>) => void }) {
  const activo = filtros.busqueda !== '' || filtros.estado !== 'Todos los estados' || filtros.proyecto !== 'Todos los proyectos' || filtros.periodo !== 'Cualquier fecha'
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          type="text"
          value={filtros.busqueda}
          onChange={(e) => onCambiar({ busqueda: e.target.value })}
          placeholder="Buscar solicitudes..."
          className="w-full rounded-full border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
      <FiltroDropdown valor={filtros.estado} opciones={ESTADOS} etiquetaTodos="Todos los estados" onCambiar={(v) => onCambiar({ estado: v })} />
      <FiltroDropdown valor={filtros.proyecto} opciones={PROYECTOS} etiquetaTodos="Todos los proyectos" onCambiar={(v) => onCambiar({ proyecto: v })} />
      <FiltroDropdown
        icon={<Calendar className="h-3.5 w-3.5 text-ink-tertiary" />}
        valor={filtros.periodo}
        opciones={['Hoy', 'Esta semana', 'Este mes']}
        etiquetaTodos="Cualquier fecha"
        onCambiar={(v) => onCambiar({ periodo: v })}
      />
      <button
        type="button"
        disabled={!activo}
        onClick={() => onCambiar({ busqueda: '', estado: 'Todos los estados', proyecto: 'Todos los proyectos', periodo: 'Cualquier fecha' })}
        className={clsx(
          'flex items-center gap-1 whitespace-nowrap rounded-full border p-2.5 text-xs font-semibold',
          activo ? 'border-brand text-brand hover:bg-brand/5' : 'cursor-default border-surface-border text-ink-tertiary/40'
        )}
        aria-label="Limpiar filtros"
      >
        <Filter className="h-4 w-4" />
      </button>
    </div>
  )
}

function SolicitudListItem({ s, seleccionada, onClick }: { s: Solicitud; seleccionada: boolean; onClick: () => void }) {
  const Icono = iconoCategoria(s.categoria)
  const ultimoMensaje = s.conversacion[s.conversacion.length - 1]
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          seleccionada ? 'bg-brand/10' : 'hover:bg-surface'
        )}
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#19b6bc]/10 text-[#19b6bc]">
          <Icono className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-ink">{s.titulo}</p>
            <span className="flex-shrink-0 text-[10px] text-ink-tertiary">{s.creadaTexto}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-ink-tertiary">
              {ultimoMensaje ? `${ultimoMensaje.esUsuario ? 'Tú: ' : ''}${ultimoMensaje.texto.split('\n')[0]}` : s.descripcion}
            </p>
            <EstatusBadge estatus={s.estatus} />
          </div>
        </div>
      </button>
    </li>
  )
}

function ListaSolicitudes({
  solicitudes, seleccionadaId, onSeleccionar, orden, onOrden,
}: { solicitudes: Solicitud[]; seleccionadaId: string; onSeleccionar: (id: string) => void; orden: Filtros['orden']; onOrden: (o: Filtros['orden']) => void }) {
  return (
    <div className="flex h-[600px] flex-col overflow-hidden border-r border-surface-border bg-card p-5">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Mis solicitudes ({solicitudes.length})</h3>
        <button
          type="button"
          onClick={() => onOrden(orden === 'recientes' ? 'antiguas' : 'recientes')}
          className="flex items-center gap-1 text-xs font-semibold text-ink-tertiary hover:text-ink-secondary"
        >
          {orden === 'recientes' ? 'Más recientes' : 'Más antiguas'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {solicitudes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <MessageCircle className="h-8 w-8" />
          <p className="text-sm">No se encontraron solicitudes con estos filtros.</p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-surface-border overflow-y-auto">
          {solicitudes.map((s) => (
            <SolicitudListItem key={s.id} s={s} seleccionada={s.id === seleccionadaId} onClick={() => onSeleccionar(s.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function inicialesDe(nombre: string) {
  const partes = nombre.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase()
}

function MensajeBurbuja({ m }: { m: MensajeConversacion }) {
  return (
    <div className={clsx('flex', m.esUsuario ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[75%] rounded-lg px-3 py-2 shadow-sm',
          m.esUsuario ? 'rounded-tr-none bg-emerald-100 text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-50' : 'rounded-tl-none bg-card text-ink'
        )}
      >
        {!m.esUsuario && <p className="mb-0.5 text-xs font-bold text-[#19b6bc]">{m.autor}</p>}
        <p className="whitespace-pre-line text-sm">{m.texto}</p>
        <div className={clsx('mt-1 flex items-center justify-end gap-1 text-[10px]', m.esUsuario ? 'text-emerald-800/70 dark:text-emerald-100/60' : 'text-ink-tertiary')}>
          <span>{m.fecha}</span>
          {m.esUsuario && <CheckCircle2 className="h-3 w-3" />}
        </div>
      </div>
    </div>
  )
}

function EstatusDropdown({ estatus, onCambiar }: { estatus: EstatusSolicitud; onCambiar: (e: EstatusSolicitud) => void }) {
  const { abierto, setAbierto, ref } = usePopover()
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={clsx('flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold', ESTATUS_ESTILO[estatus])}
      >
        {estatus}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
          {ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onCambiar(e); setAbierto(false) }}
              className={clsx('block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-surface', e === estatus ? 'text-brand' : 'text-ink-secondary')}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DetalleSolicitud({
  s, onEnviarMensaje, onCambiarEstatus,
}: { s: Solicitud; onEnviarMensaje: (texto: string) => void; onCambiarEstatus: (e: EstatusSolicitud) => void }) {
  const [mensaje, setMensaje] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [s.id, s.conversacion.length])

  function enviar() {
    if (!mensaje.trim()) return
    onEnviarMensaje(mensaje.trim())
    setMensaje('')
  }

  return (
    <div className="flex h-[600px] flex-col overflow-hidden bg-card">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-surface-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-tertiary">{s.folio}</p>
            <h3 className="mt-0.5 text-base font-bold text-ink">{s.titulo}</h3>
            <p className="mt-1 text-xs text-ink-tertiary">Creada el {s.creadaTexto}</p>
          </div>
          <EstatusDropdown estatus={s.estatus} onCambiar={onCambiarEstatus} />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
            <Briefcase className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Proyecto</p>
              <p className="truncate text-xs font-semibold text-ink">{s.proyecto}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
            <Tag className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Categoría</p>
              <p className="truncate text-xs font-semibold text-ink">{s.categoria}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
            <UserCircle className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Asignado a</p>
              <p className="truncate text-xs font-semibold text-ink">{s.asignadoA}</p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">Descripción</p>
          <p className="mt-1 text-sm text-ink-secondary">{s.descripcion}</p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-b border-surface-border px-4 py-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#19b6bc] text-[10px] font-bold text-white">
          {inicialesDe('Soporte AGYDA')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink">Soporte AGYDA</p>
          <p className="flex items-center gap-1 text-[10px] text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            En línea
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface/50 p-4">
        <span className="mx-auto rounded-full bg-card px-3 py-1 text-[10px] font-semibold text-ink-tertiary shadow-sm">Hoy</span>
        {s.conversacion.map((m, i) => <MensajeBurbuja key={i} m={m} />)}
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-t border-surface-border p-3">
        <button type="button" aria-label="Adjuntar archivo" className="flex-shrink-0 rounded-full p-2 text-ink-tertiary hover:bg-surface">
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-full border border-surface-border bg-surface px-4 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!mensaje.trim()}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Enviar
        </button>
      </div>
    </div>
  )
}

function EstadoVacio({ icon, texto }: { icon: React.ReactNode; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
      {icon}
      <p className="max-w-xs text-sm">{texto}</p>
    </div>
  )
}

function PreguntasFrecuentes() {
  const [abiertaIdx, setAbiertaIdx] = useState<number | null>(0)
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-ink">Preguntas frecuentes</h3>
      <div className="flex flex-col gap-2">
        {FAQS.map((f, i) => {
          const abierta = abiertaIdx === i
          return (
            <div key={f.pregunta} className="rounded-xl border border-surface-border">
              <button
                type="button"
                onClick={() => setAbiertaIdx(abierta ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                  <HelpCircle className="h-4 w-4 flex-shrink-0 text-brand" />
                  {f.pregunta}
                </span>
                <ChevronDown className={clsx('h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform', abierta && 'rotate-180')} />
              </button>
              {abierta && (
                <p className="border-t border-surface-border px-4 py-3 text-sm text-ink-secondary">
                  {f.respuesta}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const inputClase = 'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-secondary">{label}</span>
      {children}
    </label>
  )
}

function ModalNuevaSolicitud({
  abierto, onCerrar, onEnviar,
}: { abierto: boolean; onCerrar: () => void; onEnviar: (datos: { titulo: string; categoria: string; proyecto: string; descripcion: string }) => void }) {
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [proyecto, setProyecto] = useState(PROYECTOS[0])
  const [descripcion, setDescripcion] = useState('')

  function enviar() {
    onEnviar({ titulo, categoria, proyecto, descripcion })
    setTitulo('')
    setDescripcion('')
  }

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title="Nueva solicitud" size="sm">
      <div className="flex flex-col gap-4">
        <Campo label="Título de la solicitud">
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Problema de acceso al portal" className={inputClase} />
        </Campo>
        <Campo label="Categoría">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputClase}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Proyecto">
          <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={inputClase}>
            {PROYECTOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo label="Describe tu solicitud">
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={clsx(inputClase, 'resize-none')} />
        </Campo>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-tertiary hover:bg-surface">
            Cancelar
          </button>
          <button type="button" onClick={enviar} disabled={!titulo.trim() || !descripcion.trim()} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50">
            Enviar solicitud
          </button>
        </div>
      </div>
    </Modal>
  )
}

const TABS_PRINCIPALES = ['Mis solicitudes', 'Preguntas frecuentes'] as const

export function PortalClienteAtencionPage() {
  const [tab, setTab] = useState<(typeof TABS_PRINCIPALES)[number]>('Mis solicitudes')
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(SOLICITUDES_INICIALES)
  const [seleccionadaId, setSeleccionadaId] = useState(SOLICITUDES_INICIALES[0].id)
  const [modalNueva, setModalNueva] = useState(false)

  const [filtros, setFiltros] = useState<Filtros>({
    busqueda: '', estado: 'Todos los estados', proyecto: 'Todos los proyectos', periodo: 'Cualquier fecha',
    orden: 'recientes',
  })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  const ahora = new Date(2026, 8, 21)

  const filtradas = solicitudes
    .filter((s) => s.titulo.toLowerCase().includes(filtros.busqueda.toLowerCase()) || s.folio.toLowerCase().includes(filtros.busqueda.toLowerCase()))
    .filter((s) => filtros.estado === 'Todos los estados' || s.estatus === filtros.estado)
    .filter((s) => filtros.proyecto === 'Todos los proyectos' || s.proyecto === filtros.proyecto)
    .filter((s) => {
      if (filtros.periodo === 'Cualquier fecha') return true
      const dias = Math.floor((ahora.getTime() - s.creada.getTime()) / 86400000)
      if (filtros.periodo === 'Hoy') return dias === 0
      if (filtros.periodo === 'Esta semana') return dias >= 0 && dias <= 7
      if (filtros.periodo === 'Este mes') return s.creada.getMonth() === ahora.getMonth() && s.creada.getFullYear() === ahora.getFullYear()
      return true
    })
    .sort((a, b) => (filtros.orden === 'recientes' ? b.creada.getTime() - a.creada.getTime() : a.creada.getTime() - b.creada.getTime()))

  const seleccionada = filtradas.find((s) => s.id === seleccionadaId) ?? filtradas[0] ?? null

  function enviarMensaje(texto: string) {
    if (!seleccionada) return
    const nuevoMensaje: MensajeConversacion = { autor: 'Tú', esUsuario: true, texto, fecha: 'Ahora' }
    setSolicitudes((ss) => ss.map((s) => (s.id === seleccionada.id ? { ...s, conversacion: [...s.conversacion, nuevoMensaje] } : s)))
  }

  function cambiarEstatus(estatus: EstatusSolicitud) {
    if (!seleccionada) return
    setSolicitudes((ss) => ss.map((s) => (s.id === seleccionada.id ? { ...s, estatus } : s)))
  }

  function crearSolicitud(datos: { titulo: string; categoria: string; proyecto: string; descripcion: string }) {
    const nueva: Solicitud = {
      id: crypto.randomUUID(),
      folio: `#AT-${100 + solicitudes.length + 25}`,
      titulo: datos.titulo,
      estatus: 'En proceso',
      creada: new Date(),
      creadaTexto: 'Ahora',
      proyecto: datos.proyecto,
      categoria: datos.categoria,
      asignadoA: 'Equipo AGYDA',
      descripcion: datos.descripcion,
      conversacion: [{ autor: 'Tú', esUsuario: true, texto: datos.descripcion, fecha: 'Ahora' }],
    }
    setSolicitudes((ss) => [nueva, ...ss])
    setSeleccionadaId(nueva.id)
    setModalNueva(false)
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderAtencion />

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

        {tab === 'Mis solicitudes' && (
          <button
            type="button"
            onClick={() => setModalNueva(true)}
            className="mb-2 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#19b6bc] to-[#00537f] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nueva solicitud
          </button>
        )}
      </div>

      {tab === 'Mis solicitudes' && (
        <Reveal index={0} className="flex flex-col gap-5">
          <ResumenSolicitudes solicitudes={solicitudes} />
          <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
          <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-surface-border shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ListaSolicitudes
              solicitudes={filtradas}
              seleccionadaId={seleccionada?.id ?? ''}
              onSeleccionar={setSeleccionadaId}
              orden={filtros.orden}
              onOrden={(orden) => actualizarFiltros({ orden })}
            />
            {seleccionada ? (
              <DetalleSolicitud s={seleccionada} onEnviarMensaje={enviarMensaje} onCambiarEstatus={cambiarEstatus} />
            ) : (
              <div className="flex h-[600px] flex-col bg-card p-5">
                <EstadoVacio icon={<MessageCircle className="h-6 w-6" />} texto="Selecciona una solicitud de la lista para ver su conversación." />
              </div>
            )}
          </div>
        </Reveal>
      )}

      {tab === 'Preguntas frecuentes' && (
        <Reveal index={0}>
          <PreguntasFrecuentes />
        </Reveal>
      )}

      <ModalNuevaSolicitud abierto={modalNueva} onCerrar={() => setModalNueva(false)} onEnviar={crearSolicitud} />
    </div>
  )
}
