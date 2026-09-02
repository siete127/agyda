import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Link2, Plus, Trash2, Check, Loader2, ExternalLink, PictureInPicture2,
  GripVertical, HelpCircle, ArrowUp, ArrowDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  personalizacionService,
  type EnlaceTopbar, type EnlaceTopbarModo,
} from '@/services/personalizacion.service'
import { useEnlaceFrameStore } from '@/stores/enlaceFrame.store'
import { ENLACE_ICONOS, ENLACE_ICONO_KEYS } from '@/lib/enlaceTopbarIconos'

const COLORES = ['#7C3AED', '#DC2626', '#059669', '#0891B2', '#D97706', '#8B5CF6', '#2563EB', '#DB2777', '#475569']

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

/* ── Ilustración de mockup del encabezado ── */
function HeaderMockup() {
  return (
    <div className="relative hidden w-72 flex-shrink-0 lg:block">
      <div className="absolute -right-2 -top-3 text-violet-300">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <path d="M17 4v6M17 24v6M4 17h6M24 17h6M8 8l4 4M22 22l4 4M26 8l-4 4M12 22l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-card p-2.5 shadow-sm">
        <div className="mb-2 flex gap-1 px-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 flex-1 rounded-md bg-gray-100" />
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-500">
            <Link2 className="h-3.5 w-3.5" />
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 text-violet-400">
            <PictureInPicture2 className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-2 w-full rounded bg-gray-100" />
          <div className="ml-6 h-6 w-40 rounded-lg bg-violet-50" />
        </div>
      </div>
    </div>
  )
}

export function EnlacesTopbarTab() {
  const qc = useQueryClient()
  const abrirFlotante = useEnlaceFrameStore((s) => s.abrir)
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  // El form solo se siembra una vez desde el servidor (o al descartar/guardar) —
  // un refetch de react-query NO debe pisar las ediciones locales.
  const [form, setForm] = useState<EnlaceTopbar[] | null>(null)
  const [sembrado, setSembrado] = useState(false)
  if (data && !sembrado) {
    setSembrado(true)
    setForm(data.enlacesTopbar)
  }
  const resembrar = () => data && setForm(data.enlacesTopbar)

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
      if (!form) return [] as EnlaceTopbar[]
      return personalizacionService.updateEnlacesTopbar(form)
    },
    onSuccess: (guardados) => {
      setForm(guardados)
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

  const vistaPrevia = (e: EnlaceTopbar) => {
    if (!/^https?:\/\//i.test(e.url.trim())) { toast.error('Escribe una URL válida primero'); return }
    if (e.modo === 'flotante') abrirFlotante({ id: e.id, label: e.label || 'Enlace', url: e.url, color: e.color })
    else window.open(e.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      {/* ── Encabezado con ilustración ── */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <Link2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[1.35rem] font-bold text-gray-900">Enlaces del encabezado</h2>
              <p className="text-[0.82rem] leading-relaxed text-gray-400">
                Botones extra en la barra superior, junto a Marcador y Contingencia.<br />
                Cada uno abre su <b className="text-gray-500">URL</b> en una <b className="text-gray-500">pestaña nueva</b> o en un
                panel flotante que sigue visible al navegar.
              </p>
            </div>
          </div>
          <HeaderMockup />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-violet-50/70 px-3.5 py-3 text-[0.78rem] text-gray-500">
          <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
          <p>
            Algunos sitios (Google, bancos, etc.) bloquean ser mostrados dentro de un iframe (X-Frame-Options).<br />
            Para esos usa el modo <b className="text-gray-600">"Pestaña nueva"</b>. El modo flotante funciona con
            paneles embebibles (Spotify, dashboards propios, VICIdial…).
          </p>
        </div>
      </div>

      {/* ── Lista de enlaces ── */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-wide text-violet-600">Enlace{form.length !== 1 ? 's' : ''}</p>

        {form.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-12 text-center text-[0.82rem] text-gray-400">
            Aún no hay enlaces. Agrega el primero abajo.
          </div>
        ) : (
          <div className="space-y-4">
            {form.map((e, i) => {
              const Icon = ENLACE_ICONOS[e.icono] ?? ENLACE_ICONOS.link
              const urlMala = e.url.trim() !== '' && !/^https?:\/\//i.test(e.url.trim())
              return (
                <div key={e.id} className={clsx('rounded-2xl border border-gray-100 bg-gray-50/40 p-4', !e.visible && 'opacity-60')}>
                  {/* fila 1: orden · preview · nombre · visible · eliminar */}
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex flex-col items-center pt-6 text-gray-300">
                      <button onClick={() => mover(i, -1)} disabled={i === 0} className="hover:text-gray-500 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <GripVertical className="h-3.5 w-3.5 text-gray-200" />
                      <button onClick={() => mover(i, 1)} disabled={i === form.length - 1} className="hover:text-gray-500 disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-shrink-0 items-center pt-4">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                        style={{ backgroundColor: e.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="min-w-[10rem] flex-1">
                      <Etiqueta hint="El texto que se muestra al pasar el mouse sobre el botón en el encabezado.">Nombre del botón</Etiqueta>
                      <input
                        value={e.label}
                        onChange={(ev) => patch(e.id, { label: ev.target.value })}
                        placeholder="Ej. Dashboard Ventas"
                        className="w-full rounded-lg border border-gray-200 bg-card px-3 py-2 text-[0.85rem] text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15"
                      />
                    </div>

                    <div className="flex flex-shrink-0 flex-col items-center pt-1.5">
                      <Etiqueta hint="Si está apagado, el botón no se muestra en el encabezado pero se conserva aquí.">Visible</Etiqueta>
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
                      <Etiqueta hint="Dirección completa a la que lleva el botón. Debe empezar con http:// o https://.">URL</Etiqueta>
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                        <input
                          value={e.url}
                          onChange={(ev) => patch(e.id, { url: ev.target.value })}
                          placeholder="https://ejemplo.com/dashboard"
                          className={clsx('w-full rounded-lg border bg-card py-2 pl-9 pr-3 text-[0.8rem] font-mono outline-none focus:ring-2 focus:ring-violet-500/15',
                            urlMala ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-500')}
                        />
                      </div>
                      {urlMala && <p className="mt-1 pl-1 text-[0.68rem] text-red-500">La URL debe empezar con http:// o https://</p>}
                    </div>

                    <div>
                      <Etiqueta hint="Pestaña nueva: abre la URL fuera del sistema. Flotante: la muestra en un panel embebido que sigue visible al navegar.">Modo de apertura</Etiqueta>
                      <div className="flex gap-2 rounded-lg border border-gray-200 bg-card p-1">
                        {([
                          { key: 'pestana' as EnlaceTopbarModo, label: 'Pestaña nueva', Ico: ExternalLink },
                          { key: 'flotante' as EnlaceTopbarModo, label: 'Flotante', Ico: PictureInPicture2 },
                        ]).map((o) => (
                          <button
                            key={o.key}
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
                      <Etiqueta hint="Se muestra dentro del botón redondo en el encabezado.">Icono</Etiqueta>
                      <div className="grid grid-cols-7 gap-1.5">
                        {ENLACE_ICONO_KEYS.map((k) => {
                          const Ico = ENLACE_ICONOS[k]
                          return (
                            <button
                              key={k}
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
                      <Etiqueta hint="Color de fondo del botón en el encabezado.">Color</Etiqueta>
                      <div className="flex flex-wrap items-center gap-2">
                        {COLORES.map((c) => (
                          <button
                            key={c}
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
                      <Etiqueta hint="Abre el enlace tal como lo hará el botón, para revisarlo antes de guardar.">Vista previa</Etiqueta>
                      <button
                        type="button"
                        onClick={() => vistaPrevia(e)}
                        className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98]"
                      >
                        <Link2 className="h-4 w-4" /> Vista previa
                      </button>
                      <p className="mt-1.5 text-[0.66rem] text-gray-400">Así se verá en el encabezado</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={agregar}
          disabled={form.length >= 12}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 py-3.5 text-[0.82rem] font-semibold text-gray-500 transition-colors hover:border-violet-400 hover:text-violet-600 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> Agregar enlace
        </button>
      </div>

      {/* ── Footer de acciones ── */}
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-gray-100 bg-card px-5 py-4 shadow-card">
        <button
          onClick={resembrar}
          className="rounded-xl px-4 py-2.5 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100"
        >
          Descartar cambios
        </button>
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || hayInvalidos}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50"
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </button>
      </div>
    </div>
  )
}
