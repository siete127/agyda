import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Check, Loader2, PictureInPicture2, HelpCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { personalizacionService, type EnlaceTopbar } from '@/services/personalizacion.service'
import { EnlacesEditor } from '@/components/enlaces/EnlacesEditor'
import { hayEnlacesInvalidos } from '@/components/enlaces/enlaces.utils'

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
                Cada uno abre su <b className="text-gray-500">URL</b> en una <b className="text-gray-500">pestaña nueva</b>, en una
                <b className="text-gray-500"> ventana</b> pequeña al costado, o en un panel flotante que sigue visible al navegar.
              </p>
            </div>
          </div>
          <HeaderMockup />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-violet-50/70 px-3.5 py-3 text-[0.78rem] text-gray-500">
          <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
          <p>
            Algunos sitios (Google, bancos, azul.ardabytec.vip, etc.) bloquean ser mostrados dentro de un iframe (X-Frame-Options).<br />
            Para esos usa <b className="text-gray-600">"Pestaña nueva"</b> o <b className="text-gray-600">"Ventana"</b> (esta última
            se puede dejar al costado para ver AGYDA y el sitio al mismo tiempo). El modo flotante solo funciona con
            paneles embebibles que lo permiten (Spotify, dashboards propios, VICIdial…).
          </p>
        </div>
        <p className="mt-3 text-[0.72rem] text-gray-400">
          Estos enlaces son de toda la empresa. Cada usuario puede además tener sus propios enlaces en la tarjeta «Mis enlaces» del inicio.
        </p>
      </div>

      {/* ── Lista de enlaces ── */}
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <p className="mb-3 text-[0.72rem] font-bold uppercase tracking-wide text-violet-600">Enlace{form.length !== 1 ? 's' : ''}</p>
        <EnlacesEditor enlaces={form} onChange={setForm} donde="encabezado" />
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
          disabled={guardar.isPending || hayEnlacesInvalidos(form)}
          className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50"
        >
          {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </button>
      </div>
    </div>
  )
}
