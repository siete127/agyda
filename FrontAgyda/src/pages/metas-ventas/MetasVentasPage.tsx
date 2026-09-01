import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Target, Plus, Trash2, User, Users, X, CalendarDays, Calendar, Megaphone,
  Save, ChevronDown, TrendingUp, MoreVertical, BarChart3, Info, CheckCircle2,
} from 'lucide-react'
import { ventasAreaService } from '@/services/ventasArea.service'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { MetaVenta, MetaTipo, MetaAlcance } from '@/services/ventasArea.service'

/* Ilustración de montaña + bandera para el banner motivacional. */
function MontanaSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 90" fill="none" className={className} aria-hidden>
      <path d="M0 90 L55 34 L92 62 L128 22 L170 58 L220 30 L220 90 Z" fill="currentColor" opacity="0.18" />
      <path d="M40 90 L95 40 L135 70 L180 44 L220 66 L220 90 Z" fill="currentColor" opacity="0.28" />
      <path d="M128 22 L128 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <path d="M128 7 L142 12 L128 17 Z" fill="currentColor" opacity="0.9" />
      <path d="M60 78 C90 60 110 40 128 22" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" opacity="0.5" />
      <circle cx="60" cy="78" r="3" fill="currentColor" opacity="0.7" />
      <path d="M22 20 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="currentColor" opacity="0.4" />
      <path d="M195 14 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 Z" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

function hoyMes() {
  return new Date().toISOString().slice(0, 7)
}
function hoyDia() {
  return new Date().toISOString().slice(0, 10)
}

/* Un KPI: tile de icono coloreado + número grande + etiqueta. */
function MetaKpi({ icon: Icon, valor, label, tile, texto }: {
  icon: typeof Target; valor: React.ReactNode; label: string; tile: string; texto: string
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={clsx('flex h-11 w-11 items-center justify-center rounded-2xl', tile)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className={clsx('mt-2.5 text-lg font-black leading-none tabular-nums', texto)}>{valor}</p>
      <p className="mt-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  )
}

function MetaCard({ meta, puedeGestionar, onDelete }: { meta: MetaVenta; puedeGestionar: boolean; onDelete: (id: number) => void }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [menuAbierto])

  const objetivo = meta.metaUnidades > 0 ? meta.metaUnidades : 0
  const actual = meta.avanceUnidades
  const pct = objetivo > 0 ? Math.min(100, (actual / objetivo) * 100) : 0
  const pctReal = objetivo > 0 ? (actual / objetivo) * 100 : 0
  const cumplida = pct >= 100
  const esCampana = meta.alcance === 'campana'
  const nombre = esCampana ? (meta.campanaNombre ?? 'Campaña') : (meta.asesorNombre ?? 'Asesor')
  const iniciales = nombre.replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'MV'

  return (
    <div className="card p-6">
      {/* cabecera: avatar + nombre + contador + menú */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className={clsx(
            'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white shadow-sm',
            cumplida ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-violet-500 to-violet-700',
          )}>
            {iniciales}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-bold text-gray-900">{nombre}</span>
              <span className={clsx(
                'flex-shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide',
                esCampana ? 'bg-violet-100 text-violet-700' : 'bg-brand/10 text-brand',
              )}>
                {esCampana ? 'Equipo' : 'Individual'}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.8rem] text-gray-400">
              <Calendar className="h-3.5 w-3.5" />
              {meta.periodo} · {meta.tipo === 'diaria' ? 'diaria' : 'mensual'}
              {!esCampana && meta.campanaNombre && ` · ${meta.campanaNombre}`}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-3">
          <div className="text-right">
            <p className={clsx('text-2xl font-black leading-none tabular-nums', cumplida ? 'text-emerald-600' : 'text-violet-600')}>
              {actual} <span className="text-gray-300">/ {objetivo}</span>
            </p>
            <p className="mt-1 text-[0.78rem] text-gray-400">{pctReal.toFixed(1)}% del objetivo</p>
          </div>
          {puedeGestionar && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuAbierto((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuAbierto && (
                <div className="absolute right-0 top-11 z-10 w-44 overflow-hidden rounded-xl border border-gray-200 bg-card shadow-lg">
                  <button
                    onClick={() => { setMenuAbierto(false); onDelete(meta.id) }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[0.82rem] font-semibold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar meta
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* barra tipo slider con extremos */}
      <div className="mt-5">
        <div className="relative h-2.5 w-full rounded-full bg-gray-100">
          <div
            className={clsx('absolute inset-y-0 left-0 rounded-full', cumplida ? 'bg-emerald-500' : 'bg-violet-500')}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[0.72rem] text-gray-400">
          <span>0</span>
          <span>{objetivo}</span>
        </div>
      </div>

      {/* grid de KPIs con tiles de icono */}
      <div className="mt-5 grid grid-cols-2 gap-6 border-t border-gray-100 pt-6 sm:grid-cols-4">
        <MetaKpi icon={BarChart3} valor={actual} label="Actual" tile="bg-violet-100 text-violet-600" texto="text-violet-600" />
        <MetaKpi icon={Target} valor={objetivo} label="Objetivo" tile="bg-brand/10 text-brand" texto="text-brand" />
        <MetaKpi icon={TrendingUp} valor={`${pctReal.toFixed(1)}%`} label="Progreso" tile="bg-emerald-100 text-emerald-600" texto="text-emerald-600" />
        <MetaKpi
          icon={cumplida ? CheckCircle2 : Calendar}
          valor={cumplida ? 'Lista' : 'Activa'}
          label="Estado"
          tile={cumplida ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-500'}
          texto={cumplida ? 'text-emerald-600' : 'text-amber-500'}
        />
      </div>

      {meta.metaMonto > 0 && (
        <p className="mt-4 text-[0.8rem] text-gray-500">
          Meta de monto: <span className="font-semibold text-gray-800">${meta.metaMonto.toLocaleString('es-MX')}</span>
        </p>
      )}

      {/* banner motivacional con ilustración */}
      <div className="relative mt-4 flex items-center gap-3.5 overflow-hidden rounded-2xl bg-violet-50 px-4 py-4">
        <MontanaSVG className="pointer-events-none absolute bottom-0 right-4 h-full w-40 text-violet-300" />
        <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-100">
          {cumplida ? <CheckCircle2 className="h-5 w-5 text-violet-600" /> : <TrendingUp className="h-5 w-5 text-violet-600" />}
        </div>
        <div className="relative z-10 min-w-0">
          <p className="text-[0.88rem] font-bold text-gray-900">{cumplida ? '¡Meta cumplida! 🎉' : '¡Sigue así!'}</p>
          <p className="text-[0.78rem] text-gray-500">
            {cumplida ? 'Excelente trabajo del equipo' : 'Cada venta te acerca más al objetivo'}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Campo con icono en pill de color ── */
function CampoIcono({ label, icon: Icon, tono, children }: {
  label: string; icon: typeof Calendar; tono: 'blue' | 'violet' | 'emerald'; children: React.ReactNode
}) {
  const tonos = {
    blue: 'bg-blue-100 text-blue-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  }
  return (
    <div>
      <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">{label}</label>
      <div className="relative">
        <span className={clsx('pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg', tonos[tono])}>
          <Icon className="h-4 w-4" />
        </span>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-11 pr-3 text-[0.9rem] text-gray-900 ' +
  'outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'
const selectCls = inputCls + ' appearance-none pr-9 cursor-pointer'

function Toggle({ opciones, valor, onChange, activoCls }: {
  opciones: { key: string; label: string; icon: typeof Calendar }[]
  valor: string; onChange: (k: string) => void; activoCls: string
}) {
  return (
    <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
      {opciones.map((o) => {
        const activo = valor === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[0.82rem] font-semibold transition-all',
              activo ? `${activoCls} shadow-sm` : 'text-gray-500 hover:text-gray-700',
            )}
          >
            <o.icon className="h-4 w-4" /> {o.label}
          </button>
        )
      })}
    </div>
  )
}

function CrearMetaModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<MetaTipo>('diaria')
  const [alcance, setAlcance] = useState<MetaAlcance>('asesor')
  const [asesorId, setAsesorId] = useState<number | ''>('')
  const [campanaId, setCampanaId] = useState<number | ''>('')
  const [periodo, setPeriodo] = useState(hoyDia())
  const [periodoFin, setPeriodoFin] = useState(hoyDia())
  const [metaMonto, setMetaMonto] = useState<number | ''>('')
  const [metaUnidades, setMetaUnidades] = useState<number | ''>('')

  const { data: asesores = [] } = useQuery({
    queryKey: ['ventas-area-asesores'],
    queryFn: () => ventasAreaService.getAsesores(),
  })
  const { data: campanas = [] } = useQuery({
    queryKey: ['ventas-area-campanas'],
    queryFn: () => ventasAreaService.getCampanas(),
  })

  const cambiarTipo = (t: MetaTipo) => {
    setTipo(t)
    const hoy = t === 'diaria' ? hoyDia() : hoyMes()
    setPeriodo(hoy)
    setPeriodoFin(hoyDia())
  }

  const rangoDias = tipo === 'diaria' && periodoFin > periodo
    ? Math.round((new Date(periodoFin + 'T00:00:00').getTime() - new Date(periodo + 'T00:00:00').getTime()) / 86400000) + 1
    : 1

  const crear = useMutation({
    mutationFn: () => ventasAreaService.createMeta({
      asesorId: alcance === 'asesor' ? Number(asesorId) : undefined,
      campanaId: campanaId === '' ? undefined : Number(campanaId),
      periodo, tipo, alcance,
      periodoFin: tipo === 'diaria' && periodoFin > periodo ? periodoFin : undefined,
      metaMonto: metaMonto === '' ? undefined : Number(metaMonto),
      metaUnidades: metaUnidades === '' ? undefined : Number(metaUnidades),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-dashboard'] })
      toast.success(rangoDias > 1 ? `${rangoDias} metas creadas (una por día)` : 'Meta guardada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar la meta'),
  })

  const puedeCrear =
    (alcance === 'asesor' ? asesorId !== '' : campanaId !== '')
    && (metaMonto !== '' || metaUnidades !== '')

  return (
    <Modal isOpen onClose={onClose} size="lg">
      {/* Header propio */}
      <div className="-m-5 mb-5 flex items-start justify-between border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[1.15rem] font-bold text-gray-900">Nueva meta</h2>
            <p className="text-[0.8rem] text-gray-400">Define los detalles de tu nueva meta</p>
          </div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Periodicidad</label>
            <Toggle
              opciones={[
                { key: 'diaria', label: 'Diaria', icon: CalendarDays },
                { key: 'mensual', label: 'Mensual', icon: Calendar },
              ]}
              valor={tipo}
              onChange={(k) => cambiarTipo(k as MetaTipo)}
              activoCls="bg-blue-600 text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Alcance</label>
            <Toggle
              opciones={[
                { key: 'asesor', label: 'Asesor', icon: User },
                { key: 'campana', label: 'Campaña', icon: Users },
              ]}
              valor={alcance}
              onChange={(k) => setAlcance(k as MetaAlcance)}
              activoCls="bg-violet-600 text-white"
            />
          </div>
        </div>

        {tipo === 'diaria' ? (
          <div>
            <label className="mb-1.5 block text-[0.72rem] font-bold uppercase tracking-wide text-gray-500">Rango de fechas</label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Calendar className="h-4 w-4" />
                </span>
                <input
                  type="date"
                  value={periodo}
                  max={periodoFin}
                  onChange={(e) => setPeriodo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Calendar className="h-4 w-4" />
                </span>
                <input
                  type="date"
                  value={periodoFin}
                  min={periodo}
                  onChange={(e) => setPeriodoFin(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {rangoDias > 1 && (
              <p className="mt-1.5 text-[0.72rem] text-gray-400">
                Se creará la misma meta para <b className="text-gray-600">{rangoDias} días</b> (una por cada fecha del rango).
              </p>
            )}
          </div>
        ) : (
          <CampoIcono label="Mes" icon={Calendar} tono="blue">
            <input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className={inputCls}
            />
          </CampoIcono>
        )}

        {alcance === 'asesor' ? (
          <CampoIcono label="Asesor" icon={User} tono="violet">
            <select value={asesorId} onChange={(e) => setAsesorId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Selecciona un asesor</option>
              {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        ) : (
          <CampoIcono label="Campaña" icon={Megaphone} tono="violet">
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Selecciona una campaña</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        )}

        {alcance === 'asesor' && (
          <CampoIcono label="Campaña (opcional)" icon={Megaphone} tono="violet">
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value ? Number(e.target.value) : '')} className={selectCls}>
              <option value="">Todas sus campañas</option>
              {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </CampoIcono>
        )}

        {alcance === 'campana' && (
          <p className="-mt-2 text-[0.72rem] text-gray-400">La meta se compara contra el total de ventas de la campaña.</p>
        )}

        {/* Metas — mismo estilo sobrio que la configuración de nómina: inputs
            del sistema (.field), label pequeño, sin decoración de icono. */}
        <div className="rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">Meta de unidades vendidas</p>
                  <p className="mt-0.5 text-[0.68rem] text-gray-400">Ventas exitosas que se deben alcanzar</p>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number" min={0} step={1}
                    value={metaUnidades}
                    onChange={(e) => setMetaUnidades(e.target.value ? Number(e.target.value) : '')}
                    className="field ml-auto w-28 py-1 text-right text-[0.85rem]"
                    placeholder="0"
                  />
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">Meta de monto</p>
                  <p className="mt-0.5 text-[0.68rem] text-gray-400">Importe total esperado, en pesos</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[0.72rem] text-gray-400">$</span>
                    <input
                      type="number" min={0} step={1}
                      value={metaMonto}
                      onChange={(e) => setMetaMonto(e.target.value ? Number(e.target.value) : '')}
                      className="field w-28 py-1 text-right text-[0.85rem]"
                      placeholder="0"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="-mt-1 text-[0.68rem] text-gray-400">
          Puedes definir solo unidades, solo monto, o ambas. La barra del Inicio usa las unidades.
        </p>

        <div className="-mx-5 mt-2 flex justify-end gap-2 border-t border-gray-100 px-5 pt-4">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-[0.85rem] font-semibold text-gray-600 transition-colors hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={() => crear.mutate()}
            disabled={!puedeCrear || crear.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-[0.85rem] font-semibold text-white shadow-sm transition-all hover:bg-violet-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Guardar meta
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function MetasVentasPage() {
  const { can } = useActionAccess()
  const puedeGestionar = can('ventas-area', 'gestionar-metas')
  const qc = useQueryClient()
  const [tipoFiltro, setTipoFiltro] = useState<MetaTipo>('diaria')
  const [periodo, setPeriodo] = useState(hoyDia())
  const [showCrear, setShowCrear] = useState(false)

  const cambiarTipoFiltro = (t: MetaTipo) => {
    setTipoFiltro(t)
    setPeriodo(t === 'diaria' ? hoyDia() : hoyMes())
  }

  const { data: metasTodas = [], isLoading } = useQuery({
    queryKey: ['ventas-area-metas', periodo],
    queryFn: () => ventasAreaService.getMetas(periodo),
  })
  const metas = metasTodas.filter((m) => m.tipo === tipoFiltro)

  const eliminar = useMutation({
    mutationFn: (id: number) => ventasAreaService.eliminarMeta(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-area-metas'] })
      qc.invalidateQueries({ queryKey: ['ventas-area-dashboard'] })
      toast.success('Meta eliminada')
    },
    onError: () => toast.error('Error al eliminar la meta'),
  })

  return (
    <div className="animate-fade-in">
      {/* Encabezado */}
      <div className="mb-6 flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <Target className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Metas</h1>
          <p className="text-[0.85rem] text-gray-400">Metas diarias y mensuales por asesor o por campaña</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Columna de metas */}
        <div className="space-y-5">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : metas.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
              <Target className="h-8 w-8" />
              <p className="text-sm">Sin metas {tipoFiltro === 'diaria' ? 'diarias' : 'mensuales'} para este periodo</p>
            </div>
          ) : (
            metas.map((m) => (
              <MetaCard key={m.id} meta={m} puedeGestionar={puedeGestionar} onDelete={(id) => eliminar.mutate(id)} />
            ))
          )}
        </div>

        {/* Panel lateral de controles */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="card space-y-4 p-4">
            <div className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-1">
              {([
                { key: 'diaria' as MetaTipo, label: 'Diaria', icon: CalendarDays },
                { key: 'mensual' as MetaTipo, label: 'Mensual', icon: Calendar },
              ]).map((o) => {
                const activo = tipoFiltro === o.key
                return (
                  <button
                    key={o.key}
                    onClick={() => cambiarTipoFiltro(o.key)}
                    className={clsx(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[0.82rem] font-semibold transition-all',
                      activo ? 'bg-brand text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    <o.icon className="h-4 w-4" /> {o.label}
                  </button>
                )
              })}
            </div>

            <div>
              <label className="mb-1.5 block text-[0.8rem] font-semibold text-gray-600">Fecha</label>
              <input
                type={tipoFiltro === 'diaria' ? 'date' : 'month'}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="field w-full"
              />
            </div>

            {puedeGestionar && (
              <button
                onClick={() => setShowCrear(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-[0.88rem] font-semibold text-white shadow-sm transition-all hover:bg-brand-dark"
              >
                <Plus className="h-4 w-4" /> Nueva meta
              </button>
            )}

            <div className="flex items-start gap-2.5 rounded-xl bg-violet-50 px-3 py-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-500" />
              <p className="text-[0.76rem] leading-relaxed text-violet-700">
                {puedeGestionar
                  ? 'Crea metas para dar seguimiento al rendimiento de tu equipo.'
                  : 'Aquí ves las metas asignadas para el periodo seleccionado.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showCrear && <CrearMetaModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
