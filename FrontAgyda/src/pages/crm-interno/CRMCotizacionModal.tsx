import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, GripVertical, Trash2, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { crmService } from '@/services/crm.service'
import type { CRMCotizacion, CRMCotizacionItem } from '@/types/crm.types'

interface Props {
  opoId: number
  cot?: CRMCotizacion | null
  onClose: () => void
  onSaved: () => void
}

const ESTATUS_STEPS = ['borrador', 'enviada', 'aprobada'] as const
const ESTATUS_COLORS: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  enviada: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
}

function calcSubtotal(item: CRMCotizacionItem) {
  if (item.esSeccion) return 0
  return (item.cantidad || 0) * (item.precioUnit || 0) * (1 - (item.descuento || 0) / 100)
}

function fmtMXN(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CRMCotizacionModal({ opoId, cot, onClose, onSaved }: Props) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState(cot?.titulo ?? '')
  const [fechaVto, setFechaVto] = useState(cot?.fechaVto ?? '')
  const [notas, setNotas] = useState(cot?.notas ?? '')
  const [items, setItems] = useState<CRMCotizacionItem[]>(
    cot?.items ?? [{ esSeccion: false, descripcion: '', cantidad: 1, precioUnit: 0, descuento: 0 }]
  )
  const [showPdf, setShowPdf] = useState(false)
  const [savedCotId, setSavedCotId] = useState<number | undefined>(cot?.id)
  const dragIdx = useRef<number | null>(null)

  const total = items.reduce((s, it) => s + calcSubtotal(it), 0)

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { opoId, titulo, fechaVto: fechaVto || undefined, notas: notas || undefined, items }
      if (cot?.id) return crmService.updateCotizacion(cot.id, payload)
      return crmService.createCotizacion(payload)
    },
    onSuccess: (data) => {
      if (!cot?.id && data?.data?.id) setSavedCotId(data.data.id)
      qc.invalidateQueries({ queryKey: ['crm-cotizaciones'] })
      toast.success('Cotización guardada')
      onSaved()
    },
    onError: () => toast.error('Error al guardar'),
  })

  const enviarMut = useMutation({
    mutationFn: async () => {
      const payload = { opoId, titulo, fechaVto: fechaVto || undefined, notas: notas || undefined, items }
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
      toast.success('Cotización enviada')
      onSaved()
    },
    onError: () => toast.error('Error al enviar'),
  })

  function updateItem(i: number, patch: Partial<CRMCotizacionItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }

  function addItem(esSeccion = false) {
    setItems(prev => [...prev, { esSeccion, descripcion: '', cantidad: 1, precioUnit: 0, descuento: 0 }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const estatusActual = cot?.estatus ?? 'borrador'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">{cot ? `Editar ${cot.folio}` : 'Nueva cotización'}</h2>
            {/* Stepper */}
            <div className="flex items-center gap-1.5 mt-1.5">
              {ESTATUS_STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <div className="h-px w-6 bg-white/30" />}
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold capitalize', estatusActual === s ? 'bg-card text-[#1B4FD8]' : 'bg-white/20 text-white/70')}>{s}</span>
                </div>
              ))}
              {estatusActual === 'rechazada' && <span className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold bg-red-200 text-red-700">Rechazada</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Campos básicos */}
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
                  <th className="pb-2 text-right font-medium w-20">Cant.</th>
                  <th className="pb-2 text-right font-medium w-28">Precio unit.</th>
                  <th className="pb-2 text-right font-medium w-20">Dto. %</th>
                  <th className="pb-2 text-right font-medium w-28">Subtotal</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
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
                    <td className="py-1.5 pr-2">
                      <input className={clsx('w-full bg-transparent border-0 outline-none text-sm', it.esSeccion ? 'font-bold text-gray-800' : 'text-gray-700')}
                        value={it.descripcion} onChange={e => updateItem(i, { descripcion: e.target.value })}
                        placeholder={it.esSeccion ? 'Nombre de sección' : 'Descripción del ítem'} />
                    </td>
                    {it.esSeccion ? (
                      <td colSpan={4} />
                    ) : (
                      <>
                        <td className="py-1.5 pr-2"><input type="number" min="0" step="0.001" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.cantidad} onChange={e => updateItem(i, { cantidad: Number(e.target.value) })} /></td>
                        <td className="py-1.5 pr-2"><input type="number" min="0" step="0.01" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.precioUnit} onChange={e => updateItem(i, { precioUnit: Number(e.target.value) })} /></td>
                        <td className="py-1.5 pr-2"><input type="number" min="0" max="100" step="0.01" className="w-full bg-transparent border-0 outline-none text-sm text-right" value={it.descuento} onChange={e => updateItem(i, { descuento: Number(e.target.value) })} /></td>
                        <td className="py-1.5 pr-2 text-right text-sm font-medium text-gray-700">{fmtMXN(calcSubtotal(it))}</td>
                      </>
                    )}
                    <td className="py-1.5"><button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3">
              <button onClick={() => addItem(false)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar línea</button>
              <span className="text-gray-300">·</span>
              <button onClick={() => addItem(true)} className="text-xs text-gray-500 hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar sección</button>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-3 min-w-[200px]">
              <div className="flex justify-between items-center gap-8">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-emerald-700">{fmtMXN(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0 bg-gray-50">
          <button onClick={() => setShowPdf(true)} disabled={!cot?.id && !savedCotId} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 disabled:opacity-40">
            <FileText className="h-4 w-4" /> Vista previa PDF
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={() => enviarMut.mutate()} disabled={!titulo || enviarMut.isPending || saveMut.isPending} className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50">
              {enviarMut.isPending ? 'Enviando...' : 'Enviar por email'}
            </button>
            <button onClick={() => saveMut.mutate()} disabled={!titulo || saveMut.isPending} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saveMut.isPending ? 'Guardando...' : 'Guardar borrador'}
            </button>
          </div>
        </div>
      </div>

      {/* PDF Modal inline */}
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
