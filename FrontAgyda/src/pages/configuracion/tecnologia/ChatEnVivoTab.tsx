import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { livechatService } from '@/services/livechat.service'
import type { LivechatConfig } from '@/types/livechat.types'

export function ChatEnVivoTab() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['livechat-config'],
    queryFn: () => livechatService.getConfig(),
    retry: false,
  })

  const [form, setForm] = useState<LivechatConfig | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const guardar = useMutation({
    mutationFn: () => form ? livechatService.updateConfig(form) : Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-config'] })
      toast.success('Configuración guardada')
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  })

  if (isError) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      || (error as Error)?.message
      || 'No se pudo cargar la configuración'
    return <p className="text-sm text-red-500">{msg}</p>
  }

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Chat en Vivo</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Horario inicio (Lun-Vie)</label>
            <input className="field mt-1 text-sm" value={form.horarioInicio ?? ''} onChange={(e) => setForm({ ...form, horarioInicio: e.target.value })} placeholder="09:00" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Horario fin (Lun-Vie)</label>
            <input className="field mt-1 text-sm" value={form.horarioFin ?? ''} onChange={(e) => setForm({ ...form, horarioFin: e.target.value })} placeholder="18:00" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Horario inicio (Sábado)</label>
            <input className="field mt-1 text-sm" value={form.sabadoHorarioInicio ?? ''} onChange={(e) => setForm({ ...form, sabadoHorarioInicio: e.target.value })} placeholder="09:00" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Horario fin (Sábado)</label>
            <input className="field mt-1 text-sm" value={form.sabadoHorarioFin ?? ''} onChange={(e) => setForm({ ...form, sabadoHorarioFin: e.target.value })} placeholder="13:00" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Días de la semana (CSV, 1=Lun)</label>
            <input className="field mt-1 text-sm" value={form.diasSemana ?? ''} onChange={(e) => setForm({ ...form, diasSemana: e.target.value })} placeholder="1,2,3,4,5" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Máx. chats por agente</label>
            <input type="number" min={1} className="field mt-1 text-sm" value={form.maxChatsPorAgente} onChange={(e) => setForm({ ...form, maxChatsPorAgente: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Minutos en espera antes de escalar (Soporte TI)</label>
            <input type="number" min={1} className="field mt-1 text-sm" value={form.timeoutColaMinutos} onChange={(e) => setForm({ ...form, timeoutColaMinutos: Number(e.target.value) })} />
            <p className="mt-1 text-[0.7rem] text-ink-tertiary">
              Si un chat interno de Soporte TI espera más de este tiempo sin técnico, su ticket vinculado sube a prioridad P1 y se notifica al técnico asignado.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Mensaje de bienvenida</label>
            <textarea className="field mt-1 text-sm" rows={2} value={form.mensajeBienvenida ?? ''} onChange={(e) => setForm({ ...form, mensajeBienvenida: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Mensaje fuera de horario</label>
            <textarea className="field mt-1 text-sm" rows={2} value={form.mensajeFueraHorario ?? ''} onChange={(e) => setForm({ ...form, mensajeFueraHorario: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Mensaje sin agentes disponibles</label>
            <textarea className="field mt-1 text-sm" rows={2} value={form.mensajeSinAgentes ?? ''} onChange={(e) => setForm({ ...form, mensajeSinAgentes: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Mensaje en cola de espera</label>
            <textarea className="field mt-1 text-sm" rows={2} value={form.mensajeEnCola ?? ''} onChange={(e) => setForm({ ...form, mensajeEnCola: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
