import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mensajeriaService } from '@/services/mensajeria.service'
import type { MensajeriaConfig } from '@/types/mensajeria.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

export function MensajeriaConfigTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['mensajeria-mi-config'],
    queryFn: () => mensajeriaService.getMiConfig(),
  })

  const [form, setForm] = useState<MensajeriaConfig | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const guardar = useMutation({
    mutationFn: (payload: Partial<MensajeriaConfig>) => mensajeriaService.actualizarMiConfig(payload),
    onSuccess: (config) => {
      qc.setQueryData(['mensajeria-mi-config'], config)
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  })

  const actualizar = (patch: Partial<MensajeriaConfig>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    guardar.mutate(patch)
  }

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  return (
    <div className="space-y-4">
      {/* Burbuja flotante */}
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <p className="text-sm font-semibold text-ink">Burbuja flotante de chat</p>
        <p className="mb-3 text-xs text-ink-tertiary">Aviso emergente cuando llega un mensaje nuevo y no estás viendo esa conversación.</p>

        <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface">
          <input
            type="checkbox"
            checked={form.burbujaActiva}
            onChange={(e) => actualizar({ burbujaActiva: e.target.checked })}
          />
          <span className="text-ink-secondary">Mostrar burbuja flotante al recibir mensajes</span>
        </label>

        <label className={clsx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', form.burbujaActiva ? 'hover:bg-surface' : 'opacity-40')}>
          <input
            type="checkbox"
            checked={form.burbujaAutoocultar}
            disabled={!form.burbujaActiva}
            onChange={(e) => actualizar({ burbujaAutoocultar: e.target.checked })}
          />
          <span className="text-ink-secondary">Ocultar automáticamente tras un tiempo de inactividad</span>
        </label>

        <div className={clsx('mt-2 px-2', (!form.burbujaActiva || !form.burbujaAutoocultar) && 'opacity-40')}>
          <label className="mb-1 block text-[0.7rem] font-semibold text-ink-tertiary uppercase tracking-wide">
            Ocultar después de {form.burbujaDuracionSeg} segundos sin actividad
          </label>
          <input
            type="range"
            min={3}
            max={120}
            step={1}
            value={form.burbujaDuracionSeg}
            disabled={!form.burbujaActiva || !form.burbujaAutoocultar}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, burbujaDuracionSeg: Number(e.target.value) } : prev))}
            onMouseUp={(e) => actualizar({ burbujaDuracionSeg: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => actualizar({ burbujaDuracionSeg: Number((e.target as HTMLInputElement).value) })}
            className="w-full"
          />
        </div>
      </div>

      {/* Adjuntos */}
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <p className="text-sm font-semibold text-ink">Archivos adjuntos</p>
        <p className="mb-3 text-xs text-ink-tertiary">Permite enviar fotos y archivos en tus conversaciones (máximo 15MB por archivo).</p>
        <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-surface">
          <input
            type="checkbox"
            checked={form.permitirAdjuntos}
            onChange={(e) => actualizar({ permitirAdjuntos: e.target.checked })}
          />
          <span className="text-ink-secondary">Permitir enviar fotos y archivos</span>
        </label>
      </div>
    </div>
  )
}
