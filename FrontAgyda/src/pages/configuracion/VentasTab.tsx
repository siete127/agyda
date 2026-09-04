import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TrendingUp, Gauge, Percent, ShieldAlert, Check, Loader2, Info } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { personalizacionService, type VentasConfig } from '@/services/personalizacion.service'

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

const DEFAULTS: VentasConfig = {
  margen: { verdeMin: 25, amarilloMin: 15, rojoMax: 15, requiereOverride: true },
  iva: { tasaDefault: 0.16 },
}

export function VentasTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<VentasConfig | null>(null)
  const [seededFrom, setSeededFrom] = useState<VentasConfig | null>(null)
  const actual = data?.ventas ?? DEFAULTS
  if (data && actual !== seededFrom) {
    setSeededFrom(actual)
    setForm({ margen: { ...actual.margen }, iva: { ...actual.iva } })
  }

  const setMargen = <K extends keyof VentasConfig['margen']>(k: K, v: VentasConfig['margen'][K]) =>
    setForm((f) => (f ? { ...f, margen: { ...f.margen, [k]: v } } : f))

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateVentas(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Configuración comercial actualizada')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  const ivaPct = Math.round((form.iva.tasaDefault || 0) * 10000) / 100

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Comercial</h2>
            <p className="text-[0.82rem] text-gray-400">
              Reglas de rentabilidad para las cotizaciones del CRM: el semáforo de margen y el IVA por defecto.
            </p>
          </div>
        </div>
      </div>

      <CardSeccion icon={Gauge} titulo="Semáforo de margen" subtitulo="Umbrales sobre el margen global de la cotización (utilidad ÷ subtotal).">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Verde: margen mayor a
            </span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} step={1} className={numCls}
                value={form.margen.verdeMin}
                onChange={(e) => setMargen('verdeMin', Number(e.target.value))} />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold text-amber-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Amarillo: margen desde
            </span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} step={1} className={numCls}
                value={form.margen.amarilloMin}
                onChange={(e) => setMargen('amarilloMin', Number(e.target.value))} />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Rojo: margen menor a
            </span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} step={1} className={numCls}
                value={form.margen.rojoMax}
                onChange={(e) => setMargen('rojoMax', Number(e.target.value))} />
              <span className="text-sm text-gray-400">%</span>
            </div>
          </label>
        </div>
        <p className="mt-2 text-[0.68rem] text-gray-400">
          Se ordenan automáticamente: rojo ≤ amarillo ≤ verde. Si una cotización no tiene costos capturados, el semáforo queda en «Sin costo».
        </p>
      </CardSeccion>

      <CardSeccion icon={ShieldAlert} titulo="Bloqueo por margen bajo" subtitulo="Qué pasa cuando el margen de una cotización cae en rojo.">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600"
            checked={form.margen.requiereOverride}
            onChange={(e) => setMargen('requiereOverride', e.target.checked)} />
          <span className="text-[0.85rem] text-gray-700">
            Bloquear guardar y aprobar cotizaciones con margen en rojo, salvo que un usuario con el permiso
            <b> «Autorizar margen bajo» </b>(módulo CRM) lo autorice explícitamente.
          </span>
        </label>
      </CardSeccion>

      <CardSeccion icon={Percent} titulo="IVA por defecto" subtitulo="Tasa que se aplica a cada renglón nuevo de una cotización.">
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={100} step={0.5} className={clsx(numCls, 'max-w-[140px]')}
            value={ivaPct}
            onChange={(e) => setForm((f) => (f ? { ...f, iva: { tasaDefault: Number(e.target.value) / 100 } } : f))} />
          <span className="text-sm text-gray-400">%</span>
        </div>
        <p className="mt-2 text-[0.68rem] text-gray-400">Normalmente 16%. Cada renglón puede ajustarse individualmente en la cotización.</p>
      </CardSeccion>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          Esta configuración es propia de esta empresa. El semáforo y el bloqueo aplican en el editor de cotizaciones del CRM.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button type="button"
          onClick={() => setForm({ margen: { ...actual.margen }, iva: { ...actual.iva } })}
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
