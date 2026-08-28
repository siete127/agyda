import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Palette, Sun, Moon, MonitorSmartphone, Check, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, type Theme } from '@/stores/theme.store'
import { personalizacionService } from '@/services/personalizacion.service'
import { PALETTES, paletteFromColor } from '@/lib/palettes'

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

const MODOS: { key: Theme; label: string; icon: React.ElementType; desc: string; preview: string }[] = [
  { key: 'light',  label: 'Claro',      icon: Sun,               desc: 'Siempre claro',                  preview: 'bg-white' },
  { key: 'dark',   label: 'Oscuro',     icon: Moon,              desc: 'Siempre oscuro',                 preview: 'bg-[#181D27]' },
  { key: 'system', label: 'Automático', icon: MonitorSmartphone, desc: 'Sigue el tema del dispositivo',  preview: 'bg-gradient-to-r from-white to-[#181D27]' },
]

export function TemaTab() {
  const { user } = useAuthStore()
  const esAdmin = (user?.tipoUsuario ?? '').toUpperCase() === 'AD'

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })
  const colorActual = data?.branding.colorBrand ?? '#2F6FED'
  const paletaActual = paletteFromColor(colorActual)

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
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Palette className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-[1.35rem] font-bold text-gray-900">Tema</h2>
          <p className="text-[0.82rem] text-gray-400">Modo claro/oscuro y paleta de color de la marca.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-card">
        <div className="space-y-6 p-5">
          {/* ① Modo */}
          <div className="space-y-4">
            <SeccionNum n={1} titulo="Modo de color" subtitulo="Se guarda en este dispositivo (no afecta a otros usuarios)." />
            <div className="grid grid-cols-1 gap-3 pl-10 sm:grid-cols-3">
              {MODOS.map((m) => {
                const activo = theme === m.key
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setTheme(m.key)}
                    className={clsx(
                      'flex flex-col gap-2 rounded-xl border p-3 text-left transition-all',
                      activo ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <div className={clsx('h-14 w-full rounded-lg border border-gray-200', m.preview)} />
                    <div className="flex items-center gap-1.5">
                      <Icon className={clsx('h-4 w-4', activo ? 'text-brand' : 'text-gray-400')} />
                      <span className="text-[0.82rem] font-semibold text-gray-800">{m.label}</span>
                      {activo && <Check className="ml-auto h-4 w-4 text-brand" />}
                    </div>
                    <p className="text-[0.7rem] text-gray-400">{m.desc}</p>
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
              <p className="pl-10 text-[0.75rem] text-amber-600">
                Solo un administrador puede cambiar la paleta de la empresa.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 pl-10 sm:grid-cols-3 md:grid-cols-6">
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
                      'flex flex-col items-center gap-2 rounded-xl border p-3 transition-all disabled:opacity-50',
                      activo ? 'border-brand ring-2 ring-brand/20' : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ background: p.color }}
                    >
                      {cargando ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                        : activo ? <Check className="h-4 w-4 text-white" /> : null}
                    </span>
                    <span className="text-[0.72rem] font-semibold text-gray-700">{p.nombre}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 pl-10">
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
      </div>
    </div>
  )
}
