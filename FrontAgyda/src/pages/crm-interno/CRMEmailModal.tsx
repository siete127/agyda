import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Send, Mail, CheckCircle2, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { crmService } from '@/services/crm.service'
import { useCurrentUser } from '@/hooks/useAuth'
import type { CRMContacto } from '@/types/crm.types'

export function CRMEmailModal({ opoId, contacto, onClose }: {
  opoId: number
  contacto: CRMContacto | null
  onClose: () => void
}) {
  const user = useCurrentUser()
  const qc   = useQueryClient()
  const [para,   setPara]   = useState(contacto?.correo ?? '')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ['crm-emails', opoId],
    queryFn:  () => crmService.getEmailsByOpo(opoId),
    staleTime: 30_000,
  })

  const send = useMutation({
    mutationFn: () => crmService.sendEmail({
      opoId,
      contactoId: contacto?.id,
      para: para.trim(),
      asunto: asunto.trim(),
      cuerpo: cuerpo.trim(),
    }),
    onSuccess: () => {
      toast.success('Email enviado')
      setAsunto(''); setCuerpo('')
      qc.invalidateQueries({ queryKey: ['crm-emails', opoId] })
      qc.invalidateQueries({ queryKey: ['crm-interacciones', opoId] })
    },
    onError: () => toast.error('Error al enviar'),
  })

  return (
    <Modal isOpen title="Emails" onClose={onClose}>
      <div className="space-y-4">
        {/* Formulario de envío */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <p className="text-[0.78rem] font-bold text-gray-700 flex items-center gap-1.5"><Send className="h-3.5 w-3.5 text-brand" /> Nuevo email</p>
          <div>
            <label className="field-label">Para</label>
            <input value={para} onChange={(e) => setPara(e.target.value)} className="field-input" placeholder="correo@empresa.com" type="email" />
          </div>
          <div>
            <label className="field-label">Asunto</label>
            <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className="field-input" placeholder="Propuesta comercial..." />
          </div>
          <div>
            <label className="field-label">Mensaje</label>
            <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} className="field-input resize-none" rows={5} placeholder="Escribe el mensaje..." />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => send.mutate()}
              disabled={!para.trim() || !asunto.trim() || !cuerpo.trim() || send.isPending}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
            >
              {send.isPending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />} Enviar
            </button>
          </div>
        </div>

        {/* Historial */}
        <div>
          <p className="text-[0.78rem] font-bold text-gray-700 mb-2">Historial enviados</p>
          {isLoading ? <Spinner size="sm" /> : emails.length === 0 ? (
            <p className="text-[0.72rem] text-gray-400">Sin emails enviados</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {emails.map((e) => (
                <div key={e.id} className="flex gap-2.5 rounded-xl border border-gray-100 bg-white p-2.5">
                  <div className={clsx('mt-0.5 flex-shrink-0', e.ok ? 'text-emerald-500' : 'text-red-400')}>
                    {e.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.75rem] font-semibold text-gray-800 truncate">{e.asunto}</p>
                    <p className="text-[0.65rem] text-gray-400">
                      Para: {e.para} · {e.usuarioNombre && `${e.usuarioNombre} · `}
                      {new Date(e.fecha).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
