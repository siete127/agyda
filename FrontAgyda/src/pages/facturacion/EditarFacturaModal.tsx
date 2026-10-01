import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Save, PenLine } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { facturacionService, type Factura } from '@/services/facturacion.service'
import { satService } from '@/services/sat.service'

// Solo pre-facturas: una factura ya timbrada ante el SAT es un documento
// fiscal cerrado (corregirla exige nota de crédito/sustitución, no editar
// el registro) — el backend también lo valida, esto es solo UX.
export function EditarFacturaModal({ factura, onClose }: { factura: Factura; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: regimenes = [] } = useQuery({ queryKey: ['sat', 'regimen'], queryFn: () => satService.regimenFiscal(), staleTime: Infinity })
  const { data: usos = [] } = useQuery({ queryKey: ['sat', 'uso'], queryFn: () => satService.usoCfdi(), staleTime: Infinity })
  const { data: formas = [] } = useQuery({ queryKey: ['sat', 'forma'], queryFn: () => satService.formaPago(), staleTime: Infinity })
  // Vacío fuera del tenant ARDABY TEC — mismo criterio que NuevaFacturaModal.
  const { data: emisores = [] } = useQuery({ queryKey: ['facturas-emisores'], queryFn: () => facturacionService.emisores(), staleTime: Infinity })
  // regimenFiscal/cp no viajan en Factura (solo rfc/nombre/usoCfdi) — se
  // precargan del cliente, igual que al crear la factura.
  const { data: recGuardado } = useQuery({
    queryKey: ['factura-receptor', factura.clienteId],
    queryFn: () => facturacionService.receptorDe(factura.clienteId!),
    enabled: !!factura.clienteId,
  })

  const [rfc, setRfc] = useState(factura.receptorRfc ?? '')
  const [nombre, setNombre] = useState(factura.receptorNombre ?? '')
  const [regimenFiscal, setRegimenFiscal] = useState('')
  const [cp, setCp] = useState('')
  const [usoCfdi, setUsoCfdi] = useState(factura.usoCfdi ?? 'G03')
  const [formaPago, setFormaPago] = useState(factura.formaPago ?? '99')
  const [metodoPago, setMetodoPago] = useState(factura.metodoPago ?? 'PUE')
  const [fecha, setFecha] = useState(() => factura.fecha.slice(0, 10))
  const [emisorRfc, setEmisorRfc] = useState(factura.emisorRfc ?? '')
  // regimenFiscal/cp llegan async (recGuardado) — se sincronizan una vez que
  // resuelven, sin pisar lo que el usuario ya haya escrito a mano.
  const [precargado, setPrecargado] = useState(false)
  useEffect(() => {
    if (precargado || !recGuardado) return
    setRegimenFiscal(recGuardado.regimenFiscal ?? '')
    setCp(recGuardado.cp ?? '')
    setPrecargado(true)
  }, [recGuardado, precargado])

  const guardar = useMutation({
    mutationFn: () => facturacionService.editar(factura.id, {
      receptor: { rfc, nombre, regimenFiscal, cp, usoCfdi }, formaPago, metodoPago, fecha, emisorRfc: emisorRfc || undefined,
    }),
    onSuccess: () => {
      ;['facturas-todas', 'facturas-por-facturar', 'finanzas-dashboard', 'finanzas-cxc', 'cliente-finanzas', 'crm-facturas']
        .forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
      toast.success('Pre-factura actualizada')
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? 'No se pudo editar'),
  })

  const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2 text-sm outline-none focus:border-brand'
  const label = 'mb-1 block text-[0.7rem] font-semibold text-gray-500'
  const valido = rfc.length >= 12 && nombre.trim() && cp.length === 5

  return (
    <Modal isOpen onClose={onClose} title={`Editar ${factura.serie ?? ''}${factura.folio ?? factura.id}`} size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Datos fiscales y fecha de esta pre-factura. Se guardan también en la ficha del cliente.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>RFC</span>
            <input className={field} maxLength={13} value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} />
          </label>
          <label className="block">
            <span className={label}>CP fiscal</span>
            <input className={field} maxLength={5} value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="col-span-2 block">
            <span className={label}>Razón social</span>
            <input className={field} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="col-span-2 block">
            <span className={label}>Régimen fiscal</span>
            <select className={field} value={regimenFiscal} onChange={(e) => setRegimenFiscal(e.target.value)}>
              <option value="">Selecciona…</option>
              {regimenes.map((r) => <option key={r.c} value={r.c}>{r.c} — {r.d}</option>)}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className={label}>Uso del CFDI</span>
            <select className={field} value={usoCfdi} onChange={(e) => setUsoCfdi(e.target.value)}>
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
          <label className="block">
            <span className={label}>Fecha de registro</span>
            <input type="date" className={field} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          {!!emisores.length && (
            <label className="col-span-2 block">
              <span className={label}>Facturar como</span>
              <select className={field} value={emisorRfc} onChange={(e) => setEmisorRfc(e.target.value)}>
                <option value="">Selecciona…</option>
                {emisores.map((e) => <option key={e.rfc} value={e.rfc}>{e.nombre} — {e.rfc}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!valido} onClick={() => guardar.mutate()}>
            <Save className="h-3.5 w-3.5" /> Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export const EditarFacturaIcon = PenLine
