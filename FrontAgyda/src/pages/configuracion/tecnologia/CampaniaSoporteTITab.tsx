import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { livechatService } from '@/services/livechat.service'
import { Spinner } from '@/components/ui/Spinner'
import { GruposPanel } from '@/pages/livechat/GruposPanel'

const WIDGET_BASE_URL = `${window.location.origin.replace(/:\d+$/, ':8080')}`

export function CampaniaSoporteTITab() {
  const qc = useQueryClient()
  const { data: campanias = [], isLoading } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
  })

  const campania = campanias.find((c) => c.nombre.toLowerCase().includes('soporte ti'))

  const toggleActivo = useMutation({
    mutationFn: async () => { if (campania) await livechatService.updateCampania(campania.id, { activo: !campania.activo }) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-campanias'] })
      toast.success(campania?.activo ? 'Campaña desactivada' : 'Campaña activada')
    },
    onError: () => toast.error('No se pudo actualizar la campaña'),
  })

  const copiarLink = () => {
    if (!campania) return
    const link = `${WIDGET_BASE_URL}/?campaignToken=${campania.token}`
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Link del widget copiado'))
      .catch(() => toast.error('No se pudo copiar el link'))
  }

  if (isLoading) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  if (!campania) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <p className="text-sm text-ink-tertiary">
          La campaña "Soporte TI" todavía no existe — se crea automáticamente la primera vez que un
          empleado inicia un chat interno de soporte desde el widget flotante.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-brand" />
            <p className="text-sm font-semibold text-ink">{campania.nombre}</p>
            <span className={
              campania.activo
                ? 'rounded-full bg-green-100 px-2 py-0.5 text-[0.68rem] font-medium text-green-700'
                : 'rounded-full bg-gray-100 px-2 py-0.5 text-[0.68rem] font-medium text-gray-500'
            }>
              {campania.activo ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copiarLink} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              <Copy className="h-3 w-3" /> Copiar link del widget
            </button>
            <button
              onClick={() => toggleActivo.mutate()}
              disabled={toggleActivo.isPending}
              className="text-xs font-semibold text-ink-tertiary hover:underline"
            >
              {campania.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-ink-tertiary">
          Ruteo interno para empleados que abren el widget de "Soporte TI" desde la intranet. Cada chat
          se vincula automáticamente a un ticket. Los grupos y agentes se administran igual que cualquier
          campaña de Chat en Vivo.
        </p>

        <GruposPanel campaniaId={campania.id} />
      </div>
    </div>
  )
}
