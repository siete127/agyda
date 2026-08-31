import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Sun, Moon, MonitorSmartphone, Check, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, type Theme } from '@/stores/theme.store'
import { personalizacionService } from '@/services/personalizacion.service'
import { PALETTES, paletteFromColor } from '@/lib/palettes'
import { THEME_PRESETS, presetMatchesBranding, type ThemePreset } from '@/lib/themePresets'

/* ── Badge numerado (púrpura, como el mockup) ── */
function SeccionNum({ n, titulo, subtitulo }: { n: number; titulo: string; subtitulo: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-[0.8rem] font-bold text-white">{n}</span>
      <div>
        <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
        <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
      </div>
    </div>
  )
}

/* ── Panel interior del mockup (claro u oscuro) ── */
function MockPanel({ dark }: { dark: boolean }) {
  return (
    <div className={clsx('flex h-full flex-1 flex-col gap-1.5 p-2', dark ? 'bg-[#12161F]' : 'bg-gray-100')}>
      <div className="h-3 w-12 self-end rounded bg-violet-500" />
      <div className={clsx('h-full rounded', dark ? 'bg-[#1E2430]' : 'bg-white')} />
      <div className="flex gap-1.5">
        <div className={clsx('h-6 flex-1 rounded', dark ? 'bg-white/10' : 'bg-gray-200')} />
        <div className={clsx('h-6 flex-1 rounded', dark ? 'bg-white/10' : 'bg-gray-200')} />
      </div>
    </div>
  )
}

/* ── Mini-preview de una ventana (sidebar navy + contenido) ── */
function MiniMockup({ variant }: { variant: 'light' | 'dark' | 'split' }) {
  return (
    <div className={clsx('flex h-[86px] w-full overflow-hidden rounded-lg border', variant === 'dark' ? 'border-white/10' : 'border-gray-200')}>
      <div className="flex w-6 flex-shrink-0 flex-col gap-1 bg-[#0B1730] p-1.5">
        <span className="h-1 w-full rounded bg-white/25" />
        <span className="h-1 w-full rounded bg-white/15" />
        <span className="h-1 w-full rounded bg-white/15" />
      </div>
      {variant === 'split' ? (
        <>
          <MockPanel dark={false} />
          <MockPanel dark />
        </>
      ) : (
        <MockPanel dark={variant === 'dark'} />
      )}
    </div>
  )
}

/* ── Mini-ilustración de una plantilla ── */
function PresetMockup({ p }: { p: ThemePreset }) {
  const modoIcon = p.modo === 'light' ? '☀' : p.modo === 'dark' ? '☾' : '⌘'
  return (
    <div
      className="flex h-[92px] w-full overflow-hidden rounded-lg border border-black/5"
      style={{ background: p.preview.fondo }}
    >
      <div className="flex w-7 flex-shrink-0 flex-col gap-1 p-1.5" style={{ background: p.preview.sidebar }}>
        <span className="h-1 w-full rounded" style={{ background: 'rgba(255,255,255,0.3)' }} />
        <span className="h-1 w-full rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
        <span className="h-1 w-full rounded" style={{ background: 'rgba(255,255,255,0.18)' }} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="flex items-center justify-between">
          <span className="h-2 w-8 rounded" style={{ background: p.preview.acento }} />
          <span className="text-[0.6rem] leading-none" style={{ color: p.preview.texto }}>{modoIcon}</span>
        </div>
        <div className="h-full rounded" style={{ background: p.preview.card }} />
        <div className="flex gap-1.5">
          <div className="h-5 flex-1 rounded" style={{ background: p.preview.card }} />
          <div className="h-5 w-8 rounded" style={{ background: p.preview.acento }} />
        </div>
      </div>
    </div>
  )
}

const MODOS: { key: Theme; label: string; icon: React.ElementType; desc: string; mockup: 'light' | 'dark' | 'split' }[] = [
  { key: 'light',  label: 'Claro',      icon: Sun,               desc: 'Siempre claro',                 mockup: 'light' },
  { key: 'dark',   label: 'Oscuro',     icon: Moon,              desc: 'Siempre oscuro',                mockup: 'dark' },
  { key: 'system', label: 'Automático', icon: MonitorSmartphone, desc: 'Sigue el tema del dispositivo', mockup: 'split' },
]

export function TemaTab() {
  const { user } = useAuthStore()
  const esAdmin = (user?.tipoUsuario ?? '').toUpperCase() === 'AD'

  const themeGuardado = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  // El modo se aplica en vivo (para que se vea el efecto) pero se puede
  // "Cancelar" para volver al guardado. `pendiente` = elección sin confirmar.
  const [pendiente, setPendiente] = useState<Theme | null>(null)
  const modoActivo = pendiente ?? themeGuardado
  const hayCambios = pendiente !== null && pendiente !== themeGuardado

  const elegirModo = (t: Theme) => {
    setPendiente(t)
    setTheme(t) // preview inmediato
  }
  const cancelar = () => {
    if (pendiente !== null) setTheme(themeGuardado)
    setPendiente(null)
  }
  const guardar = () => {
    setPendiente(null)
    toast.success('Preferencia de tema guardada en este dispositivo')
  }
  const restablecer = () => {
    setPendiente('system')
    setTheme('system')
  }

  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })
  const colorActual = data?.branding.colorBrand ?? '#2F6FED'
  const paletaActual = paletteFromColor(colorActual)

  const branding = data?.branding
  const presetActivo = branding
    ? THEME_PRESETS.find((p) => p.modo === themeGuardado && presetMatchesBranding(p, branding))
    : undefined

  const [aplicandoPreset, setAplicandoPreset] = useState<string | null>(null)
  const aplicarPreset = useMutation({
    mutationFn: async (preset: ThemePreset) => {
      setAplicandoPreset(preset.key)
      // Modo → por dispositivo
      setPendiente(null)
      setTheme(preset.modo)
      // Branding → por empresa (solo si es admin)
      if (esAdmin && branding) {
        await personalizacionService.updateBranding({ ...branding, ...preset.branding })
      }
    },
    onSuccess: (_d, preset) => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success(
        esAdmin
          ? `Plantilla "${preset.nombre}" aplicada a la empresa`
          : `Modo de "${preset.nombre}" aplicado en este dispositivo`,
      )
    },
    onError: () => toast.error('No se pudo aplicar la plantilla'),
    onSettled: () => setAplicandoPreset(null),
  })

  const [aplicando, setAplicando] = useState<string | null>(null)
  const aplicarPaleta = useMutation({
    mutationFn: async (color: string) => {
      setAplicando(color)
      await personalizacionService.updateBranding({ ...data?.branding, colorBrand: color })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personalizacion'] })
      toast.success('Paleta aplicada a toda la empresa')
    },
    onError: () => toast.error('No se pudo aplicar la paleta'),
    onSettled: () => setAplicando(null),
  })

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <Palette className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Tema</h2>
          <p className="text-[0.82rem] text-gray-400">Modo claro/oscuro y paleta de color de la marca.</p>
        </div>
      </div>

      {/* Plantillas de diseño */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[0.95rem] font-bold text-gray-900">Plantillas de diseño</p>
            <p className="text-[0.78rem] text-gray-400">
              Combinan modo, color, sidebar y fondo de una sola vez.
              {esAdmin ? ' Se aplican a toda la empresa.' : ' Solo el modo se aplica en tu dispositivo (el resto lo define un administrador).'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_PRESETS.map((p) => {
            const activo = presetActivo?.key === p.key
            const cargando = aplicandoPreset === p.key
            return (
              <button
                key={p.key}
                type="button"
                disabled={aplicarPreset.isPending}
                onClick={() => aplicarPreset.mutate(p)}
                className={clsx(
                  'group flex flex-col gap-2.5 rounded-2xl border p-3 text-left transition-all disabled:opacity-60',
                  activo ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-gray-200 hover:border-gray-300',
                )}
              >
                <PresetMockup p={p} />
                <div className="flex items-center gap-1.5">
                  <p className="text-[0.82rem] font-bold text-gray-900">{p.nombre}</p>
                  {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
                  {activo && !cargando && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="text-[0.7rem] leading-snug text-gray-400">{p.descripcion}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        <div className="space-y-6 p-5">
          {/* ① Modo */}
          <div className="space-y-4">
            <SeccionNum n={1} titulo="Modo de color" subtitulo="Se guarda en este dispositivo (no afecta a otros usuarios)." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {MODOS.map((m) => {
                const activo = modoActivo === m.key
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => elegirModo(m.key)}
                    className={clsx(
                      'flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all',
                      activo ? 'border-violet-500 ring-2 ring-violet-500/20 bg-violet-50/40' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', activo ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-400')}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.85rem] font-bold text-gray-800">{m.label}</p>
                        <p className="text-[0.68rem] text-gray-400">{m.desc}</p>
                      </div>
                      {activo && (
                        <span className="ml-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <MiniMockup variant={m.mockup} />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gray-50" />

          {/* ② Paleta de marca */}
          <div className="space-y-4">
            <SeccionNum n={2} titulo="Paleta de marca" subtitulo="Color de acento de toda la empresa. Se aplica en vivo a todos sus usuarios." />
            {!esAdmin && (
              <p className="text-[0.75rem] text-amber-600">
                Solo un administrador puede cambiar la paleta de la empresa.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
              {PALETTES.map((p) => {
                const activo = paletaActual?.key === p.key
                const cargando = aplicando === p.color
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!esAdmin || aplicarPaleta.isPending}
                    onClick={() => aplicarPaleta.mutate(p.color)}
                    className={clsx(
                      'flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all disabled:opacity-50',
                      activo ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-full" style={{ background: p.color }}>
                      {cargando ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : null}
                      {activo && !cargando && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>
                    <span className="text-[0.72rem] font-semibold text-gray-700">{p.nombre}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block h-4 w-4 rounded-full border border-gray-200" style={{ background: colorActual }} />
              <span className="text-[0.75rem] text-gray-500">
                Actual: <b className="font-mono">{colorActual}</b>
                {!paletaActual && ' (personalizado)'}
              </span>
              {esAdmin && (
                <span className="ml-auto text-[0.72rem] text-gray-400">
                  ¿Color propio? → Apariencia · Marca
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer con acciones */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-50 bg-gray-50/40 px-5 py-4">
          <button
            type="button"
            onClick={restablecer}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
          >
            <RotateCcw className="h-4 w-4" /> Restablecer valores
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={cancelar}
              disabled={!hayCambios}
              className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!hayCambios}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
