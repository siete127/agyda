import { useState } from 'react'
import { clsx } from 'clsx'
import {
  Receipt, ChevronRight, ChevronDown, ChevronLeft, Search, Calendar,
  FileText, FileCode, Download, Share2, CreditCard, CheckCircle2,
  Clock, AlertCircle, RefreshCcw, Copy, MoreVertical, X,
} from 'lucide-react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import facturaHero from '@/assets/factura-hero.png'

// --- Datos de ejemplo — reemplazar por datos reales del servicio de
// facturación (facturacion.service.ts) cuando el portal de cliente se
// conecte al backend CFDI real. La estructura ya sigue el modelo fiscal
// real (UUID, serie/folio, forma/método de pago, saldo) en vez de una
// versión simplificada, para que conectar el backend después sea directo. ---

type EstatusFactura = 'Pagada' | 'Pendiente' | 'Cancelada'

interface ConceptoFactura {
  descripcion: string
  cantidad: number
  precioUnitario: number
  importe: number
}

interface PagoFactura {
  fecha: string
  monto: number
  referencia: string
}

interface ArchivoFactura {
  nombre: string
  tipo: 'PDF' | 'XML'
  fecha: string
  tamano: string
}

interface Factura {
  id: string
  folio: string
  serie: string
  uuid: string
  descripcion: string
  proyecto: string
  fechaEmision: string
  fechaEmisionTexto: string
  fechaTimbrado: string
  fechaLimite?: string
  monto: number
  estatus: EstatusFactura
  formaPago: string
  metodoPago: string
  receptorRfc: string
  receptorNombre: string
  saldoPendiente: number
  conceptos: ConceptoFactura[]
  pagos: PagoFactura[]
  archivos: ArchivoFactura[]
  motivoCancelacion?: string
}

const FACTURAS_INICIALES: Factura[] = [
  {
    id: '1', folio: '1024', serie: 'A', uuid: '3f5e9c1e-2d4b-4a7c-9f2e-1a2b3c4d5e6f',
    descripcion: 'Desarrollo Portal Web', proyecto: 'Sitio web corporativo',
    fechaEmision: '2026-03-10', fechaEmisionTexto: '10 mar 2026',
    fechaTimbrado: '10 mar 2026 10:25', fechaLimite: '15 abr 2026',
    monto: 4320, estatus: 'Pendiente',
    formaPago: '99 - Por definir', metodoPago: 'PPD - Pago en parcialidades o diferido',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 4320,
    conceptos: [
      { descripcion: 'Desarrollo de módulos frontend', cantidad: 1, precioUnitario: 2500, importe: 2500 },
      { descripcion: 'Integración de API de pagos', cantidad: 1, precioUnitario: 1224.14, importe: 1224.14 },
    ],
    pagos: [],
    archivos: [
      { nombre: 'Factura F-1024', tipo: 'PDF', fecha: '10 mar 2026', tamano: '210 KB' },
      { nombre: 'Factura F-1024', tipo: 'XML', fecha: '10 mar 2026', tamano: '18 KB' },
    ],
  },
  {
    id: '2', folio: '1023', serie: 'A', uuid: 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    descripcion: 'Servicio de hosting', proyecto: 'Sitio web corporativo',
    fechaEmision: '2026-03-05', fechaEmisionTexto: '05 mar 2026',
    fechaTimbrado: '05 mar 2026 09:10',
    monto: 2900, estatus: 'Pagada',
    formaPago: '03 - Transferencia electrónica', metodoPago: 'PUE - Pago en una sola exhibición',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 0,
    conceptos: [{ descripcion: 'Hosting mensual', cantidad: 1, precioUnitario: 2500, importe: 2500 }],
    pagos: [{ fecha: '05 mar 2026', monto: 2900, referencia: 'TRA-88213' }],
    archivos: [
      { nombre: 'Factura F-1023', tipo: 'PDF', fecha: '05 mar 2026', tamano: '198 KB' },
      { nombre: 'Factura F-1023', tipo: 'XML', fecha: '05 mar 2026', tamano: '17 KB' },
    ],
  },
  {
    id: '3', folio: '1022', serie: 'A', uuid: 'b2c3d4e5-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    descripcion: 'Consultoría UX/UI', proyecto: 'Sitio web corporativo',
    fechaEmision: '2026-02-20', fechaEmisionTexto: '20 feb 2026',
    fechaTimbrado: '20 feb 2026 16:40',
    monto: 8700, estatus: 'Pagada',
    formaPago: '03 - Transferencia electrónica', metodoPago: 'PUE - Pago en una sola exhibición',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 0,
    conceptos: [{ descripcion: 'Consultoría de experiencia de usuario', cantidad: 1, precioUnitario: 7500, importe: 7500 }],
    pagos: [{ fecha: '21 feb 2026', monto: 8700, referencia: 'TRA-87990' }],
    archivos: [
      { nombre: 'Factura F-1022', tipo: 'PDF', fecha: '20 feb 2026', tamano: '205 KB' },
      { nombre: 'Factura F-1022', tipo: 'XML', fecha: '20 feb 2026', tamano: '19 KB' },
    ],
  },
  {
    id: '4', folio: '1021', serie: 'A', uuid: 'c3d4e5f6-7a8b-4c9d-0e1f-2a3b4c5d6e7f',
    descripcion: 'Mantenimiento mensual', proyecto: 'Sitio web corporativo',
    fechaEmision: '2026-02-15', fechaEmisionTexto: '15 feb 2026',
    fechaTimbrado: '15 feb 2026 11:00',
    monto: 2900, estatus: 'Cancelada',
    formaPago: '03 - Transferencia electrónica', metodoPago: 'PUE - Pago en una sola exhibición',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 0,
    conceptos: [{ descripcion: 'Mantenimiento y soporte mensual', cantidad: 1, precioUnitario: 2500, importe: 2500 }],
    pagos: [],
    archivos: [{ nombre: 'Factura F-1021', tipo: 'XML', fecha: '15 feb 2026', tamano: '17 KB' }],
    motivoCancelacion: 'Facturado por error, se emitió una nueva factura con los datos correctos.',
  },
  {
    id: '5', folio: '1020', serie: 'A', uuid: 'd4e5f6a7-8b9c-4d0e-1f2a-3b4c5d6e7f8a',
    descripcion: 'Desarrollo módulo CRM', proyecto: 'CRM interno',
    fechaEmision: '2026-01-30', fechaEmisionTexto: '30 ene 2026',
    fechaTimbrado: '30 ene 2026 12:15', fechaLimite: '30 mar 2026',
    monto: 12640, estatus: 'Pendiente',
    formaPago: '99 - Por definir', metodoPago: 'PPD - Pago en parcialidades o diferido',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 6320,
    conceptos: [
      { descripcion: 'Desarrollo de módulo de oportunidades', cantidad: 1, precioUnitario: 8000, importe: 8000 },
      { descripcion: 'Integración con facturación', cantidad: 1, precioUnitario: 4640, importe: 4640 },
    ],
    pagos: [{ fecha: '15 feb 2026', monto: 6320, referencia: 'TRA-88450' }],
    archivos: [
      { nombre: 'Factura F-1020', tipo: 'PDF', fecha: '30 ene 2026', tamano: '224 KB' },
      { nombre: 'Factura F-1020', tipo: 'XML', fecha: '30 ene 2026', tamano: '20 KB' },
    ],
  },
  {
    id: '6', folio: '1019', serie: 'A', uuid: 'e5f6a7b8-9c0d-4e1f-2a3b-4c5d6e7f8a9b',
    descripcion: 'Capacitación equipo', proyecto: 'CRM interno',
    fechaEmision: '2026-01-18', fechaEmisionTexto: '18 ene 2026',
    fechaTimbrado: '18 ene 2026 10:00',
    monto: 4500, estatus: 'Pagada',
    formaPago: '03 - Transferencia electrónica', metodoPago: 'PUE - Pago en una sola exhibición',
    receptorRfc: 'XAXX010101000', receptorNombre: 'Cliente Ejemplo S.A. de C.V.',
    saldoPendiente: 0,
    conceptos: [{ descripcion: 'Capacitación de uso de plataforma', cantidad: 1, precioUnitario: 3879.31, importe: 3879.31 }],
    pagos: [{ fecha: '18 ene 2026', monto: 4500, referencia: 'TRA-87102' }],
    archivos: [
      { nombre: 'Factura F-1019', tipo: 'PDF', fecha: '18 ene 2026', tamano: '190 KB' },
      { nombre: 'Factura F-1019', tipo: 'XML', fecha: '18 ene 2026', tamano: '16 KB' },
    ],
  },
]

const PROYECTOS = Array.from(new Set(FACTURAS_INICIALES.map((f) => f.proyecto)))
const ESTADOS: EstatusFactura[] = ['Pagada', 'Pendiente', 'Cancelada']
const POR_PAGINA = 8

function formatoMoneda(monto: number) {
  return monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function usePopover() {
  const [abierto, setAbierto] = useState(false)
  return { abierto, setAbierto }
}

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Facturas</span>
    </div>
  )
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
            Consulta, descarga y paga tus facturas de forma rápida y segura.
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

const ESTATUS_ESTILO: Record<EstatusFactura, string> = {
  Pagada: 'bg-emerald-500/10 text-emerald-500',
  Pendiente: 'bg-amber-500/10 text-amber-500',
  Cancelada: 'bg-red-500/10 text-red-500',
}

const ESTATUS_ICONO: Record<EstatusFactura, React.ComponentType<{ className?: string }>> = {
  Pagada: CheckCircle2,
  Pendiente: Clock,
  Cancelada: X,
}

function EstatusBadge({ estatus }: { estatus: EstatusFactura }) {
  const Icono = ESTATUS_ICONO[estatus]
  return (
    <span className={clsx('flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold', ESTATUS_ESTILO[estatus])}>
      <Icono className="h-3 w-3" />
      {estatus}
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
  proyecto: string
}

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
          placeholder="Buscar por folio, UUID o descripción..."
          className="w-full rounded-lg border border-surface-border bg-card py-2 pl-10 pr-4 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        />
      </div>
      <FiltroDropdown valor={filtros.estatus} opciones={ESTADOS} etiquetaTodos="Todas" onCambiar={(v) => onCambiar({ estatus: v })} />
      <FiltroDropdown valor={filtros.proyecto} opciones={PROYECTOS} etiquetaTodos="Todos" onCambiar={(v) => onCambiar({ proyecto: v })} />
      <button
        type="button"
        onClick={() => onCambiar({ busqueda: '', estatus: 'Todas', proyecto: 'Todos' })}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-border px-3.5 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface"
      >
        <RefreshCcw className="h-3.5 w-3.5" />
        Limpiar filtros
      </button>
    </div>
  )
}

function FacturaListItem({ f, seleccionada, onClick }: { f: Factura; seleccionada: boolean; onClick: () => void }) {
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
            <p className="text-sm font-bold text-ink">F-{f.folio}</p>
            <span className="text-[11px] text-ink-tertiary">Serie {f.serie}</span>
          </div>
          <p className="truncate text-xs text-ink-secondary">{f.descripcion}</p>
          <p className="text-[11px] text-ink-tertiary">{f.fechaEmisionTexto}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <p className="text-sm font-bold text-ink">${formatoMoneda(f.monto)}</p>
          <EstatusBadge estatus={f.estatus} />
        </div>
      </button>
    </li>
  )
}

function ListaFacturas({
  facturas, seleccionadaId, onSeleccionar, pagina, onPagina, totalFacturas,
}: {
  facturas: Factura[]
  seleccionadaId: string
  onSeleccionar: (id: string) => void
  pagina: number
  onPagina: (p: number) => void
  totalFacturas: number
}) {
  const totalPaginas = Math.max(1, Math.ceil(totalFacturas / POR_PAGINA))
  const inicio = (pagina - 1) * POR_PAGINA

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Facturas ({totalFacturas})</h3>
        <button type="button" className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-surface">
          <Download className="h-3.5 w-3.5" />
          Exportar listado
        </button>
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
              Mostrando {Math.min(facturas.length, POR_PAGINA)} de {totalFacturas} facturas
            </p>
          </div>
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

function DetalleFactura({ f }: { f: Factura }) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>('Información')
  const { abierto, setAbierto } = usePopover()
  const [copiado, setCopiado] = useState(false)

  function copiarUuid() {
    navigator.clipboard?.writeText(f.uuid)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  const porcentajePagado = f.monto > 0 ? Math.round(((f.monto - f.saldoPendiente) / f.monto) * 100) : 100

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#19b6bc]/10 text-[#19b6bc]">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-bold text-ink">F-{f.folio}</p>
            <p className="text-xs text-ink-tertiary">Serie {f.serie} · {f.descripcion}</p>
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
                  <button type="button" onClick={copiarUuid} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
                    <Copy className="h-4 w-4" />
                    {copiado ? '¡UUID copiado!' : 'Copiar UUID'}
                  </button>
                  <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ink-secondary hover:bg-surface">
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
        {SUBTABS.map((t) => {
          const contador = t === 'Conceptos' ? f.conceptos.length : t === 'Pagos' ? f.pagos.length : t === 'Archivos' ? f.archivos.length : null
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

      <div>
        {subtab === 'Información' && (
          <div className="flex flex-col divide-y divide-surface-border">
            <div className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink-tertiary">UUID (CFDI)</span>
              <button type="button" onClick={copiarUuid} className="flex items-center gap-1.5 text-right font-mono text-[11px] font-semibold text-ink hover:text-brand">
                {f.uuid}
                <Copy className="h-3 w-3 flex-shrink-0" />
              </button>
            </div>
            <CampoInfo label="Fecha de emisión">{f.fechaEmisionTexto}</CampoInfo>
            <CampoInfo label="Fecha de timbrado">{f.fechaTimbrado}</CampoInfo>
            <CampoInfo label="Forma de pago">{f.formaPago}</CampoInfo>
            <CampoInfo label="Método de pago">{f.metodoPago}</CampoInfo>
            <div className="py-2">
              <p className="text-sm text-ink-tertiary">Receptor</p>
              <p className="mt-0.5 text-sm font-semibold text-ink">{f.receptorRfc}</p>
              <p className="text-xs text-ink-tertiary">{f.receptorNombre}</p>
            </div>
            {f.estatus === 'Cancelada' && f.motivoCancelacion && (
              <div className="flex items-start gap-2 py-3 text-xs text-red-500">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{f.motivoCancelacion}</span>
              </div>
            )}
          </div>
        )}

        {subtab === 'Conceptos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-ink-tertiary">
                  <th className="pb-2 font-semibold">Descripción</th>
                  <th className="pb-2 text-right font-semibold">Cant.</th>
                  <th className="pb-2 text-right font-semibold">P. unitario</th>
                  <th className="pb-2 text-right font-semibold">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {f.conceptos.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2.5 pr-2 text-ink-secondary">{c.descripcion}</td>
                    <td className="py-2.5 text-right text-ink-secondary">{c.cantidad}</td>
                    <td className="py-2.5 text-right text-ink-secondary">${formatoMoneda(c.precioUnitario)}</td>
                    <td className="py-2.5 text-right font-semibold text-ink">${formatoMoneda(c.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-col items-end gap-1 border-t border-surface-border pt-3 text-xs">
              <div className="flex w-40 justify-between text-ink-tertiary"><span>Subtotal</span><span>${formatoMoneda(f.monto / 1.16)}</span></div>
              <div className="flex w-40 justify-between text-ink-tertiary"><span>IVA (16%)</span><span>${formatoMoneda(f.monto - f.monto / 1.16)}</span></div>
              <div className="flex w-40 justify-between text-sm font-bold text-ink"><span>Total</span><span>${formatoMoneda(f.monto)}</span></div>
            </div>
          </div>
        )}

        {subtab === 'Pagos' && (
          f.pagos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-ink-tertiary">
              <Clock className="h-6 w-6" />
              <p className="text-sm">Todavía no se han registrado pagos para esta factura.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {f.pagos.map((p, i) => (
                <li key={i} className="flex items-center gap-2.5 rounded-lg border border-surface-border p-2.5">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-ink">${formatoMoneda(p.monto)} MXN</span>
                    <span className="block text-[11px] text-ink-tertiary">{p.fecha} · Ref. {p.referencia}</span>
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        {subtab === 'Archivos' && (
          <ul className="flex flex-col gap-2">
            {f.archivos.map((a, i) => (
              <li key={i} className="flex items-center gap-2.5 rounded-lg border border-surface-border p-2.5">
                {a.tipo === 'PDF' ? <FileText className="h-4 w-4 flex-shrink-0 text-red-500" /> : <FileCode className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink">{a.nombre}.{a.tipo.toLowerCase()}</span>
                  <span className="block text-[11px] text-ink-tertiary">{a.fecha} · {a.tamano}</span>
                </span>
                <Download className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {f.estatus === 'Pendiente' && (
        <div className="border-t border-surface-border pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-ink">Saldo pendiente</span>
            <span className="text-ink-tertiary">Total: ${formatoMoneda(f.monto)} MXN</span>
          </div>
          <p className="mt-1 text-lg font-extrabold text-ink">${formatoMoneda(f.saldoPendiente)} MXN</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-brand" style={{ width: `${porcentajePagado}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-ink-tertiary">{porcentajePagado}%</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={f.estatus !== 'Pendiente'}
          title={f.estatus === 'Pendiente' ? undefined : 'El pago en línea estará disponible próximamente'}
          className="flex items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Pagar ahora
        </button>
        <button type="button" className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface">
          <FileText className="h-3.5 w-3.5" />
          Descargar PDF
        </button>
        <button type="button" className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface">
          <FileCode className="h-3.5 w-3.5" />
          Descargar XML
        </button>
        <button type="button" className="flex items-center justify-center gap-1.5 rounded-full border border-surface-border py-2.5 text-xs font-semibold text-ink-secondary hover:bg-surface">
          <Share2 className="h-3.5 w-3.5" />
          Compartir
        </button>
      </div>

      {f.estatus === 'Pendiente' && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Esta factura se encuentra pendiente de pago. Realiza tu pago para evitar cargos adicionales.</span>
        </div>
      )}
    </div>
  )
}

export function PortalClienteFacturasPage() {
  const [facturas] = useState<Factura[]>(FACTURAS_INICIALES)
  const [seleccionadaId, setSeleccionadaId] = useState(FACTURAS_INICIALES[0].id)
  const [pagina, setPagina] = useState(1)

  const [filtros, setFiltros] = useState<Filtros>({ busqueda: '', estatus: 'Todas', proyecto: 'Todos' })

  function actualizarFiltros(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
    setPagina(1)
  }

  const filtradas = facturas
    .filter((f) => `${f.folio}`.includes(filtros.busqueda) || f.uuid.toLowerCase().includes(filtros.busqueda.toLowerCase()) || f.descripcion.toLowerCase().includes(filtros.busqueda.toLowerCase()))
    .filter((f) => filtros.estatus === 'Todas' || f.estatus === filtros.estatus)
    .filter((f) => filtros.proyecto === 'Todos' || f.proyecto === filtros.proyecto)
    .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision))

  const inicio = (pagina - 1) * POR_PAGINA
  const paginadas = filtradas.slice(inicio, inicio + POR_PAGINA)

  const seleccionada = facturas.find((f) => f.id === seleccionadaId) ?? facturas[0] ?? null

  const pendientes = facturas.filter((f) => f.estatus === 'Pendiente')
  const totalPendiente = pendientes.reduce((acc, f) => acc + f.saldoPendiente, 0)
  const pagadasEsteAnio = facturas.filter((f) => f.estatus === 'Pagada' && f.fechaEmision.startsWith('2026'))
  const totalPagadas = pagadasEsteAnio.reduce((acc, f) => acc + f.monto, 0)
  const proximaLimite = pendientes
    .filter((f) => f.fechaLimite)
    .sort((a, b) => (a.fechaEmision > b.fechaEmision ? 1 : -1))[0]

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderFacturas
        totalPendiente={totalPendiente}
        cantidadPendientes={pendientes.length}
        onVerPendientes={() => actualizarFiltros({ estatus: 'Pendiente' })}
      />

      <Reveal index={0} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResumenCard icon={FileText} color="bg-[#19b6bc]/10 text-[#19b6bc]" valor={String(facturas.length)} label="Total de facturas" sublabel="Histórico" />
        <ResumenCard icon={Clock} color="bg-amber-500/10 text-amber-500" valor={String(pendientes.length)} label="Pendientes de pago" sublabel={`$${formatoMoneda(totalPendiente)} MXN`} sublabelColor="text-amber-500" />
        <ResumenCard icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-500" valor={String(pagadasEsteAnio.length)} label="Pagadas este año" sublabel={`$${formatoMoneda(totalPagadas)} MXN`} sublabelColor="text-emerald-500" />
        <ResumenCard icon={Calendar} color="bg-violet-500/10 text-violet-500" valor={proximaLimite ? proximaLimite.fechaLimite! : '—'} label="Próxima fecha límite" sublabel={proximaLimite ? `$${formatoMoneda(proximaLimite.saldoPendiente)} MXN` : 'Sin pendientes'} />
      </Reveal>

      <Reveal index={1} className="flex flex-col gap-5">
        <BarraFiltros filtros={filtros} onCambiar={actualizarFiltros} />
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_1fr]">
          <ListaFacturas
            facturas={paginadas}
            seleccionadaId={seleccionada?.id ?? ''}
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
      </Reveal>
    </div>
  )
}
