import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Briefcase } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { CRM_ETAPAS, type CRMEtapa } from '@/types/crm.types'
import { useAuthStore } from '@/stores/auth.store'

// Cierra el ciclo atención → venta: desde un caso (o una evaluación de
// retención) se genera una oportunidad en el pipeline de CRM, precargando el
// contacto y el contexto, sin recapturar datos. Editar sigue en Oportunidades.

export function GenerarOportunidadModal({
  contactoId, contactoNombre, tituloSugerido, contextoNota, onClose,
}: {
  contactoId: number
  contactoNombre?: string | null
  tituloSugerido: string
  contextoNota?: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [nombre, setNombre] = useState(tituloSugerido)
  const [etapa, setEtapa] = useState<CRMEtapa>('prospecto')
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState(contextoNota ?? '')

  const crear = useMutation({
    mutationFn: () => crmService.createOportunidad({
      nombre: nombre.trim(),
      contactoId,
      etapa,
      valor: valor ? Number(valor) : undefined,
      notas: notas.trim() || undefined,
      creadoPor: user?.id,
      usuarioNombre: user?.nombres,
    }),
    onSuccess: (res: unknown) => {
      const id = (res as { data?: { id?: number } })?.data?.id
      toast.success('Oportunidad creada en el pipeline')
      onClose()
      toast(
        (t) => (
          <span className="flex items-center gap-2 text-sm">
            Oportunidad lista.
            <button
              onClick={() => { toast.dismiss(t.id); navigate('/crm-interno') }}
              className="font-bold text-brand hover:underline"
            >
              Abrir en Oportunidades
            </button>
          </span>
        ),
        { duration: 6000, icon: '💼' },
      )
      void id
    },
    onError: (err: unknown) =>
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo crear la oportunidad'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Generar oportunidad de venta" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5">
          <Briefcase className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-[0.78rem] text-blue-700">
            Se creará una oportunidad en el pipeline de CRM
            {contactoNombre ? <> para <span className="font-semibold">{contactoNombre}</span></> : null}.
            El seguimiento comercial continúa en el módulo de Oportunidades.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Nombre de la oportunidad *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Etapa</label>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value as CRMEtapa)} className="field">
              {CRM_ETAPAS.filter((e) => e.key !== 'ganado' && e.key !== 'perdido').map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Valor estimado</label>
            <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="field" placeholder="Opcional" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className="field resize-none" placeholder="Contexto para el equipo comercial" />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!nombre.trim()} onClick={() => crear.mutate()}>
            <Briefcase className="h-3.5 w-3.5" /> Crear oportunidad
          </Button>
        </div>
      </div>
    </Modal>
  )
}
