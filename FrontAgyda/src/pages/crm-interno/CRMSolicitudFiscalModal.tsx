import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Receipt, Mail } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { crmService } from '@/services/crm.service'
import type { CRMOportunidad } from '@/types/crm.types'

export function CRMSolicitudFiscalModal({
  opo, correoSugerido, onClose, onSent,
}: {
  opo: CRMOportunidad
  correoSugerido: string | null
  onClose: () => void
  onSent: () => void
}) {
  const [correo, setCorreo] = useState(correoSugerido ?? '')

  const enviar = useMutation({
    mutationFn: () => crmService.solicitarDatosFiscales(opo.id, correo || undefined),
    onSuccess: (data) => {
      toast.success(data.message || 'Solicitud enviada')
      onSent()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e?.response?.data?.message || 'No se pudo enviar la solicitud')
    },
  })

  return (
    <Modal onClose={onClose}>
      <div className="w-full max-w-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
            <Receipt className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Solicitar datos fiscales</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Se enviará un enlace para que el cliente capture su RFC, razón social, régimen fiscal y uso de CFDI. Sin necesidad de iniciar sesión.
        </p>

        <label className="block text-[0.7rem] font-semibold text-gray-500 mb-1">Correo del cliente</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="correo@empresa.com"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-violet-400 focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={() => enviar.mutate()}
            disabled={!correo || enviar.isPending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {enviar.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
