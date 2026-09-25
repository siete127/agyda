import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Box, Package, Wrench, DollarSign, Sparkles, X, Loader2, FileSpreadsheet, Check, CalendarClock } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalProductoServicio, PortalCatalogoItem } from '@/types/portalCliente.types'
import { PortalHero } from './components/PortalHero'
import { PortalBreadcrumb } from './components/PortalBreadcrumb'
import productosHero from '@/assets/productos-hero.png'

const RECURRENCIA_LABEL: Record<string, string> = { MENSUAL: '/mes', ANUAL: '/año', UNICO: 'pago único' }

// Mismo degradado que el pill activo del sidebar del portal (PortalClienteSidebar.tsx).
const BRAND_GRADIENT = 'bg-gradient-to-br from-[#19b6bc] to-[#00537f]'

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
function NuevaCotizacionPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: catalogo = [], isLoading } = useQuery({
    queryKey: ['portal-catalogo-productos-servicios'],
    queryFn: () => portalClienteService.getCatalogoProductosServicios(),
  })
  const [seleccionIds, setSeleccionIds] = useState<number[]>([])
  const [requerimientos, setRequerimientos] = useState<Record<number, string>>({})
  const [mostrarRequerimientos, setMostrarRequerimientos] = useState<Record<number, boolean>>({})
  const [fechaContactacion, setFechaContactacion] = useState('')

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
                    </div>
                    <span className={clsx('mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                      activo ? 'border-brand bg-brand text-white' : 'border-surface-border')}>
                      {activo && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  </button>
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
        <label className="mb-3 flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-tertiary">
            <CalendarClock className="h-3.5 w-3.5" /> ¿Cuándo te gustaría que te contactemos? (opcional)
          </span>
          <input
            type="datetime-local"
            value={fechaContactacion}
            onChange={(e) => setFechaContactacion(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface px-2.5 py-2 text-xs text-ink focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={seleccionados.length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
          className={clsx('flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40', BRAND_GRADIENT)}
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Solicitar cotización
        </button>
      </div>
    </div>
  )
}

export function PortalClienteProductosPage() {
  const { data: lista, isLoading } = useQuery({ queryKey: ['portal-productos-servicios'], queryFn: () => portalClienteService.getProductosServicios() })
  const items = lista ?? []
  const [panelAbierto, setPanelAbierto] = useState(false)

  const productos = items.filter((p) => p.tipo === 'PRODUCTO')
  const servicios = items.filter((p) => p.tipo === 'SERVICIO')
  const costoMensual = items.filter((p) => p.recurrencia === 'MENSUAL').reduce((sum, p) => sum + p.precio, 0)

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
                <div key={p.id} className="flex items-start gap-3 rounded-xl border border-surface-border px-3.5 py-3">
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
                  </div>
                  {p.precio > 0 && (
                    <p className="flex-shrink-0 text-right text-sm font-bold text-ink">
                      ${p.precio.toLocaleString('es-MX')}
                      <span className="ml-0.5 text-[11px] font-normal text-ink-tertiary">{RECURRENCIA_LABEL[p.recurrencia]}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {panelAbierto && (
        <div className="min-w-0">
          <div className="sticky top-6 h-[calc(100vh-8rem)]">
            <NuevaCotizacionPanel onClose={() => setPanelAbierto(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
