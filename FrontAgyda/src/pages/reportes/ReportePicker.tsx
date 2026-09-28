import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import {
  LogIn, CalendarCheck, FileWarning, HeartPulse, Coffee, Timer, Ticket, Wrench, AlertOctagon,
  MessagesSquare, MessageCircle, ClipboardList, Handshake, ShoppingCart, GraduationCap, ClipboardCheck,
  Award, Headphones, KanbanSquare, ListChecks, Wallet, BarChart3, ShieldCheck, FileSpreadsheet,
  UserRound, Search, ChevronDown, Check, X, Sparkles,
} from 'lucide-react'

export interface ReporteOpcion { key: string; grupo: string; label: string; descripcion: string }

type Icono = typeof LogIn
const ICONOS: Record<string, Icono> = {
  'asistencia': LogIn, 'excepciones-asistencia': CalendarCheck, 'actas': FileWarning, 'incapacidades': HeartPulse,
  'pausas': Coffee, 'tiempos-estado': Timer,
  'tickets-levantados': Ticket, 'tickets-atendidos': Wrench, 'casos': AlertOctagon,
  'interacciones-cc': MessagesSquare, 'livechat': MessageCircle, 'formularios': ClipboardList,
  'crm-interacciones': Handshake, 'ventas': ShoppingCart,
  'capacitacion': GraduationCap, 'eval-capacitacion': ClipboardCheck, 'eval-desempeno': Award,
  'calidad': Headphones, 'tareas': KanbanSquare, 'checklist': ListChecks,
  'nomina': Wallet, 'encuestas': BarChart3, 'auditoria': ShieldCheck,
}

// Un color por tema, para ubicar de un vistazo de qué área es cada reporte.
const TEMAS: Record<string, { chip: string; icono: string; iconoSel: string; borde: string; fondo: string; punto: string }> = {
  'Asistencia':             { chip: 'bg-emerald-50 text-emerald-700', icono: 'bg-emerald-50 text-emerald-600', iconoSel: 'bg-emerald-600 text-white', borde: 'border-emerald-300', fondo: 'bg-emerald-50/70', punto: 'bg-emerald-500' },
  'Tiempos y pausas':       { chip: 'bg-amber-50 text-amber-700',     icono: 'bg-amber-50 text-amber-600',     iconoSel: 'bg-amber-500 text-white',   borde: 'border-amber-300',   fondo: 'bg-amber-50/70',   punto: 'bg-amber-500' },
  'Tickets y casos':        { chip: 'bg-orange-50 text-orange-700',   icono: 'bg-orange-50 text-orange-600',   iconoSel: 'bg-orange-500 text-white',  borde: 'border-orange-300',  fondo: 'bg-orange-50/70',  punto: 'bg-orange-500' },
  'Contact Center':         { chip: 'bg-sky-50 text-sky-700',         icono: 'bg-sky-50 text-sky-600',         iconoSel: 'bg-sky-600 text-white',     borde: 'border-sky-300',     fondo: 'bg-sky-50/70',     punto: 'bg-sky-500' },
  'Desempeño y desarrollo': { chip: 'bg-violet-50 text-violet-700',   icono: 'bg-violet-50 text-violet-600',   iconoSel: 'bg-violet-600 text-white',  borde: 'border-violet-300',  fondo: 'bg-violet-50/70',  punto: 'bg-violet-500' },
  'Nómina':                 { chip: 'bg-teal-50 text-teal-700',       icono: 'bg-teal-50 text-teal-600',       iconoSel: 'bg-teal-600 text-white',    borde: 'border-teal-300',    fondo: 'bg-teal-50/70',    punto: 'bg-teal-500' },
  'Sistema':                { chip: 'bg-slate-100 text-slate-600',    icono: 'bg-slate-100 text-slate-600',    iconoSel: 'bg-slate-600 text-white',   borde: 'border-slate-300',   fondo: 'bg-slate-50',      punto: 'bg-slate-500' },
}
const TEMA_DEFAULT = TEMAS['Sistema']
const temaDe = (grupo: string) => TEMAS[grupo] ?? TEMA_DEFAULT

// Selector del tipo de reporte: botón con el reporte elegido y un menú
// flotante con buscador, la opción "todo sobre el colaborador" destacada y los
// reportes agrupados por tema con su descripción.
export function ReportePicker({ value, onChange, reportes, valorTodos }: {
  value: string
  onChange: (key: string) => void
  reportes: ReporteOpcion[]
  /** key de la opción que corre todos los reportes de un colaborador */
  valorTodos: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const esTodos = value === valorTodos
  const actual = reportes.find((r) => r.key === value)
  const ActualIcon = esTodos ? Sparkles : (ICONOS[value] ?? FileSpreadsheet)
  const temaActual = actual ? temaDe(actual.grupo) : null

  const texto = busca.trim().toLowerCase()
  const grupos = useMemo(() => {
    const lista: { grupo: string; items: ReporteOpcion[] }[] = []
    for (const r of reportes) {
      if (texto && !`${r.label} ${r.descripcion} ${r.grupo}`.toLowerCase().includes(texto)) continue
      const g = lista.find((x) => x.grupo === r.grupo)
      if (g) g.items.push(r); else lista.push({ grupo: r.grupo, items: [r] })
    }
    return lista
  }, [reportes, texto])
  const mostrarTodos = !texto || 'todo colaborador todos los reportes expediente completo'.includes(texto)

  // Posición del menú (flotante, sobre todo): debajo del botón o arriba si no cabe.
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return
    const calcular = () => {
      const r = boton.current!.getBoundingClientRect()
      const width = Math.min(720, window.innerWidth - 24)
      const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
      const abajo = window.innerHeight - r.bottom - 12
      const arriba = r.top - 12
      const maxH = Math.min(560, Math.max(abajo, arriba))
      const top = abajo >= Math.min(560, arriba) ? r.bottom + 6 : Math.max(12, r.top - 6 - maxH)
      setPos({ top, left, width, maxH })
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => { window.removeEventListener('resize', calcular); window.removeEventListener('scroll', calcular, true) }
  }, [abierto])

  // Cerrar con Esc o clic afuera.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node) || boton.current?.contains(e.target as Node)) return
      setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) } }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc, true) }
  }, [abierto])

  const elegir = (key: string) => { onChange(key); setAbierto(false); setBusca('') }

  // Enter en el buscador elige el primer resultado.
  const primerResultado = texto ? (grupos[0]?.items[0]?.key ?? (mostrarTodos ? valorTodos : null)) : null

  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto((v) => !v)}
        className={clsx('flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition',
          abierto ? 'border-brand ring-2 ring-brand/15' : 'border-gray-200 hover:border-brand/40')}>
        <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
          esTodos ? 'bg-gradient-to-br from-brand to-violet-500 text-white' : temaActual?.icono ?? 'bg-brand/10 text-brand')}>
          <ActualIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-800">
            {esTodos ? 'Todo sobre el colaborador' : actual?.label ?? 'Elige un reporte'}
          </span>
          <span className="block truncate text-[0.68rem] text-gray-400">
            {esTodos ? 'Todos los reportes juntos para una persona' : actual?.grupo ?? ''}
          </span>
        </span>
        <ChevronDown className={clsx('h-4 w-4 flex-shrink-0 text-gray-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && pos && createPortal(
        <div ref={panel} style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          className="fixed z-[400] flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-2xl animate-fade-in">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <Search className="h-4 w-4 text-gray-300" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && primerResultado) elegir(primerResultado) }}
              placeholder="¿Qué quieres consultar? (ej. retardos, ventas, tickets, pausas)…"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400" />
            {busca && <button onClick={() => setBusca('')} className="rounded p-0.5 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>}
            <span className="hidden sm:inline rounded-md border border-gray-200 px-1.5 py-0.5 text-[0.6rem] font-semibold text-gray-400">Esc</span>
          </div>

          <div className="overflow-y-auto p-3 space-y-3">
            {mostrarTodos && (
              <button type="button" onClick={() => elegir(valorTodos)}
                className={clsx('group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3.5 text-left transition',
                  esTodos ? 'border-brand bg-brand/5' : 'border-brand/20 hover:border-brand/50 hover:bg-brand/5')}>
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-violet-500 text-white shadow-sm">
                  <UserRound className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[0.85rem] font-bold text-gray-800">
                    Todo sobre el colaborador
                    <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-brand">Completo</span>
                    {esTodos && <Check className="h-4 w-4 text-brand" />}
                  </span>
                  <span className="block text-[0.7rem] leading-snug text-gray-500">
                    Asistencia, pausas, tickets, Contact Center, ventas, evaluaciones y más de una sola persona, en un mismo reporte y un solo Excel.
                  </span>
                </span>
                <Sparkles className="h-4 w-4 flex-shrink-0 text-brand/40 group-hover:text-brand transition-colors" />
              </button>
            )}

            {grupos.length === 0 && !mostrarTodos && (
              <p className="px-2 py-8 text-center text-xs text-gray-400">Ningún reporte coincide con “{busca}”.</p>
            )}

            {grupos.map(({ grupo, items }) => {
              const tema = temaDe(grupo)
              return (
                <div key={grupo}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span className={clsx('h-1.5 w-1.5 rounded-full', tema.punto)} />
                    <p className="text-[0.64rem] font-bold uppercase tracking-wider text-gray-400">{grupo}</p>
                    <span className="text-[0.62rem] text-gray-300">{items.length}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {items.map((r) => {
                      const Icon = ICONOS[r.key] ?? FileSpreadsheet
                      const sel = r.key === value
                      return (
                        <button key={r.key} type="button" onClick={() => elegir(r.key)}
                          className={clsx('group flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition',
                            sel ? clsx(tema.borde, tema.fondo) : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/80')}>
                          <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition',
                            sel ? tema.iconoSel : tema.icono)}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1 text-[0.8rem] font-semibold text-gray-800">
                              {r.label} {sel && <Check className="h-3.5 w-3.5 text-gray-700" />}
                            </span>
                            <span className="block text-[0.68rem] leading-snug text-gray-400">{r.descripcion}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
