import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2, Plus, Trash2, Check, Loader2, ExternalLink, PictureInPicture2,
  GripVertical, Info, ArrowUp, ArrowDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService,
  type EnlaceTopbar, type EnlaceTopbarModo,
} from '@/services/personalizacion.service'
import { ENLACE_ICONOS, ENLACE_ICONO_KEYS } from '@/lib/enlaceTopbarIconos'

const COLORES = ['#2F6FED', '#DC2626', '#059669', '#7C3AED', '#D97706', '#0891B2', '#DB2777', '#475569']

function nuevoEnlace(): EnlaceTopbar {
  return {
    id: `enlace-${Date.now()}`,
    label: '',
    url: '',
    icono: 'link',
    color: '#2F6FED',
    modo: 'pestana',
    visible: true,
  }
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-card px-3 py-2 text-[0.82rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'

export function EnlacesTopbarTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<EnlaceTopbar[] | null>(null)
  const [seededFrom, setSeededFrom] = useState<EnlaceTopbar[] | null>(null)
  if (data && data.enlacesTopbar !== seededFrom) {
    setSeededFrom(data.enlacesTopbar)
    setForm(data.enlacesTopbar)
  }

  const patch = (id: string, p: Partial<EnlaceTopbar>) =>
    setForm((f) => (f ? f.map((e) => (e.id === id ? { ...e, ...p } : e)) : f))
  const quitar = (id: string) => setForm((f) => (f ? f.filter((e) => e.id !== id) : f))
  const agregar = () => setForm((f) => [...(f ?? []), nuevoEnlace()])
  const mover = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      if (!f) return f
      const j = i + dir
      if (j < 0 || j >= f.length) return f
      const copy = [...f]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateEnlacesTopbar(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Enlaces actualizados')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudieron guardar los enlaces')
    },
  })

  if (isLoading || !form) return <p className="text-sm text-ink-tertiary">Cargando…</p>

  const hayInvalidos = form.some((e) => !e.url.trim() || !/^https?:\/\//i.test(e.url.trim()) || !e.label.trim())

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Link2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Enlaces del encabezado</h2>
          <p className="text-[0.82rem] text-gray-400">
            Botones extra en la barra superior, junto a Marcador y Contingencia. Cada uno abre su
            URL en una pestaña nueva o en un panel flotante que sigue visible al navegar.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-brand/[0.05] px-3.5 py-3 text-[0.8rem] text-brand">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          Algunos sitios (Google, bancos, etc.) bloquean ser mostrados dentro de un iframe
          (<span className="font-mono text-[0.72rem]">X-Frame-Options</span>). Para esos usa el modo
          "Pestaña nueva". El modo flotante funciona con paneles embebibles (Spotify, dashboards propios, VICIdial…).
        </p>
      </div>

      <div className="space-y-3">
        {form.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-[0.82rem] text-gray-400">
            Aún no hay enlaces. Agrega el primero.
          </div>
        )}

        {form.map((e, i) => {
          const Icon = ENLACE_ICONOS[e.icono] ?? ENLACE_ICONOS.link
          const urlMala = e.url.trim() !== '' && !/^https?:\/\//i.test(e.url.trim())
          return (
            <div key={e.id} className={clsx('rounded-2xl border border-gray-100 bg-card p-4 shadow-card', !e.visible && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-3">
                {/* Orden */}
                <div className="flex flex-col">
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <GripVertical className="h-3.5 w-3.5 text-gray-200" />
                  <button onClick={() => mover(i, 1)} disabled={i === form.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Preview del botón */}
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                  style={{ backgroundColor: e.color }}
                >
                  <Icon className="h-4 w-4" />
                </div>

                {/* Nombre */}
                <input
                  value={e.label}
                  onChange={(ev) => patch(e.id, { label: ev.target.value })}
                  placeholder="Nombre del botón"
                  className={clsx('min-w-[9rem] flex-1', inputCls)}
                />

                {/* Visible */}
                <label className="flex cursor-pointer items-center gap-2 select-none">
                  <span className={clsx('relative inline-flex h-5 w-9 rounded-full transition-colors', e.visible ? 'bg-blue-600' : 'bg-gray-200')}>
                    <input type="checkbox" className="sr-only" checked={e.visible} onChange={(ev) => patch(e.id, { visible: ev.target.checked })} />
                    <span className={clsx('mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', e.visible && 'translate-x-4')} />
                  </span>
                  <span className="text-[0.75rem] font-semibold text-gray-500">Visible</span>
                </label>

                <button onClick={() => quitar(e.id)} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* URL */}
              <div className="relative mt-2.5">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                <input
                  value={e.url}
                  onChange={(ev) => patch(e.id, { url: ev.target.value })}
                  placeholder="https://…"
                  className={clsx('w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-[0.8rem] font-mono outline-none focus:ring-2 focus:ring-brand/15',
                    urlMala ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-brand')}
                />
                {urlMala && <p className="mt-1 pl-1 text-[0.68rem] text-red-500">La URL debe empezar con http:// o https://</p>}
              </div>

              {/* Icono + color + modo */}
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Icono</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ENLACE_ICONO_KEYS.map((k) => {
                      const Ico = ENLACE_ICONOS[k]
                      return (
                        <button
                          key={k}
                          onClick={() => patch(e.id, { icono: k })}
                          className={clsx('flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                            e.icono === k ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-400 hover:bg-gray-50')}
                        >
                          <Ico className="h-3.5 w-3.5" />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Color</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {COLORES.map((c) => (
                      <button
                        key={c}
                        onClick={() => patch(e.id, { color: c })}
                        className={clsx('h-7 w-7 rounded-lg border-2 transition-transform hover:scale-110', e.color.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#2F6FED'}
                      onChange={(ev) => patch(e.id, { color: ev.target.value })}
                      className="h-7 w-9 cursor-pointer rounded-lg border border-gray-200 bg-card p-0.5"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Al hacer clic</p>
                  <div className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-1">
                    {([
                      { key: 'pestana' as EnlaceTopbarModo, label: 'Pestaña', Ico: ExternalLink },
                      { key: 'flotante' as EnlaceTopbarModo, label: 'Flotante', Ico: PictureInPicture2 },
                    ]).map((o) => (
                      <button
                        key={o.key}
                        onClick={() => patch(e.id, { modo: o.key })}
                        className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[0.75rem] font-semibold transition-all',
                          e.modo === o.key ? 'bg-brand text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                      >
                        <o.Ico className="h-3.5 w-3.5" /> {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <button
          onClick={agregar}
          disabled={form.length >= 12}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 py-3 text-[0.82rem] font-semibold text-gray-500 transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Agregar enlace
        </button>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button
          onClick={() => data && setForm(data.enlacesTopbar)}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
        >
          Descartar cambios
        </button>
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || hayInvalidos}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50"
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </button>
      </div>
    </div>
  )
}
