import {
  Link2, Plus, Trash2, Check, ExternalLink, PictureInPicture2, AppWindow,
  GripVertical, HelpCircle, ArrowUp, ArrowDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { EnlaceTopbar, EnlaceTopbarModo } from '@/services/personalizacion.service'
import { useEnlaceFrameStore } from '@/stores/enlaceFrame.store'
import { ENLACE_ICONOS, ENLACE_ICONO_KEYS } from '@/lib/enlaceTopbarIconos'
import { abrirEnVentana } from '@/lib/popup'
import { urlValida } from './enlaces.utils'

// Editor de enlaces externos (nombre, URL, modo de apertura, icono, color,
// visible y orden). Lo comparten los enlaces del encabezado de la empresa
// (Configuración → Enlaces del encabezado) y los enlaces personales de cada
// usuario (tarjeta "Mis enlaces" del inicio). `donde` solo ajusta los textos.

const COLORES = ['#7C3AED', '#DC2626', '#059669', '#0891B2', '#D97706', '#8B5CF6', '#2563EB', '#DB2777', '#475569']

export const MAX_ENLACES = 12

let _seq = 0
function nuevoEnlace(): EnlaceTopbar {
  return {
    id: `enlace-${Date.now()}-${_seq++}`,
    label: '',
    url: '',
    icono: 'link',
    color: '#7C3AED',
    modo: 'pestana',
    visible: true,
  }
}

/* ── Etiqueta con tooltip ── */
function Etiqueta({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <span className="mb-1.5 flex items-center gap-1 text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">
      {children}
      <span className="group relative inline-flex">
        <HelpCircle className="h-3 w-3 cursor-help text-gray-300 hover:text-gray-400" />
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-48 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[0.68rem] font-normal normal-case leading-snug text-white shadow-lg group-hover:block">
          {hint}
        </span>
      </span>
    </span>
  )
}

const TEXTOS = {
  encabezado: {
    nombreHint: 'El texto que se muestra al pasar el mouse sobre el botón en el encabezado.',
    visibleHint: 'Si está apagado, el botón no se muestra en el encabezado pero se conserva aquí.',
    iconoHint: 'Se muestra dentro del botón redondo en el encabezado.',
    colorHint: 'Color de fondo del botón en el encabezado.',
    previaNota: 'Así se verá en el encabezado',
  },
  tarjeta: {
    nombreHint: 'El texto que se muestra en tu tarjeta "Mis enlaces".',
    visibleHint: 'Si está apagado, el enlace no se muestra en tu tarjeta pero se conserva aquí.',
    iconoHint: 'Se muestra en el cuadro de color del enlace.',
    colorHint: 'Color del cuadro del enlace en tu tarjeta.',
    previaNota: 'Así se abrirá desde tu tarjeta',
  },
} as const

export function EnlacesEditor({ enlaces, onChange, donde, alAbrirFlotante }: {
  enlaces: EnlaceTopbar[]
  onChange: (enlaces: EnlaceTopbar[]) => void
  donde: 'encabezado' | 'tarjeta'
  // Si el editor vive dentro de un modal, el panel flotante (z-40) quedaría
  // detrás: quien lo usa puede ocultar su modal mientras se ve la vista previa.
  alAbrirFlotante?: () => void
}) {
  const t = TEXTOS[donde]
  const abrirFlotante = useEnlaceFrameStore((s) => s.abrir)

  const patch = (id: string, p: Partial<EnlaceTopbar>) =>
    onChange(enlaces.map((e) => (e.id === id ? { ...e, ...p } : e)))
  const quitar = (id: string) => onChange(enlaces.filter((e) => e.id !== id))
  const agregar = () => onChange([...enlaces, nuevoEnlace()])
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= enlaces.length) return
    const copy = [...enlaces]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    onChange(copy)
  }

  const vistaPrevia = (e: EnlaceTopbar) => {
    if (!urlValida(e.url)) { toast.error('Escribe una URL válida primero'); return }
    if (e.modo === 'flotante') {
      abrirFlotante({ id: e.id, label: e.label || 'Enlace', url: e.url, color: e.color })
      alAbrirFlotante?.()
    } else if (e.modo === 'ventana') abrirEnVentana(e.url, e.id)
    else window.open(e.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div>
      {enlaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-[0.82rem] text-gray-400">
          Aún no hay enlaces. Agrega el primero abajo.
        </div>
      ) : (
        <div className="space-y-4">
          {enlaces.map((e, i) => {
            const Icon = ENLACE_ICONOS[e.icono] ?? ENLACE_ICONOS.link
            const urlMala = e.url.trim() !== '' && !urlValida(e.url)
            return (
              <div key={e.id} className={clsx('rounded-2xl border border-gray-100 bg-gray-50/40 p-4', !e.visible && 'opacity-60')}>
                {/* fila 1: orden · preview · nombre · visible · eliminar */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex flex-col items-center pt-6 text-gray-300">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="hover:text-gray-500 disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <GripVertical className="h-3.5 w-3.5 text-gray-200" />
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === enlaces.length - 1} className="hover:text-gray-500 disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-shrink-0 items-center pt-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: e.color }}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="min-w-[10rem] flex-1">
                    <Etiqueta hint={t.nombreHint}>Nombre</Etiqueta>
                    <input
                      value={e.label}
                      onChange={(ev) => patch(e.id, { label: ev.target.value })}
                      placeholder="Ej. Dashboard Ventas"
                      maxLength={40}
                      className="w-full rounded-lg border border-gray-200 bg-card px-3 py-2 text-[0.85rem] text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>

                  <div className="flex flex-shrink-0 flex-col items-center pt-1.5">
                    <Etiqueta hint={t.visibleHint}>Visible</Etiqueta>
                    <label className="mt-1 cursor-pointer">
                      <span className={clsx('relative inline-flex h-6 w-11 rounded-full transition-colors', e.visible ? 'bg-violet-600' : 'bg-gray-200')}>
                        <input type="checkbox" className="sr-only" checked={e.visible} onChange={(ev) => patch(e.id, { visible: ev.target.checked })} />
                        <span className={clsx('mt-0.5 ml-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', e.visible && 'translate-x-5')} />
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-shrink-0 pt-6">
                    <button
                      type="button"
                      onClick={() => quitar(e.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[0.75rem] font-semibold text-red-600 transition-colors hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                </div>

                {/* fila 2: URL + modo */}
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <Etiqueta hint="Dirección externa (empieza con http:// o https://) o una ruta del propio sistema (empieza con /, p. ej. /formulario-publico/…), que se abre en el mismo dominio donde estés.">URL</Etiqueta>
                    <div className="relative">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                      <input
                        value={e.url}
                        onChange={(ev) => patch(e.id, { url: ev.target.value })}
                        placeholder="https://ejemplo.com/dashboard"
                        maxLength={500}
                        className={clsx('w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-[0.8rem] font-mono outline-none focus:ring-2 focus:ring-violet-500/15',
                          urlMala ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-500')}
                      />
                    </div>
                    {urlMala && <p className="mt-1 pl-1 text-[0.68rem] text-red-500">La URL debe empezar con http://, https:// o / (ruta del sistema)</p>}
                  </div>

                  <div>
                    <Etiqueta hint="Pestaña nueva: abre la URL fuera del sistema. Ventana: pestaña nueva pero en una ventana pequeña que puedes dejar al costado. Flotante: la muestra en un panel embebido que sigue visible al navegar.">Modo de apertura</Etiqueta>
                    <div className="flex gap-2 rounded-lg border border-gray-200 bg-card p-1">
                      {([
                        { key: 'pestana' as EnlaceTopbarModo, label: 'Pestaña nueva', Ico: ExternalLink },
                        { key: 'ventana' as EnlaceTopbarModo, label: 'Ventana', Ico: AppWindow },
                        { key: 'flotante' as EnlaceTopbarModo, label: 'Flotante', Ico: PictureInPicture2 },
                      ]).map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => patch(e.id, { modo: o.key })}
                          className={clsx('flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[0.75rem] font-semibold transition-all',
                            e.modo === o.key ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:text-gray-700')}
                        >
                          <o.Ico className="h-3.5 w-3.5" /> {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* fila 3: icono · color · vista previa */}
                <div className="mt-4 grid gap-5 rounded-xl border border-gray-100 bg-card p-4 lg:grid-cols-[auto_1fr_auto]">
                  <div>
                    <Etiqueta hint={t.iconoHint}>Icono</Etiqueta>
                    <div className="grid grid-cols-7 gap-1.5">
                      {ENLACE_ICONO_KEYS.map((k) => {
                        const Ico = ENLACE_ICONOS[k]
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => patch(e.id, { icono: k })}
                            className={clsx('flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                              e.icono === k ? 'border-violet-500 bg-violet-100 text-violet-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50')}
                          >
                            <Ico className="h-4 w-4" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="lg:border-l lg:border-gray-100 lg:pl-5">
                    <Etiqueta hint={t.colorHint}>Color</Etiqueta>
                    <div className="flex flex-wrap items-center gap-2">
                      {COLORES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => patch(e.id, { color: c })}
                          className={clsx('flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-transform hover:scale-105',
                            e.color.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-transparent')}
                          style={{ backgroundColor: c }}
                        >
                          {e.color.toLowerCase() === c.toLowerCase() && <Check className="h-4 w-4 text-white" />}
                        </button>
                      ))}
                      <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 text-[0.7rem] font-semibold text-gray-500 hover:border-violet-400 hover:text-violet-600">
                        <Plus className="h-3.5 w-3.5" /> Personalizado
                        <input
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#7C3AED'}
                          onChange={(ev) => patch(e.id, { color: ev.target.value })}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="lg:border-l lg:border-gray-100 lg:pl-5">
                    <Etiqueta hint="Abre el enlace tal como se abrirá después, para revisarlo antes de guardar.">Vista previa</Etiqueta>
                    <button
                      type="button"
                      onClick={() => vistaPrevia(e)}
                      className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98]"
                    >
                      <Link2 className="h-4 w-4" /> Vista previa
                    </button>
                    <p className="mt-1.5 text-[0.66rem] text-gray-400">{t.previaNota}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={agregar}
        disabled={enlaces.length >= MAX_ENLACES}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 py-3.5 text-[0.82rem] font-semibold text-gray-500 transition-colors hover:border-violet-400 hover:text-violet-600 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" /> Agregar enlace {enlaces.length >= MAX_ENLACES && `(máximo ${MAX_ENLACES})`}
      </button>
    </div>
  )
}
