import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Receipt, ChevronRight, ChevronDown, ChevronLeft, Search,
  FileText, FileCode, Download, Share2, CreditCard, CheckCircle2,
  Clock, AlertCircle, RefreshCcw, MoreVertical, X, Lock, Loader2,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { PortalBreadcrumb } from '@/pages/portal-cliente/components/PortalBreadcrumb'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalFactura } from '@/types/portalCliente.types'
import facturaHero from '@/assets/factura-hero.png'

// --- Conectada a datos reales (portalCliente.service.ts -> GET
// /portal-cliente/facturas). El modelo real hoy solo expone folio, serie,
// fecha, fecha de timbrado, total, moneda y estatus — no hay UUID CFDI ni
// desglose de conceptos/pagos parciales todavía, esas secciones se dejan
// "no disponible aún". Descargar PDF/XML SÍ está conectado (mismo backend
// de facturación del panel interno, vía /portal-cliente/facturas/:id/documento/:formato
// con validación de que la factura pertenezca al contacto autenticado). ---

// El backend normaliza el estatus real de la tabla FACTURAS (pre-factura,
// timbrada, cancelada, con pago registrado, etc.) — se agrupa aquí en 3
// estados visuales sin inventar datos que el backend no manda.
type GrupoEstatus = 'Pagada' | 'Pendiente' | 'Cancelada'

const ESTATUS_A_GRUPO: Record<string, GrupoEstatus> = {
  pagada: 'Pagada',
  timbrada: 'Pendiente',
  pendiente: 'Pendiente',
  'pre-factura': 'Pendiente',
  cancelada: 'Cancelada',
  error: 'Cancelada',
}

function grupoDeEstatus(estatus: string): GrupoEstatus {
  return ESTATUS_A_GRUPO[estatus.toLowerCase()] ?? 'Pendiente'
}

function formatoMoneda(monto: number) {
  return monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatoFecha(fecha: string) {
  const d = new Date(`${fecha}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function usePopover() {
  const [abierto, setAbierto] = useState(false)
  return { abierto, setAbierto }
}


function HeaderFacturas({ totalPendiente, cantidadPendientes, onVerPendientes }: { totalPendiente: number; cantidadPendientes: number; onVerPendientes: () => void }) {
  return (
    <div
      className="relative flex flex-col gap-5 overflow-hidden rounded-3xl bg-cover bg-center px-6 py-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${facturaHero})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/75 to-[#0a2f71]/40" />

      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Receipt className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Facturas</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Consulta tus facturas de forma rápida y segura.
          </p>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-3 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Total pendiente de pago</p>
          <p className="text-xl font-extrabold text-white">${formatoMoneda(totalPendiente)} MXN</p>
        </div>
        <button
          type="button"
          onClick={onVerPendientes}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark"
        >
          Ver pendientes
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {cantidadPendientes > 0 && (
          <span className="flex w-full items-center gap-1.5 text-[11px] font-semibold text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            {cantidadPendientes} {cantidadPendientes === 1 ? 'factura pendiente' : 'facturas pendientes'}
          </span>
        )}
      </div>
    </div>
  )
}

const ESTATUS_ESTILO: Record<GrupoEstatus, string> = {
  Pagada: 'bg-emerald-500/10 text-emerald-500',
  Pendiente: 'bg-amber-500/10 text-amber-500',
  Cancelada: 'bg-red-500/10 text-red-500',
}

const ESTATUS_ICONO: Record<GrupoEstatus, React.ComponentType<{ className?: string }>> = {
  Pagada: CheckCircle2,
  Pendiente: Clock,
  Cancelada: X,
}

function EstatusBadge({ estatus }: { estatus: string }) {
  const grupo = grupoDeEstatus(estatus)
  const Icono = ESTATUS_ICONO[grupo]
  return (
    <span className={clsx('flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold', ESTATUS_ESTILO[grupo])}>
      <Icono className="h-3 w-3" />
      {grupo}
    </span>
  )
}

function ResumenCard({ icon: Icon, color, valor, label, sublabel, sublabelColor }: {
  icon: React.ComponentType<{ className?: string }>
  color: string
  valor: string
  label: string
  sublabel: string
  sublabelColor?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-border bg-card p-4 shadow-card">
      <span className={clsx('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xl font-extrabold text-ink">{valor}</p>
        <p className="truncate text-xs text-ink-tertiary">{label}</p>
        <p className={clsx('truncate text-[11px] font-semibold', sublabelColor ?? 'text-ink-tertiary')}>{sublabel}</p>
      </div>
    </div>
  )
}

interface Filtros {
  busqueda: string
  estatus: string
}

const GRUPOS: GrupoEstatus[] = ['Pagada', 'Pendiente', 'Cancelada']
const POR_PAGINA = 8

function FiltroDropdown({
  valor, opciones, etiquetaTodos, onCambiar,
}: { valor: string; opciones: string[]; etiquetaTodos: string; onCambiar: (v: string) => void }) {
  const { abierto, setAbierto } = usePopover()
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-surface-border bg-card px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        {valor}
        <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
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
        </>
      )}
    </div>
  )
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
          placeholder="Buscar por folio..."
          className="w-full rounded-lg border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
      <FiltroDropdown valor={filtros.estatus} opciones={GRUPOS} etiquetaTodos="Todas" onCambiar={(v) => onCambiar({ estatus: v })} />
      <button
        type="button"
        onClick={() => onCambiar({ busqueda: '', estatus: 'Todas' })}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-border px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Limpiar filtros
      </button>
    </div>
  )
}

function FacturaListItem({ f, seleccionada, onClick }: { f: PortalFactura; seleccionada: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors',
          seleccionada ? 'border-brand bg-brand/5' : 'border-surface-border hover:bg-surface'
        )}
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#19b6bc]/10 text-[#19b6bc]">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink">{f.serie ?? ''}{f.folio ?? f.id}</p>
          </div>
          <p className="text-[11px] text-ink-tertiary">{formatoFecha(f.fecha)}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <p className="text-sm font-bold text-ink">${formatoMoneda(f.total)}</p>
          <EstatusBadge estatus={f.estatus} />
        </div>
      </button>
    </li>
  )
}

function ListaFacturas({
  facturas, seleccionadaId, onSeleccionar, pagina, onPagina, totalFacturas,
}: {
  facturas: PortalFactura[]
  seleccionadaId: number | null
  onSeleccionar: (id: number) => void
  pagina: number
  onPagina: (p: number) => void
  totalFacturas: number
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalFacturas / POR_PAGINA))

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Facturas ({totalFacturas})</h3>
      </div>

      {facturas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-ink-tertiary">
          <FileText className="h-8 w-8" />
          <p className="text-sm">No se encontraron facturas con estos filtros.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {facturas.map((f) => (
              <FacturaListItem key={f.id} f={f} seleccionada={f.id === seleccionadaId} onClick={() => onSeleccionar(f.id)} />
            ))}
          </ul>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-between border-t border-surface-border pt-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => onPagina(pagina - 1)}
                  className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface disabled:opacity-30"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPagina(p)}
                    className={clsx(
                      'h-7 w-7 rounded-lg text-xs font-semibold',
                      p === pagina ? 'bg-brand text-white' : 'text-ink-secondary hover:bg-surface'
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() => onPagina(pagina + 1)}
                  className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface disabled:opacity-30"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <p className="text-[11px] text-ink-tertiary">
                Mostrando {facturas.length} de {totalFacturas} facturas
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const SUBTABS = ['Información', 'Conceptos', 'Pagos', 'Archivos'] as const

function CampoInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-ink-tertiary">{label}</span>
      <span className="text-right font-semibold text-ink">{children}</span>
    </div>
  )
}

function NoDisponibleAun({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-tertiary">
      <Lock className="h-6 w-6" />
      <p className="text-sm">{texto}</p>
    </div>
  )
}

function DetalleFactura({ f }: { f: PortalFactura }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Información')
  const { abierto, setAbierto } = usePopover()
  const grupo = grupoDeEstatus(f.estatus)
  const timbrada = ['timbrada', 'pagada'].includes(f.estatus.toLowerCase())
  const [descargando, setDescargando] = useState<'pdf' | 'xml' | null>(null)

  async function descargar(formato: 'pdf' | 'xml') {
    setDescargando(formato)
    try {
      await portalClienteService.descargarFacturaDocumento(f.id, formato, `${f.serie ?? ''}${f.folio ?? f.id}.${formato}`)
    } catch {
      toast.error(`No se pudo descargar el ${formato.toUpperCase()}`)
    } finally {
      setDescargando(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#19b6bc]/10 text-[#19b6bc]">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold text-ink">{f.serie ?? ''}{f.folio ?? f.id}</p>
            <p className="text-xs text-ink-tertiary">{formatoFecha(f.fecha)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EstatusBadge estatus={f.estatus} />
          <div className="relative">
            <button type="button" onClick={() => setAbierto((v) => !v)} aria-label="Más opciones" className="rounded-full p-1.5 text-ink-tertiary hover:bg-surface">
              <MoreVertical className="h-4 w-4" />
            </button>
            {abierto && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-surface-border bg-card p-1.5 shadow-card-lg">
                  <button type="button" disabled title="Disponible próximamente" className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-tertiary/60">
                    <Share2 className="h-4 w-4" />
                    Compartir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-5 overflow-x-auto border-b border-surface-border">
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

      <div>
        {subtab === 'Información' && (
          <div className="flex flex-col divide-y divide-surface-border">
            <CampoInfo label="Fecha de emisión">{formatoFecha(f.fecha)}</CampoInfo>
            <CampoInfo label="Fecha de timbrado">{f.fechaTimbrado ? formatoFecha(f.fechaTimbrado) : '—'}</CampoInfo>
            <CampoInfo label="Moneda">{f.moneda}</CampoInfo>
            <CampoInfo label="Total">${formatoMoneda(f.total)}</CampoInfo>
          </div>
        )}

        {subtab === 'Conceptos' && <NoDisponibleAun texto="El desglose de conceptos no está disponible aún." />}
        {subtab === 'Pagos' && <NoDisponibleAun texto="El historial de pagos no está disponible aún." />}
        {subtab === 'Archivos' && <NoDisponibleAun texto="La descarga de archivos no está disponible aún." />}
      </div>

      {grupo === 'Pendiente' && (
        <div className="border-t border-surface-border pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">Total a pagar</span>
          </div>
          <p className="mt-1 text-lg font-extrabold text-ink">${formatoMoneda(f.total)} MXN</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled
          title="El pago en línea estará disponible próximamente"
          className="flex items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Pagar ahora
        </button>
        <button
          type="button"
          disabled={!timbrada || descargando !== null}
          title={timbrada ? undefined : 'Disponible solo cuando la factura ya está timbrada'}
          onClick={() => descargar('pdf')}
          className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface disabled:cursor-not-allowed disabled:text-ink-tertiary/60 disabled:hover:bg-transparent"
        >
          {descargando === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Descargar PDF
        </button>
        <button
          type="button"
          disabled={!timbrada || descargando !== null}
          title={timbrada ? undefined : 'Disponible solo cuando la factura ya está timbrada'}
          onClick={() => descargar('xml')}
          className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface disabled:cursor-not-allowed disabled:text-ink-tertiary/60 disabled:hover:bg-transparent"
        >
          {descargando === 'xml' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCode className="h-3.5 w-3.5" />}
          Descargar XML
        </button>
        <button
          type="button"
          disabled
          title="Compartir estará disponible próximamente"
          className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-tertiary/60 disabled:cursor-not-allowed"
        >
          <Share2 className="h-3.5 w-3.5" />
          Compartir
        </button>
      </div>

      {grupo === 'Pendiente' && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Esta factura se encuentra pendiente de pago.</span>
        </div>
      )}
    </div>
  )
}

export function PortalClienteFacturasPage() {
  const { data: facturas = [], isLoading } = useQuery({ queryKey: ['portal-facturas'], queryFn: () => portalClienteService.getFacturas() })

  const [seleccionadaId, setSeleccionadaId] = useState<number | null>(null)
  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState<Filtros>({ busqueda: '', estatus: 'Todas' })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
    setPagina(1)
  }

  const filtradas = facturas
    .filter((f) => {
      const texto = `${f.serie ?? ''}${f.folio ?? f.id}`.toLowerCase()
      return texto.includes(filtros.busqueda.toLowerCase())
    })
    .filter((f) => filtros.estatus === 'Todas' || grupoDeEstatus(f.estatus) === filtros.estatus)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const inicio = (pagina - 1) * POR_PAGINA
  const paginadas = filtradas.slice(inicio, inicio + POR_PAGINA)

  const seleccionada = facturas.find((f) => f.id === seleccionadaId) ?? filtradas[0] ?? null

  const pendientes = facturas.filter((f) => grupoDeEstatus(f.estatus) === 'Pendiente')
  const totalPendiente = pendientes.reduce((acc, f) => acc + f.total, 0)
  const anioActual = new Date().getFullYear()
  const pagadasEsteAnio = facturas.filter((f) => grupoDeEstatus(f.estatus) === 'Pagada' && f.fecha.startsWith(String(anioActual)))
  const totalPagadas = pagadasEsteAnio.reduce((acc, f) => acc + f.total, 0)

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
        <PortalBreadcrumb seccion="Facturas" />
        <div className="h-48 animate-pulse rounded-3xl bg-surface" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-24 animate-pulse rounded-2xl bg-surface" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface" />
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-surface" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PortalBreadcrumb seccion="Facturas" />
      <HeaderFacturas
        totalPendiente={totalPendiente}
        cantidadPendientes={pendientes.length}
        onVerPendientes={() => actualizarFiltros({ estatus: 'Pendiente' })}
      />

      <Reveal index={0} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ResumenCard icon={FileText} color="bg-[#19b6bc]/10 text-[#19b6bc]" valor={String(facturas.length)} label="Total de facturas" sublabel="Histórico" />
        <ResumenCard icon={Clock} color="bg-amber-500/10 text-amber-500" valor={String(pendientes.length)} label="Pendientes de pago" sublabel={`$${formatoMoneda(totalPendiente)} MXN`} sublabelColor="text-amber-500" />
        <ResumenCard icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-500" valor={String(pagadasEsteAnio.length)} label="Pagadas este año" sublabel={`$${formatoMoneda(totalPagadas)} MXN`} sublabelColor="text-emerald-500" />
      </Reveal>

      <Reveal index={1} className="flex flex-col gap-5">
        <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
        {facturas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center shadow-card">
            <Receipt className="h-8 w-8 text-ink-tertiary/50" />
            <p className="text-sm font-semibold text-ink">Sin facturas registradas</p>
            <p className="text-xs text-ink-tertiary">Tus facturas aparecerán aquí en cuanto se emitan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1fr]">
            <ListaFacturas
              facturas={paginadas}
              seleccionadaId={seleccionada?.id ?? null}
              onSeleccionar={setSeleccionadaId}
              pagina={pagina}
              onPagina={setPagina}
              totalFacturas={filtradas.length}
            />
            {seleccionada ? <DetalleFactura f={seleccionada} /> : (
              <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
                <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-tertiary">
                  <FileText className="h-6 w-6" />
                  <p className="text-sm">Selecciona una factura de la lista para ver su detalle.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Reveal>
    </div>
  )
}
