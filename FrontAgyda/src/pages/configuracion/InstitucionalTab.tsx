import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Target, Eye, Heart, Check, Loader2, Plus, X, Info } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { personalizacionService, type Institucional } from '@/services/personalizacion.service'

const textareaCls =
  'w-full rounded-xl border border-gray-200 bg-card px-3.5 py-3 text-[0.88rem] leading-relaxed text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

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

export function InstitucionalTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<Institucional | null>(null)
  const [seededFrom, setSeededFrom] = useState<Institucional | null>(null)
  const [nuevoValor, setNuevoValor] = useState('')
  if (data && data.institucional !== seededFrom) {
    setSeededFrom(data.institucional)
    setForm(data.institucional)
  }

  const set = <K extends keyof Institucional>(k: K, v: Institucional[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  const agregarValor = () => {
    const v = nuevoValor.trim()
    if (!v || !form) return
    if (form.valores.some((x) => x.toLowerCase() === v.toLowerCase())) { setNuevoValor(''); return }
    set('valores', [...form.valores, v].slice(0, 20))
    setNuevoValor('')
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateInstitucional(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Identidad institucional actualizada')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Identidad institucional</h2>
            <p className="text-[0.82rem] text-gray-400">
              Misión, visión y valores de la empresa. Aparecen en la tarjeta del inicio y son propios de esta empresa.
            </p>
          </div>
        </div>
      </div>

      <CardSeccion icon={Target} titulo="Misión" subtitulo="El propósito de la empresa: qué hace y para quién.">
        <textarea
          rows={3}
          value={form.mision}
          onChange={(e) => set('mision', e.target.value)}
          placeholder="Describe la misión de la empresa…"
          className={textareaCls}
          maxLength={600}
        />
        <p className="mt-1 text-right text-[0.68rem] text-gray-400">{form.mision.length} / 600</p>
      </CardSeccion>

      <CardSeccion icon={Eye} titulo="Visión" subtitulo="Hacia dónde va la empresa: la aspiración a futuro.">
        <textarea
          rows={3}
          value={form.vision}
          onChange={(e) => set('vision', e.target.value)}
          placeholder="Describe la visión de la empresa…"
          className={textareaCls}
          maxLength={600}
        />
        <p className="mt-1 text-right text-[0.68rem] text-gray-400">{form.vision.length} / 600</p>
      </CardSeccion>

      <CardSeccion icon={Heart} titulo="Valores" subtitulo="Los principios que guían el comportamiento del equipo.">
        <div className="flex flex-wrap gap-2">
          {form.valores.map((v) => (
            <span key={v} className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 py-1 pl-3 pr-1.5 text-[0.78rem] font-semibold text-violet-700">
              {v}
              <button
                type="button"
                onClick={() => set('valores', form.valores.filter((x) => x !== v))}
                className="flex h-4 w-4 items-center justify-center rounded-full text-violet-400 transition-colors hover:bg-violet-200 hover:text-violet-700"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {form.valores.length === 0 && (
            <p className="text-[0.78rem] text-gray-400">Aún no hay valores definidos.</p>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={nuevoValor}
            onChange={(e) => setNuevoValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarValor() } }}
            placeholder="Agregar un valor…"
            maxLength={60}
            className="flex-1 rounded-xl border border-gray-200 bg-card px-3.5 py-2.5 text-[0.85rem] text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
          />
          <button
            type="button"
            onClick={agregarValor}
            disabled={!nuevoValor.trim() || form.valores.length >= 20}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white transition-all hover:bg-violet-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <p className="mt-2 text-[0.68rem] text-gray-400">Máximo 20 valores.</p>
      </CardSeccion>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          Estos textos se muestran al abrir Misión, Visión o Valores desde la tarjeta institucional del inicio.
        </p>
      </div>

      {/* Footer de acciones */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button
          type="button"
          onClick={() => data && setForm(data.institucional)}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
        >
          Descartar cambios
        </button>
        <button
          type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className={clsx(
            'flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white',
            'shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60',
          )}
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
