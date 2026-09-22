import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, Check, Loader2, Info } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { personalizacionService, type EmailMarketingConfig } from '@/services/personalizacion.service'

const numCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3.5 py-2.5 text-[0.88rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

function CardSeccion({ icon: Icon, titulo, subtitulo, children }: {
  icon: React.ElementType; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
          <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

const DEFAULTS: EmailMarketingConfig = { emailsPorHoraDefault: 200 }

export function EmailMarketingConfigTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<EmailMarketingConfig | null>(null)
  const [seededFrom, setSeededFrom] = useState<EmailMarketingConfig | null>(null)
  const actual = data?.emailMarketing ?? DEFAULTS
  if (data && actual !== seededFrom) {
    setSeededFrom(actual)
    setForm({ ...actual })
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateEmailMarketing(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Configuración de email marketing actualizada')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Mail className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Email Marketing</h2>
            <p className="text-[0.82rem] text-gray-400">
              Throttle sugerido al crear una nueva campaña de correo.
            </p>
          </div>
        </div>
      </div>

      <CardSeccion icon={Mail} titulo="Envíos por hora (sugerido)" subtitulo="Valor con el que se precarga una campaña nueva — cada campaña puede ajustarlo individualmente.">
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={10000} step={10} className={clsx(numCls, 'max-w-[160px]')}
            value={form.emailsPorHoraDefault}
            onChange={(e) => setForm((f) => (f ? { ...f, emailsPorHoraDefault: Number(e.target.value) } : f))} />
          <span className="text-sm text-gray-400">emails / hora</span>
        </div>
        <p className="mt-2 text-[0.68rem] text-gray-400">
          Las credenciales SMTP y el remitente se configuran aparte, en Configuración → Notificaciones → Canal Email (son compartidas con el resto del sistema).
        </p>
      </CardSeccion>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          Esta configuración es propia de esta empresa y solo afecta el valor precargado al crear campañas nuevas de Email Marketing (CRM → Email Marketing).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button type="button"
          onClick={() => setForm({ ...actual })}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100">
          Descartar cambios
        </button>
        <button type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className={clsx(
            'flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white',
            'shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60',
          )}>
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
