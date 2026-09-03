import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Upload, Check, Loader2, Image as ImageIcon, Film, Info } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService,
  type Mascota, type MascotaMovimiento, type MascotaVelocidad,
} from '@/services/personalizacion.service'
import { MascotaTablero } from '@/components/ui/MascotaTablero'

const MOVIMIENTOS: { key: MascotaMovimiento; label: string; sub: string }[] = [
  { key: 'ninguno', label: 'Sin movimiento', sub: 'La imagen queda fija.' },
  { key: 'flotar', label: 'Flotar', sub: 'Sube y baja suavemente.' },
  { key: 'saludar', label: 'Saludar', sub: 'Se inclina como si saludara, cada tanto.' },
  { key: 'latir', label: 'Latir', sub: 'Crece y encoge apenas, como respirando.' },
  { key: 'balanceo', label: 'Balanceo', sub: 'Se mece de lado a lado.' },
]
const VELOCIDADES: { key: MascotaVelocidad; label: string }[] = [
  { key: 'lenta', label: 'Lenta' }, { key: 'normal', label: 'Normal' }, { key: 'rapida', label: 'Rápida' },
]

export function MascotaTab() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<Mascota | null>(null)
  const [sembrado, setSembrado] = useState(false)
  if (data && !sembrado) { setSembrado(true); setForm(data.mascota) }

  const set = <K extends keyof Mascota>(k: K, v: Mascota[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  const guardar = useMutation({
    mutationFn: async () => { if (form) await personalizacionService.updateMascota(form) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Mascota actualizada — se aplicó en el tablero')
    },
    onError: () => toast.error('No se pudo guardar la mascota'),
  })

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return
    setSubiendo(true)
    try {
      const { id, tipo } = await personalizacionService.subirMascotaMedia(file)
      setForm((f) => (f ? { ...f, mediaId: id, tipo } : { mediaId: id, tipo, movimiento: 'flotar', velocidad: 'normal' }))
      toast.success('Archivo subido — pulsa Guardar para aplicarlo')
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo subir')
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = () => setForm((f) => (f ? { ...f, mediaId: null, tipo: null } : f))

  if (isLoading || !form) return <p className="text-sm text-ink-tertiary">Cargando…</p>

  const esVideo = form.tipo === 'video'

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Mascota</h2>
            <p className="text-[0.82rem] text-gray-400">
              Imagen o video del tablero. Solo afecta a esta empresa — cada una tiene la suya.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {/* Archivo */}
          <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <ImageIcon className="h-4 w-4" />
              </div>
              <p className="text-[0.9rem] font-bold text-gray-800">Imagen o video</p>
            </div>
            <p className="mb-3 text-[0.75rem] text-gray-400">PNG, JPG, WEBP, GIF, MP4 o WEBM · máximo 25 MB</p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={subiendo}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-card px-4 py-2.5 text-[0.82rem] font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {form.mediaId ? 'Reemplazar' : 'Subir archivo'}
              </button>
              {form.mediaId && (
                <>
                  <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700">
                    {esVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    {esVideo ? 'Video' : 'Imagen'}
                  </span>
                  <button onClick={quitar} className="text-[0.72rem] font-semibold text-gray-400 hover:text-red-500">
                    Quitar (usar la del sistema)
                  </button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <p className="text-[0.72rem] text-gray-500">
                Si no subes nada, el tablero usa la mascota del sistema. El movimiento solo aplica a imágenes —
                un video ya trae su propia animación.
              </p>
            </div>
          </section>

          {/* Movimiento — solo relevante para imagen */}
          <section className={clsx('rounded-2xl border border-gray-100 bg-card p-5 shadow-card', esVideo && 'opacity-50')}>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[0.9rem] font-bold text-gray-800">Movimiento</p>
                <p className="text-[0.72rem] text-gray-400">Solo aplica a imágenes.</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {MOVIMIENTOS.map((m) => (
                <button
                  key={m.key}
                  disabled={esVideo}
                  onClick={() => set('movimiento', m.key)}
                  className={clsx('rounded-xl border p-3 text-left transition-colors',
                    form.movimiento === m.key ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:bg-gray-50')}
                >
                  <p className={clsx('text-[0.8rem] font-semibold', form.movimiento === m.key ? 'text-violet-700' : 'text-gray-700')}>{m.label}</p>
                  <p className="mt-0.5 text-[0.66rem] text-gray-400">{m.sub}</p>
                </button>
              ))}
            </div>

            <p className="mb-2 mt-4 text-[0.72rem] font-semibold uppercase tracking-wide text-gray-500">Velocidad</p>
            <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
              {VELOCIDADES.map((v) => (
                <button
                  key={v.key}
                  disabled={esVideo || form.movimiento === 'ninguno'}
                  onClick={() => set('velocidad', v.key)}
                  className={clsx('flex-1 rounded-lg py-2 text-[0.8rem] font-semibold transition-all',
                    form.velocidad === v.key ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Vista previa */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
            <p className="mb-1 text-[0.8rem] font-bold text-gray-800">Vista previa</p>
            <p className="mb-3 text-[0.68rem] text-gray-400">Igual a como se verá en el tablero.</p>
            <div className="relative overflow-hidden rounded-xl"
              style={{ height: 340, background: 'linear-gradient(160deg, #10203F 0%, #0B1730 100%)' }}>
              <MascotaTablero mascota={form} className="p-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button
          onClick={() => data && setForm(data.mascota)}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
        >
          Descartar cambios
        </button>
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
