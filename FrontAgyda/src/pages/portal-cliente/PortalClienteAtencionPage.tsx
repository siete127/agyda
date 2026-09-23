import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Headphones, ChevronRight, ChevronDown, Search, Calendar,
  Plus, HelpCircle, MessageCircle,
  FileText, CheckCircle2, XCircle,
  Clock, Tag, AlertTriangle, Send,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Modal } from '@/components/ui/Modal'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalIncidencia } from '@/types/portalCliente.types'
import atencionHero from '@/assets/atencion-hero.png'

// --- Conectada a datos reales (portalCliente.service.ts -> GET/POST
// /portal-cliente/incidencias). El modelo real ("incidencia", con folio,
// categoría, prioridad, SLA y una única "solucionPropuesta" del agente) no
// tiene un hilo de mensajes tipo chat — se muestra la solicitud inicial del
// cliente y, si existe, la solución propuesta como respuesta, en vez de una
// conversación de ida y vuelta que el backend no soporta. ---

function usePopover() {
  const [abierto, setAbierto] = useState(false)
  return { abierto, setAbierto }
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

const ESTATUS_ESTILO: Record<string, string> = {
  abierto: 'bg-amber-500/10 text-amber-500',
  en_proceso: 'bg-blue-500/10 text-blue-500',
  resuelto: 'bg-emerald-500/10 text-emerald-500',
  cerrado: 'bg-slate-500/10 text-slate-500',
}

const PRIORIDAD_ESTILO: Record<string, string> = {
  alta: 'bg-red-500/10 text-red-500',
  media: 'bg-amber-500/10 text-amber-500',
  baja: 'bg-slate-500/10 text-slate-500',
}

function EstatusBadge({ estatus }: { estatus: string }) {
  return (
    <span className={clsx('flex-shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold capitalize', ESTATUS_ESTILO[estatus.toLowerCase()] ?? 'bg-surface text-ink-tertiary')}>
      {estatus.replace('_', ' ')}
    </span>
  )
}

function PrioridadBadge({ prioridad }: { prioridad: string }) {
  return (
    <span className={clsx('flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', PRIORIDAD_ESTILO[prioridad.toLowerCase()] ?? 'bg-surface text-ink-tertiary')}>
      {prioridad}
    </span>
  )
}

function ResumenSolicitudes({ incidencias }: { incidencias: PortalIncidencia[] }) {
  const stats = [
    { label: 'Total de solicitudes', valor: incidencias.length, icon: FileText, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
    { label: 'Abiertas', valor: incidencias.filter((i) => i.estatus.toLowerCase() === 'abierto').length, icon: Clock, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'En proceso', valor: incidencias.filter((i) => i.estatus.toLowerCase() === 'en_proceso').length, icon: MessageCircle, color: 'text-blue-500 bg-blue-500/10' },
    { label: 'Resueltas', valor: incidencias.filter((i) => i.estatus.toLowerCase() === 'resuelto').length, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Cerradas', valor: incidencias.filter((i) => i.estatus.toLowerCase() === 'cerrado').length, icon: XCircle, color: 'text-slate-500 bg-slate-500/10' },
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

interface Filtros {
  busqueda: string
  estado: string
}

const ESTADOS = ['abierto', 'en_proceso', 'resuelto', 'cerrado']

function FiltroDropdown({
  valor, opciones, etiquetaTodos, onCambiar,
}: { valor: string; opciones: string[]; etiquetaTodos: string; onCambiar: (v: string) => void }) {
  const { abierto, setAbierto } = usePopover()
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 whitespace-nowrap rounded-full border border-surface-border bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        {valor === 'Todos los estados' ? valor : <span className="capitalize">{valor.replace('_', ' ')}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
            <button type="button" onClick={() => { onCambiar(etiquetaTodos); setAbierto(false) }} className={clsx('block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-surface', valor === etiquetaTodos ? 'text-brand' : 'text-ink-secondary')}>
              {etiquetaTodos}
            </button>
            {opciones.map((op) => (
              <button key={op} type="button" onClick={() => { onCambiar(op); setAbierto(false) }} className={clsx('block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold capitalize hover:bg-surface', valor === op ? 'text-brand' : 'text-ink-secondary')}>
                {op.replace('_', ' ')}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BarraFiltros({ filtros, onCambiar }: { filtros: Filtros; onCambiar: (f: Partial<Filtros>) => void }) {
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
    </div>
  )
}

function SolicitudListItem({ inc, seleccionada, onClick }: { inc: PortalIncidencia; seleccionada: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', seleccionada ? 'bg-brand/10' : 'hover:bg-surface')}
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#19b6bc]/10 text-[#19b6bc]">
          <Tag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-bold text-ink">{inc.titulo}</p>
            <span className="flex-shrink-0 text-[10px] text-ink-tertiary">
              {new Date(inc.fechaCreacion).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-ink-tertiary">{inc.folio}{inc.categoria ? ` · ${inc.categoria}` : ''}</p>
            <EstatusBadge estatus={inc.estatus} />
          </div>
        </div>
      </button>
    </li>
  )
}

function ListaSolicitudes({
  incidencias, seleccionadaId, onSeleccionar,
}: { incidencias: PortalIncidencia[]; seleccionadaId: number; onSeleccionar: (id: number) => void }) {
  return (
    <div className="flex h-[600px] flex-col overflow-hidden border-r border-surface-border bg-card p-5">
      <h3 className="mb-3 flex-shrink-0 text-sm font-bold text-ink">Mis solicitudes ({incidencias.length})</h3>

      {incidencias.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <MessageCircle className="h-8 w-8" />
          <p className="text-sm">No se encontraron solicitudes con estos filtros.</p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-surface-border overflow-y-auto">
          {incidencias.map((inc) => (
            <SolicitudListItem key={inc.id} inc={inc} seleccionada={inc.id === seleccionadaId} onClick={() => onSeleccionar(inc.id)} />
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

function DetalleSolicitud({ inc }: { inc: PortalIncidencia }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex h-[600px] flex-col overflow-hidden bg-card">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-surface-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-tertiary">{inc.folio}</p>
            <h3 className="mt-0.5 text-base font-bold text-ink">{inc.titulo}</h3>
            <p className="mt-1 text-xs text-ink-tertiary">
              Creada el {new Date(inc.fechaCreacion).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
            </p>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <EstatusBadge estatus={inc.estatus} />
            <PrioridadBadge prioridad={inc.prioridad} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {inc.categoria && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <Tag className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Categoría</p>
                <p className="truncate text-xs font-semibold text-ink">{inc.categoria}</p>
              </div>
            </div>
          )}
          {inc.fechaLimiteSla && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha límite</p>
                <p className="truncate text-xs font-semibold text-ink">
                  {new Date(inc.fechaLimiteSla).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-b border-surface-border px-4 py-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#19b6bc] text-[10px] font-bold text-white">
          {inicialesDe('Soporte AGYDA')}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink">Soporte AGYDA</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface/50 p-4">
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-lg rounded-tr-none bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm dark:bg-emerald-900/40 dark:text-emerald-50">
            <p className="whitespace-pre-line text-sm">{inc.titulo}</p>
          </div>
        </div>

        {inc.solucionPropuesta ? (
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-lg rounded-tl-none bg-card px-3 py-2 text-ink shadow-sm">
              <p className="mb-0.5 text-xs font-bold text-[#19b6bc]">Soporte AGYDA</p>
              <p className="whitespace-pre-line text-sm">{inc.solucionPropuesta}</p>
              {inc.fechaResolucion && (
                <p className="mt-1 text-right text-[10px] text-ink-tertiary">
                  {new Date(inc.fechaResolucion).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-lg rounded-tl-none bg-card px-3 py-2 text-ink-tertiary shadow-sm">
              <p className="text-xs">Un agente de soporte revisará tu solicitud y te responderá aquí.</p>
            </div>
          </div>
        )}
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

const FAQS = [
  { pregunta: '¿Cómo restablezco mi contraseña del portal?', respuesta: 'Ve a la pantalla de inicio de sesión y da clic en "¿Olvidaste tu contraseña?". Recibirás un correo con instrucciones para crear una nueva.' },
  { pregunta: '¿Cuánto tarda en responderse una solicitud?', respuesta: 'El tiempo promedio de primera respuesta depende de la prioridad asignada a tu solicitud.' },
  { pregunta: '¿Cómo cierro una solicitud?', respuesta: 'Un agente de soporte marca la solicitud como resuelta o cerrada una vez que se atiende tu caso.' },
  { pregunta: '¿Dónde veo el historial de mis solicitudes anteriores?', respuesta: 'En la pestaña "Mis solicitudes" puedes ver todas tus solicitudes, incluidas las resueltas y cerradas, usando el filtro de estado.' },
]

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
              <button type="button" onClick={() => setAbiertaIdx(abierta ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                  <HelpCircle className="h-4 w-4 flex-shrink-0 text-brand" />
                  {f.pregunta}
                </span>
                <ChevronDown className={clsx('h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform', abierta && 'rotate-180')} />
              </button>
              {abierta && <p className="border-t border-surface-border px-4 py-3 text-sm text-ink-secondary">{f.respuesta}</p>}
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

function ModalNuevaSolicitud({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (folio: string) => void }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const enviar = useMutation({
    mutationFn: () => portalClienteService.crearIncidencia({ titulo: titulo.trim(), descripcion: descripcion.trim(), categoria: categoria || undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['portal-incidencias'] })
      setTitulo('')
      setCategoria('')
      setDescripcion('')
      onCreada(res.folio)
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo enviar la solicitud'),
  })

  const puedeEnviar = titulo.trim().length > 0 && descripcion.trim().length > 0

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title="Nueva solicitud" size="sm">
      <div className="flex flex-col gap-4">
        <Campo label="Título de la solicitud">
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Resumen breve de tu solicitud" className={inputClase} />
        </Campo>
        <Campo label="Categoría (opcional)">
          <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={50} placeholder="Ej. Facturación, Soporte técnico..." className={inputClase} />
        </Campo>
        <Campo label="Describe tu solicitud">
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={4000} className={clsx(inputClase, 'resize-none')} />
        </Campo>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-tertiary hover:bg-surface">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => enviar.mutate()}
            disabled={!puedeEnviar || enviar.isPending}
            className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
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
  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)
  const [modalNueva, setModalNueva] = useState(false)
  const [filtros, setFiltros] = useState<Filtros>({ busqueda: '', estado: 'Todos los estados' })

  const { data: incidencias = [], isLoading } = useQuery({ queryKey: ['portal-incidencias'], queryFn: () => portalClienteService.getIncidencias() })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  const filtradas = incidencias
    .filter((i) => i.titulo.toLowerCase().includes(filtros.busqueda.toLowerCase()) || i.folio.toLowerCase().includes(filtros.busqueda.toLowerCase()))
    .filter((i) => filtros.estado === 'Todos los estados' || i.estatus.toLowerCase() === filtros.estado)
    .sort((a, b) => new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime())

  const seleccionada = filtradas.find((i) => i.id === seleccionadaId) ?? filtradas[0] ?? null

  function onCreada(folio: string) {
    toast.success(`Solicitud registrada — folio ${folio}`)
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
              className={clsx('relative pb-3 text-sm font-semibold transition-colors', tab === t ? 'text-brand' : 'text-ink-tertiary hover:text-ink-secondary')}
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
        isLoading ? (
          <div className="h-96 animate-pulse rounded-2xl bg-surface" />
        ) : (
          <Reveal index={0} className="flex flex-col gap-5">
            <ResumenSolicitudes incidencias={incidencias} />
            <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
            {incidencias.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center shadow-card">
                <Headphones className="h-8 w-8 text-ink-tertiary/50" />
                <p className="text-sm font-semibold text-ink">No tienes solicitudes registradas</p>
                <p className="text-xs text-ink-tertiary">¿Necesitas ayuda? Crea tu primera solicitud.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-surface-border shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <ListaSolicitudes incidencias={filtradas} seleccionadaId={seleccionada?.id ?? -1} onSeleccionar={setSeleccionadaId} />
                {seleccionada ? (
                  <DetalleSolicitud inc={seleccionada} />
                ) : (
                  <div className="flex h-[600px] flex-col bg-card p-5">
                    <EstadoVacio icon={<MessageCircle className="h-6 w-6" />} texto="Selecciona una solicitud de la lista para ver su detalle." />
                  </div>
                )}
              </div>
            )}
          </Reveal>
        )
      )}

      {tab === 'Preguntas frecuentes' && (
        <Reveal index={0}>
          <PreguntasFrecuentes />
        </Reveal>
      )}

      <ModalNuevaSolicitud abierto={modalNueva} onCerrar={() => setModalNueva(false)} onCreada={onCreada} />
    </div>
  )
}
