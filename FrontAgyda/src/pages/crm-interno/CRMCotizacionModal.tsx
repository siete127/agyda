import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Plus, GripVertical, Trash2, FileText, ShieldAlert, PackageSearch } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { crmService } from '@/services/crm.service'
import { productoServicioService } from '@/services/productoServicio.service'
import { usePersonalizacion } from '@/providers/personalizacion.context'
import { useActionAccess } from '@/hooks/useActionAccess'
import type { CRMCotizacion, CRMCotizacionItem, CRMSemaforo } from '@/types/crm.types'

interface Props {
  opoId: number
  cot?: CRMCotizacion | null
  onClose: () => void
  onSaved: () => void
}

const ESTATUS_STEPS = ['borrador', 'enviada', 'aprobada'] as const

const SEMAFORO_UI: Record<CRMSemaforo, { label: string; chip: string; dot: string }> = {
  VERDE:     { label: 'Margen sano',   chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  AMARILLO:  { label: 'Margen ajustado', chip: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-500' },
  ROJO:      { label: 'Margen bajo',    chip: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-500' },
  SIN_COSTO: { label: 'Sin costo',      chip: 'bg-gray-100 text-gray-500 border-gray-200',        dot: 'bg-gray-400' },
}

function fmtMXN(n: number) {
  return '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function lineaBase(it: CRMCotizacionItem) {
  if (it.esSeccion) return 0
  return (it.cantidad || 0) * (it.precioUnit || 0) * (1 - (it.descuento || 0) / 100)
}

interface Totales {
  subtotal: number
  iva: number
  total: number
  costoTotal: number
  utilidad: number | null
  margenPct: number | null
  semaforo: CRMSemaforo
}

function calcTotales(
  items: CRMCotizacionItem[],
  tasaIvaDefault: number,
  umbral: { verdeMin: number; amarilloMin: number; rojoMax: number },
): Totales {
  let subtotal = 0, iva = 0, costoTotal = 0, conCosto = false
  for (const it of items) {
    if (it.esSeccion) continue
    const base = lineaBase(it)
    subtotal += base
    iva += base * (it.ivaTasa != null ? it.ivaTasa : tasaIvaDefault)
    if (it.costoUnit != null && it.costoUnit !== ('' as unknown as number)) {
      conCosto = true
      costoTotal += Number(it.costoUnit) * (it.cantidad || 0)
    }
  }
  const total = subtotal + iva
  const utilidad = conCosto ? subtotal - costoTotal : null
  const margenPct = conCosto && subtotal > 0 ? ((utilidad as number) / subtotal) * 100 : null
  let semaforo: CRMSemaforo = 'SIN_COSTO'
  if (margenPct != null) {
    semaforo = margenPct > umbral.verdeMin ? 'VERDE' : margenPct >= umbral.amarilloMin ? 'AMARILLO' : 'ROJO'
  }
  return { subtotal, iva, total, costoTotal, utilidad, margenPct, semaforo }
}

function margenLinea(it: CRMCotizacionItem): number | null {
  if (it.esSeccion || it.costoUnit == null) return null
  const base = lineaBase(it)
  if (base <= 0) return null
  return ((base - Number(it.costoUnit) * (it.cantidad || 0)) / base) * 100
}

export function CRMCotizacionModal({ opoId, cot, onClose, onSaved }: Props) {
  const qc = useQueryClient()
  const { ventas } = usePersonalizacion()
  const { can } = useActionAccess()
  const puedeOverride = can('crm', 'cotizacion-override-margen')

  const tasaIva = ventas?.iva?.tasaDefault ?? 0.16
  const umbral = ventas?.margen ?? { verdeMin: 25, amarilloMin: 15, rojoMax: 15, requiereOverride: true }

  const [titulo, setTitulo] = useState(cot?.titulo ?? '')
  const [fechaVto, setFechaVto] = useState(cot?.fechaVto ?? '')
  const [notas, setNotas] = useState(cot?.notas ?? '')
  const [items, setItems] = useState<CRMCotizacionItem[]>(
    cot?.items ?? [{ esSeccion: false, descripcion: '', cantidad: 1, precioUnit: 0, descuento: 0 }]
  )
  const [showPdf, setShowPdf] = useState(false)
  const [savedCotId, setSavedCotId] = useState<number | undefined>(cot?.id)
  const [overridePedido, setOverridePedido] = useState<null | 'save' | 'enviar'>(null)
  const [catalogoPara, setCatalogoPara] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  const { data: catalogo = [] } = useQuery({
    queryKey: ['productos-servicios'],
    queryFn: () => productoServicioService.getAll(),
    enabled: catalogoPara !== null,
    staleTime: 5 * 60 * 1000,
  })

  const t = calcTotales(items, tasaIva, umbral)
  const bloqueadoPorMargen = t.semaforo === 'ROJO' && umbral.requiereOverride

  function buildPayload(override = false) {
    return {
      opoId,
      titulo,
      fechaVto: fechaVto || undefined,
      notas: notas || undefined,
      items,
      ...(override ? { overrideMargen: true } : {}),
    }
  }

  const saveMut = useMutation({
    mutationFn: async (override: boolean) => {
      const payload = buildPayload(override)
      if (cot?.id) return crmService.updateCotizacion(cot.id, payload)
      return crmService.createCotizacion(payload)
    },
    onSuccess: (data: { data?: { id?: number } }) => {
      if (!cot?.id && data?.data?.id) setSavedCotId(data.data.id)
      qc.invalidateQueries({ queryKey: ['crm-cotizaciones'] })
      setOverridePedido(null)
      toast.success('Cotización guardada')
      onSaved()
    },
    onError: (e: { response?: { data?: { code?: string } } }) => {
      if (e?.response?.data?.code === 'MARGEN_BAJO') {
        if (puedeOverride) setOverridePedido('save')
        else toast.error('El margen está por debajo del mínimo. Se requiere autorización de un supervisor.')
      } else {
        toast.error('Error al guardar')
      }
    },
  })

  const enviarMut = useMutation({
    mutationFn: async (override: boolean) => {
      const payload = buildPayload(override)
      let id = cot?.id ?? savedCotId
      if (!id) {
        const r = await crmService.createCotizacion(payload)
        id = r?.data?.id
        if (id) setSavedCotId(id)
      } else {
        await crmService.updateCotizacion(id, payload)
      }
      if (!id) throw new Error('Sin ID')
      await crmService.enviarCotizacion(id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-cotizaciones'] })
      setOverridePedido(null)
      toast.success('Cotización enviada')
      onSaved()
    },
    onError: (e: { response?: { data?: { code?: string } } }) => {
      if (e?.response?.data?.code === 'MARGEN_BAJO') {
        if (puedeOverride) setOverridePedido('enviar')
        else toast.error('El margen está por debajo del mínimo. Se requiere autorización de un supervisor.')
      } else {
        toast.error('Error al enviar')
      }
    },
  })

  function intentar(accion: 'save' | 'enviar') {
    if (bloqueadoPorMargen && !puedeOverride) {
      toast.error('El margen está por debajo del mínimo. Se requiere autorización de un supervisor.')
      return
    }
    if (bloqueadoPorMargen && puedeOverride) {
      setOverridePedido(accion)
      return
    }
    if (accion === 'save') saveMut.mutate(false)
    else enviarMut.mutate(false)
  }

  function confirmarOverride() {
    if (overridePedido === 'save') saveMut.mutate(true)
    else if (overridePedido === 'enviar') enviarMut.mutate(true)
  }

  function updateItem(i: number, patch: Partial<CRMCotizacionItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }

  function aplicarProducto(i: number, psId: number) {
    const p = catalogo.find(x => x.id === psId)
    if (!p) return
    updateItem(i, {
      descripcion: p.nombre,
      precioUnit: p.precio ?? 0,
      costoUnit: p.costo ?? null,
      ivaTasa: p.ivaTasa ?? tasaIva,
      claveProdServ: p.claveProdServ ?? null,
      claveUnidad: p.claveUnidad ?? null,
      psId: p.id,
    })
    setCatalogoPara(null)
  }

  function addItem(esSeccion = false) {
    setItems(prev => [...prev, { esSeccion, descripcion: '', cantidad: 1, precioUnit: 0, descuento: 0 }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const estatusActual = cot?.estatus ?? 'borrador'
  const busy = saveMut.isPending || enviarMut.isPending
  const sem = SEMAFORO_UI[t.semaforo]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">{cot ? `Editar ${cot.folio}` : 'Nueva cotización'}</h2>
            <div className="flex items-center gap-1.5 mt-1.5">
              {ESTATUS_STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <div className="h-px w-6 bg-white/30" />}
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold capitalize', estatusActual === s ? 'bg-card text-[#1B4FD8]' : 'bg-white/20 text-white/70')}>{s}</span>
                </div>
              ))}
              {estatusActual === 'rechazada' && <span className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold bg-red-200 text-red-700">Rechazada</span>}
              {estatusActual === 'facturada' && <span className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold bg-violet-200 text-violet-800">Facturada</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Título</label>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Propuesta de servicios" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Válida hasta</label>
              <input type="date" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={fechaVto ?? ''} onChange={e => setFechaVto(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notas</label>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Condiciones, notas adicionales..." />
            </div>
          </div>

          {/* Tabla de ítems */}
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  <th className="pb-2 w-6"></th>
                  <th className="pb-2 text-left font-medium">Descripción</th>
                  <th className="pb-2 text-right font-medium w-16">Cant.</th>
                  <th className="pb-2 text-right font-medium w-24">Precio unit.</th>
                  <th className="pb-2 text-right font-medium w-24">Costo unit.</th>
                  <th className="pb-2 text-right font-medium w-16">Dto. %</th>
                  <th className="pb-2 text-right font-medium w-28">Subtotal</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const mg = margenLinea(it)
                  return (
                    <tr key={i} draggable
                      onDragStart={() => { dragIdx.current = i }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIdx.current === null || dragIdx.current === i) return
                        const arr = [...items]
                        const [moved] = arr.splice(dragIdx.current, 1)
                        arr.splice(i, 0, moved)
                        setItems(arr)
                        dragIdx.current = null
                      }}
                      className={clsx('border-b border-gray-100', it.esSeccion ? 'bg-gray-50' : '')}>
                      <td className="py-1.5 pr-1 text-gray-300 cursor-grab"><GripVertical className="h-4 w-4" /></td>
                      <td className="relative py-1.5 pr-2">
                        <div className="flex items-center gap-1">
                          <input className={clsx('w-full bg-transparent border-0 outline-none text-sm', it.esSeccion ? 'font-bold text-gray-800' : 'text-gray-700')}
                            value={it.descripcion} onChange={e => updateItem(i, { descripcion: e.target.value })}
                            placeholder={it.esSeccion ? 'Nombre de sección' : 'Descripción del ítem'} />
                          {!it.esSeccion && (
                            <button type="button" title="Elegir del catálogo"
                              onClick={() => setCatalogoPara(catalogoPara === i ? null : i)}
                              className="flex-shrink-0 text-gray-300 hover:text-blue-600">
                              <PackageSearch className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {catalogoPara === i && (
                          <div className="absolute z-40 mt-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-card p-1 shadow-lg">
                            {catalogo.filter(p => p.activo).length === 0 && (
                              <p className="px-3 py-2 text-xs text-gray-400">Sin productos en el catálogo</p>
                            )}
                            {catalogo.filter(p => p.activo).map(p => (
                              <button key={p.id} type="button" onClick={() => aplicarProducto(i, p.id)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-blue-50">
                                <span className="truncate text-gray-700">{p.nombre}</span>
                                <span className="flex-shrink-0 font-semibold text-gray-500">{fmtMXN(p.precio)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      {it.esSeccion ? (
                        <td colSpan={5} />
                      ) : (
                        <>
                          <td className="py-1.5 pr-2"><input type="number" min="0" step="0.001" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.cantidad} onChange={e => updateItem(i, { cantidad: Number(e.target.value) })} /></td>
                          <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.precioUnit} onChange={e => updateItem(i, { precioUnit: Number(e.target.value) })} /></td>
                          <td className="py-1.5 pr-2">
                            <input type="number" min="0" step="0.01" placeholder="—"
                              className="w-full bg-transparent border-0 outline-none text-sm text-right text-gray-500"
                              value={it.costoUnit ?? ''}
                              onChange={e => updateItem(i, { costoUnit: e.target.value === '' ? null : Number(e.target.value) })} />
                          </td>
                          <td className="py-1.5 pr-2"><input type="number" min="0" max="100" step="0.01" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.descuento} onChange={e => updateItem(i, { descuento: Number(e.target.value) })} /></td>
                          <td className="py-1.5 pr-2 text-right">
                            <span className="text-sm font-medium text-gray-700">{fmtMXN(lineaBase(it))}</span>
                            {mg != null && (
                              <span className={clsx(
                                'ml-2 inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-bold',
                                mg > umbral.verdeMin ? 'bg-emerald-100 text-emerald-700'
                                  : mg >= umbral.amarilloMin ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700',
                              )}>{mg.toFixed(0)}%</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-1.5"><button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3">
              <button onClick={() => addItem(false)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar línea</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => addItem(true)} className="text-xs text-gray-500 hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar sección</button>
            </div>
          </div>

          {/* Resumen: rentabilidad + totales */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', sem.chip)}>
                <span className={clsx('h-2 w-2 rounded-full', sem.dot)} />
                {sem.label}
              </span>
              {t.margenPct != null && (
                <>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">Costo {fmtMXN(t.costoTotal)}</span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">Utilidad {fmtMXN(t.utilidad || 0)}</span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Margen {t.margenPct.toFixed(1)}%</span>
                </>
              )}
            </div>
            <div className="min-w-[220px] space-y-1">
              <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{fmtMXN(t.subtotal)}</span></div>
              <div className="flex justify-between text-xs text-gray-500"><span>IVA</span><span>{fmtMXN(t.iva)}</span></div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mt-1 flex justify-between items-center gap-8">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-lg font-bold text-emerald-700">{fmtMXN(t.total)}</span>
              </div>
            </div>
          </div>

          {bloqueadoPorMargen && (
            <div className={clsx(
              'flex items-start gap-2 rounded-xl border px-3 py-2 text-xs',
              puedeOverride ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800',
            )}>
              <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                El margen ({t.margenPct?.toFixed(1)}%) está por debajo del mínimo ({umbral.rojoMax}%).{' '}
                {puedeOverride
                  ? 'Al guardar se te pedirá autorizar la excepción.'
                  : 'Un supervisor con permiso debe autorizarla antes de guardar.'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0 bg-gray-50">
          <button onClick={() => setShowPdf(true)} disabled={!cot?.id && !savedCotId} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 disabled:opacity-40">
            <FileText className="h-4 w-4" /> Vista previa PDF
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={() => intentar('enviar')} disabled={!titulo || busy || (bloqueadoPorMargen && !puedeOverride)} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50">
              {enviarMut.isPending ? 'Enviando...' : 'Enviar por email'}
            </button>
            <button onClick={() => intentar('save')} disabled={!titulo || busy || (bloqueadoPorMargen && !puedeOverride)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saveMut.isPending ? 'Guardando...' : 'Guardar borrador'}
            </button>
          </div>
        </div>
      </div>

      {overridePedido && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOverridePedido(null)} />
          <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 text-amber-700 mb-2">
              <ShieldAlert className="h-5 w-5" />
              <h3 className="font-bold text-sm">Autorizar margen bajo</h3>
            </div>
            <p className="text-sm text-gray-600">
              El margen de esta cotización es <b>{t.margenPct?.toFixed(1)}%</b>, por debajo del mínimo
              de {umbral.rojoMax}%. ¿Deseas autorizar la excepción y {overridePedido === 'save' ? 'guardar' : 'enviar'} de todos modos?
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOverridePedido(null)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmarOverride} disabled={busy} className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? 'Guardando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPdf && (savedCotId || cot?.id) && (
        <CRMCotizacionPdfInline cotId={(savedCotId ?? cot?.id)!} onClose={() => setShowPdf(false)} />
      )}
    </div>
  )
}

function CRMCotizacionPdfInline({ cotId, onClose }: { cotId: number; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/crm/cotizaciones/${cotId}/pdf`)
      .then(r => r.text())
      .then(h => { setHtml(h); setLoading(false) })
      .catch(() => { setLoading(false) })
  }, [cotId])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <span className="font-semibold text-gray-800">Vista previa PDF</span>
          <div className="flex gap-2">
            <button onClick={() => iframeRef.current?.contentWindow?.print()} className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors">Imprimir</button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {loading && <div className="flex-1 flex items-center justify-center"><span className="text-gray-400">Cargando...</span></div>}
        {html && <iframe ref={iframeRef} srcDoc={html} className="flex-1 w-full" style={{ minHeight: '70vh' }} />}
      </div>
    </div>
  )
}
