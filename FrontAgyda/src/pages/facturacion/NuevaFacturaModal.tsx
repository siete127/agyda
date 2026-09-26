import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Package, FileSignature, Search, Plus, Trash2, ArrowLeft, Receipt, CheckCircle2, PenLine } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { facturacionService, type CotizacionPorFacturar, type ReceptorFiscal } from '@/services/facturacion.service'
import { productoServicioService } from '@/services/productoServicio.service'
import { satService } from '@/services/sat.service'
import { formatMonto } from './estatusFactura'

type Modo = 'productos' | 'cotizacion'

interface Linea {
  key: number
  psId: number | null
  descripcion: string
  cantidad: number
  precioUnit: number
  ivaTasa: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const RECEPTOR_VACIO: ReceptorFiscal = { rfc: '', nombre: '', regimenFiscal: '', cp: '', usoCfdi: 'G03' }

/* Facturar desde Finanzas: productos/servicios sueltos del catálogo o una
   cotización aprobada del CRM. Paso 1 qué se factura, paso 2 datos fiscales. */
export function NuevaFacturaModal({ onClose, cotizacionInicial = null }: {
  onClose: () => void
  cotizacionInicial?: CotizacionPorFacturar | null
}) {
  const qc = useQueryClient()
  const [modo, setModo] = useState<Modo>(cotizacionInicial ? 'cotizacion' : 'productos')
  const [paso, setPaso] = useState<1 | 2>(1)
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [buscarCliente, setBuscarCliente] = useState('')
  const [buscarProd, setBuscarProd] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [cot, setCot] = useState<CotizacionPorFacturar | null>(cotizacionInicial)
  const [rec, setRec] = useState<ReceptorFiscal>(RECEPTOR_VACIO)
  const [formaPago, setFormaPago] = useState('99')
  const [metodoPago, setMetodoPago] = useState('PUE')

  const { data: pendientes, isLoading: cargando } = useQuery({
    queryKey: ['facturas-por-facturar'],
    queryFn: () => facturacionService.porFacturar(),
  })
  const { data: catalogo = [] } = useQuery({
    queryKey: ['productos-servicios', 'activos'],
    queryFn: () => productoServicioService.getAll(),
  })
  const { data: regimenes = [] } = useQuery({ queryKey: ['sat', 'regimen'], queryFn: () => satService.regimenFiscal(), staleTime: Infinity })
  const { data: usos = [] } = useQuery({ queryKey: ['sat', 'uso'], queryFn: () => satService.usoCfdi(), staleTime: Infinity })
  const { data: formas = [] } = useQuery({ queryKey: ['sat', 'forma'], queryFn: () => satService.formaPago(), staleTime: Infinity })

  const clientes = useMemo(() => pendientes?.clientes ?? [], [pendientes])
  const cotizaciones = pendientes?.cotizaciones ?? []
  const cliente = clientes.find((c) => c.id === clienteId) ?? null

  const clientesFiltrados = useMemo(() => {
    const t = buscarCliente.trim().toLowerCase()
    return (t ? clientes.filter((c) => `${c.nombre} ${c.contacto ?? ''} ${c.rfc ?? ''}`.toLowerCase().includes(t)) : clientes).slice(0, 40)
  }, [clientes, buscarCliente])

  const productosFiltrados = useMemo(() => {
    const t = buscarProd.trim().toLowerCase()
    const activos = catalogo.filter((p) => p.activo)
    return (t ? activos.filter((p) => `${p.nombre} ${p.descripcion ?? ''}`.toLowerCase().includes(t)) : activos).slice(0, 30)
  }, [catalogo, buscarProd])

  const subtotal = round2(lineas.reduce((s, l) => s + l.cantidad * l.precioUnit, 0))
  const iva = round2(lineas.reduce((s, l) => s + round2(l.cantidad * l.precioUnit * l.ivaTasa), 0))
  const total = round2(subtotal + iva)

  const agregarProducto = (id: number) => {
    const p = catalogo.find((x) => x.id === id)
    if (!p) return
    setLineas((ls) => {
      const ya = ls.find((l) => l.psId === id)
      if (ya) return ls.map((l) => (l.psId === id ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [...ls, { key: Date.now(), psId: p.id, descripcion: p.nombre, cantidad: 1, precioUnit: Number(p.precio) || 0, ivaTasa: p.ivaTasa ?? 0.16 }]
    })
  }
  const agregarLibre = () => setLineas((ls) => [...ls, { key: Date.now(), psId: null, descripcion: '', cantidad: 1, precioUnit: 0, ivaTasa: 0.16 }])
  const cambiar = (key: number, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)))

  const clienteFactura = modo === 'cotizacion' ? cot?.clienteId ?? null : clienteId
  const paso1Listo = modo === 'productos'
    ? !!clienteId && lineas.length > 0 && lineas.every((l) => l.descripcion.trim() && l.cantidad > 0) && total > 0
    : !!cot

  // Al pasar a datos fiscales se precargan los guardados del cliente.
  const continuar = async () => {
    const base = { ...RECEPTOR_VACIO, nombre: modo === 'cotizacion' ? cot?.cliente ?? '' : cliente?.nombre ?? '' }
    if (clienteFactura) {
      try {
        const r = await facturacionService.receptorDe(clienteFactura)
        setRec({
          rfc: r.rfc ?? '', nombre: r.nombre ?? base.nombre, regimenFiscal: r.regimenFiscal ?? '',
          cp: r.cp ?? '', usoCfdi: r.usoCfdi || 'G03',
        })
      } catch { setRec(base) }
    } else setRec(base)
    setPaso(2)
  }

  const receptorValido = rec.rfc.length >= 12 && rec.nombre.trim() && rec.regimenFiscal && rec.cp.length === 5

  const facturar = useMutation({
    mutationFn: async () => {
      if (modo === 'cotizacion' && cot) {
        const r = await facturacionService.facturarCotizacion(cot.id, { receptor: rec, formaPago, metodoPago })
        return r?.data as { modo?: string; folio?: string | number; serie?: string } | undefined
      }
      const r = await facturacionService.facturarManual({
        clienteId: clienteId!, receptor: rec, formaPago, metodoPago,
        conceptos: lineas.map((l) => ({ psId: l.psId, descripcion: l.descripcion.trim(), cantidad: l.cantidad, precioUnit: l.precioUnit, ivaTasa: l.ivaTasa })),
      })
      return r?.data
    },
    onSuccess: (d) => {
      ;['facturas-todas', 'facturas-por-facturar', 'finanzas-dashboard', 'finanzas-cxc', 'cliente-finanzas', 'crm-facturas']
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      toast.success(d?.modo === 'timbrada'
        ? `Factura ${d?.serie ?? ''}${d?.folio ?? ''} timbrada`
        : `Pre-factura ${d?.serie ?? 'PRE'}${d?.folio ?? ''} generada · quedó en Cuentas por cobrar`)
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo facturar'),
  })

  const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-sm outline-none focus:border-brand'
  const label = 'mb-1 block text-[0.7rem] font-semibold text-gray-500'

  return (
    <Modal isOpen onClose={onClose} title="Nueva factura" size="xl">
      <div className="space-y-4">
        {/* Pasos */}
        <div className="flex items-center gap-2 text-[0.72rem] font-semibold">
          {['Qué se factura', 'Datos fiscales'].map((t, i) => (
            <div key={t} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-gray-200" />}
              <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem]',
                paso > i + 1 ? 'bg-emerald-500 text-white' : paso === i + 1 ? 'bg-brand text-white' : 'bg-gray-100 text-gray-400')}>
                {paso > i + 1 ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              <span className={paso === i + 1 ? 'text-gray-900' : 'text-gray-400'}>{t}</span>
            </div>
          ))}
        </div>

        {paso === 1 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {([
                { m: 'productos', icon: Package, t: 'Productos y servicios', d: 'Del catálogo o conceptos libres' },
                { m: 'cotizacion', icon: FileSignature, t: 'Cotización aprobada', d: `${cotizaciones.length} por facturar` },
              ] as const).map(({ m, icon: Icon, t, d }) => (
                <button key={m} type="button" onClick={() => setModo(m)}
                  className={clsx('flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                    modo === m ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-gray-200')}>
                  <div className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', modo === m ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500')}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.85rem] font-semibold text-gray-900">{t}</p>
                    <p className="text-[0.7rem] text-gray-400">{d}</p>
                  </div>
                </button>
              ))}
            </div>

            {modo === 'productos' ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                {/* Cliente + catálogo */}
                <div className="space-y-3">
                  <div>
                    <span className={label}>Cliente</span>
                    {cliente ? (
                      <div className="flex items-center justify-between rounded-xl border border-brand/30 bg-brand/5 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{cliente.nombre}</p>
                          <p className="text-[0.68rem] text-gray-400">{cliente.rfc || 'Sin RFC registrado'}</p>
                        </div>
                        <button type="button" onClick={() => setClienteId(null)} className="text-[0.7rem] font-semibold text-brand hover:underline">Cambiar</button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                          <Search className="h-3.5 w-3.5 text-gray-400" />
                          <input value={buscarCliente} onChange={(e) => setBuscarCliente(e.target.value)} placeholder="Buscar cliente o RFC…" className="w-full bg-transparent text-sm outline-none" />
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {cargando ? <p className="px-3 py-3 text-xs text-gray-400">Cargando…</p>
                            : clientesFiltrados.length === 0 ? <p className="px-3 py-3 text-xs text-gray-400">Sin clientes</p>
                              : clientesFiltrados.map((c) => (
                                <button key={c.id} type="button" onClick={() => setClienteId(c.id)} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">
                                  <p className="truncate text-[0.8rem] font-medium text-gray-800">{c.nombre}</p>
                                  {c.rfc && <p className="text-[0.65rem] text-gray-400">{c.rfc}</p>}
                                </button>
                              ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className={label}>Catálogo de productos y servicios</span>
                    <div className="rounded-xl border border-gray-200">
                      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                        <Search className="h-3.5 w-3.5 text-gray-400" />
                        <input value={buscarProd} onChange={(e) => setBuscarProd(e.target.value)} placeholder="Buscar en el catálogo…" className="w-full bg-transparent text-sm outline-none" />
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {productosFiltrados.map((p) => (
                          <button key={p.id} type="button" onClick={() => agregarProducto(p.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50">
                            <Package className={clsx('h-3.5 w-3.5 flex-shrink-0', p.tipo === 'SERVICIO' ? 'text-violet-500' : 'text-brand')} />
                            <span className="min-w-0 flex-1 truncate text-[0.8rem] text-gray-800">{p.nombre}</span>
                            <span className="text-[0.72rem] font-semibold tabular-nums text-gray-500">{formatMonto(p.precio)}</span>
                            <Plus className="h-3.5 w-3.5 text-gray-300" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conceptos */}
                <div className="flex flex-col rounded-2xl border border-gray-100 bg-gray-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[0.8rem] font-bold text-gray-800">Conceptos</p>
                    <button type="button" onClick={agregarLibre} className="flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:underline">
                      <PenLine className="h-3 w-3" /> Concepto libre
                    </button>
                  </div>
                  {lineas.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-gray-400">
                      <Receipt className="h-7 w-7 opacity-40" />
                      <p className="text-xs">Elige productos o servicios del catálogo</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lineas.map((l) => (
                        <div key={l.key} className="rounded-xl border border-gray-100 bg-card p-2.5">
                          <div className="flex items-center gap-2">
                            <input value={l.descripcion} onChange={(e) => cambiar(l.key, { descripcion: e.target.value })} placeholder="Descripción"
                              className="min-w-0 flex-1 bg-transparent text-[0.82rem] font-semibold text-gray-800 outline-none" />
                            <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} className="text-gray-300 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-1.5 grid grid-cols-[4rem_1fr_4.5rem_auto] items-center gap-2 text-[0.72rem]">
                            <input type="number" min={1} step="1" value={l.cantidad} onChange={(e) => cambiar(l.key, { cantidad: Math.max(0, Number(e.target.value)) })}
                              className="rounded-lg border border-gray-200 px-2 py-1 tabular-nums outline-none focus:border-brand" title="Cantidad" />
                            <input type="number" min={0} step="0.01" value={l.precioUnit} onChange={(e) => cambiar(l.key, { precioUnit: Math.max(0, Number(e.target.value)) })}
                              className="rounded-lg border border-gray-200 px-2 py-1 tabular-nums outline-none focus:border-brand" title="Precio unitario sin IVA" />
                            <select value={l.ivaTasa} onChange={(e) => cambiar(l.key, { ivaTasa: Number(e.target.value) })}
                              className="rounded-lg border border-gray-200 px-1 py-1 outline-none" title="IVA">
                              <option value={0.16}>IVA 16%</option>
                              <option value={0.08}>IVA 8%</option>
                              <option value={0}>IVA 0%</option>
                            </select>
                            <span className="text-right font-semibold tabular-nums text-gray-700">{formatMonto(l.cantidad * l.precioUnit)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 space-y-0.5 border-t border-gray-200 pt-2 text-[0.75rem]">
                    <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="tabular-nums">{formatMonto(subtotal)}</span></div>
                    <div className="flex justify-between text-gray-500"><span>IVA</span><span className="tabular-nums">{formatMonto(iva)}</span></div>
                    <div className="flex justify-between text-sm font-bold text-gray-900"><span>Total</span><span className="tabular-nums">{formatMonto(total)}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-h-[22rem] space-y-2 overflow-y-auto">
                {cargando ? <p className="py-6 text-center text-xs text-gray-400">Cargando…</p>
                  : cotizaciones.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-10 text-gray-400">
                      <FileSignature className="h-7 w-7 opacity-40" />
                      <p className="text-xs">No hay cotizaciones aprobadas pendientes de facturar</p>
                    </div>
                  ) : cotizaciones.map((c) => (
                    <button key={c.id} type="button" onClick={() => setCot(c)}
                      className={clsx('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                        cot?.id === c.id ? 'border-brand bg-brand/5' : 'border-gray-100 hover:border-gray-200')}>
                      <FileSignature className={clsx('h-4 w-4 flex-shrink-0', cot?.id === c.id ? 'text-brand' : 'text-gray-400')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.85rem] font-semibold text-gray-900">{c.folio || `#${c.id}`}{c.titulo ? ` · ${c.titulo}` : ''}</p>
                        <p className="text-[0.7rem] text-gray-400">{c.cliente ?? 'Sin cliente'} · {c.renglones} concepto{c.renglones !== 1 ? 's' : ''} · {new Date(c.fecha).toLocaleDateString('es-MX')}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-gray-900">{formatMonto(c.total)}</span>
                    </button>
                  ))}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button disabled={!paso1Listo} onClick={continuar}>Continuar</Button>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">{modo === 'cotizacion' ? 'Cotización' : 'Productos y servicios'}</p>
                <p className="truncate text-sm font-semibold text-gray-900">
                  {modo === 'cotizacion' ? `${cot?.folio || `#${cot?.id}`} · ${cot?.cliente ?? ''}` : `${cliente?.nombre} · ${lineas.length} concepto${lineas.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              <span className="text-lg font-black tabular-nums text-gray-900">{formatMonto(modo === 'cotizacion' ? cot?.total : total)}</span>
            </div>

            <p className="text-xs text-gray-500">Datos fiscales del receptor. Se guardan en la ficha del cliente para la próxima factura.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}>RFC</span>
                <input className={field} maxLength={13} value={rec.rfc} onChange={(e) => setRec({ ...rec, rfc: e.target.value.toUpperCase() })} />
              </label>
              <label className="block">
                <span className={label}>CP fiscal</span>
                <input className={field} maxLength={5} value={rec.cp} onChange={(e) => setRec({ ...rec, cp: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label className="col-span-2 block">
                <span className={label}>Razón social</span>
                <input className={field} value={rec.nombre} onChange={(e) => setRec({ ...rec, nombre: e.target.value })} />
              </label>
              <label className="col-span-2 block">
                <span className={label}>Régimen fiscal</span>
                <select className={field} value={rec.regimenFiscal} onChange={(e) => setRec({ ...rec, regimenFiscal: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {regimenes.map((r) => <option key={r.c} value={r.c}>{r.c} — {r.d}</option>)}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className={label}>Uso del CFDI</span>
                <select className={field} value={rec.usoCfdi} onChange={(e) => setRec({ ...rec, usoCfdi: e.target.value })}>
                  {usos.map((u) => <option key={u.c} value={u.c}>{u.c} — {u.d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={label}>Forma de pago</span>
                <select className={field} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                  {formas.map((f) => <option key={f.c} value={f.c}>{f.c} — {f.d}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={label}>Método de pago</span>
                <select className={field} value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="PUE">PUE — una exhibición</option>
                  <option value="PPD">PPD — parcialidades/diferido</option>
                </select>
              </label>
            </div>
            <p className="text-[0.7rem] text-gray-400">
              Si el timbrado no está configurado se genera como pre-factura (sin validez fiscal). En ambos casos queda en Cuentas por cobrar hasta que se registre el pago.
            </p>

            <div className="flex justify-between gap-2 border-t border-gray-100 pt-3">
              <Button variant="ghost" onClick={() => setPaso(1)}><ArrowLeft className="h-3.5 w-3.5" /> Atrás</Button>
              <Button isLoading={facturar.isPending} disabled={!receptorValido} onClick={() => facturar.mutate()}>
                <Receipt className="h-3.5 w-3.5" /> Generar factura
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
