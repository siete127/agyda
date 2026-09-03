import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, UploadCloud, Check, Loader2, Image as ImageIcon, Film, Info,
  LayoutGrid, PictureInPicture2, Layers, Trash2, Home, MoveVertical, Hand, Heart, RefreshCw, Ban,
  Snail, Waves, Zap,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService,
  type Mascota, type MascotaMovimiento, type MascotaVelocidad, type MascotaModo,
} from '@/services/personalizacion.service'
import { MascotaTablero } from '@/components/ui/MascotaTablero'

const MOVIMIENTOS: { key: MascotaMovimiento; label: string; sub: string; icon: typeof Home }[] = [
  { key: 'ninguno', label: 'Sin movimiento', sub: 'La imagen queda fija.', icon: Ban },
  { key: 'flotar', label: 'Flotar', sub: 'Sube y baja suavemente.', icon: MoveVertical },
  { key: 'saludar', label: 'Saludar', sub: 'Se inclina como si saludara, cada tanto.', icon: Hand },
  { key: 'latir', label: 'Latir', sub: 'Crece y encoge apenas, como respirando.', icon: Heart },
  { key: 'balanceo', label: 'Balanceo', sub: 'Se mece de lado a lado.', icon: RefreshCw },
]
const VELOCIDADES: { key: MascotaVelocidad; label: string; icon: typeof Snail }[] = [
  { key: 'lenta', label: 'Lenta', icon: Snail },
  { key: 'normal', label: 'Normal', icon: Waves },
  { key: 'rapida', label: 'Rápida', icon: Zap },
]
const MODOS: { key: MascotaModo; label: string; sub: string; icon: typeof LayoutGrid }[] = [
  { key: 'card', label: 'En la card del inicio', sub: 'Como está hoy, dentro del tablero.', icon: LayoutGrid },
  { key: 'flotante', label: 'Widget flotante', sub: 'Flota en la esquina en todas las páginas. Cada usuario la puede ocultar.', icon: PictureInPicture2 },
  { key: 'ambas', label: 'Ambas', sub: 'En la card del inicio y como widget flotante.', icon: Layers },
]

/* ── Cabecera de sección: icono en pill + título ── */
function SeccionHead({ icon: Icon, titulo, sub }: { icon: typeof Home; titulo: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[0.95rem] font-bold text-gray-800">{titulo}</p>
        {sub && <p className="text-[0.72rem] text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Tarjeta de opción seleccionable (icono + label + sub) ── */
function OpcionCard({ icon: Icon, label, sub, activo, onClick, disabled }: {
  icon: typeof Home; label: string; sub: string; activo: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
        activo ? 'border-violet-500 bg-violet-50/70' : 'border-gray-200 hover:bg-gray-50',
        disabled && 'opacity-50',
      )}
    >
      <Icon className={clsx('mt-0.5 h-4 w-4 flex-shrink-0', activo ? 'text-violet-600' : 'text-gray-400')} />
      <span className="min-w-0">
        <span className={clsx('block text-[0.82rem] font-semibold', activo ? 'text-violet-700' : 'text-gray-700')}>{label}</span>
        <span className="mt-0.5 block text-[0.68rem] leading-snug text-gray-400">{sub}</span>
      </span>
    </button>
  )
}

export function MascotaTab() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [previewModo, setPreviewModo] = useState<'inicio' | 'flotante'>('inicio')

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
      toast.success('Mascota actualizada')
    },
    onError: () => toast.error('No se pudo guardar la mascota'),
  })

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return
    setSubiendo(true)
    try {
      const { id, tipo } = await personalizacionService.subirMascotaMedia(file)
      setForm((f) => (f ? { ...f, mediaId: id, tipo } : { mediaId: id, tipo, movimiento: 'flotar', velocidad: 'normal', modo: 'card' }))
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
              Imagen o video en la card del inicio y/o como widget flotante. Solo afecta a esta empresa.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          {/* ── Archivo ── */}
          <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
            <SeccionHead icon={ImageIcon} titulo="Imagen o video" />
            <p className="-mt-2 mb-3 text-[0.75rem] text-gray-400">
              Formatos permitidos: PNG, JPG, WEBP, GIF, MP4 o WEBM · Tamaño máximo: 25 MB
            </p>

            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false)
                elegirArchivo(e.dataTransfer.files?.[0])
              }}
              className={clsx(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragOver ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-violet-400 hover:bg-gray-50/60',
              )}
            >
              {subiendo ? (
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              ) : (
                <UploadCloud className="h-6 w-6 text-gray-400" />
              )}
              <p className="text-[0.85rem] font-semibold text-gray-700">
                {form.mediaId ? 'Reemplazar archivo' : 'Subir archivo'}
              </p>
              <p className="text-[0.72rem] text-gray-400">Arrastra o selecciona un archivo</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>

            {form.mediaId && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-700">
                  {esVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {esVideo ? 'Video' : 'Imagen'} cargado
                </span>
                <button onClick={quitar} className="text-[0.72rem] font-semibold text-gray-400 hover:text-red-500">
                  Quitar (usar la del sistema)
                </button>
              </div>
            )}

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <p className="text-[0.72rem] leading-relaxed text-gray-500">
                Sin nada subido, el tablero usa la mascota del sistema.<br />
                El movimiento solo aplica a imágenes — un video ya trae su propia animación.
              </p>
            </div>
          </section>

          {/* ── Dónde se muestra ── */}
          <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
            <SeccionHead icon={PictureInPicture2} titulo="Dónde se muestra" />
            <div className="grid gap-2.5 sm:grid-cols-3">
              {MODOS.map((m) => (
                <OpcionCard
                  key={m.key}
                  icon={m.icon}
                  label={m.label}
                  sub={m.sub}
                  activo={form.modo === m.key}
                  onClick={() => set('modo', m.key)}
                />
              ))}
            </div>
          </section>

          {/* ── Movimiento ── */}
          <section className={clsx('rounded-2xl border border-gray-100 bg-card p-5 shadow-card', esVideo && 'opacity-60')}>
            <SeccionHead icon={Sparkles} titulo="Movimiento" sub="Solo aplica a imágenes." />
            <div className="grid gap-2.5 sm:grid-cols-3">
              {MOVIMIENTOS.map((m) => (
                <OpcionCard
                  key={m.key}
                  icon={m.icon}
                  label={m.label}
                  sub={m.sub}
                  activo={form.movimiento === m.key}
                  disabled={esVideo}
                  onClick={() => set('movimiento', m.key)}
                />
              ))}
            </div>

            <p className="mb-2 mt-4 text-[0.72rem] font-semibold text-gray-500">Velocidad</p>
            <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
              {VELOCIDADES.map((v) => (
                <button
                  key={v.key}
                  disabled={esVideo || form.movimiento === 'ninguno'}
                  onClick={() => set('velocidad', v.key)}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[0.8rem] font-semibold transition-all',
                    form.velocidad === v.key ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" /> {v.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* ── Vista previa ── */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
            <p className="text-[0.85rem] font-bold text-gray-800">Vista previa</p>
            <p className="mb-3 text-[0.68rem] text-gray-400">Así se verá en el tablero y como widget flotante.</p>

            {previewModo === 'inicio' ? (
              <div className="relative overflow-hidden rounded-xl"
                style={{ height: 300, background: 'linear-gradient(160deg, #10203F 0%, #0B1730 100%)' }}>
                <MascotaTablero mascota={form} className="p-4" />
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-gray-100 bg-surface" style={{ height: 300 }}>
                {/* Simula el rincón de la pantalla */}
                <div className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(0deg,transparent,transparent_18px,rgba(0,0,0,0.04)_18px,rgba(0,0,0,0.04)_19px)]" />
                <div className="absolute bottom-2 right-2 h-40 w-32">
                  <MascotaTablero mascota={form} className="drop-shadow-xl" />
                </div>
              </div>
            )}

            <div className="mt-3 flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
              <button
                onClick={() => setPreviewModo('inicio')}
                className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[0.75rem] font-semibold transition-all',
                  previewModo === 'inicio' ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:text-gray-700')}
              >
                <Home className="h-3.5 w-3.5" /> Inicio
              </button>
              <button
                onClick={() => setPreviewModo('flotante')}
                className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[0.75rem] font-semibold transition-all',
                  previewModo === 'flotante' ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:text-gray-700')}
              >
                <PictureInPicture2 className="h-3.5 w-3.5" /> Widget flotante
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
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
