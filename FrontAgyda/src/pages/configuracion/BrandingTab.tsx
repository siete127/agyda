import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Type, Sparkles, Image as ImageIcon, Upload, Check, RotateCcw, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService, type Branding, type AssetTipo,
} from '@/services/personalizacion.service'

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-11 pr-3 text-[0.85rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15'

const COLOR_DEFAULT = '#2F6FED'

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[0.8rem] font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-gray-100 text-gray-400">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function SeccionNum({ n, titulo, subtitulo }: { n: number; titulo: string; subtitulo: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.8rem] font-bold text-white">{n}</span>
      <div>
        <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
        <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
      </div>
    </div>
  )
}

/* ── Uploader de un asset ─────────────────────────────────────── */
function AssetUploader({ tipo, label, hint, actualId, previewClass, onUploaded }: {
  tipo: AssetTipo
  label: string
  hint: string
  actualId: number | null
  previewClass: string
  onUploaded: (id: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const url = personalizacionService.assetUrl(actualId)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setSubiendo(true)
    try {
      const id = await personalizacionService.subirAsset(tipo, file)
      onUploaded(id)
      toast.success(`${label} actualizado`)
    } catch {
      toast.error(`No se pudo subir ${label.toLowerCase()}`)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-card p-3">
      <div className={clsx('mb-2 flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-200 bg-gray-50', previewClass)}>
        {url ? (
          <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-6 w-6 text-gray-300" />
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-[0.72rem] font-semibold text-gray-600 transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
      >
        {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {label}
      </button>
      <p className="mt-1 text-center text-[0.62rem] text-gray-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
      />
    </div>
  )
}

export function BrandingTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  // Estado editable sembrado desde el servidor. Cuando llega una versión nueva
  // del servidor (por otro admin / socket), re-sembramos — patrón de
  // "you might not need an effect" (react.dev).
  const [form, setForm] = useState<Branding | null>(null)
  const [seededFrom, setSeededFrom] = useState<Branding | null>(null)
  if (data && data.branding !== seededFrom) {
    setSeededFrom(data.branding)
    setForm(data.branding)
  }

  const set = <K extends keyof Branding>(k: K, v: Branding[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f))

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return
      await personalizacionService.updateBranding(form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Marca actualizada — se aplicó en todo el sistema')
    },
    onError: () => toast.error('No se pudo guardar la marca'),
  })

  if (isLoading || !form) {
    return <p className="text-sm text-ink-tertiary">Cargando…</p>
  }

  const color = /^#[0-9a-fA-F]{6}$/.test(form.colorBrand) ? form.colorBrand : COLOR_DEFAULT

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Palette className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Marca de la empresa</h2>
          <p className="text-[0.82rem] text-gray-400">
            Logo, colores y nombre. Los cambios se aplican a toda la empresa en vivo.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        <div className="space-y-6 p-5">
          {/* ① Identidad */}
          <div className="space-y-4">
            <SeccionNum n={1} titulo="Identidad" subtitulo="Nombre y eslogan que aparecen en el encabezado y en el pie." />
            <div className="grid grid-cols-1 gap-4 pl-10 sm:grid-cols-3">
              <Field label="Nombre corto" icon={<Type className="h-3.5 w-3.5" />}>
                <input value={form.nombreCorto} onChange={(e) => set('nombreCorto', e.target.value)} placeholder="AGYDA" className={inputCls} />
              </Field>
              <Field label="Nombre largo" icon={<Type className="h-3.5 w-3.5" />}>
                <input value={form.nombreLargo} onChange={(e) => set('nombreLargo', e.target.value)} placeholder="Ardaby Tec" className={inputCls} />
              </Field>
              <Field label="Eslogan" icon={<Sparkles className="h-3.5 w-3.5" />}>
                <input value={form.eslogan} onChange={(e) => set('eslogan', e.target.value)} placeholder="Soluciones en tecnología" className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="border-t border-gray-50" />

          {/* ② Color */}
          <div className="space-y-4">
            <SeccionNum n={2} titulo="Color de marca" subtitulo="El acento del sistema: botones, chips, enlaces y estados activos." />
            <div className="flex flex-wrap items-center gap-4 pl-10">
              <input
                type="color"
                value={color}
                onChange={(e) => set('colorBrand', e.target.value)}
                className="h-11 w-16 cursor-pointer rounded-lg border border-gray-200 bg-card p-1"
              />
              <input
                value={form.colorBrand}
                onChange={(e) => set('colorBrand', e.target.value)}
                placeholder="#2F6FED"
                className="w-28 rounded-xl border border-gray-200 bg-card py-2.5 px-3 text-[0.85rem] font-mono outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                type="button"
                onClick={() => set('colorBrand', COLOR_DEFAULT)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[0.72rem] font-semibold text-gray-500 hover:border-gray-300"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Azul por defecto
              </button>
              {/* preview en vivo con el color elegido (aún no guardado) */}
              <div
                className="flex items-center gap-2 rounded-xl border px-3 py-2"
                style={{ borderColor: color + '55', background: color + '12' }}
              >
                <span className="rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold text-white" style={{ background: color }}>Botón</span>
                <span className="text-[0.72rem] font-semibold" style={{ color }}>Enlace</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-50" />

          {/* ③ Imágenes */}
          <div className="space-y-4">
            <SeccionNum n={3} titulo="Logos e imágenes" subtitulo="PNG, JPG, WEBP o SVG. Se guardan por empresa, fuera del código." />
            <div className="grid grid-cols-2 gap-3 pl-10 md:grid-cols-4">
              <AssetUploader
                tipo="logo-principal" label="Logo principal" hint="480 × 160" previewClass="h-16"
                actualId={form.logoPrincipalId} onUploaded={(id) => set('logoPrincipalId', id)}
              />
              <AssetUploader
                tipo="logo-compacto" label="Logo compacto" hint="128 × 128" previewClass="h-16"
                actualId={form.logoCompactoId} onUploaded={(id) => set('logoCompactoId', id)}
              />
              <AssetUploader
                tipo="login" label="Imagen de login" hint="1920 × 1080" previewClass="h-16"
                actualId={form.loginImagenId} onUploaded={(id) => set('loginImagenId', id)}
              />
              <AssetUploader
                tipo="favicon" label="Favicon" hint="64 × 64" previewClass="h-16"
                actualId={form.faviconId} onUploaded={(id) => set('faviconId', id)}
              />
            </div>
            <p className="pl-10 text-[0.72rem] text-gray-400">
              Al subir una imagen se guarda de inmediato como asset. Pulsa "Guardar" para
              que la marca use esas imágenes y el nombre/color.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-50 bg-gray-50/40 px-5 py-4">
          <button
            type="button"
            onClick={() => data && setForm(data.branding)}
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
