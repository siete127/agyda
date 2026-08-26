import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Trash2, Ban, CheckCircle2, Download } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import type { CRMRecordatorioPago } from '@/types/crm.types'

// Paleta literal del flujo (punto 5): 🟢Pagado · 🟡Próximo a vencer · 🟠Vence
// hoy · 🔴Vencido · 🔵Pago parcial — más 'cancelado' como estado adicional.
const ESTATUS_VISUAL_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  pagado:         { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Pagado' },
  proximo_vencer: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Próximo a vencer' },
  vence_hoy:      { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500',  label: 'Vence hoy' },
  vencido:        { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500',     label: 'Vencido' },
  parcial:        { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Pago parcial' },
  cancelado:      { bg: 'bg-gray-100',   text: 'text-gray-500',    dot: 'bg-gray-400',    label: 'Cancelado' },
}

const METODOS_PAGO = [
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'otro', label: 'Otro' },
]

function NuevoRecordatorioModal({ contactoId, onClose, onSaved }: { contactoId: number; onClose: () => void; onSaved: () => void }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [notas, setNotas] = useState('')

  const save = useMutation({
    mutationFn: () => crmService.createRecordatorio({
      contactoId, concepto: concepto.trim(), monto: parseFloat(monto), fechaLimite, notas: notas || undefined,
    }),
    onSuccess: () => { toast.success('Recordatorio creado'); onSaved() },
    onError: () => toast.error('Error al crear'),
  })

  const valido = concepto.trim() && parseFloat(monto) > 0 && fechaLimite

  return (
    <Modal isOpen title="Nuevo recordatorio de pago" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Concepto *</label>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className="field" placeholder="Ej: Mensualidad de servicio" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto *</label>
            <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className="field" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha límite *</label>
            <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="field resize-none" placeholder="Opcional" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={save.isPending} disabled={!valido} onClick={() => save.mutate()}>Crear recordatorio</Button>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmarPagoModal({ contactoId, recordatorio, onClose }: { contactoId: number; recordatorio: CRMRecordatorioPago; onClose: () => void }) {
  const qc = useQueryClient()
  const [metodoPago, setMetodoPago] = useState('transferencia')
  const [montoPagado, setMontoPagado] = useState(String(recordatorio.monto))
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const esParcial = Number(montoPagado) > 0 && Number(montoPagado) < recordatorio.monto

  const confirmar = useMutation({
    mutationFn: async () => {
      let comprobanteDocId: number | undefined
      if (comprobante) {
        setSubiendo(true)
        const res = await crmService.uploadDocumentoCliente(contactoId, comprobante, { categoria: 'comprobante_pago' })
        comprobanteDocId = res?.data?.id
        setSubiendo(false)
      }
      return crmService.confirmarPagoRecordatorio(recordatorio.id, { metodoPago, comprobanteDocId, montoPagado: Number(montoPagado) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-pagos', contactoId] })
      qc.invalidateQueries({ queryKey: ['clientes-documentos', contactoId] })
      toast.success('Pago confirmado')
      onClose()
    },
    onError: () => { setSubiendo(false); toast.error('No se pudo confirmar el pago') },
  })

  return (
    <Modal isOpen onClose={onClose} title="Confirmar pago" size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Concepto</p>
          <p className="mt-0.5 text-sm text-gray-800">{recordatorio.concepto} — ${recordatorio.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Monto pagado</label>
          <input type="number" min="0" step="0.01" value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} className="field" />
          {esParcial && <p className="mt-1 text-[0.72rem] font-medium text-blue-600">Quedará marcado como pago parcial</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Método de pago</label>
          <div className="grid grid-cols-3 gap-1.5">
            {METODOS_PAGO.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetodoPago(m.key)}
                className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all', metodoPago === m.key ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300')}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Comprobante (opcional)</label>
          <input type="file" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} className="field" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={confirmar.isPending || subiendo} onClick={() => confirmar.mutate()}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar pago
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function PagosTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const puedeGestionar = can('atencion-cliente', 'clientes-pagos')
  const [showNuevo, setShowNuevo] = useState(false)
  const [confirmando, setConfirmando] = useState<CRMRecordatorioPago | null>(null)

  const { data: recordatorios = [], isLoading } = useQuery({
    queryKey: ['cliente-pagos', contactoId],
    queryFn: () => crmService.getRecordatorios(contactoId),
    staleTime: 15_000,
  })

  const cancelar = useMutation({
    mutationFn: (id: number) => crmService.cancelarRecordatorio(id),
    onSuccess: () => { toast.success('Recordatorio cancelado'); qc.invalidateQueries({ queryKey: ['cliente-pagos', contactoId] }) },
    onError: () => toast.error('Error al cancelar'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => crmService.deleteRecordatorio(id),
    onSuccess: () => { toast.success('Recordatorio eliminado'); qc.invalidateQueries({ queryKey: ['cliente-pagos', contactoId] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Recordatorios de pago</p>
        {puedeGestionar && (
          <button onClick={() => setShowNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : recordatorios.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin recordatorios registrados</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {recordatorios.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{r.concepto}</p>
                <p className="text-[0.7rem] text-gray-400">
                  ${r.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · vence {r.fechaLimite}
                  {r.metodoPago && ` · ${r.metodoPago}`}
                  {r.estatus === 'parcial' && r.montoPagado != null && ` · pagado $${r.montoPagado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold', ESTATUS_VISUAL_STYLE[r.estatusVisual]?.bg, ESTATUS_VISUAL_STYLE[r.estatusVisual]?.text)}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', ESTATUS_VISUAL_STYLE[r.estatusVisual]?.dot)} />
                  {ESTATUS_VISUAL_STYLE[r.estatusVisual]?.label ?? r.estatusVisual}
                </span>
                {r.comprobanteDocId && (
                  <button onClick={() => crmService.downloadDocumentoCliente(r.comprobanteDocId!, `comprobante_${r.id}`)} title="Descargar comprobante" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                {puedeGestionar && (r.estatus === 'pendiente' || r.estatus === 'enviado' || r.estatus === 'parcial') && (
                  <>
                    <button onClick={() => setConfirmando(r)} title="Confirmar pago" className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => cancelar.mutate(r.id)} title="Cancelar" className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { if (window.confirm('¿Eliminar este recordatorio?')) eliminar.mutate(r.id) }}
                      title="Eliminar"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNuevo && (
        <NuevoRecordatorioModal
          contactoId={contactoId}
          onClose={() => setShowNuevo(false)}
          onSaved={() => { setShowNuevo(false); qc.invalidateQueries({ queryKey: ['cliente-pagos', contactoId] }) }}
        />
      )}
      {confirmando && <ConfirmarPagoModal contactoId={contactoId} recordatorio={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  )
}
