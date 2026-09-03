import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, UploadCloud, Check, Loader2, Image as ImageIcon, Film, Info,
  LayoutGrid, PictureInPicture2, Trash2, Home, MoveVertical, Hand, Heart, RefreshCw, Ban,
  Snail, Waves, Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService,
  type Mascota, type MascotaParte, type MascotaMovimiento, type MascotaVelocidad,
} from '@/services/personalizacion.service'
import { MascotaTablero } from '@/components/ui/MascotaTablero'

const MOVIMIENTOS: { key: MascotaMovimiento; label: string; sub: string; icon: typeof Home }[] = [
  { key: 'ninguno', label: 'Sin movimiento', sub: 'Queda fija.', icon: Ban },
  { key: 'flotar', label: 'Flotar', sub: 'Sube y baja suavemente.', icon: MoveVertical },
  { key: 'saludar', label: 'Saludar', sub: 'Se inclina como si saludara.', icon: Hand },
  { key: 'latir', label: 'Latir', sub: 'Crece y encoge, como respirando.', icon: Heart },
  { key: 'balanceo', label: 'Balanceo', sub: 'Se mece de lado a lado.', icon: RefreshCw },
]
const VELOCIDADES: { key: MascotaVelocidad; label: string; icon: typeof Snail }[] = [
  { key: 'lenta', label: 'Lenta', icon: Snail },
  { key: 'normal', label: 'Normal', icon: Waves },
  { key: 'rapida', label: 'Rápida', icon: Zap },
]

/* ── Sub-editor de una mascota (imagen/video + movimiento) ── */
function EditorMascota({
  parte, uso, onChange,
}: {
  parte: MascotaParte
  uso: 'inicio' | 'flotante'
  onChange: (p: MascotaParte) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const esVideo = parte.tipo === 'video'

  const elegir = async (file: File | undefined) => {
    if (!file) return
    setSubiendo(true)
    try {
      const { id, tipo } = await personalizacionService.subirMascotaMedia(file, uso)
      onChange({ ...parte, mediaId: id, tipo })
      toast.success('Archivo subido — pulsa Guardar para aplicarlo')
    } catch (e) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo subir')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div>
        <p className="mb-2 text-[0.75rem] text-gray-400">
          PNG, JPG, WEBP, GIF, MP4 o WEBM · máximo 25 MB
        </p>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); elegir(e.dataTransfer.files?.[0]) }}
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
            dragOver ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-400 hover:bg-gray-50/60',
          )}
        >
          {subiendo ? <Loader2 className="h-6 w-6 animate-spin text-violet-500" /> : <UploadCloud className="h-6 w-6 text-gray-400" />}
          <p className="text-[0.85rem] font-semibold text-gray-700">{parte.mediaId ? 'Reemplazar archivo' : 'Subir archivo'}</p>
          <p className="text-[0.72rem] text-gray-400">Arrastra o selecciona un archivo</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = '' }}
          />
        </div>
        {parte.mediaId && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700">
              {esVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
              {esVideo ? 'Video' : 'Imagen'} cargado
            </span>
            <button onClick={() => onChange({ ...parte, mediaId: null, tipo: null })} className="text-[0.72rem] font-semibold text-gray-400 hover:text-red-500">
              Quitar (usar la del sistema)
            </button>
          </div>
        )}
      </div>

      {/* Movimiento */}
      <div className={clsx(esVideo && 'opacity-60')}>
        <p className="mb-2 flex items-center gap-1.5 text-[0.72rem] font-semibold text-gray-500">
          <Sparkles className="h-3 w-3 text-violet-400" /> Movimiento
          <span className="font-normal text-gray-400">· solo imágenes</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MOVIMIENTOS.map((m) => {
            const activo = parte.movimiento === m.key
            return (
              <button
                key={m.key}
                disabled={esVideo}
                onClick={() => onChange({ ...parte, movimiento: m.key })}
                className={clsx('flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                  activo ? 'border-violet-500 bg-violet-50/70' : 'border-gray-200 hover:bg-gray-50')}
              >
                <m.icon className={clsx('mt-0.5 h-3.5 w-3.5 flex-shrink-0', activo ? 'text-violet-600' : 'text-gray-400')} />
                <span className="min-w-0">
                  <span className={clsx('block text-[0.78rem] font-semibold', activo ? 'text-violet-700' : 'text-gray-700')}>{m.label}</span>
                  <span className="block text-[0.64rem] text-gray-400">{m.sub}</span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mb-2 mt-3 text-[0.72rem] font-semibold text-gray-500">Velocidad</p>
        <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
          {VELOCIDADES.map((v) => (
            <button
              key={v.key}
              disabled={esVideo || parte.movimiento === 'ninguno'}
              onClick={() => onChange({ ...parte, velocidad: v.key })}
              className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[0.8rem] font-semibold transition-all',
                parte.velocidad === v.key ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              <v.icon className="h-3.5 w-3.5" /> {v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Vista previa de una mascota en su contexto ── */
function Preview({ parte, contexto }: { parte: MascotaParte; contexto: 'inicio' | 'flotante' }) {
  if (contexto === 'inicio') {
    return (
      <div className="relative overflow-hidden rounded-xl"
        style={{ height: 260, background: 'linear-gradient(160deg, #10203F 0%, #0B1730 100%)' }}>
        <MascotaTablero mascota={parte} className="p-4" />
      </div>
    )
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-surface" style={{ height: 260 }}>
      <div className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(0deg,transparent,transparent_18px,rgba(0,0,0,0.04)_18px,rgba(0,0,0,0.04)_19px)]" />
      <div className="absolute bottom-2 right-2 h-36 w-28">
        <MascotaTablero mascota={parte} className="drop-shadow-xl" />
      </div>
    </div>
  )
}

export function MascotaTab() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<Mascota | null>(null)
  const [sembrado, setSembrado] = useState(false)
  if (data && !sembrado) { setSembrado(true); setForm(data.mascota) }

  const guardar = useMutation({
    mutationFn: async () => { if (form) await personalizacionService.updateMascota(form) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Mascota actualizada')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  if (isLoading || !form) return <p className="text-sm text-ink-tertiary">Cargando…</p>

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
              Dos mascotas independientes: la de la card del inicio y la del widget flotante. Solo afecta a esta empresa.
            </p>
          </div>
        </div>
      </div>

      {/* ── Mascota del inicio ── */}
      <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2.5 border-b border-gray-100 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-800">Mascota de la card del inicio</p>
            <p className="text-[0.72rem] text-gray-400">Se ve dentro del tablero, en la card "Marca / mascota".</p>
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <EditorMascota parte={form.inicio} uso="inicio" onChange={(p) => setForm((f) => (f ? { ...f, inicio: p } : f))} />
          <div>
            <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">Vista previa</p>
            <Preview parte={form.inicio} contexto="inicio" />
          </div>
        </div>
      </section>

      {/* ── Mascota flotante ── */}
      <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <PictureInPicture2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[0.95rem] font-bold text-gray-800">Mascota flotante (widget)</p>
              <p className="text-[0.72rem] text-gray-400">Flota en la esquina en todas las páginas. Cada usuario la puede ocultar.</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <span className={clsx('relative inline-flex h-6 w-11 rounded-full transition-colors', form.flotante.habilitado ? 'bg-violet-600' : 'bg-gray-200')}>
              <input
                type="checkbox"
                className="sr-only"
                checked={form.flotante.habilitado}
                onChange={(e) => setForm((f) => (f ? { ...f, flotante: { ...f.flotante, habilitado: e.target.checked } } : f))}
              />
              <span className={clsx('mt-0.5 ml-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', form.flotante.habilitado && 'translate-x-5')} />
            </span>
            <span className="text-[0.8rem] font-semibold text-gray-600">{form.flotante.habilitado ? 'Habilitado' : 'Deshabilitado'}</span>
          </label>
        </div>

        {form.flotante.habilitado ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
            <EditorMascota parte={form.flotante} uso="flotante" onChange={(p) => setForm((f) => (f ? { ...f, flotante: { ...p, habilitado: f.flotante.habilitado } } : f))} />
            <div>
              <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-gray-400">Vista previa</p>
              <Preview parte={form.flotante} contexto="flotante" />
              {!form.flotante.mediaId && (
                <p className="mt-2 flex items-start gap-1.5 text-[0.68rem] text-gray-400">
                  <Info className="mt-0.5 h-3 w-3 flex-shrink-0 text-violet-400" />
                  Sin archivo propio, el widget usa la mascota del sistema.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="py-3 text-[0.8rem] text-gray-400">Actívalo para configurar su imagen y movimiento.</p>
        )}
      </section>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button
          onClick={() => data && setForm(data.mascota)}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-card px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 transition-colors hover:bg-gray-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Descartar cambios
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
