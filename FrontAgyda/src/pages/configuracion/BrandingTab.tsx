import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Type, Sparkles, Image as ImageIcon, Upload, Check, RotateCcw, Loader2, IdCard, Droplet, ImagePlus, Info, PanelLeft } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService, type Branding, type AssetTipo, type SidebarEstilo,
} from '@/services/personalizacion.service'

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-11 pr-3 text-[0.85rem] text-gray-900 ' +
  'placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

const COLOR_DEFAULT = '#2F6FED'

const PASOS = [
  { n: 1, key: 'identidad', label: 'Identidad',        sub: 'Nombre y eslogan que representan tu empresa.', icon: IdCard },
  { n: 2, key: 'color',     label: 'Color de marca',    sub: 'El color principal del sistema y sus estados.', icon: Droplet },
  { n: 3, key: 'imagenes',  label: 'Logos e imágenes',  sub: 'Sube los activos visuales de tu marca.', icon: ImagePlus },
  { n: 4, key: 'entorno',   label: 'Menú y fondo',      sub: 'Estilo del sidebar y color de fondo de la app.', icon: PanelLeft },
] as const

const SIDEBAR_PRESETS: { key: SidebarEstilo; label: string; bg: string }[] = [
  { key: 'degradado-azul',  label: 'Degradado azul',   bg: 'linear-gradient(180deg,#14225C,#2C57C4)' },
  { key: 'solido-oscuro',   label: 'Sólido oscuro',    bg: '#0B1730' },
  { key: 'color-marca',     label: 'Color de marca',   bg: 'rgb(var(--color-brand-dark))' },
  { key: 'gradiente-marca', label: 'Degradado marca',  bg: 'linear-gradient(180deg,rgb(var(--color-brand-dark)),rgb(var(--color-brand)))' },
]

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

function CardSeccion({ icon: Icon, titulo, subtitulo, children, anchor }: {
  icon: React.ElementType; titulo: string; subtitulo: string; children: React.ReactNode; anchor: string
}) {
  return (
    <section id={anchor} className="scroll-mt-4 rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
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

/* ── Uploader de un asset ─────────────────────────────────────── */
function AssetUploader({ tipo, label, hint, actualId, onUploaded }: {
  tipo: AssetTipo
  label: string
  hint: string
  actualId: number | null
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
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={subiendo}
      className="group flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 text-center transition-colors hover:border-violet-400 disabled:opacity-60"
    >
      <p className="text-[0.78rem] font-semibold text-gray-700">{label}</p>
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-500 transition-colors group-hover:bg-violet-100">
        {subiendo ? <Loader2 className="h-4 w-4 animate-spin" />
          : url ? <img src={url} alt={label} className="h-full w-full rounded-full object-cover" />
          : <Upload className="h-4 w-4" />}
      </div>
      <p className="text-[0.66rem] text-gray-400">{hint}</p>
      {url && !subiendo && (
        <span className="flex items-center gap-1 text-[0.62rem] font-semibold text-violet-600">
          <ImageIcon className="h-3 w-3" /> Reemplazar
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
        className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
      />
    </button>
  )
}

/* ── Mini-ilustración del header ── */
function HeaderMockup() {
  return (
    <div className="hidden w-64 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-card p-2 shadow-sm lg:block">
      <div className="mb-1.5 flex gap-1 px-1">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-16 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500" />
        <div className="flex-1 space-y-1.5 py-1">
          <div className="h-2 w-full rounded bg-violet-200" />
          <div className="h-2 w-3/4 rounded bg-gray-200" />
          <div className="h-2 w-2/3 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  )
}

export function BrandingTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const [form, setForm] = useState<Branding | null>(null)
  const [seededFrom, setSeededFrom] = useState<Branding | null>(null)
  if (data && data.branding !== seededFrom) {
    setSeededFrom(data.branding)
    setForm(data.branding)
  }

  const [pasoActivo, setPasoActivo] = useState<string>('identidad')

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

  const irA = (key: string) => {
    setPasoActivo(key)
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-5">
      {/* Encabezado con ilustración */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <Palette className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[1.35rem] font-bold text-gray-900">Marca de la empresa</h2>
              <p className="text-[0.82rem] text-gray-400">
                Personaliza la identidad visual de tu empresa. Los cambios se aplicarán en todo el sistema.
              </p>
            </div>
          </div>
          <HeaderMockup />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* ── Navegación lateral de pasos ── */}
        <nav className="hidden lg:block">
          <ol className="sticky top-4 space-y-1">
            {PASOS.map((p) => {
              const activo = pasoActivo === p.key
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => irA(p.key)}
                    className={clsx(
                      'flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors',
                      activo ? 'bg-violet-50' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={clsx(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold',
                      activo ? 'bg-violet-600 text-white' : 'border border-gray-300 text-gray-400',
                    )}>
                      {p.n}
                    </span>
                    <span className="min-w-0">
                      <span className={clsx('block text-[0.82rem] font-semibold', activo ? 'text-violet-700' : 'text-gray-700')}>{p.label}</span>
                      <span className="block text-[0.68rem] text-gray-400">{p.sub}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* ── Contenido ── */}
        <div className="space-y-5">
          <CardSeccion anchor="identidad" icon={IdCard} titulo="Identidad" subtitulo="Nombre y eslogan que aparecen en el encabezado y en el pie.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </CardSeccion>

          <CardSeccion anchor="color" icon={Droplet} titulo="Color de marca" subtitulo="El color principal del sistema. Se aplica a botones, chips, enlaces y estados activos.">
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="color"
                value={color}
                onChange={(e) => set('colorBrand', e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-gray-200 bg-card p-1"
              />
              <input
                value={form.colorBrand}
                onChange={(e) => set('colorBrand', e.target.value)}
                placeholder="#2F6FED"
                className="w-28 rounded-xl border border-gray-200 bg-card py-2.5 px-3 text-[0.85rem] font-mono outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
              />
              <button
                type="button"
                onClick={() => set('colorBrand', COLOR_DEFAULT)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[0.72rem] font-semibold text-gray-500 hover:border-gray-300"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Azul por defecto
              </button>
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: color + '55', background: color + '12' }}>
                <p className="mb-1 text-[0.6rem] font-semibold uppercase tracking-wide text-gray-400">Vista previa</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold text-white" style={{ background: color }}>Botón</span>
                  <span className="text-[0.72rem] font-semibold" style={{ color }}>Enlace</span>
                </div>
              </div>
            </div>
          </CardSeccion>

          <CardSeccion anchor="imagenes" icon={ImagePlus} titulo="Logos e imágenes" subtitulo="Formatos soportados: PNG, JPG, WEBP o SVG. Fondo transparente recomendado.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <AssetUploader tipo="logo-principal" label="Logo principal" hint="480 × 160 px" actualId={form.logoPrincipalId} onUploaded={(id) => set('logoPrincipalId', id)} />
              <AssetUploader tipo="logo-compacto" label="Logo compacto" hint="128 × 128 px" actualId={form.logoCompactoId} onUploaded={(id) => set('logoCompactoId', id)} />
              <AssetUploader tipo="login" label="Imagen de login" hint="1920 × 1080 px" actualId={form.loginImagenId} onUploaded={(id) => set('loginImagenId', id)} />
              <AssetUploader tipo="favicon" label="Favicon" hint="64 × 64 px" actualId={form.faviconId} onUploaded={(id) => set('faviconId', id)} />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
              <p className="text-[0.72rem] text-gray-500">
                Las imágenes se guardan de inmediato como activos. Puedes reemplazarlas cuando lo necesites. Pulsa "Guardar cambios" para que la marca use el nombre y color.
              </p>
            </div>
          </CardSeccion>

          <CardSeccion anchor="entorno" icon={PanelLeft} titulo="Menú y fondo" subtitulo="Estilo del menú lateral y color de fondo de la aplicación.">
            {/* Estilo del sidebar */}
            <p className="mb-2 text-[0.8rem] font-semibold text-gray-700">Estilo del menú lateral</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SIDEBAR_PRESETS.map((p) => {
                const activo = (form.sidebarEstilo ?? 'degradado-azul') === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => set('sidebarEstilo', p.key)}
                    className={clsx(
                      'flex flex-col gap-2 rounded-xl border p-2 transition-all',
                      activo ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <span className="relative h-12 w-full overflow-hidden rounded-lg" style={{ background: p.bg }}>
                      {activo && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                    <span className="text-[0.72rem] font-semibold text-gray-700">{p.label}</span>
                  </button>
                )
              })}
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2.5 select-none">
              <span className={clsx(
                'relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors',
                (form.sidebarBurbujas ?? true) ? 'bg-violet-600' : 'bg-gray-200',
              )}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.sidebarBurbujas ?? true}
                  onChange={(e) => set('sidebarBurbujas', e.target.checked)}
                />
                <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform', (form.sidebarBurbujas ?? true) ? 'translate-x-4' : 'translate-x-0')} />
              </span>
              <span className="text-[0.8rem] font-semibold text-gray-700">Burbujas animadas en el menú</span>
            </label>

            {/* Fondo de la app */}
            <p className="mb-2 mt-6 text-[0.8rem] font-semibold text-gray-700">Color de fondo de la aplicación</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[0.75rem] font-medium text-gray-500">Modo claro</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.fondoClaro) ? form.fondoClaro : '#F7F9FC'}
                    onChange={(e) => set('fondoClaro', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 bg-card p-1"
                  />
                  <input
                    value={form.fondoClaro}
                    onChange={(e) => set('fondoClaro', e.target.value)}
                    className="w-24 rounded-lg border border-gray-200 bg-card px-2 py-2 text-[0.8rem] font-mono outline-none focus:border-violet-500"
                  />
                  <button type="button" onClick={() => set('fondoClaro', '#F7F9FC')}
                    className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:border-gray-300" title="Restablecer">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[0.75rem] font-medium text-gray-500">Modo oscuro</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.fondoOscuro) ? form.fondoOscuro : '#0F131B'}
                    onChange={(e) => set('fondoOscuro', e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 bg-card p-1"
                  />
                  <input
                    value={form.fondoOscuro}
                    onChange={(e) => set('fondoOscuro', e.target.value)}
                    className="w-24 rounded-lg border border-gray-200 bg-card px-2 py-2 text-[0.8rem] font-mono outline-none focus:border-violet-500"
                  />
                  <button type="button" onClick={() => set('fondoOscuro', '#0F131B')}
                    className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:border-gray-300" title="Restablecer">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
              <p className="text-[0.72rem] text-gray-500">
                El fondo debe contrastar con las tarjetas (blancas en claro, oscuras en oscuro).
                Colores muy claros/oscuros pueden hacer que las tarjetas "desaparezcan".
              </p>
            </div>
          </CardSeccion>
        </div>
      </div>

      {/* Footer de acciones */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
          >
            {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
