import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { AlertTriangle, Loader2, Megaphone, Plus, Send, ShieldAlert, Smartphone } from 'lucide-react'
import { useActionAccess } from '@/hooks/useActionAccess'
import { waMasivoService } from '@/services/waMasivo.service'
import { CuentasMasivo } from './CuentasMasivo'
import { CampaniaMasivo } from './CampaniaMasivo'
import { ESTADO_CAMPANIA } from './waMasivoUi'

const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f

/**
 * WhatsApp masivo (solo envío): varias cuentas de WhatsApp se turnan para
 * mandar una cadena de mensajes (texto, imagen, video o documento, con espera
 * entre cada uno) a una lista de números de Excel o capturada a mano. Cada
 * número sigue siempre con la cuenta que le escribió primero.
 */
export function WaMasivoPage() {
  const { can, isLoading: cargandoPermisos } = useActionAccess()
  const permitido = can('contact-center', 'whatsapp-masivo')
  const qc = useQueryClient()
  const [pestana, setPestana] = useState<'campanias' | 'cuentas'>('campanias')
  const [abierta, setAbierta] = useState<number | null>(null)
  const [nueva, setNueva] = useState<string | null>(null)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['wa-masivo-resumen'],
    queryFn: waMasivoService.resumen,
    enabled: permitido,
    refetchInterval: 10_000,
  })
  const crear = useMutation({
    mutationFn: (nombre: string) => waMasivoService.crearCampania(nombre),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['wa-masivo-resumen'] }); setNueva(null); setAbierta(r.id) },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear la campaña')),
  })

  if (cargandoPermisos) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
  if (!permitido) {
    return (
      <div className="card mx-auto mt-10 flex max-w-lg flex-col items-center gap-2 p-8 text-center">
        <ShieldAlert className="h-8 w-8 text-amber-500" />
        <p className="font-semibold text-gray-800">No tienes acceso a WhatsApp masivo</p>
        <p className="text-[0.8rem] text-gray-500">Pídelo en Accesos → Contact Center → "WhatsApp masivo".</p>
      </div>
    )
  }

  const cuentas = data?.cuentas ?? []
  const campanias = data?.campanias ?? []
  const enviando = cuentas.filter((c) => c.estado === 'conectado' && c.activa && !c.pausaMotivo).length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
          <Send className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">WhatsApp masivo</h1>
          <p className="text-[0.85rem] text-gray-400">Solo envío: varias cuentas se turnan para mandar una cadena de mensajes; cada número sigue siempre con la misma cuenta</p>
        </div>
        {abierta === null && (
          <div className="flex rounded-xl border border-gray-200 bg-gray-50/60 p-1" role="tablist" aria-label="Sección">
            {([['campanias', 'Campañas', Megaphone, campanias.length], ['cuentas', 'Cuentas', Smartphone, `${enviando}/${cuentas.length}`]] as const).map(([k, l, Icon, n]) => (
              <button key={k} role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
                className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold transition',
                  pestana === k ? 'bg-card text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                <Icon className="h-4 w-4" /> {l} <span className="rounded-full bg-gray-100 px-1.5 text-[0.65rem] text-gray-500">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isError ? (
        <div className="card flex items-center gap-2 p-5 text-[0.82rem] text-red-700"><AlertTriangle className="h-4 w-4" /> {msgError(error, 'No se pudo cargar WhatsApp masivo')}</div>
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
      ) : abierta !== null ? (
        <CampaniaMasivo id={abierta} cuentasEnviando={enviando} onVolver={() => setAbierta(null)} />
      ) : pestana === 'cuentas' ? (
        <CuentasMasivo cuentas={cuentas} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.8rem] text-gray-500">
              {enviando ? <><b className="text-emerald-600">{enviando} cuenta(s)</b> conectada(s) para enviar</> : <span className="text-amber-600">Ninguna cuenta conectada: vincúlalas en la pestaña Cuentas</span>}
            </p>
            {nueva === null ? (
              <button onClick={() => setNueva('')} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[0.8rem] font-bold text-white shadow-sm hover:bg-violet-700">
                <Plus className="h-4 w-4" /> Nueva campaña
              </button>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (nueva.trim()) crear.mutate(nueva.trim()) }} className="flex gap-2">
                <input autoFocus value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nombre de la campaña" maxLength={150} className="field w-64" />
                <button type="submit" disabled={!nueva.trim() || crear.isPending} className="rounded-xl bg-violet-600 px-3.5 py-2 text-[0.8rem] font-bold text-white hover:bg-violet-700 disabled:opacity-50">Crear</button>
                <button type="button" onClick={() => setNueva(null)} className="rounded-xl px-3 py-2 text-[0.8rem] font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
              </form>
            )}
          </div>

          {campanias.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center text-gray-400">
              <Megaphone className="h-8 w-8" />
              <p className="text-sm font-semibold text-gray-600">Aún no hay campañas</p>
              <p className="max-w-md text-[0.75rem]">Arma la cadena de mensajes, sube los números y elige el horario; las cuentas conectadas se turnan para enviar.</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-[0.82rem]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-[0.66rem] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Campaña</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3 text-right">Mensajes</th>
                    <th className="min-w-[12rem] px-3 py-3">Avance</th><th className="px-3 py-3">Creada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campanias.map((c) => {
                    const hechos = c.completados + c.noEnviados
                    const pct = c.total ? Math.round((hechos / c.total) * 100) : 0
                    return (
                      <tr key={c.id} onClick={() => setAbierta(c.id)} className="cursor-pointer transition-colors hover:bg-violet-50/30">
                        <td className="px-4 py-3 font-semibold text-gray-900">{c.nombre}</td>
                        <td className="px-3 py-3"><span className={clsx('rounded-full px-2 py-0.5 text-[0.66rem] font-bold', ESTADO_CAMPANIA[c.estado].cls)}>{ESTADO_CAMPANIA[c.estado].label}</span></td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-600">{c.pasos}</td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                            <span className="w-28 text-right text-[0.72rem] tabular-nums text-gray-500">{c.completados}/{c.total}{c.noEnviados ? ` · ${c.noEnviados} no` : ''}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[0.75rem] text-gray-400">{new Date(c.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
