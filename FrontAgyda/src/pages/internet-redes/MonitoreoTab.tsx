import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Activity, Gauge, MonitorSmartphone, Wifi, WifiOff, Download, Upload,
  Radio, Check, Pencil, ShieldAlert, ShieldCheck, Server, RefreshCw, Info,
} from 'lucide-react'
import { internetRedesService } from '@/services/internetRedes.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import type { DispositivoRed } from '@/types/internetRedes.types'

const VIOLETA = '#7C3AED'
const VERDE = '#10B981'

/* Recibe segundos transcurridos calculados por el servidor (mismo reloj que la
   BD). Evita el desfase de zona horaria de parsear la fecha en el navegador. */
function haceCuanto(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || Number.isNaN(seg)) return 'nunca'
  if (seg < 60) return 'hace segundos'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

function num(n: number | null | undefined, dec = 0): string {
  return n === null || n === undefined ? '—' : n.toFixed(dec)
}

/* ── Tarjeta KPI: pill de color a la izquierda, label + valor a la derecha ── */
function Kpi({ icon: Icon, label, value, sub, tono = 'violet' }: {
  icon: typeof Activity; label: string; value: React.ReactNode; sub?: string
  tono?: 'emerald' | 'red' | 'amber' | 'violet'
}) {
  const tonos: Record<string, { pill: string; icon: string; val: string }> = {
    emerald: { pill: 'bg-emerald-100', icon: 'text-emerald-600', val: 'text-emerald-600' },
    red:     { pill: 'bg-red-100',     icon: 'text-red-500',     val: 'text-red-500' },
    amber:   { pill: 'bg-amber-100',   icon: 'text-amber-600',   val: 'text-amber-600' },
    violet:  { pill: 'bg-violet-100',  icon: 'text-violet-600',  val: 'text-violet-600' },
  }
  const t = tonos[tono]
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className={clsx('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl', t.pill)}>
        <Icon className={clsx('h-5 w-5', t.icon)} />
      </div>
      <div className="min-w-0">
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={clsx('mt-0.5 text-[1.35rem] font-black leading-tight tabular-nums', t.val)}>{value}</p>
        {sub && <p className="text-[0.68rem] text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

/* ── Panel de gráfica con título+icono violeta y selector de agregación ── */
function GraficaPanel({ titulo, nota, leyenda, agregacion, onAgregacion, children }: {
  titulo: string
  nota?: string
  leyenda?: React.ReactNode
  agregacion: 'promedio' | 'max' | 'min'
  onAgregacion: (a: 'promedio' | 'max' | 'min') => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-violet-600" />
          <h3 className="text-[0.9rem] font-bold text-gray-900">{titulo}</h3>
          {nota && (
            <span className="ml-1 flex items-center gap-1 text-[0.68rem] text-gray-400">
              <Info className="h-3 w-3" /> {nota}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {leyenda}
          <select
            value={agregacion}
            onChange={(e) => onAgregacion(e.target.value as 'promedio' | 'max' | 'min')}
            className="rounded-lg border border-gray-200 bg-card px-2.5 py-1 text-[0.72rem] font-semibold text-gray-600 outline-none focus:border-violet-400"
          >
            <option value="promedio">Promedio</option>
            <option value="max">Máximo</option>
            <option value="min">Mínimo</option>
          </select>
        </div>
      </div>
      <div className="h-60">{children}</div>
    </div>
  )
}

/* Tooltip de recharts con la tarjeta blanca flotante de la imagen 2 */
function TooltipRed({ active, payload, label, unidad, series }: {
  active?: boolean
  payload?: { value: number | null; name: string; color: string }[]
  label?: string
  unidad: string
  series?: { key: string; label: string }[]
}) {
  if (!active || !payload?.length) return null
  const filas = series
    ? series.map((s) => payload.find((p) => p.name === s.label)).filter(Boolean)
    : payload
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg">
      {(filas as { value: number | null; name: string; color: string }[]).map((p) => (
        <p key={p.name} className="flex items-baseline gap-1.5 text-[0.82rem] font-bold text-gray-900">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.value ?? '—'}<span className="text-[0.68rem] font-semibold text-gray-400">{unidad}</span>
        </p>
      ))}
      <p className="mt-0.5 text-[0.68rem] text-gray-400">{label}</p>
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
      <td className="px-4 py-2.5 text-gray-400">{haceCuanto(d.vistoHaceSeg)}</td>
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
  const [bajando, setBajando] = useState<'ps1' | 'bat' | null>(null)

  const bajar = async (formato: 'ps1' | 'bat') => {
    setBajando(formato)
    try {
      await internetRedesService.descargarAgente({
        formato,
        enlaceId: enlaceId === '' ? undefined : Number(enlaceId),
      })
      toast.success(formato === 'bat'
        ? 'Instalador .bat descargado — doble-click en la PC de la oficina (pedirá permisos de admin)'
        : 'Instalador .ps1 descargado — click derecho → Ejecutar con PowerShell (Administrador)')
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
          onClick={() => bajar('bat')}
          disabled={bajando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {bajando === 'bat' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Descargar instalador (.bat)
        </button>
        <button
          onClick={() => bajar('ps1')}
          disabled={bajando !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {bajando === 'ps1' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Script (.ps1)
        </button>
      </div>
      <p className="mt-2 text-[0.66rem] text-gray-400">
        El <b>.bat</b>: doble-click, pide permisos de administrador solo. El <b>.ps1</b>: click derecho
        → «Ejecutar con PowerShell» (como Administrador). Ambos registran una tarea que reporta cada 2 min.
      </p>
    </div>
  )
}

type Agregacion = 'promedio' | 'max' | 'min'

/* Agrupa la serie en ~48 buckets y aplica la agregación elegida. Para rangos
   cortos con pocos puntos, devuelve los puntos tal cual. */
function agregarSerie(
  puntos: { t: string; lat: number | null; down: number | null; up: number | null }[],
  modo: Agregacion,
) {
  if (puntos.length <= 60) return puntos
  const BUCKETS = 48
  const tam = Math.ceil(puntos.length / BUCKETS)
  const out: typeof puntos = []
  const agg = (vals: (number | null)[]) => {
    const n = vals.filter((v): v is number => v != null)
    if (!n.length) return null
    if (modo === 'max') return Math.max(...n)
    if (modo === 'min') return Math.min(...n)
    return Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10
  }
  for (let i = 0; i < puntos.length; i += tam) {
    const grupo = puntos.slice(i, i + tam)
    out.push({
      t: grupo[Math.floor(grupo.length / 2)].t,
      lat: agg(grupo.map((g) => g.lat)),
      down: agg(grupo.map((g) => g.down)),
      up: agg(grupo.map((g) => g.up)),
    })
  }
  return out
}

export function MonitoreoTab() {
  const editable = useIsADorTI()
  const [horas, setHoras] = useState(24)
  const [aggLat, setAggLat] = useState<Agregacion>('promedio')
  const [aggVel, setAggVel] = useState<Agregacion>('promedio')

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

  const serieBase = useMemo(
    () => mediciones.map((m) => ({
      t: m.hhmm ?? '',
      lat: m.latenciaMs,
      down: m.downMbps,
      up: m.upMbps,
    })),
    [mediciones],
  )
  const serieLat = useMemo(() => agregarSerie(serieBase, aggLat), [serieBase, aggLat])
  const serieVel = useMemo(() => agregarSerie(serieBase, aggVel), [serieBase, aggVel])

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
          <span><b>Sin conexión a internet.</b> Última lectura {haceCuanto(u.haceSeg)}.</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={online ? Wifi : WifiOff}
          label="Estado"
          value={online ? 'En línea' : 'Caído'}
          sub={u ? `Lectura ${haceCuanto(u.haceSeg)}` : undefined}
          tono={online ? 'emerald' : 'red'}
        />
        <Kpi
          icon={Activity}
          label="Latencia"
          value={<>{num(u?.latenciaMs, 0)} <span className="text-sm font-bold text-gray-400">ms</span></>}
          sub={u?.perdidaPct != null ? `Pérdida ${num(u.perdidaPct, 1)}%` : undefined}
          tono={(u?.latenciaMs ?? 0) > 120 ? 'amber' : 'violet'}
        />
        <Kpi
          icon={Gauge}
          label="Velocidad"
          value={vel && vel.downMbps != null ? (
            <span className="flex items-baseline gap-2">
              <span className="flex items-baseline gap-0.5"><Download className="h-3.5 w-3.5 text-emerald-500" />{num(vel.downMbps, 0)}</span>
              <span className="flex items-baseline gap-0.5"><Upload className="h-3.5 w-3.5 text-violet-500" />{num(vel.upMbps, 0)}</span>
              <span className="text-[0.7rem] font-bold text-gray-400">Mbps</span>
            </span>
          ) : '—'}
          sub={vel ? `Prueba ${haceCuanto(vel.haceSeg)}` : 'Sin prueba de velocidad aún'}
          tono="violet"
        />
        <Kpi
          icon={MonitorSmartphone}
          label="Dispositivos"
          value={estado?.dispositivos.online ?? 0}
          sub={`${estado?.dispositivos.total ?? 0} conectados en total`}
          tono="violet"
        />
      </div>

      {/* Rango */}
      <div className="flex items-center gap-1.5">
        {[6, 24, 72, 168].map((h) => (
          <button
            key={h}
            onClick={() => setHoras(h)}
            className={clsx('rounded-full px-3.5 py-1.5 text-[0.72rem] font-semibold transition-colors',
              horas === h ? 'bg-violet-600 text-white' : 'border border-gray-200 text-gray-500 hover:text-gray-700')}
          >
            {h < 24 ? `${h} h` : h === 24 ? '1 día' : `${h / 24} días`}
          </button>
        ))}
      </div>

      {/* Gráfica de latencia */}
      <GraficaPanel titulo="Latencia (ms)" nota="Menos es mejor" agregacion={aggLat} onAgregacion={setAggLat}>
        {serieLat.length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-gray-400">Sin datos en el rango</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieLat} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gLat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIOLETA} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={VIOLETA} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgb(var(--surface-border))" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<TooltipRed unidad="ms" />} cursor={{ stroke: VIOLETA, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="lat" name="Latencia" stroke={VIOLETA} strokeWidth={2.5}
                fill="url(#gLat)" dot={false} activeDot={{ r: 4, fill: VIOLETA, strokeWidth: 2, stroke: '#fff' }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </GraficaPanel>

      {/* Gráfica de velocidad */}
      <GraficaPanel
        titulo="Velocidad (Mbps)"
        agregacion={aggVel}
        onAgregacion={setAggVel}
        leyenda={
          <div className="flex items-center gap-3 text-[0.68rem] font-semibold">
            <span className="flex items-center gap-1 text-gray-500"><span className="h-2 w-2 rounded-full" style={{ background: VERDE }} /> Descarga</span>
            <span className="flex items-center gap-1 text-gray-500"><span className="h-2 w-2 rounded-full" style={{ background: VIOLETA }} /> Subida</span>
          </div>
        }
      >
        {serieVel.filter((s) => s.down != null).length === 0 ? (
          <p className="flex h-full items-center justify-center text-xs text-gray-400">
            Sin pruebas de velocidad en el rango
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serieVel} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VERDE} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={VERDE} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VIOLETA} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={VIOLETA} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgb(var(--surface-border))" vertical={false} />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={48} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                content={<TooltipRed unidad="Mbps" series={[{ key: 'down', label: 'Descarga (Mbps)' }, { key: 'up', label: 'Subida (Mbps)' }]} />}
                cursor={{ stroke: VIOLETA, strokeDasharray: '4 4' }}
              />
              <Legend wrapperStyle={{ display: 'none' }} />
              <Area type="monotone" dataKey="down" name="Descarga (Mbps)" stroke={VERDE} strokeWidth={2.5} fill="url(#gDown)" dot={false} connectNulls />
              <Area type="monotone" dataKey="up" name="Subida (Mbps)" stroke={VIOLETA} strokeWidth={2.5} fill="url(#gUp)" dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </GraficaPanel>

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
                      {a.vivo ? 'activo' : 'sin señal'} · {haceCuanto(a.haceSeg)}
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

      {/* Nota al pie */}
      <div className="flex items-center gap-2 rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-[0.75rem] text-gray-500">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
          <Info className="h-3.5 w-3.5" />
        </span>
        El agente reporta cada 2 minutos y esta vista se refresca sola.
      </div>
    </div>
  )
}
