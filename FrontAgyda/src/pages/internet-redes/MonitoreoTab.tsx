import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Activity, Gauge, MonitorSmartphone, Wifi, WifiOff, Download, Upload,
  Radio, Check, Pencil, ShieldAlert, ShieldCheck, Server, RefreshCw,
} from 'lucide-react'
import { internetRedesService } from '@/services/internetRedes.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import type { DispositivoRed } from '@/types/internetRedes.types'

function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'hace segundos'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function fmtHora(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function num(n: number | null | undefined, dec = 0): string {
  return n === null || n === undefined ? '—' : n.toFixed(dec)
}

/* ── Tarjeta KPI ── */
function Kpi({ icon: Icon, label, value, sub, tono = 'brand' }: {
  icon: typeof Activity; label: string; value: React.ReactNode; sub?: string
  tono?: 'brand' | 'emerald' | 'red' | 'amber' | 'violet'
}) {
  const tonos: Record<string, string> = {
    brand: 'text-brand', emerald: 'text-emerald-500', red: 'text-red-500',
    amber: 'text-amber-500', violet: 'text-violet-500',
  }
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <Icon className={clsx('h-4 w-4', tonos[tono])} />
      </div>
      <p className={clsx('text-2xl font-black tabular-nums', tonos[tono])}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.68rem] text-gray-400">{sub}</p>}
    </div>
  )
}

/* ── Fila de dispositivo con edición de alias ── */
function DispRow({ d, editable }: { d: DispositivoRed; editable: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [alias, setAlias] = useState(d.alias ?? '')

  const guardar = useMutation({
    mutationFn: (payload: { alias?: string; bloqueado?: boolean }) =>
      internetRedesService.actualizarDispositivo(d.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['red-dispositivos'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <tr className={clsx('border-b border-gray-50 last:border-0 hover:bg-gray-50/60', d.bloqueado && 'bg-red-50/40')}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={clsx('h-2 w-2 flex-shrink-0 rounded-full', d.online ? 'bg-emerald-500' : 'bg-gray-300')} />
          {editando ? (
            <span className="flex items-center gap-1">
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={d.hostname ?? d.mac}
                className="w-32 rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                autoFocus
              />
              <button onClick={() => guardar.mutate({ alias })} className="text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span className="font-medium text-gray-900">
              {d.alias || d.hostname || <span className="font-mono text-gray-500">{d.mac}</span>}
              {editable && (
                <button onClick={() => setEditando(true)} className="ml-1.5 text-gray-300 hover:text-brand">
                  <Pencil className="inline h-3 w-3" />
                </button>
              )}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-gray-600">{d.ip ?? '—'}</td>
      <td className="px-4 py-2.5 font-mono text-[0.7rem] text-gray-400">{d.mac}</td>
      <td className="px-4 py-2.5 text-gray-500">{d.fabricante ?? '—'}</td>
      <td className="px-4 py-2.5">
        {d.origen === 'router' ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[0.62rem] font-semibold text-emerald-600">router</span>
        ) : (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.62rem] font-semibold text-gray-400">arp</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-400">{haceCuanto(d.ultimaVez)}</td>
      <td className="px-4 py-2.5 text-right">
        {editable && (
          <button
            onClick={() => guardar.mutate({ bloqueado: !d.bloqueado })}
            className={clsx('inline-flex items-center gap-1 text-[0.7rem] font-semibold', d.bloqueado ? 'text-red-500' : 'text-gray-400 hover:text-red-500')}
            title={d.bloqueado ? 'Marcado como no autorizado' : 'Marcar como no autorizado'}
          >
            {d.bloqueado ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          </button>
        )}
      </td>
    </tr>
  )
}

/* Descarga del agente PRECONFIGURADO para la empresa (API key + empresa ya
   embebidas). El admin solo elige el enlace y baja el .ps1 o el .exe. */
function InstalarAgente({ enlaces = [] }: { enlaces?: { id: number; nombre: string }[] }) {
  const [enlaceId, setEnlaceId] = useState<number | ''>(enlaces[0]?.id ?? '')
  const [bajando, setBajando] = useState<'ps1' | 'exe' | null>(null)

  const bajar = async (formato: 'ps1' | 'exe') => {
    setBajando(formato)
    try {
      await internetRedesService.descargarAgente({
        formato,
        enlaceId: enlaceId === '' ? undefined : Number(enlaceId),
      })
      toast.success(formato === 'exe'
        ? 'Ejecutable descargado — córrelo como Administrador en la PC de la oficina'
        : 'Instalador descargado — click derecho → Ejecutar con PowerShell (Administrador)')
    } catch {
      toast.error('No se pudo generar el instalador')
    } finally {
      setBajando(null)
    }
  }

  return (
    <div className="mt-2 w-full max-w-lg rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-left">
      <p className="mb-1 text-[0.78rem] font-semibold text-gray-700">Descargar el agente</p>
      <p className="mb-3 text-[0.7rem] text-gray-400">
        Ya viene configurado para tu empresa. Descárgalo, cópialo a una PC Windows de la oficina
        (siempre encendida) y ejecútalo <b>como Administrador</b>.
      </p>

      {enlaces.length > 0 && (
        <label className="mb-3 block">
          <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
            Asociar al enlace
          </span>
          <select
            value={enlaceId}
            onChange={(e) => setEnlaceId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full rounded-lg border border-gray-200 bg-card px-2.5 py-1.5 text-[0.8rem]"
          >
            <option value="">Sin asociar (genérico)</option>
            {enlaces.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => bajar('ps1')}
          disabled={bajando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {bajando === 'ps1' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Descargar instalador (.ps1)
        </button>
        <button
          onClick={() => bajar('exe')}
          disabled={bajando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {bajando === 'exe' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Ejecutable (.exe)
        </button>
      </div>
      <p className="mt-2 text-[0.66rem] text-gray-400">
        El .ps1: click derecho → «Ejecutar con PowerShell». El .exe: doble-click.
        Ambos registran una tarea que reporta cada 2 minutos.
      </p>
    </div>
  )
}

export function MonitoreoTab() {
  const editable = useIsADorTI()
  const [horas, setHoras] = useState(24)

  const { data: estado, isLoading: loadingEstado } = useQuery({
    queryKey: ['red-estado-actual'],
    queryFn: () => internetRedesService.getEstadoActual(),
    refetchInterval: 30_000,
  })

  const { data: mediciones = [] } = useQuery({
    queryKey: ['red-mediciones', horas],
    queryFn: () => internetRedesService.getMediciones({ horas }),
    refetchInterval: 60_000,
  })

  const { data: dispositivos = [] } = useQuery({
    queryKey: ['red-dispositivos'],
    queryFn: () => internetRedesService.getDispositivos(),
    refetchInterval: 45_000,
  })

  const serie = useMemo(
    () => mediciones.map((m) => ({
      t: fmtHora(m.fecha),
      lat: m.latenciaMs,
      down: m.downMbps,
      up: m.upMbps,
      online: m.online ? 1 : 0,
    })),
    [mediciones],
  )

  if (loadingEstado) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const u = estado?.ultima
  const vel = estado?.ultimaVelocidad
  const online = u?.online ?? false
  const hayAgente = (estado?.agentes.length ?? 0) > 0
  const enlaces = estado?.enlaces ?? []

  if (!hayAgente && !u) {
    return (
      <div className="card flex flex-col items-center gap-3 py-16 text-center">
        <Radio className="h-9 w-9 text-gray-300" />
        <div>
          <p className="text-sm font-semibold text-gray-700">Esperando datos del agente de monitoreo</p>
          <p className="mt-1 max-w-md text-xs text-gray-400">
            Instala el agente en una PC de la oficina (siempre encendida) para que reporte el estado de
            la red cada 2 minutos.
          </p>
        </div>
        {editable ? <InstalarAgente enlaces={enlaces} /> : (
          <p className="text-xs text-gray-400">Un administrador de TI puede descargar el agente.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Banner de caída */}
      {!online && u && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span><b>Sin conexión a internet.</b> Última lectura {haceCuanto(u.fecha)}.</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={online ? Wifi : WifiOff}
          label="Estado"
          value={online ? 'En línea' : 'Caído'}
          sub={u ? `Lectura ${haceCuanto(u.fecha)}` : undefined}
          tono={online ? 'emerald' : 'red'}
        />
        <Kpi
          icon={Activity}
          label="Latencia"
          value={`${num(u?.latenciaMs, 0)} ms`}
          sub={u?.perdidaPct != null ? `Pérdida ${num(u.perdidaPct, 1)}%` : undefined}
          tono={(u?.latenciaMs ?? 0) > 120 ? 'amber' : 'brand'}
        />
        <Kpi
          icon={Gauge}
          label="Velocidad"
          value={<span className="flex items-baseline gap-1">
            <Download className="h-3.5 w-3.5" />{num(vel?.downMbps, 0)}
            <Upload className="ml-1.5 h-3.5 w-3.5" />{num(vel?.upMbps, 0)}
            <span className="text-xs font-semibold text-gray-400">Mbps</span>
          </span>}
          sub={vel ? `Prueba ${haceCuanto(vel.fecha)}` : 'Sin prueba de velocidad aún'}
          tono="violet"
        />
        <Kpi
          icon={MonitorSmartphone}
          label="Dispositivos"
          value={estado?.dispositivos.online ?? 0}
          sub={`${estado?.dispositivos.total ?? 0} conocidos en total`}
          tono="brand"
        />
      </div>

      {/* Rango */}
      <div className="flex items-center gap-1.5">
        {[6, 24, 72, 168].map((h) => (
          <button
            key={h}
            onClick={() => setHoras(h)}
            className={clsx('rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold transition-colors',
              horas === h ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-700')}
          >
            {h < 24 ? `${h} h` : h === 24 ? '1 día' : `${h / 24} días`}
          </button>
        ))}
      </div>

      {/* Gráfica de latencia */}
      <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-[0.85rem] font-bold text-gray-900">Latencia (ms)</h3>
        <div className="h-56">
          {serie.length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-gray-400">Sin datos en el rango</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="lat" name="Latencia" stroke="#2F6FED" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gráfica de velocidad */}
      <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-[0.85rem] font-bold text-gray-900">Velocidad (Mbps)</h3>
        <div className="h-56">
          {serie.filter((s) => s.down != null).length === 0 ? (
            <p className="flex h-full items-center justify-center text-xs text-gray-400">
              Sin pruebas de velocidad en el rango
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="down" name="Bajada" stroke="#10B981" fill="#10B98122" strokeWidth={2} connectNulls />
                <Area type="monotone" dataKey="up" name="Subida" stroke="#8B5CF6" fill="#8B5CF622" strokeWidth={2} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Agentes */}
      {(estado?.agentes.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
          <h3 className="mb-2 flex items-center gap-1.5 text-[0.85rem] font-bold text-gray-900">
            <Server className="h-4 w-4 text-gray-400" /> Agentes de monitoreo
          </h3>
          <div className="flex flex-col gap-2">
            {estado!.agentes.map((a) => {
              const rEstado = a.routerEstado
              const rDesc =
                rEstado === 'ok'
                  ? `Router: ${a.routerMarca ?? 'detectado'}${a.routerModelo ? ` (${a.routerModelo})` : ''} · vía ${a.routerMetodo ?? '—'}`
                  : rEstado === 'sin-acceso'
                    ? `Router: sin acceso${a.routerMarca ? ` (${a.routerMarca}?)` : ''} — usando ARP local`
                    : rEstado === 'deshabilitado'
                      ? 'Router: lectura DHCP desactivada'
                      : rEstado === 'sin-gateway'
                        ? 'Router: sin gateway'
                        : rEstado
                          ? `Router: ${rEstado}`
                          : null
              return (
                <div key={a.id} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={clsx('h-2 w-2 rounded-full', a.vivo ? 'bg-emerald-500' : 'bg-red-400')} />
                    <span className="font-semibold text-gray-700">{a.nombre}</span>
                    <span className="text-gray-400">
                      {a.vivo ? 'activo' : 'sin señal'} · {haceCuanto(a.ultimaSenal)}
                      {a.version && ` · v${a.version}`}
                    </span>
                  </div>
                  {rDesc && (
                    <p className={clsx('mt-1 pl-4 text-[0.68rem]', rEstado === 'ok' ? 'text-emerald-600' : 'text-gray-400')}>
                      {rDesc}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {editable && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.72rem] font-semibold text-brand">Instalar otro agente</summary>
              <div className="mt-2"><InstalarAgente enlaces={enlaces} /></div>
            </details>
          )}
        </div>
      )}

      {/* Dispositivos */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-[0.85rem] font-bold text-gray-900">
            <MonitorSmartphone className="h-4 w-4 text-gray-400" /> Dispositivos en la red
          </h3>
          <span className="flex items-center gap-1 text-[0.7rem] text-gray-400">
            <RefreshCw className="h-3 w-3" /> auto
          </span>
        </div>
        {dispositivos.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-400">Aún no se han detectado dispositivos</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">Nombre</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                  <th className="px-4 py-2.5 font-semibold">MAC</th>
                  <th className="px-4 py-2.5 font-semibold">Fabricante</th>
                  <th className="px-4 py-2.5 font-semibold">Origen</th>
                  <th className="px-4 py-2.5 font-semibold">Visto</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {dispositivos.map((d) => <DispRow key={d.id} d={d} editable={editable} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
