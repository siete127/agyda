import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Box, Package, Wrench, DollarSign, Sparkles, X, Loader2, FileSpreadsheet, Check, CalendarClock, ChevronDown, ListChecks, Star, Plug, Target, ClipboardCheck } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalProductoServicio, PortalCatalogoItem } from '@/types/portalCliente.types'
import { PortalHero } from './components/PortalHero'
import { PortalBreadcrumb } from './components/PortalBreadcrumb'
import { Modal } from '@/components/ui/Modal'
import productosHero from '@/assets/productos-hero.png'

const RECURRENCIA_LABEL: Record<string, string> = { MENSUAL: '/mes', ANUAL: '/año', UNICO: 'pago único' }

// Mismo degradado que el pill activo del sidebar del portal (PortalClienteSidebar.tsx).
const BRAND_GRADIENT = 'bg-gradient-to-br from-[#19b6bc] to-[#00537f]'

// Cada campo ampliado del catálogo se captura como texto plano, un punto por
// línea — se parte por saltos de línea y se descartan las vacías al pintar bullets.
function lineas(texto: string | null): string[] {
  if (!texto) return []
  return texto.split('\n').map((l) => l.trim()).filter(Boolean)
}

const SECCIONES_FICHA: { key: 'caracteristicas' | 'beneficios' | 'integraciones' | 'aplicaciones'; label: string; icon: typeof ListChecks }[] = [
  { key: 'caracteristicas', label: 'Características', icon: ListChecks },
  { key: 'beneficios', label: 'Beneficios', icon: Star },
  { key: 'integraciones', label: 'Integraciones', icon: Plug },
  { key: 'aplicaciones', label: 'Se usa para', icon: Target },
]

interface FichaAmpliada {
  caracteristicas: string | null
  beneficios: string | null
  integraciones: string | null
  aplicaciones: string | null
}

function tieneFichaAmpliada(item: FichaAmpliada): boolean {
  return SECCIONES_FICHA.some((s) => lineas(item[s.key]).length > 0)
}

function FichaAmpliadaDetalle({ item }: { item: FichaAmpliada }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-surface-border pt-4 sm:grid-cols-2">
      {SECCIONES_FICHA.map(({ key, label, icon: Icon }) => {
        const puntos = lineas(item[key])
        if (puntos.length === 0) return null
        return (
          <div key={key} className="rounded-xl bg-surface p-3.5">
            <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">
              <Icon className="h-3.5 w-3.5" /> {label}
            </p>
            <ul className="flex flex-col gap-2">
              {puntos.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-ink-secondary">
                  <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-ink-tertiary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-border bg-card p-4 shadow-card">
      <span className={clsx('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl', color)}>
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold text-ink">{value}</p>
        <p className="text-xs text-ink-tertiary">{label}</p>
      </div>
    </div>
  )
}

// Card deslizable: al abrir empuja el contenido de la página hacia la
// izquierda (grid de 2 columnas) en vez de superponerse como un modal.
function NuevaCotizacionPanel({ onClose, yaContratadosIds = new Set() }: { onClose: () => void; yaContratadosIds?: Set<number> }) {
  const queryClient = useQueryClient()
  const { data: catalogoData = [], isLoading } = useQuery({
    queryKey: ['portal-catalogo-productos-servicios'],
    queryFn: () => portalClienteService.getCatalogoProductosServicios(),
  })
  // Solo productos/servicios con precio definido (los que están en $0 no
  // tienen tarifa pública para cotizar) y que el cliente no tenga ya
  // contratados — no tiene caso volver a ofrecerle algo que ya tiene.
  const catalogo = catalogoData.filter((c) => c.precio > 0 && !yaContratadosIds.has(c.id))
  const [seleccionIds, setSeleccionIds] = useState<number[]>([])
  const [requerimientos, setRequerimientos] = useState<Record<number, string>>({})
  const [mostrarRequerimientos, setMostrarRequerimientos] = useState<Record<number, boolean>>({})
  const [expandidoId, setExpandidoId] = useState<number | null>(null)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [slotSeleccionado, setSlotSeleccionado] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  const { data: disponibilidad, isLoading: cargandoDisponibilidad } = useQuery({
    queryKey: ['portal-disponibilidad-asesor'],
    queryFn: () => portalClienteService.getDisponibilidadAsesor(),
  })
  const dias = disponibilidad?.dias ?? []
  const fechaContactacion = diaSeleccionado && slotSeleccionado ? `${diaSeleccionado}T${slotSeleccionado}` : ''

  const seleccionados = catalogo.filter((c) => seleccionIds.includes(c.id))
  const totalEstimado = seleccionados.reduce((sum, c) => sum + c.precio, 0)

  const mutation = useMutation({
    mutationFn: () => portalClienteService.solicitarCotizacion(
      seleccionIds.map((id) => ({
        psId: id, cantidad: 1,
        requerimientos: mostrarRequerimientos[id] ? (requerimientos[id]?.trim() || undefined) : undefined,
      })),
      fechaContactacion || null
    ),
    onSuccess: (data) => {
      toast.success(`Solicitud enviada — folio ${data.folio}. Te contactaremos pronto.`)
      queryClient.invalidateQueries({ queryKey: ['portal-cotizaciones'] })
      setConfirmando(false)
      onClose()
    },
    onError: () => toast.error('No se pudo enviar la solicitud'),
  })

  function toggle(item: PortalCatalogoItem) {
    setSeleccionIds((prev) => {
      if (prev.includes(item.id)) return prev.filter((id) => id !== item.id)
      return [...prev, item.id]
    })
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-surface-border bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={clsx('flex h-9 w-9 items-center justify-center rounded-xl text-white', BRAND_GRADIENT)}>
            <FileSpreadsheet className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Nueva cotización</p>
            <p className="text-[11px] text-ink-tertiary">Elige lo que te interesa cotizar</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary hover:bg-surface hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface" />
        ) : catalogo.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">No hay productos o servicios disponibles por ahora.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalogo.map((item) => {
              const activo = seleccionIds.includes(item.id)
              return (
                <div
                  key={item.id}
                  className={clsx(
                    'rounded-xl border px-3.5 py-3 transition-colors',
                    activo ? 'border-brand bg-brand/5' : 'border-surface-border'
                  )}
                >
                  <button type="button" onClick={() => toggle(item)} className="flex w-full items-start gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{item.nombre}</p>
                      <span className={clsx('mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        item.tipo === 'SERVICIO' ? 'bg-violet-500/10 text-violet-500' : 'bg-brand/10 text-brand')}>
                        {item.tipo === 'SERVICIO' ? 'Servicio' : 'Producto'}
                      </span>
                      {item.descripcion && (
                        <p className="mt-1.5 whitespace-pre-line text-xs text-ink-tertiary">{item.descripcion}</p>
                      )}
                      <p className="mt-1.5 text-sm font-bold text-ink">
                        ${item.precio.toLocaleString('es-MX')}
                        <span className="ml-0.5 text-[11px] font-normal text-ink-tertiary">{RECURRENCIA_LABEL[item.recurrencia]}</span>
                      </p>
                      {tieneFichaAmpliada(item) && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setExpandidoId((cur) => (cur === item.id ? null : item.id)) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setExpandidoId((cur) => (cur === item.id ? null : item.id)) } }}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          {expandidoId === item.id ? 'Ver menos' : 'Ver más'}
                          <ChevronDown className={clsx('h-3 w-3 transition-transform', expandidoId === item.id && 'rotate-180')} />
                        </span>
                      )}
                    </div>
                    <span className={clsx('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                      activo ? 'border-brand bg-brand text-white' : 'border-surface-border')}>
                      {activo && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
                  {expandidoId === item.id && <FichaAmpliadaDetalle item={item} />}
                  {activo && (
                    <div className="mt-2.5 flex flex-col gap-2.5 border-t border-surface-border pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-tertiary">Agregar requerimientos</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMostrarRequerimientos((prev) => ({ ...prev, [item.id]: !prev[item.id] })) }}
                          className={clsx(
                            'relative h-6 w-11 flex-shrink-0 rounded-full border-0 p-0 transition-colors',
                            mostrarRequerimientos[item.id] ? 'bg-brand' : 'bg-gray-200'
                          )}
                        >
                          <span className={clsx('absolute left-[4px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform', mostrarRequerimientos[item.id] ? 'translate-x-5' : 'translate-x-0')} />
                        </button>
                      </div>
                      {mostrarRequerimientos[item.id] && (
                        <textarea
                          value={requerimientos[item.id] || ''}
                          onChange={(e) => setRequerimientos((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Requerimientos específicos de este producto o servicio"
                          rows={2}
                          maxLength={4000}
                          autoFocus
                          className="w-full resize-none rounded-lg border border-surface-border bg-surface px-2.5 py-2 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-surface-border p-5">
        {seleccionados.length > 0 && (
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-ink-tertiary">{seleccionados.length} seleccionado{seleccionados.length > 1 ? 's' : ''}</span>
            <span className="font-bold text-ink">${totalEstimado.toLocaleString('es-MX')} aprox.</span>
          </div>
        )}
        <div className="mb-3 flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-tertiary">
            <CalendarClock className="h-3.5 w-3.5" /> ¿Cuándo te gustaría que te contactemos? (opcional)
          </span>
          {cargandoDisponibilidad ? (
            <div className="h-16 animate-pulse rounded-lg bg-surface" />
          ) : dias.length === 0 ? (
            <p className="rounded-lg bg-surface px-2.5 py-2 text-[11px] text-ink-tertiary">
              No hay horarios disponibles por ahora — te contactaremos para acordar una fecha.
            </p>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {dias.map((d) => {
                  const fecha = new Date(`${d.fecha}T12:00:00`)
                  const activo = diaSeleccionado === d.fecha
                  return (
                    <button
                      key={d.fecha}
                      type="button"
                      onClick={() => { setDiaSeleccionado(d.fecha); setSlotSeleccionado(null) }}
                      className={clsx(
                        'flex flex-shrink-0 flex-col items-center rounded-lg border px-2.5 py-1.5 text-center transition-colors',
                        activo ? 'border-brand bg-brand/10' : 'border-surface-border hover:bg-surface'
                      )}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-tertiary">
                        {fecha.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')}
                      </span>
                      <span className="text-sm font-bold text-ink">{fecha.getDate()}</span>
                    </button>
                  )
                })}
              </div>
              {diaSeleccionado && (
                <div className="flex flex-wrap gap-1.5">
                  {dias.find((d) => d.fecha === diaSeleccionado)?.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSlotSeleccionado(slot)}
                      className={clsx(
                        'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                        slotSeleccionado === slot ? 'border-brand bg-brand text-white' : 'border-surface-border text-ink-secondary hover:bg-surface'
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          disabled={seleccionados.length === 0}
          onClick={() => setConfirmando(true)}
          className={clsx('flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40', BRAND_GRADIENT)}
        >
          <Sparkles className="h-4 w-4" />
          Solicitar cotización
        </button>
      </div>

      <Modal isOpen={confirmando} onClose={() => setConfirmando(false)} title="Confirma tu solicitud" size="md">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-secondary">Revisa que todo esté correcto antes de enviar tu solicitud de cotización.</p>

          <div className="flex flex-col gap-2.5 rounded-xl border border-surface-border bg-surface p-3.5">
            {seleccionados.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 border-b border-surface-border pb-2.5 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.nombre}</p>
                  {mostrarRequerimientos[item.id] && requerimientos[item.id]?.trim() && (
                    <p className="mt-0.5 whitespace-pre-line text-xs text-ink-tertiary">{requerimientos[item.id]}</p>
                  )}
                </div>
                <p className="flex-shrink-0 text-sm font-bold text-ink">
                  ${item.precio.toLocaleString('es-MX')}
                  <span className="ml-0.5 text-[11px] font-normal text-ink-tertiary">{RECURRENCIA_LABEL[item.recurrencia]}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink-secondary">Total estimado</span>
            <span className="text-base font-bold text-ink">${totalEstimado.toLocaleString('es-MX')}</span>
          </div>

          {fechaContactacion && (
            <div className="flex items-center gap-2 rounded-xl bg-brand/5 px-3.5 py-2.5 text-xs text-ink-secondary">
              <CalendarClock className="h-4 w-4 flex-shrink-0 text-brand" />
              Contacto propuesto: <span className="font-semibold text-ink">{new Date(fechaContactacion).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="flex-1 rounded-xl border border-surface-border py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface"
            >
              Seguir editando
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className={clsx('flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60', BRAND_GRADIENT)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Confirmar y enviar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export function PortalClienteProductosPage() {
  const { data: lista, isLoading } = useQuery({ queryKey: ['portal-productos-servicios'], queryFn: () => portalClienteService.getProductosServicios() })
  const items = lista ?? []
  const [searchParams] = useSearchParams()
  // ?nueva=1 permite llegar desde otra sección (ej. Cotizaciones sin ninguna
  // aún) con el panel ya desplegado, en vez de que el cliente tenga que
  // encontrar el botón por su cuenta.
  const [panelAbierto, setPanelAbierto] = useState(() => searchParams.get('nueva') === '1')
  const [expandidoDetalleId, setExpandidoDetalleId] = useState<number | null>(null)

  const productos = items.filter((p) => p.tipo === 'PRODUCTO')
  const servicios = items.filter((p) => p.tipo === 'SERVICIO')
  const costoMensual = items.filter((p) => p.recurrencia === 'MENSUAL').reduce((sum, p) => sum + p.precio, 0)
  const yaContratadosIds = new Set(items.map((p) => p.productoServicioId))

  return (
    <div className={clsx('mx-auto grid max-w-[1280px] gap-6 transition-[grid-template-columns] duration-300', panelAbierto ? 'lg:grid-cols-[1fr_380px]' : 'lg:grid-cols-1')}>
      <div className="flex min-w-0 flex-col gap-6">
        <PortalBreadcrumb seccion="Productos" />

        <PortalHero icon={Box} titulo="Productos y servicios contratados" descripcion="Consulta todo lo que tienes contratado con nosotros." imagen={productosHero} />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPanelAbierto((v) => !v)}
            className={clsx(
              'flex flex-shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90',
              BRAND_GRADIENT,
              panelAbierto && 'opacity-90'
            )}
          >
            <Sparkles className="h-4 w-4" /> Nueva cotización
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={<Package className="h-5 w-5" />} label="Productos" value={String(productos.length)} color="bg-brand/10 text-brand" />
          <StatCard icon={<Wrench className="h-5 w-5" />} label="Servicios" value={String(servicios.length)} color="bg-violet-500/10 text-violet-500" />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Costo mensual" value={`$${costoMensual.toLocaleString('es-MX')}`} color="bg-emerald-500/10 text-emerald-500" />
        </div>

        <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
          <h3 className="mb-4 text-sm font-bold text-ink">Detalle</h3>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface" />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-tertiary">
                <Box className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold text-ink">Aún no tienes productos ni servicios contratados.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {items.map((p: PortalProductoServicio) => (
                <div key={p.id} className="rounded-xl border border-surface-border px-3.5 py-3">
                  <div className="flex items-start gap-3">
                    <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
                      p.tipo === 'SERVICIO' ? 'bg-violet-500/10 text-violet-500' : 'bg-brand/10 text-brand')}>
                      {p.tipo === 'SERVICIO' ? <Wrench className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.nombre}</p>
                      <span className={clsx('mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        p.tipo === 'SERVICIO' ? 'bg-violet-500/10 text-violet-500' : 'bg-brand/10 text-brand')}>
                        {p.tipo === 'SERVICIO' ? 'Servicio' : 'Producto'}
                      </span>
                      {p.descripcion && (
                        <p className="mt-1.5 whitespace-pre-line text-xs text-ink-tertiary">{p.descripcion}</p>
                      )}
                      {tieneFichaAmpliada(p) && (
                        <button
                          type="button"
                          onClick={() => setExpandidoDetalleId((cur) => (cur === p.id ? null : p.id))}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          {expandidoDetalleId === p.id ? 'Ver menos' : 'Ver más'}
                          <ChevronDown className={clsx('h-3 w-3 transition-transform', expandidoDetalleId === p.id && 'rotate-180')} />
                        </button>
                      )}
                    </div>
                    {p.precio > 0 && (
                      <p className="flex-shrink-0 text-right text-sm font-bold text-ink">
                        ${p.precio.toLocaleString('es-MX')}
                        <span className="ml-0.5 text-[11px] font-normal text-ink-tertiary">{RECURRENCIA_LABEL[p.recurrencia]}</span>
                      </p>
                    )}
                  </div>
                  {expandidoDetalleId === p.id && <FichaAmpliadaDetalle item={p} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {panelAbierto && (
        <div className="min-w-0">
          <div className="sticky top-6 h-[calc(100vh-8rem)]">
            <NuevaCotizacionPanel onClose={() => setPanelAbierto(false)} yaContratadosIds={yaContratadosIds} />
          </div>
        </div>
      )}
    </div>
  )
}
