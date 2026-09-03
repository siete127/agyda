import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, CheckCircle2, Copy } from 'lucide-react'
import { configuracionService } from '@/services/configuracion.service'
import toast from 'react-hot-toast'

export function TelegramVinculoSection() {
  const qc = useQueryClient()
  const [codigo, setCodigo] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-estado'],
    queryFn: () => configuracionService.getEstadoTelegram(),
  })

  const generar = useMutation({
    mutationFn: () => configuracionService.generarCodigoTelegram(),
    onSuccess: (res) => setCodigo(res.codigo),
    onError: (e: any) => toast.error(e?.response?.data?.message || 'No se pudo generar el código'),
  })

  const desvincular = useMutation({
    mutationFn: () => configuracionService.desvincularTelegram(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['telegram-estado'] })
      setCodigo(null)
      toast.success('Telegram desvinculado')
    },
  })

  if (isLoading) return null
  if (!data?.telegramConfigurado) return null

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-secondary">Telegram</label>

      {data.vinculado ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-border bg-surface px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-sm text-ink">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Cuenta vinculada
          </span>
          <button
            type="button"
            onClick={() => desvincular.mutate()}
            disabled={desvincular.isPending}
            className="text-[0.7rem] font-semibold text-red-500 hover:underline"
          >
            Desvincular
          </button>
        </div>
      ) : codigo ? (
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface px-3.5 py-3">
          <p className="text-xs text-ink-secondary">
            Manda este código a <strong>@ArdabytecAgydaBot</strong> en Telegram (válido 15 minutos):
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-lg bg-card px-3 py-2 text-center text-lg font-bold tracking-[0.3em] text-brand">{codigo}</span>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(codigo); toast.success('Copiado') }}
              className="rounded-lg p-2 text-ink-tertiary hover:bg-card hover:text-ink"
              title="Copiar código"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <a
            href="https://t.me/ArdabytecAgydaBot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            <Send className="h-3.5 w-3.5" /> Abrir chat con el bot
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => generar.mutate()}
          disabled={generar.isPending}
          className="field flex w-full items-center justify-center gap-1.5 py-2 text-sm font-semibold text-brand hover:bg-surface"
        >
          <Send className="h-3.5 w-3.5" /> Vincular Telegram
        </button>
      )}
      <p className="text-[0.68rem] text-ink-tertiary">Recibe las mismas notificaciones que por correo, directo en Telegram.</p>
    </div>
  )
}
