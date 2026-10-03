import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2, Flame, Loader2, Pencil, Plus, Power, QrCode, Save, Smartphone, Trash2, Unplug, X } from 'lucide-react'
import { waMasivoService, type CuentaMasivo } from '@/services/waMasivo.service'

const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f
const ESTADO: Record<CuentaMasivo['estado'], { label: string; cls: string }> = {
  conectado: { label: 'Conectada', cls: 'bg-emerald-50 text-emerald-700' },
  esperando_qr: { label: 'Esperando QR', cls: 'bg-amber-50 text-amber-700' },
  desconectado: { label: 'Desconectada', cls: 'bg-gray-100 text-gray-500' },
}

// Ventana para vincular: muestra el QR y se cierra sola al conectar.
function VincularQr({ cuenta, onClose }: { cuenta: CuentaMasivo; onClose: () => void }) {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    waMasivoService.conectar(cuenta.id).catch((e) => setError(msgError(e, 'No se pudo iniciar la vinculación')))
  }, [cuenta.id])
  const { data } = useQuery({
    queryKey: ['wa-masivo-qr', cuenta.id],
    queryFn: () => waMasivoService.estadoCuenta(cuenta.id),
    refetchInterval: 2000,
    enabled: !error,
  })
  const conectada = data?.estado === 'conectado'
  useEffect(() => {
    if (!conectada) return
    qc.invalidateQueries({ queryKey: ['wa-masivo-resumen'] })
    toast.success(`${cuenta.alias} quedó vinculada${data?.numero ? ` (${data.numero})` : ''}`)
    const t = setTimeout(onClose, 1200)
    return () => clearTimeout(t)
  }, [conectada]) // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-xl" role="dialog" aria-modal="true" aria-label={`Vincular ${cuenta.alias}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">Vincular {cuenta.alias}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        {error ? (
          <p className="rounded-xl bg-red-50 p-3 text-[0.78rem] text-red-700">{error}</p>
        ) : conectada ? (
          <div className="flex flex-col items-center gap-2 py-8 text-emerald-600"><CheckCircle2 className="h-12 w-12" /><p className="font-semibold">¡Conectada!</p></div>
        ) : data?.qrDataUrl ? (
          <>
            <img src={data.qrDataUrl} alt="Código QR para vincular WhatsApp" className="mx-auto h-60 w-60 rounded-xl border border-gray-100" />
            <p className="mt-3 text-[0.75rem] text-gray-500">En el celular de esa cuenta: <b>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</b> y escanea el código.</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /><p className="text-[0.78rem]">Generando el código…</p></div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function FormCuenta({ inicial, onGuardar, onCancelar, guardando }: {
  inicial?: CuentaMasivo
  onGuardar: (d: { alias: string; topeDiario: number; calentamiento: boolean }) => void
  onCancelar: () => void
  guardando: boolean
}) {
  const [f, setF] = useState({ alias: inicial?.alias ?? '', topeDiario: inicial?.topeDiario ?? 200, calentamiento: inicial?.calentamiento ?? true })
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <label className="block">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-600">Nombre de la cuenta</span>
          <input autoFocus className="field" maxLength={80} placeholder="Ej. Masivo 1" value={f.alias} onChange={(e) => setF({ ...f, alias: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.7rem] font-semibold text-gray-600">Tope por día</span>
          <input type="number" min={1} max={5000} className="field" value={f.topeDiario} onChange={(e) => setF({ ...f, topeDiario: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>
      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-card px-2.5 py-2">
        <input type="checkbox" checked={f.calentamiento} onChange={(e) => setF({ ...f, calentamiento: e.target.checked })} className="mt-0.5 accent-violet-600" />
        <span className="text-[0.75rem] text-gray-700">
          <b>Calentamiento</b>
          <span className="block text-[0.66rem] text-gray-400">Recomendado en números nuevos: empieza con 30 mensajes al día y sube 20 cada día hasta su tope, para que WhatsApp no la marque como spam.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
        <button onClick={() => onGuardar(f)} disabled={!f.alias.trim() || guardando}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>
    </div>
  )
}

export function CuentasMasivo({ cuentas }: { cuentas: CuentaMasivo[] }) {
  const qc = useQueryClient()
  const refrescar = () => qc.invalidateQueries({ queryKey: ['wa-masivo-resumen'] })
  const [nueva, setNueva] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [qr, setQr] = useState<CuentaMasivo | null>(null)

  const crear = useMutation({
    mutationFn: waMasivoService.crearCuenta,
    onSuccess: () => { refrescar(); setNueva(false); toast.success('Cuenta agregada: ahora vincúlala con su QR') },
    onError: (e) => toast.error(msgError(e, 'No se pudo agregar')),
  })
  const editar = useMutation({
    mutationFn: (x: { c: CuentaMasivo; datos: { alias: string; topeDiario: number; calentamiento: boolean; activa?: boolean; reanudar?: boolean } }) => waMasivoService.editarCuenta(x.c.id, x.datos),
    onSuccess: () => { refrescar(); setEditando(null) },
    onError: (e) => toast.error(msgError(e, 'No se pudo guardar')),
  })
  const desconectar = useMutation({
    mutationFn: (c: CuentaMasivo) => waMasivoService.desconectar(c.id),
    onSuccess: () => { refrescar(); toast.success('Cuenta desvinculada') },
    onError: (e) => toast.error(msgError(e, 'No se pudo desvincular')),
  })
  const eliminar = useMutation({
    mutationFn: (c: CuentaMasivo) => waMasivoService.eliminarCuenta(c.id),
    onSuccess: (r) => { refrescar(); toast.success(`Cuenta eliminada${r.liberados ? ` · ${r.liberados} números liberados` : ''}`) },
    onError: (e) => toast.error(msgError(e, 'No se pudo eliminar')),
  })
  const base = (c: CuentaMasivo) => ({ alias: c.alias, topeDiario: c.topeDiario, calentamiento: c.calentamiento })
  const conectadas = cuentas.filter((c) => c.estado === 'conectado' && c.activa && !c.pausaMotivo)
  const capacidad = conectadas.reduce((n, c) => n + Math.max(0, c.topeHoy - c.enviadosHoy), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.8rem] text-gray-500">
          {cuentas.length} cuenta(s) · <b className="text-emerald-600">{conectadas.length} enviando</b> · les quedan <b>{capacidad}</b> mensajes hoy
        </p>
        {!nueva && (
          <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-[0.8rem] font-bold text-white shadow-sm hover:bg-violet-700">
            <Plus className="h-4 w-4" /> Agregar cuenta
          </button>
        )}
      </div>
      {nueva && <FormCuenta onGuardar={(d) => crear.mutate(d)} onCancelar={() => setNueva(false)} guardando={crear.isPending} />}

      {cuentas.length === 0 && !nueva ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center text-gray-400">
          <Smartphone className="h-8 w-8" />
          <p className="text-sm font-semibold text-gray-600">Aún no hay cuentas de WhatsApp para el envío masivo</p>
          <p className="max-w-md text-[0.75rem]">Usa números aparte de los del chat: si WhatsApp bloquea una cuenta de envío masivo, la atención a clientes no se ve afectada.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cuentas.map((c) => {
            const pct = c.topeHoy ? Math.min(100, (c.enviadosHoy / c.topeHoy) * 100) : 0
            return (
              <div key={c.id} className={clsx('card flex flex-col p-4', !c.activa && 'opacity-60')}>
                {editando === c.id ? (
                  <FormCuenta inicial={c} guardando={editar.isPending} onCancelar={() => setEditando(null)} onGuardar={(d) => editar.mutate({ c, datos: d })} />
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', c.estado === 'conectado' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400')}>
                        <Smartphone className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.9rem] font-bold text-gray-900">{c.alias}</p>
                        <p className="text-[0.72rem] text-gray-400">{c.numero ? `+${c.numero}` : 'Sin vincular'}</p>
                      </div>
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', ESTADO[c.estado].cls)}>{c.activa ? ESTADO[c.estado].label : 'Apagada'}</span>
                    </div>

                    {c.pausaMotivo && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-[0.72rem] text-red-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="flex-1">{c.pausaMotivo}</span>
                        <button onClick={() => editar.mutate({ c, datos: { ...base(c), reanudar: true } })} className="flex-shrink-0 font-bold underline">Reanudar</button>
                      </div>
                    )}

                    <div className="mt-3">
                      <div className="flex justify-between text-[0.7rem] text-gray-500">
                        <span>Hoy: <b className="text-gray-800">{c.enviadosHoy}</b> de {c.topeHoy}</span>
                        {c.calentamiento && c.topeHoy < c.topeDiario && <span className="flex items-center gap-1 text-amber-600"><Flame className="h-3 w-3" /> calentando (tope {c.topeDiario})</span>}
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div className={clsx('h-full rounded-full', pct >= 100 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-[0.68rem] text-gray-400">{c.numerosAsignados} número(s) atendidos por esta cuenta</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                      {c.estado !== 'conectado' ? (
                        <button onClick={() => setQr(c)} className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[0.72rem] font-bold text-white hover:bg-violet-700"><QrCode className="h-3.5 w-3.5" /> Vincular</button>
                      ) : (
                        <button onClick={() => { if (window.confirm(`¿Desvincular ${c.alias}? Para volver a usarla habrá que escanear el QR de nuevo.`)) desconectar.mutate(c) }}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50"><Unplug className="h-3.5 w-3.5" /> Desvincular</button>
                      )}
                      <button onClick={() => editar.mutate({ c, datos: { ...base(c), activa: !c.activa } })}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50"><Power className="h-3.5 w-3.5" /> {c.activa ? 'Apagar' : 'Encender'}</button>
                      <button onClick={() => setEditando(c.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar" aria-label={`Editar ${c.alias}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (window.confirm(`¿Eliminar ${c.alias}? Sus ${c.numerosAsignados} números quedarán libres para otra cuenta y sus cadenas a medias se detienen.`)) eliminar.mutate(c) }}
                        className="ml-auto rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" title="Eliminar" aria-label={`Eliminar ${c.alias}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      {qr && <VincularQr cuenta={qr} onClose={() => { setQr(null); refrescar() }} />}
    </div>
  )
}
