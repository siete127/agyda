import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MousePointerClick, Headset, Check, Loader2, Link2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { personalizacionService, type HeaderButton } from '@/services/personalizacion.service'

type Key = HeaderButton['key']

const META: Record<Key, { icon: React.ElementType; nota: string }> = {
  contingencia: { icon: Headset, nota: 'Marcador de contingencia (por defecto abre Azul1)' },
  marcador: { icon: Headset, nota: 'Marcador principal (por defecto abre el servidor VICIdial)' },
}

const ORDEN: Key[] = ['contingencia', 'marcador']

export function BotonesHeaderTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<HeaderButton[] | null>(null)
  const [seededFrom, setSeededFrom] = useState<HeaderButton[] | null>(null)
  if (data && data.headerButtons !== seededFrom) {
    setSeededFrom(data.headerButtons)
    setForm(data.headerButtons)
  }

  const patch = (key: Key, p: Partial<HeaderButton>) =>
    setForm((f) => (f ? f.map((b) => (b.key === key ? { ...b, ...p } : b)) : f))

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateHeaderButtons(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Botones actualizados')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudieron guardar los botones')
    },
  })

  if (isLoading || !form) return <p className="text-sm text-ink-tertiary">Cargando…</p>

  const ordenados = ORDEN
    .map((k) => form.find((b) => b.key === k))
    .filter(Boolean) as HeaderButton[]

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <MousePointerClick className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Botones del encabezado</h2>
          <p className="text-[0.82rem] text-gray-400">
            Oculta cualquiera de estos botones, o cámbiales la URL para que abran otra cosa.
            Con la URL vacía conservan su función interna.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        <div className="divide-y divide-gray-50">
          {ordenados.map((b) => {
            const Icon = META[b.key].icon
            return (
              <div key={b.key} className={clsx('p-4 transition-colors', !b.visible && 'bg-gray-50/40')}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className={clsx(
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
                    b.visible ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-400',
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 select-none">
                    <span className={clsx(
                      'relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors',
                      b.visible ? 'bg-blue-600' : 'bg-gray-200',
                    )}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={b.visible}
                        onChange={(e) => patch(b.key, { visible: e.target.checked })}
                      />
                      <span className={clsx('inline-block h-4 w-4 rounded-full bg-card shadow transform transition-transform', b.visible ? 'translate-x-4' : 'translate-x-0')} />
                    </span>
                    <span className="text-[0.78rem] font-semibold text-gray-600">Visible</span>
                  </label>

                  <input
                    value={b.label}
                    onChange={(e) => patch(b.key, { label: e.target.value })}
                    placeholder="Nombre del botón"
                    className="min-w-[10rem] flex-1 rounded-lg border border-gray-200 bg-card px-3 py-2 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </div>

                <div className="relative mt-2.5">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                  <input
                    value={b.url}
                    onChange={(e) => patch(b.key, { url: e.target.value })}
                    placeholder="https://…  (vacío = función interna)"
                    className="w-full rounded-lg border border-gray-200 bg-card py-2 pl-9 pr-3 text-[0.8rem] font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                  />
                </div>
                <p className="mt-1 pl-1 text-[0.68rem] text-gray-400">{META[b.key].nota}</p>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-50 bg-gray-50/40 px-5 py-4">
          <button
            type="button"
            onClick={() => data && setForm(data.headerButtons)}
            className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
          >
            Descartar cambios
          </button>
          <button
            type="button"
            onClick={() => guardar.mutate()}
            disabled={guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
          >
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
