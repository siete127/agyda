import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, Plus, RefreshCw, CheckCircle2, LayoutGrid, PieChart,
  DollarSign, TrendingUp, AlertTriangle, Users, X, Coins, Save,
  Pencil, Check, BadgeDollarSign, RotateCcw, Settings, Trophy,
  UserX, ShieldOff,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface Periodo {
  id: number
  fechaInicio: string
  fechaFin: string
  fechaBase: string | null
  fechaCorte: string | null
  estado: 'borrador' | 'aprobado'
  fechaCalculo: string | null
  fechaAprobacion: string | null
}

interface ComisionDetalle {
  campanaId: number
  campana: string
  numVentas: number
  tarifa: number
  tipoTarifa: string
  monto: number
  gananciaNeta: number
}

interface DetalleEmpleado {
  id: number
  neusId: number
  nombre: string
  puesto: string | null
  sueldoQuincenal: number
  sueldoDiario: number
  diasFalta: number
  diasMedioTiempo: number
  diasDescontados: number
  montoDescuento: number
  sueldoNeto: number
  totalComisiones: number
  totalAPagar: number
  totalVentas: number
  bonoRanking: number
  lugarRanking: number | null
  comisiones: ComisionDetalle[]
  totalRetardos: number
  descuentoRetardo: number
  minutosExcesoPausa: number
  descuentoPausa: number
  diasConEntrada: number
  faltaAjustadaManual: boolean
  faltasPorRetardos: number
}

interface ComisionCampana {
  campana: string
  label: string
  numComisiones: number
  tarifa: number
  monto: number
}

interface Excepcion {
  id: number
  neusId: number
  nombre: string
  fechaIncidencia: string
  motivo: string
  fechaCreacion: string
}

function parsePeriodo(r: Record<string, unknown>): Periodo {
  const fi = String(r['fechaInicio']).slice(0, 10)
  const ff = String(r['fechaFin']).slice(0, 10)
  return {
    id: Number(r['id']),
    fechaInicio: fi,
    fechaFin: ff,
    fechaBase:  r['fechaBase']  ? String(r['fechaBase']).slice(0, 10)  : fi,
    fechaCorte: r['fechaCorte'] ? String(r['fechaCorte']).slice(0, 10) : ff,
    estado: (String(r['estado'] ?? 'borrador')) as Periodo['estado'],
    fechaCalculo: r['fechaCalculo'] ? String(r['fechaCalculo']) : null,
    fechaAprobacion: r['fechaAprobacion'] ? String(r['fechaAprobacion']) : null,
  }
}

const fmtMoney = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtFecha = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

// Colores por campaña (por campanaId, cíclico si hay más de 6)
const CAMP_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-500' },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    dot: 'bg-rose-500' },
  { bg: 'bg-teal-100',    text: 'text-teal-700',    dot: 'bg-teal-500' },
]
function campColor(campanaId: number) {
  const idx = ((campanaId - 1) % CAMP_COLORS.length + CAMP_COLORS.length) % CAMP_COLORS.length
  return CAMP_COLORS[idx] ?? CAMP_COLORS[0]
}

/* ── Modal crear periodo ── */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function CrearPeriodoModal({ onClose, ultimoPeriodo }: { onClose: () => void; ultimoPeriodo: Periodo | null }) {
  const qc = useQueryClient()

  // Pre-calcular fechas sugeridas basadas en el último periodo
  const sugerido = ultimoPeriodo
    ? (() => { const ini = addDays(ultimoPeriodo.fechaFin, 1); return { inicio: ini, fin: addDays(ini, 14) } })()
    : null

  const [fechaInicio, setFechaInicio] = useState(sugerido?.inicio ?? '')
  const [fechaFin, setFechaFin] = useState(sugerido?.fin ?? '')
  const [solapamiento, setSolapamiento] = useState<{ inicio: string; fin: string } | null>(null)

  const crear = useMutation({
    mutationFn: (payload: { fechaInicio: string; fechaFin: string; fechaBase: string; fechaCorte: string }) =>
      api.post('/nomina/periodos', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Periodo creado')
      onClose()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ''
      if (msg.includes('solapa') && sugerido) {
        setSolapamiento(sugerido)
      } else {
        toast.error(msg || 'Error al crear el periodo')
      }
    },
  })

  const handleCrear = () => {
    setSolapamiento(null)
    crear.mutate({ fechaInicio, fechaFin, fechaBase: fechaInicio, fechaCorte: fechaFin })
  }

  const usarFechasSugeridas = () => {
    if (!solapamiento) return
    setFechaInicio(solapamiento.inicio)
    setFechaFin(solapamiento.fin)
    setSolapamiento(null)
    crear.mutate({
      fechaInicio: solapamiento.inicio,
      fechaFin: solapamiento.fin,
      fechaBase: solapamiento.inicio,
      fechaCorte: solapamiento.fin,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="Nueva quincena" size="sm">
      <div className="space-y-4">

        {/* Banner de solapamiento */}
        {solapamiento && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-semibold text-amber-800 mb-0.5">Las fechas se solapan con un periodo existente</p>
            <p className="text-amber-700 text-[0.78rem] mb-3">
              ¿Quieres usar la siguiente quincena disponible?
              <span className="font-semibold"> {fmtFecha(solapamiento.inicio)} – {fmtFecha(solapamiento.fin)}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={usarFechasSugeridas}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Sí, usar estas fechas
              </button>
              <button
                onClick={() => setSolapamiento(null)}
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-[0.78rem] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
              >
                Cambiar manualmente
              </button>
            </div>
          </div>
        )}

        {/* Periodo de pago */}
        <div>
          <p className="text-[0.7rem] font-bold text-gray-400 uppercase tracking-wide mb-2">Periodo de pago</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Inicio</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fin</label>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="field" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!fechaInicio || !fechaFin} onClick={handleCrear}>Crear</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal excepción manual ── */
function ExcepcionModal({ periodoId, onClose }: { periodoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [neusId, setNeusId] = useState('')
  const [fechaIncidencia, setFechaIncidencia] = useState('')
  const [motivo, setMotivo] = useState('')

  // Lista de empleados CC (no depende de que el periodo ya se haya calculado, a diferencia
  // de /detalle que solo tiene filas después de presionar "Calcular nómina").
  const { data: empleadosRaw = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ['nomina-empleados-cc'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/area/CC')
      const list = Array.isArray(data?.data) ? data.data : []
      return (list as Record<string, unknown>[]).map((r) => ({ id: Number(r['id']), nombre: String(r['nombre'] ?? '') }))
    },
  })
  const { data: idsExcluidos = new Set<number>() } = useQuery<Set<number>>({
    queryKey: ['nomina-excluidos-ids'],
    queryFn: async () => {
      const { data } = await api.get('/nomina/agentes-excluidos')
      const list = Array.isArray(data?.data) ? data.data : []
      return new Set((list as Record<string, unknown>[]).map((r) => Number(r['neusId'])))
    },
  })
  const empleados = useMemo(() => empleadosRaw.filter((e) => !idsExcluidos.has(e.id)), [empleadosRaw, idsExcluidos])

  const crear = useMutation({
    mutationFn: () => api.post(`/nomina/periodos/${periodoId}/excepciones`, {
      neusId: Number(neusId), fechaIncidencia, motivo: motivo.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-excepciones', periodoId] })
      toast.success('Excepción registrada')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar la excepción'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Agregar excepción manual" size="sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Empleado</label>
          <select value={neusId} onChange={(e) => setNeusId(e.target.value)} className="field">
            <option value="">Selecciona un empleado</option>
            {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha de la incidencia</label>
          <input type="date" value={fechaIncidencia} onChange={(e) => setFechaIncidencia(e.target.value)} className="field" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Motivo (obligatorio)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ej. Permiso justificado por cita médica" className="field resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!neusId || !fechaIncidencia || !motivo.trim()} onClick={() => crear.mutate()}>
            Guardar excepción
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal ventas individuales ── */
interface VentaDetalle { id: number; nombreCliente: string; telefono: string; evidencia: string | null; fecha: string; estatus: string; campaignId: number }

function VentasEmpleadoModal({ periodoId, empleado, onClose }: { periodoId: number; empleado: DetalleEmpleado; onClose: () => void }) {
  const { data: ventas = [], isLoading } = useQuery<VentaDetalle[]>({
    queryKey: ['ventas-empleado', periodoId, empleado.neusId],
    queryFn: async () => {
      const { data } = await api.get(`/nomina/periodos/${periodoId}/ventas/${empleado.neusId}`)
      return data.data ?? []
    },
  })

  const [imgAmpliada, setImgAmpliada] = useState<string | null>(null)

  const fmtDt = (f: string) => new Date(f).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const campColor = (id: number) => {
    const cols = [
      { bg: 'bg-emerald-100', text: 'text-emerald-700' },
      { bg: 'bg-sky-100',     text: 'text-sky-700' },
      { bg: 'bg-violet-100',  text: 'text-violet-700' },
    ]
    return cols[id % cols.length]
  }

  return (
    <Modal isOpen onClose={onClose} title={`Ventas — ${empleado.nombre}`} size="lg">
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>
      ) : ventas.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-10">Sin ventas registradas en este periodo</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.72rem] text-gray-400">{ventas.length} venta{ventas.length !== 1 ? 's' : ''} aprobada{ventas.length !== 1 ? 's' : ''}</p>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {ventas.map((v) => {
              const col = campColor(v.campaignId)
              const VENTAS_BASE = 'https://ventas.ardabytec.vip:8443'
              const evidenciaUrl = v.evidencia
                ? v.evidencia.startsWith('http') ? v.evidencia : `${VENTAS_BASE}${v.evidencia.startsWith('/') ? '' : '/'}${v.evidencia}`
                : null
              const esImg = !!evidenciaUrl
              return (
                <div key={v.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex gap-3 items-start">
                  {/* Evidencia */}
                  <div className="flex-shrink-0">
                    {esImg ? (
                      <button onClick={() => setImgAmpliada(evidenciaUrl!)} className="block w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity">
                        <img src={evidenciaUrl!} alt="evidencia" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-dashed border-gray-200 flex items-center justify-center">
                        <span className="text-[0.6rem] text-gray-300 text-center leading-tight">Sin evidencia</span>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-[0.82rem] text-gray-800 truncate">{v.nombreCliente || '—'}</p>
                      <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', col.bg, col.text)}>
                        Camp. {v.campaignId}
                      </span>
                    </div>
                    <p className="text-[0.72rem] text-gray-400 mt-0.5">{v.telefono || '—'}</p>
                    <p className="text-[0.7rem] text-gray-500 mt-1">{fmtDt(v.fecha)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Imagen ampliada */}
      {imgAmpliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setImgAmpliada(null)}>
          <img src={imgAmpliada} alt="evidencia" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </Modal>
  )
}

/* ── Modal comisiones por campaña ── */
function ComisionesModal({ periodoId, empleado, onClose }: { periodoId: number; empleado: DetalleEmpleado; onClose: () => void }) {
  const qc = useQueryClient()
  const [filas, setFilas] = useState<ComisionCampana[]>([])

  const { isLoading } = useQuery<ComisionCampana[]>({
    queryKey: ['nomina-comisiones', periodoId, empleado.neusId],
    queryFn: async () => {
      const data = (await api.get(`/nomina/periodos/${periodoId}/comisiones/${empleado.neusId}`)).data?.data ?? []
      setFilas(data)
      return data
    },
  })

  const guardarTodo = useMutation({
    mutationFn: async () => {
      for (const fila of filas) {
        await api.put(`/nomina/periodos/${periodoId}/comisiones/${empleado.neusId}`, {
          campana: fila.campana, numComisiones: fila.numComisiones, tarifa: fila.tarifa,
        })
      }
      // Recalcula automáticamente para que el nuevo monto de comisiones se refleje
      // de inmediato en la tabla, sin depender de que el usuario presione "Calcular nómina".
      await api.post(`/nomina/periodos/${periodoId}/calcular`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-comisiones', periodoId, empleado.neusId] })
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodoId] })
      toast.success('Comisiones guardadas y reflejadas en la nómina')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const updateFila = (campana: string, patch: Partial<ComisionCampana>) => {
    setFilas((fs) => fs.map((f) => f.campana === campana ? { ...f, ...patch, monto: (patch.numComisiones ?? f.numComisiones) * (patch.tarifa ?? f.tarifa) } : f))
  }

  const totalMonto = filas.reduce((s, f) => s + f.monto, 0)

  return (
    <Modal isOpen onClose={onClose} title={`Comisiones — ${empleado.nombre}`} size="md">
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-2 text-left text-[0.68rem] font-semibold text-gray-400 uppercase">Campaña</th>
                  <th className="px-3 py-2 text-right text-[0.68rem] font-semibold text-gray-400 uppercase">No. comisiones</th>
                  <th className="px-3 py-2 text-right text-[0.68rem] font-semibold text-gray-400 uppercase">Tarifa</th>
                  <th className="px-3 py-2 text-right text-[0.68rem] font-semibold text-gray-400 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map((f) => (
                  <tr key={f.campana}>
                    <td className="px-3 py-2 font-medium text-gray-700">{f.label}</td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={f.numComisiones}
                        onChange={(e) => updateFila(f.campana, { numComisiones: Number(e.target.value) })}
                        className="field py-1 text-right text-[0.8rem] w-20 ml-auto" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={f.tarifa}
                        onChange={(e) => updateFila(f.campana, { tarifa: Number(e.target.value) })}
                        className="field py-1 text-right text-[0.8rem] w-24 ml-auto" />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-600 tabular-nums">{fmtMoney(f.monto)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/50">
                  <td className="px-3 py-2 font-bold text-gray-700 text-[0.78rem]" colSpan={3}>Total comisiones</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900 tabular-nums">{fmtMoney(totalMonto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[0.7rem] text-gray-400">Al guardar se aplican las 3 campañas. Después presiona "Calcular nómina" para reflejar el total en el sueldo a pagar.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button isLoading={guardarTodo.isPending} onClick={() => guardarTodo.mutate()}>
              <Save className="h-3.5 w-3.5" /> Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Tipos para config ────────────────────────────────────────────────────────
interface ConfigGlobal {
  sueldo_base: number
  dias_quincena: number
  factor_dia_completo: number
  factor_medio_dia: number
  factor_falta_justificada: number
  monto_retardo: number
  minutos_pausa_libre: number
  monto_exceso_pausa: number
  retardos_por_falta: number
  pausas_activo: boolean
}
interface CampanaConfig {
  campana_id: number
  campana_nombre: string
  tipo_tarifa: 'fijo' | 'porcentaje'
  tarifa: number
  activo: boolean
  ganancia_neta: number
}
interface BonoConfig {
  lugar: number
  label: string
  monto: number
  activo: boolean
  campana_id: number | null
}

// ─── Sección config ───────────────────────────────────────────────────────────
function NominaConfig() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ config: ConfigGlobal; campanas: CampanaConfig[]; bonos: BonoConfig[] }>({
    queryKey: ['nomina-config'],
    queryFn: async () => (await api.get('/nomina/config')).data?.data,
  })

  const [cfg, setCfg] = useState<ConfigGlobal | null>(null)
  const [campanas, setCampanas] = useState<CampanaConfig[]>([])
  const [bonos, setBonos] = useState<BonoConfig[]>([])
  const [loaded, setLoaded] = useState(false)

  // Cuando llegan los datos del query, inicializa el estado local una sola vez
  if (data && !loaded) {
    setCfg({ ...data.config })
    setCampanas(data.campanas.map((c) => ({ ...c })))
    setBonos(data.bonos.map((b) => ({ ...b })))
    setLoaded(true)
  }

  const guardar = useMutation({
    mutationFn: () => api.put('/nomina/config', {
      sueldo_base:          cfg?.sueldo_base,
      dias_quincena:        cfg?.dias_quincena,
      factor_dia_completo:  cfg?.factor_dia_completo,
      factor_medio_dia:     cfg?.factor_medio_dia,
      factor_falta_justificada: cfg?.factor_falta_justificada,
      monto_retardo:        cfg?.monto_retardo,
      minutos_pausa_libre:  cfg?.minutos_pausa_libre,
      monto_exceso_pausa:   cfg?.monto_exceso_pausa,
      retardos_por_falta:   cfg?.retardos_por_falta,
      pausas_activo:        cfg?.pausas_activo,
      campanas,
      bonos,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-config'] })
      setLoaded(false)
      toast.success('Configuración guardada')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const addCampana = () => {
    const newId = campanas.length > 0 ? Math.max(...campanas.map((c) => c.campana_id)) + 1 : 1
    setCampanas((cs) => [...cs, { campana_id: newId, campana_nombre: 'Nueva campaña', tipo_tarifa: 'fijo', tarifa: 0, activo: true, ganancia_neta: 0 }])
  }
  const addBono = () => {
    const newLugar = bonos.length > 0 ? Math.max(...bonos.map((b) => b.lugar)) + 1 : 1
    setBonos((bs) => [...bs, { lugar: newLugar, label: `${newLugar}° lugar`, monto: 0, activo: true, campana_id: null }])
  }

  if (isLoading || !cfg) {
    return <div className="space-y-4 animate-fade-in">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Sueldo base y días ── */}
      <div className="card p-5">
        <h3 className="text-[0.78rem] font-bold text-gray-700 mb-4 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-brand" /> Parámetros globales
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Sueldo base quincenal (MXN)</label>
            <input type="number" min="0" step="0.01" value={cfg.sueldo_base}
              onChange={(e) => setCfg((c) => c ? { ...c, sueldo_base: Number(e.target.value) } : c)}
              className="field" />
            <p className="mt-1 text-[0.68rem] text-gray-400">Se aplica a empleados sin sueldo individual configurado.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wide">Días laborables por quincena</label>
            <input type="number" min="1" max="20" step="1" value={cfg.dias_quincena}
              onChange={(e) => setCfg((c) => c ? { ...c, dias_quincena: Number(e.target.value) } : c)}
              className="field" />
            <p className="mt-1 text-[0.68rem] text-gray-400">Se usa para calcular el sueldo diario = sueldo ÷ días.</p>
          </div>
        </div>
      </div>

      {/* ── Descuento por tipo de falta ── */}
      <div className="card p-5">
        <h3 className="text-[0.78rem] font-bold text-gray-700 mb-1 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Descuento por tipo de falta
        </h3>
        <p className="text-[0.7rem] text-gray-400 mb-4">Factor que multiplica el sueldo diario para calcular cuánto se descuenta según el tipo de inasistencia.</p>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase">Tipo de descuento</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase">Factor / Parámetro</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase">Monto a descontar ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const sueldoDiario = cfg.sueldo_base / cfg.dias_quincena
                return (
                  <>
                    <tr>
                      <td className="px-4 py-3 font-medium text-gray-800">Día completo de falta</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-[0.8rem]">
                        {cfg.factor_dia_completo.toFixed(4)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number" min="0" step="1"
                          value={Math.round(cfg.factor_dia_completo * sueldoDiario * 100) / 100}
                          onChange={(e) => {
                            const monto = Number(e.target.value)
                            const factor = sueldoDiario > 0 ? monto / sueldoDiario : 0
                            setCfg((c) => c ? { ...c, factor_dia_completo: Math.round(factor * 10000) / 10000 } : c)
                          }}
                          className="field py-1 text-right text-[0.8rem] w-28 ml-auto"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-gray-800">Medio día de falta</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-[0.8rem]">
                        {cfg.factor_medio_dia.toFixed(4)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number" min="0" step="1"
                          value={Math.round(cfg.factor_medio_dia * sueldoDiario * 100) / 100}
                          onChange={(e) => {
                            const monto = Number(e.target.value)
                            const factor = sueldoDiario > 0 ? monto / sueldoDiario : 0
                            setCfg((c) => c ? { ...c, factor_medio_dia: Math.round(factor * 10000) / 10000 } : c)
                          }}
                          className="field py-1 text-right text-[0.8rem] w-28 ml-auto"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">Falta justificada</p>
                        <p className="text-[0.68rem] text-gray-400 mt-0.5">Cuenta como 1 falta completa, pero con su propio descuento (ej. incapacidad, permiso especial)</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400 text-[0.8rem]">
                        {cfg.factor_falta_justificada.toFixed(4)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number" min="0" step="1"
                          value={Math.round(cfg.factor_falta_justificada * sueldoDiario * 100) / 100}
                          onChange={(e) => {
                            const monto = Number(e.target.value)
                            const factor = sueldoDiario > 0 ? monto / sueldoDiario : 0
                            setCfg((c) => c ? { ...c, factor_falta_justificada: Math.round(factor * 10000) / 10000 } : c)
                          }}
                          className="field py-1 text-right text-[0.8rem] w-28 ml-auto"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">Retardos</p>
                        <p className="text-[0.68rem] text-gray-400 mt-0.5">Cantidad de retardos acumulados en el periodo que equivalen a 1 día completo de falta</p>
                      </td>
                      <td className="px-4 py-3 text-right text-[0.72rem] text-gray-400">retardos = 1 falta</td>
                      <td className="px-4 py-3">
                        <input
                          type="number" min="1" step="1"
                          value={cfg.retardos_por_falta}
                          onChange={(e) => setCfg((c) => c ? { ...c, retardos_por_falta: Math.max(1, Number(e.target.value)) } : c)}
                          className="field py-1 text-right text-[0.8rem] w-28 ml-auto"
                        />
                      </td>
                    </tr>
                    <tr className={clsx(!cfg.pausas_activo && 'opacity-50')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Switch activo/inactivo */}
                          <button
                            type="button"
                            onClick={() => setCfg((c) => c ? { ...c, pausas_activo: !c.pausas_activo } : c)}
                            className={clsx(
                              'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                              cfg.pausas_activo ? 'bg-brand' : 'bg-gray-200'
                            )}
                          >
                            <span className={clsx(
                              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow ring-0 transition duration-200',
                              cfg.pausas_activo ? 'translate-x-4' : 'translate-x-0'
                            )} />
                          </button>
                          <div>
                            <p className="font-medium text-gray-800">Exceso de pausas</p>
                            <p className="text-[0.68rem] text-gray-400 mt-0.5">
                              Minutos libres por día:&nbsp;
                              <input
                                type="number" min="0" step="5"
                                value={cfg.minutos_pausa_libre}
                                disabled={!cfg.pausas_activo}
                                onChange={(e) => setCfg((c) => c ? { ...c, minutos_pausa_libre: Number(e.target.value) } : c)}
                                className="field py-0.5 px-1.5 text-[0.72rem] w-14 text-center inline-block disabled:cursor-not-allowed"
                              />
                              &nbsp;min. Se cobra por cada 5 min de exceso (acumulado en el periodo)
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[0.72rem] text-gray-400">por c/5 min exceso</td>
                      <td className="px-4 py-3">
                        <input
                          type="number" min="0" step="1"
                          value={cfg.monto_exceso_pausa}
                          disabled={!cfg.pausas_activo}
                          onChange={(e) => setCfg((c) => c ? { ...c, monto_exceso_pausa: Number(e.target.value) } : c)}
                          className="field py-1 text-right text-[0.8rem] w-28 ml-auto disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.68rem] text-gray-400">
          Sueldo diario: {fmtMoney(cfg.sueldo_base / cfg.dias_quincena)} · Cada {cfg.retardos_por_falta} retardos acumulados en el periodo descuentan 1 día completo de sueldo. El exceso de pausas es fijo en pesos.
        </p>
      </div>

      {/* ── Campañas y comisiones ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[0.78rem] font-bold text-gray-700 flex items-center gap-2">
            <Coins className="h-4 w-4 text-brand" /> Campañas y comisiones
          </h3>
          <button onClick={addCampana} className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/40 px-3 py-1.5 text-[0.72rem] font-semibold text-brand hover:bg-brand/5 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Añadir campaña
          </button>
        </div>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase">Campaña</th>
                  <th className="px-4 py-2.5 text-center text-[0.72rem] font-semibold text-gray-400 uppercase">Tipo</th>
                  <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase">Valor</th>
                  <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase">Ganancia neta</th>
                  <th className="px-4 py-2.5 text-center text-[0.72rem] font-semibold text-gray-400 uppercase">Activa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {campanas.map((c, i) => (
                  <tr key={c.campana_id}>
                    <td className="px-4 py-2.5">
                      <input value={c.campana_nombre}
                        onChange={(e) => setCampanas((cs) => cs.map((x, j) => j === i ? { ...x, campana_nombre: e.target.value } : x))}
                        className="field py-1 text-[0.8rem] w-full" />
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={c.tipo_tarifa}
                        onChange={(e) => setCampanas((cs) => cs.map((x, j) => j === i ? { ...x, tipo_tarifa: e.target.value as 'fijo' | 'porcentaje' } : x))}
                        className="field py-1 text-[0.8rem] text-center mx-auto">
                        <option value="fijo">Fijo ($)</option>
                        <option value="porcentaje">% sueldo</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {c.tipo_tarifa === 'porcentaje' && <span className="text-[0.72rem] text-gray-400">%</span>}
                        {c.tipo_tarifa === 'fijo' && <span className="text-[0.72rem] text-gray-400">$</span>}
                        <input type="number" min="0" step="0.01" value={c.tarifa}
                          onChange={(e) => setCampanas((cs) => cs.map((x, j) => j === i ? { ...x, tarifa: Number(e.target.value) } : x))}
                          className="field py-1 text-right text-[0.8rem] w-24" />
                      </div>
                      <p className="mt-0.5 text-right text-[0.65rem] text-gray-400">
                        {c.tipo_tarifa === 'fijo'
                          ? `${fmtMoney(c.tarifa)} por venta`
                          : `${c.tarifa}% del sueldo quincenal por venta`}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[0.72rem] text-gray-400">$</span>
                        <input type="number" min="0" step="0.01" value={c.ganancia_neta ?? 0}
                          onChange={(e) => setCampanas((cs) => cs.map((x, j) => j === i ? { ...x, ganancia_neta: Number(e.target.value) } : x))}
                          className="field py-1 text-right text-[0.8rem] w-24" />
                      </div>
                      <p className="mt-0.5 text-right text-[0.65rem] text-gray-400">{fmtMoney(c.ganancia_neta ?? 0)} por aprobada</p>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => setCampanas((cs) => cs.map((x, j) => j === i ? { ...x, activo: !x.activo } : x))}
                        className={clsx('inline-flex h-5 w-9 items-center rounded-full transition-colors', c.activo ? 'bg-brand' : 'bg-gray-200')}>
                        <span className={clsx('inline-block h-4 w-4 rounded-full bg-card shadow transition-transform', c.activo ? 'translate-x-4' : 'translate-x-0.5')} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Bonos de ranking ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[0.78rem] font-bold text-gray-700 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Bonos por ranking de ventas
          </h3>
          <button onClick={addBono} className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400/60 px-3 py-1.5 text-[0.72rem] font-semibold text-amber-600 hover:bg-amber-50 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Añadir fila
          </button>
        </div>
        <p className="text-[0.7rem] text-gray-400 mb-4">
          Ranking global por total de ventas. El monto del bono depende del lugar y de la campaña principal del empleado (la campaña en que tuvo más ventas esa quincena). Si una campaña no tiene bono específico, se usa el de "Todas".
        </p>
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase">Lugar</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase">Aplica a campaña</th>
                  <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase">Etiqueta</th>
                  <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase">Bono (MXN)</th>
                  <th className="px-4 py-2.5 text-center text-[0.72rem] font-semibold text-gray-400 uppercase">Activo</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bonos.map((b, i) => (
                  <tr key={i} className={!b.activo ? 'opacity-40' : ''}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={clsx(
                          'inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold',
                          b.lugar === 1 ? 'bg-amber-100 text-amber-700' :
                          b.lugar === 2 ? 'bg-gray-100 text-gray-600' :
                          b.lugar === 3 ? 'bg-orange-100 text-orange-600' :
                          'bg-gray-50 text-gray-500'
                        )}>
                          {b.lugar}°
                        </div>
                        <input type="number" min="1" step="1" value={b.lugar}
                          onChange={(e) => setBonos((bs) => bs.map((x, j) => j === i ? { ...x, lugar: Number(e.target.value) } : x))}
                          className="field py-1 text-[0.8rem] w-14" />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <select value={b.campana_id ?? ''}
                        onChange={(e) => setBonos((bs) => bs.map((x, j) => j === i ? { ...x, campana_id: e.target.value === '' ? null : Number(e.target.value) } : x))}
                        className="field py-1 text-[0.8rem] min-w-[130px]">
                        <option value="">Todas las campañas</option>
                        {campanas.filter((c) => c.activo).map((c) => (
                          <option key={c.campana_id} value={c.campana_id}>{c.campana_nombre}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <input value={b.label}
                        onChange={(e) => setBonos((bs) => bs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                        className="field py-1 text-[0.8rem] min-w-[120px]" />
                    </td>
                    <td className="px-4 py-2.5">
                      <input type="number" min="0" step="0.01" value={b.monto}
                        onChange={(e) => setBonos((bs) => bs.map((x, j) => j === i ? { ...x, monto: Number(e.target.value) } : x))}
                        className="field py-1 text-right text-[0.8rem] w-28 ml-auto" />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => setBonos((bs) => bs.map((x, j) => j === i ? { ...x, activo: !x.activo } : x))}
                        className={clsx('inline-flex h-5 w-9 items-center rounded-full transition-colors', b.activo ? 'bg-brand' : 'bg-gray-200')}>
                        <span className={clsx('inline-block h-4 w-4 rounded-full bg-card shadow transition-transform', b.activo ? 'translate-x-4' : 'translate-x-0.5')} />
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <button onClick={() => setBonos((bs) => bs.filter((_, j) => j !== i))}
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {bonos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-[0.8rem] text-gray-400">Sin bonos configurados. Usa "Añadir fila" para crear uno.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-[0.7rem] text-amber-700 space-y-1">
          <p className="font-semibold">Ejemplo:</p>
          <p>· 1° lugar + Plata = $800 → el mejor vendedor de Plata recibe $800</p>
          <p>· 1° lugar + Todas = $500 → cualquier 1° lugar que no tenga bono específico de su campaña recibe $500</p>
          <p>· Si un lugar no tiene bono para la campaña del empleado ni para "Todas", recibe $0.</p>
        </div>
      </div>

      {/* ── Botón guardar ── */}
      <div className="flex justify-end">
        <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()} className="gap-2">
          <Save className="h-4 w-4" /> Guardar configuración
        </Button>
      </div>
    </div>
  )
}

/* ── Stat tile ── */
function StatTile({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'brand' | 'warn' | 'critical' | 'success' }) {
  const toneClasses = {
    brand: 'bg-brand/10 text-brand',
    warn: 'bg-amber-100 text-amber-600',
    critical: 'bg-red-100 text-red-600',
    success: 'bg-emerald-100 text-emerald-600',
  }[tone]
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', toneClasses)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 leading-none tabular-nums truncate">{value}</p>
        <p className="text-[0.7rem] text-gray-400 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

/* ── Dashboard ── */
function NominaDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['nomina-dashboard-resumen'],
    queryFn: async () => (await api.get('/nomina/dashboard/resumen')).data?.data,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-100" />)}
      </div>
    )
  }

  if (!data?.periodo) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-16">
        <Wallet className="h-10 w-10 text-gray-200" />
        <p className="text-sm text-gray-400">Aún no hay ningún periodo calculado</p>
      </div>
    )
  }

  const detalle = (data.detalle ?? []) as DetalleEmpleado[]
  const maxDescuento = Math.max(1, ...detalle.map((d) => d.montoDescuento))

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={DollarSign} label="Costo total del periodo" value={fmtMoney(data.costoTotal)} tone="brand" />
        <StatTile icon={TrendingUp} label="Costo por hora (prom.)" value={fmtMoney(data.costoPorHoraPromedio)} tone="success" />
        <StatTile icon={AlertTriangle} label="Total descontado" value={fmtMoney(data.totalDescuentos)} tone="warn" />
        <StatTile icon={Users} label="Empleados calculados" value={String(data.totalEmpleados)} tone="brand" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile icon={TrendingUp} label="Proyección mensual" value={fmtMoney(data.proyeccionMensual)} tone="brand" />
        <StatTile icon={TrendingUp} label="Proyección anual" value={fmtMoney(data.proyeccionAnual)} tone="brand" />
      </div>

      <div className="card p-5">
        <h3 className="text-[0.8rem] font-bold text-gray-700 mb-4">Descuento por empleado — {fmtFecha(data.periodo.fechaInicio)} al {fmtFecha(data.periodo.fechaFin)}</h3>
        {detalle.length === 0 ? (
          <p className="py-8 text-center text-[0.8rem] text-gray-400">Sin empleados en este periodo</p>
        ) : (
          <div className="space-y-3">
            {detalle.map((d) => (
              <div key={d.neusId}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[0.75rem] font-semibold text-gray-700 truncate pr-2">{d.nombre}</span>
                  <span className="text-[0.68rem] font-semibold text-gray-400 flex-shrink-0 tabular-nums">
                    {d.diasFalta}d falta · {fmtMoney(d.montoDescuento)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(d.montoDescuento / maxDescuento) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Modal desglose de faltas por empleado ── */
interface DesgloseDia { fecha: string; tipo: 'asistencia' | 'retardo' | 'falta' | 'justificado' | 'medio_dia' | 'falta_justificada'; hora: string | null; motivo: string | null }
interface DesgloseFaltas {
  dias: DesgloseDia[]
  resumen: { totalDiasHabiles: number; totalAsistencias: number; totalRetardos: number; totalFaltasDirectas: number; totalMediosDias: number; totalFaltasJustificadas: number; faltasPorRetardos: number; retardosPorFalta: number; totalFaltas: number }
}

type TipoDia = 'asistencia' | 'retardo' | 'falta' | 'justificado' | 'medio_dia' | 'falta_justificada'
type TipoCfgMap = Record<TipoDia, { label: string; dot: string; text: string; bg: string }>

function DesgloseDiasTabla({ dias, periodoId, neusId, esBorrador, tipoCfg, fmtDia, onCambio }: {
  dias: DesgloseDia[]
  periodoId: number
  neusId: number
  esBorrador: boolean
  tipoCfg: TipoCfgMap
  fmtDia: (f: string) => string
  onCambio: () => void
}) {
  const [editandoDia, setEditandoDia] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const qcTabla = useQueryClient()
  const cambiarEstado = async (fecha: string, tipo: TipoDia) => {
    setGuardando(fecha)
    try {
      await api.patch(`/nomina/periodos/${periodoId}/dia-asistencia/${neusId}`, { fecha, tipo })
      // Recalcular nómina automáticamente para reflejar el cambio
      await api.post(`/nomina/periodos/${periodoId}/calcular`)
      qcTabla.invalidateQueries({ queryKey: ['nomina-detalle', periodoId] })
      onCambio()
      toast.success('Día actualizado')
    } catch {
      toast.error('Error al actualizar el día')
    } finally {
      setGuardando(null)
      setEditandoDia(null)
    }
  }

  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
      <table className="w-full text-[0.78rem]">
        <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Día</th>
            <th className="px-3 py-2 text-left font-semibold text-gray-500">Estado</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-500">Hora entrada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {dias.map((dia) => {
            const cfg = tipoCfg[dia.tipo]
            const esEditando = editandoDia === dia.fecha
            const esGuardando = guardando === dia.fecha
            return (
              <tr key={dia.fecha} className={clsx('transition-colors', dia.tipo === 'falta' ? 'bg-red-50/40' : dia.tipo === 'retardo' ? 'bg-amber-50/40' : dia.tipo === 'medio_dia' ? 'bg-purple-50/40' : dia.tipo === 'falta_justificada' ? 'bg-orange-50/40' : '')}>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDia(dia.fecha)}</td>
                <td className="px-3 py-2">
                  {esBorrador && esEditando ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {(['asistencia', 'retardo', 'falta', 'justificado', 'medio_dia', 'falta_justificada'] as TipoDia[]).map((t) => {
                        const c = tipoCfg[t]
                        return (
                          <button
                            key={t}
                            disabled={esGuardando}
                            onClick={() => cambiarEstado(dia.fecha, t)}
                            className={clsx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold border transition-all',
                              dia.tipo === t ? `${c.bg} ${c.text} border-transparent` : 'bg-card text-gray-400 border-gray-200 hover:border-gray-300',
                              esGuardando && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            <span className={clsx('h-1.5 w-1.5 rounded-full', c.dot)} />
                            {c.label}
                          </button>
                        )
                      })}
                      <button onClick={() => setEditandoDia(null)} className="ml-1 text-[0.68rem] text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => esBorrador && setEditandoDia(dia.fecha)}
                      className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', cfg.bg, cfg.text, esBorrador && 'hover:opacity-80 cursor-pointer')}
                      title={esBorrador ? 'Click para editar' : undefined}
                    >
                      <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                      {cfg.label}
                      {dia.motivo && <span className="font-normal opacity-70">· {dia.motivo}</span>}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">{dia.hora ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DesgloseFaltasModal({ periodoId, empleado, esBorrador, onClose }: { periodoId: number; empleado: DetalleEmpleado; esBorrador: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<DesgloseFaltas>({
    queryKey: ['desglose-faltas', periodoId, empleado.neusId],
    queryFn: async () => {
      const { data } = await api.get(`/nomina/periodos/${periodoId}/desglose-faltas/${empleado.neusId}`)
      return data.data
    },
  })

  const [editandoFaltas, setEditandoFaltas] = useState(false)
  const [valorFaltas, setValorFaltas] = useState(String(empleado.diasFalta))

  const guardarFaltas = useMutation({
    mutationFn: async (diasFalta: number) => {
      await api.put(`/nomina/periodos/${periodoId}/faltas/${empleado.neusId}`, { diasFalta })
      await api.post(`/nomina/periodos/${periodoId}/calcular`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodoId] })
      toast.success('Faltas actualizadas y nómina recalculada')
      setEditandoFaltas(false)
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const DIAS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const fmtDia = (f: string) => {
    const d = new Date(f + 'T12:00:00')
    return `${DIAS_ES[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' })}`
  }

  const tipoCfg = {
    asistencia:  { label: 'Asistencia',  dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50'  },
    retardo:     { label: 'Retardo',     dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50'    },
    falta:       { label: 'Falta',       dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50'      },
    justificado: { label: 'Justificado', dot: 'bg-sky-500',     text: 'text-sky-700',     bg: 'bg-sky-50'      },
    medio_dia:   { label: 'Medio día',   dot: 'bg-purple-400',  text: 'text-purple-700',  bg: 'bg-purple-50'   },
    falta_justificada: { label: 'Falta justificada', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  }

  const r = data?.resumen

  return (
    <Modal isOpen onClose={onClose} title={`Desglose — ${empleado.nombre}`} size="md">
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>
      ) : !data ? (
        <p className="text-center text-sm text-gray-400 py-8">Sin datos</p>
      ) : (
        <div className="space-y-4">
          {/* Tiles resumen */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Días hábiles', value: r!.totalDiasHabiles,            color: 'text-gray-700' },
              { label: 'Asistencias',  value: r!.totalAsistencias,             color: 'text-emerald-600' },
              { label: 'Retardos',     value: r!.totalRetardos,                color: 'text-amber-600' },
              { label: 'Medio día',    value: r!.totalMediosDias ?? 0,         color: 'text-purple-600' },
              { label: 'F. justif.',   value: r!.totalFaltasJustificadas ?? 0, color: 'text-orange-600' },
              { label: 'Faltas calc.', value: r!.totalFaltas,                  color: 'text-red-500' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-center">
                <p className={clsx('text-lg font-bold tabular-nums', s.color)}>{s.value}</p>
                <p className="text-[0.65rem] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Explicación cálculo */}
          <div className={clsx('rounded-xl border px-4 py-2.5 text-[0.78rem] space-y-0.5', r!.totalFaltas > 0 ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700')}>
            {r!.totalFaltas === 0 ? (
              <p className="font-semibold">Sin faltas en este periodo</p>
            ) : (
              <>
                {r!.totalFaltasDirectas > 0 && (
                  <p>· <span className="font-semibold">{r!.totalFaltasDirectas}</span> falta{r!.totalFaltasDirectas !== 1 ? 's' : ''} por inasistencia directa</p>
                )}
                {(r!.totalMediosDias ?? 0) > 0 && (
                  <p>· <span className="font-semibold">{r!.totalMediosDias}</span> medio{r!.totalMediosDias !== 1 ? 's' : ''} día = <span className="font-semibold">{(r!.totalMediosDias * 0.5).toFixed(1)}</span> falta</p>
                )}
                {(r!.totalFaltasJustificadas ?? 0) > 0 && (
                  <p>· <span className="font-semibold">{r!.totalFaltasJustificadas}</span> falta{r!.totalFaltasJustificadas !== 1 ? 's' : ''} justificada{r!.totalFaltasJustificadas !== 1 ? 's' : ''} (descuento con factor propio)</p>
                )}
                {r!.faltasPorRetardos > 0 && (
                  <p>· <span className="font-semibold">{r!.faltasPorRetardos}</span> falta{r!.faltasPorRetardos !== 1 ? 's' : ''} por retardos acumulados
                    <span className="opacity-70"> ({r!.totalRetardos} retardos ÷ {r!.retardosPorFalta} = {r!.faltasPorRetardos})</span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* Aviso de desactualizado */}
          {!empleado.faltaAjustadaManual && r && r.totalFaltas !== empleado.diasFalta && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[0.75rem] text-amber-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>El desglose en vivo muestra <strong>{r.totalFaltas} falta{r.totalFaltas !== 1 ? 's' : ''}</strong>, pero la nómina tiene guardado <strong>{empleado.diasFalta}</strong>. Presiona "Calcular nómina" para actualizar.</span>
            </div>
          )}

          {/* Ajuste manual */}
          {esBorrador && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.78rem] font-semibold text-gray-700">Faltas a descontar</p>
                <p className="text-[0.68rem] text-gray-400 mt-0.5">
                  {empleado.faltaAjustadaManual ? 'Ajustado manualmente · sobreescribe el cálculo automático' : 'Calculado automáticamente · edita para sobreescribir'}
                </p>
              </div>
              {editandoFaltas ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus type="number" min="0" step="0.5"
                    value={valorFaltas}
                    onChange={(e) => setValorFaltas(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && Number(valorFaltas) >= 0) guardarFaltas.mutate(Number(valorFaltas)) }}
                    className="field py-1 text-[0.82rem] w-20 text-right"
                  />
                  <button
                    onClick={() => Number(valorFaltas) >= 0 && guardarFaltas.mutate(Number(valorFaltas))}
                    disabled={guardarFaltas.isPending}
                    className="rounded-lg bg-brand px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
                  >
                    {guardarFaltas.isPending ? '...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditandoFaltas(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[0.75rem] text-gray-500 hover:bg-gray-100 transition-colors">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={clsx('text-xl font-bold tabular-nums', empleado.faltaAjustadaManual ? 'text-amber-600' : 'text-gray-700')}>{empleado.diasFalta}</span>
                  <button
                    onClick={() => { setValorFaltas(String(empleado.diasFalta)); setEditandoFaltas(true) }}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[0.72rem] text-gray-500 hover:bg-card hover:border-brand hover:text-brand transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tabla día a día */}
          <DesgloseDiasTabla
            dias={data.dias}
            periodoId={periodoId}
            neusId={empleado.neusId}
            esBorrador={esBorrador}
            tipoCfg={tipoCfg}
            fmtDia={fmtDia}
            onCambio={() => { qc.invalidateQueries({ queryKey: ['desglose-faltas', periodoId, empleado.neusId] }) }}
          />
        </div>
      )}
    </Modal>
  )
}

/* ── Días de falta editables inline (captura manual, como en el Excel de RH) ── */
function DiasFaltaCell({ periodoId, empleado, esBorrador }: { periodoId: number; empleado: DetalleEmpleado; esBorrador: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(empleado.diasFalta))

  const guardar = useMutation({
    mutationFn: async (diasFalta: number) => {
      await api.put(`/nomina/periodos/${periodoId}/faltas/${empleado.neusId}`, { diasFalta })
      // Recalcula automáticamente para reflejar el nuevo descuento/total de inmediato.
      await api.post(`/nomina/periodos/${periodoId}/calcular`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodoId] })
      toast.success('Días de falta guardados y reflejados en la nómina')
      setEditando(false)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  if (!esBorrador) return <span className="tabular-nums text-gray-600">{empleado.diasFalta}</span>

  if (editando) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <input
          autoFocus
          type="number"
          min="0"
          step="0.5"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="field py-1 text-[0.78rem] w-16 text-right"
          onKeyDown={(e) => { if (e.key === 'Enter' && Number(valor) >= 0) guardar.mutate(Number(valor)) }}
        />
        <button onClick={() => Number(valor) >= 0 && guardar.mutate(Number(valor))} disabled={guardar.isPending}
          className="rounded-lg p-1 text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0">
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button onClick={() => { setValor(String(empleado.diasFalta)); setEditando(true) }} className="group flex items-center justify-end gap-1.5 ml-auto">
      <span className="tabular-nums text-gray-600">{empleado.diasFalta}</span>
      <Pencil className="h-3 w-3 text-gray-300 group-hover:text-brand transition-colors flex-shrink-0" />
    </button>
  )
}

function NominaPreview({ periodo }: { periodo: Periodo }) {
  const qc = useQueryClient()
  const [showExcepcion, setShowExcepcion] = useState(false)
  const [confirmAprobar, setConfirmAprobar] = useState(false)
  const [empleadoComisiones, setEmpleadoComisiones] = useState<DetalleEmpleado | null>(null)
  const [empleadoDesglose, setEmpleadoDesglose] = useState<DetalleEmpleado | null>(null)
  const [empleadoVentas, setEmpleadoVentas] = useState<DetalleEmpleado | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<DetalleEmpleado | null>(null)
  const [confirmExcluir, setConfirmExcluir] = useState<DetalleEmpleado | null>(null)
  const [showExcluidos, setShowExcluidos] = useState(false)

  const eliminarDetalle = useMutation({
    mutationFn: (neusId: number) => api.delete(`/nomina/periodos/${periodo.id}/detalle/${neusId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodo.id] })
      toast.success('Empleado eliminado del pre-cálculo')
      setConfirmEliminar(null)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'),
  })

  const excluirAgente = useMutation({
    mutationFn: (neusId: number) => api.post('/nomina/agentes-excluidos', { neusId, motivo: 'Excluido desde detalle de nómina', periodoId: periodo.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodo.id] })
      qc.invalidateQueries({ queryKey: ['nomina-excluidos'] })
      qc.invalidateQueries({ queryKey: ['nomina-excluidos-ids'] })
      toast.success('Agente excluido — no volverá a aparecer en ningún cálculo hasta que lo quites de la lista')
      setConfirmExcluir(null)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al excluir'),
  })

  const limpiarExcluidos = useMutation({
    mutationFn: () => api.post(`/nomina/periodos/${periodo.id}/limpiar-excluidos`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodo.id] })
      const n = res.data?.removidos ?? 0
      toast.success(n > 0 ? `${n} agente${n !== 1 ? 's' : ''} excluido${n !== 1 ? 's' : ''} quitado${n !== 1 ? 's' : ''} del detalle` : 'No había excluidos pendientes de quitar')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al limpiar'),
  })

  const { data: detalle = [], isLoading } = useQuery<DetalleEmpleado[]>({
    queryKey: ['nomina-detalle', periodo.id],
    queryFn: async () => (await api.get(`/nomina/periodos/${periodo.id}/detalle`)).data?.data ?? [],
  })

  const exportarExcel = () => {
    if (detalle.length === 0) return toast.error('No hay datos para exportar')

    const headers = [
      'Lugar', 'Empleado', 'Sueldo quincenal', 'Días falta', 'Faltas directas',
      'Retardos', 'Faltas por retardos', 'Descuento total', 'Sueldo neto',
      'Total ventas', 'Comisiones', 'Bono ranking', 'Total a pagar', 'Ganancia empresa',
    ]

    const filas = detalle.map((d) => ({
      'Lugar': d.lugarRanking ?? '',
      'Empleado': d.nombre,
      'Sueldo quincenal': d.sueldoQuincenal,
      'Días falta': d.diasFalta,
      'Faltas directas': d.diasFalta - (d.faltasPorRetardos ?? 0),
      'Retardos': d.totalRetardos ?? 0,
      'Faltas por retardos': d.faltasPorRetardos ?? 0,
      'Descuento total': d.montoDescuento,
      'Sueldo neto': d.sueldoNeto,
      'Total ventas': d.totalVentas ?? 0,
      'Comisiones': d.totalComisiones,
      'Bono ranking': d.bonoRanking ?? 0,
      'Total a pagar': d.totalAPagar,
      'Ganancia empresa': d.comisiones.reduce((s, c) => s + c.numVentas * c.gananciaNeta, 0),
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(filas, { header: headers })

    // Anchos de columna
    ws['!cols'] = [
      { wch: 6 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
      { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
    ]

    // Fila de título con info del periodo
    XLSX.utils.sheet_add_aoa(ws, [
      [`NÓMINA — ${fmtFecha(periodo.fechaInicio)} al ${fmtFecha(periodo.fechaFin)}`],
      [`Generado: ${new Date().toLocaleString('es-MX')}`],
      [],
    ], { origin: 'A1' })
    XLSX.utils.sheet_add_json(ws, filas, { header: headers, origin: 'A4', skipHeader: false })

    // Fila de totales al final
    const lastRow = filas.length + 5
    const totalFila = {
      'Lugar': '', 'Empleado': 'TOTALES',
      'Sueldo quincenal': detalle.reduce((s, d) => s + d.sueldoQuincenal, 0),
      'Días falta': '', 'Faltas directas': '', 'Retardos': '', 'Faltas por retardos': '',
      'Descuento total': detalle.reduce((s, d) => s + d.montoDescuento, 0),
      'Sueldo neto': detalle.reduce((s, d) => s + d.sueldoNeto, 0),
      'Total ventas': detalle.reduce((s, d) => s + (d.totalVentas ?? 0), 0),
      'Comisiones': detalle.reduce((s, d) => s + d.totalComisiones, 0),
      'Bono ranking': detalle.reduce((s, d) => s + (d.bonoRanking ?? 0), 0),
      'Total a pagar': detalle.reduce((s, d) => s + d.totalAPagar, 0),
      'Ganancia empresa': detalle.reduce((s, d) => s + d.comisiones.reduce((sc, c) => sc + c.numVentas * c.gananciaNeta, 0), 0),
    }
    XLSX.utils.sheet_add_json(ws, [totalFila], { header: headers, origin: `A${lastRow}`, skipHeader: true })

    XLSX.utils.book_append_sheet(wb, ws, 'Nómina')
    XLSX.writeFile(wb, `nomina_${periodo.fechaInicio}_${periodo.fechaFin}.xlsx`)
  }

  const { data: excepciones = [] } = useQuery<Excepcion[]>({
    queryKey: ['nomina-excepciones', periodo.id],
    queryFn: async () => (await api.get(`/nomina/periodos/${periodo.id}/excepciones`)).data?.data ?? [],
  })

  const calcular = useMutation({
    mutationFn: () => api.post(`/nomina/periodos/${periodo.id}/calcular`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-detalle', periodo.id] })
      qc.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Nómina calculada')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al calcular'),
  })

  const [confirmRevertir, setConfirmRevertir] = useState(false)
  const [confirmBorrarPeriodo, setConfirmBorrarPeriodo] = useState(false)

  const aprobar = useMutation({
    mutationFn: () => api.post(`/nomina/periodos/${periodo.id}/aprobar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Periodo aprobado')
      setConfirmAprobar(false)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al aprobar'),
  })

  const revertir = useMutation({
    mutationFn: () => api.post(`/nomina/periodos/${periodo.id}/revertir`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Aprobación revertida, el periodo volvió a borrador')
      setConfirmRevertir(false)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al revertir'),
  })

  const borrarPeriodo = useMutation({
    mutationFn: () => api.delete(`/nomina/periodos/${periodo.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Periodo eliminado')
      setConfirmBorrarPeriodo(false)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al eliminar'),
  })

  const eliminarExcepcion = useMutation({
    mutationFn: (id: number) => api.delete(`/nomina/excepciones/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-excepciones', periodo.id] })
      toast.success('Excepción eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const totalNeto       = useMemo(() => detalle.reduce((s, d) => s + d.sueldoNeto, 0), [detalle])
  const totalComisiones = useMemo(() => detalle.reduce((s, d) => s + d.totalComisiones, 0), [detalle])
  const totalBonos      = useMemo(() => detalle.reduce((s, d) => s + (d.bonoRanking ?? 0), 0), [detalle])
  const totalAPagar     = useMemo(() => detalle.reduce((s, d) => s + d.totalAPagar, 0), [detalle])
  const totalVentas     = useMemo(() => detalle.reduce((s, d) => s + (d.totalVentas ?? 0), 0), [detalle])
  const totalGanancia   = useMemo(() => detalle.reduce((s, d) => s + d.comisiones.reduce((sc, c) => sc + c.numVentas * c.gananciaNeta, 0), 0), [detalle])
  const esBorrador = periodo.estado === 'borrador'

  const qcInner = useQueryClient()
  const [editFechas, setEditFechas] = useState(false)
  const [fb, setFb] = useState(periodo.fechaBase ?? periodo.fechaInicio)
  const [fc, setFc] = useState(periodo.fechaCorte ?? periodo.fechaFin)

  const abrirEditFechas = () => {
    // Releer siempre desde `periodo` al abrir — evita mostrar valores obsoletos
    // si el componente no se remonta entre ediciones (mismo id de periodo).
    setFb(periodo.fechaBase ?? periodo.fechaInicio)
    setFc(periodo.fechaCorte ?? periodo.fechaFin)
    setEditFechas(true)
  }

  // La ventana de asistencias/ventas solo se muestra por separado cuando fue
  // ajustada manualmente — por defecto coincide con el ciclo fijo del periodo.
  const fechasAsistDifieren =
    (periodo.fechaBase ?? periodo.fechaInicio) !== periodo.fechaInicio ||
    (periodo.fechaCorte ?? periodo.fechaFin) !== periodo.fechaFin

  const saveFechas = useMutation({
    mutationFn: () => api.patch(`/nomina/periodos/${periodo.id}/fechas`, { fechaBase: fb, fechaCorte: fc }),
    onSuccess: () => {
      qcInner.invalidateQueries({ queryKey: ['nomina-periodos'] })
      toast.success('Rango actualizado')
      setEditFechas(false)
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-4 w-1 rounded-full bg-brand" />
          <span className="text-[0.8rem] font-bold text-gray-700">
            {fmtFecha(periodo.fechaInicio)} al {fmtFecha(periodo.fechaFin)}
          </span>
          <span className={clsx('chip text-[0.65rem]', esBorrador ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
            {esBorrador ? 'Borrador' : 'Aprobado'}
          </span>
          {/* Rango de asistencias/ventas — solo se muestra por separado si difiere del periodo */}
          {!editFechas ? (
            fechasAsistDifieren ? (
              <span className="flex items-center gap-1 text-[0.68rem] text-gray-400">
                · Asist/Ventas: <span className="font-medium text-gray-600">{fmtFecha(periodo.fechaBase ?? periodo.fechaInicio)} – {fmtFecha(periodo.fechaCorte ?? periodo.fechaFin)}</span>
                {esBorrador && (
                  <button onClick={abrirEditFechas} className="ml-1 text-brand hover:underline text-[0.68rem]">editar</button>
                )}
              </span>
            ) : (
              esBorrador && (
                <button onClick={abrirEditFechas} className="text-[0.68rem] text-brand hover:underline">
                  editar ventana de asistencias/ventas
                </button>
              )
            )
          ) : (
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[0.68rem] text-gray-500">Asist/Ventas:</span>
              <input type="date" value={fb} onChange={(e) => setFb(e.target.value)} className="field py-0.5 px-2 text-[0.72rem] w-36" />
              <span className="text-[0.68rem] text-gray-400">–</span>
              <input type="date" value={fc} onChange={(e) => setFc(e.target.value)} className="field py-0.5 px-2 text-[0.72rem] w-36" />
              <Button isLoading={saveFechas.isPending} onClick={() => saveFechas.mutate()} className="text-[0.72rem] py-0.5 px-2 h-auto">Guardar</Button>
              <button onClick={() => setEditFechas(false)} className="text-[0.68rem] text-gray-400 hover:text-gray-600">Cancelar</button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Grupo: operación normal del periodo */}
          <Button onClick={() => setShowExcluidos(true)} variant="ghost" title="Agentes excluidos de nómina" className="text-[0.78rem] py-1.5 px-3 text-gray-500">
            <ShieldOff className="h-3.5 w-3.5" /> Excluidos
          </Button>
          {esBorrador && (
            <>
              <Button
                onClick={() => limpiarExcluidos.mutate()}
                isLoading={limpiarExcluidos.isPending}
                variant="ghost"
                title="Quitar del detalle a quienes ya estén en la lista de excluidos"
                className="text-[0.78rem] py-1.5 px-3 text-gray-500"
              >
                <UserX className="h-3.5 w-3.5" /> Limpiar excluidos
              </Button>
              <Button onClick={() => setShowExcepcion(true)} variant="ghost" className="text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Excepción
              </Button>
              <Button isLoading={calcular.isPending} onClick={() => calcular.mutate()} className="text-[0.78rem] py-1.5 px-3">
                <RefreshCw className="h-3.5 w-3.5" /> Calcular nómina
              </Button>
            </>
          )}
          {detalle.length > 0 && (
            <Button onClick={exportarExcel} variant="ghost" className="text-[0.78rem] py-1.5 px-3 text-emerald-700 hover:bg-emerald-50">
              <Save className="h-3.5 w-3.5" /> Exportar Excel
            </Button>
          )}

          {/* Grupo: cierre del periodo (pagos reales) */}
          {esBorrador && periodo.fechaCalculo && (
            <>
              <div className="mx-1 h-6 w-px bg-gray-200 flex-shrink-0" />
              <Button onClick={() => setConfirmAprobar(true)} className="bg-emerald-600 hover:bg-emerald-700 text-[0.78rem] py-1.5 px-3">
                <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar periodo
              </Button>
            </>
          )}
          {!esBorrador && (
            <Button onClick={() => setConfirmRevertir(true)} variant="ghost" className="text-[0.78rem] py-1.5 px-3 text-amber-600 hover:bg-amber-50">
              <RotateCcw className="h-3.5 w-3.5" /> Revertir aprobación
            </Button>
          )}

          {/* Acción destructiva: apartada al final */}
          {esBorrador && (
            <>
              <div className="mx-1 h-6 w-px bg-gray-200 flex-shrink-0" />
              <Button onClick={() => setConfirmBorrarPeriodo(true)} variant="ghost" title="Eliminar este periodo de nómina" className="text-[0.78rem] py-1.5 px-3 text-red-500 hover:bg-red-50">
                <X className="h-3.5 w-3.5" /> Borrar periodo
              </Button>
            </>
          )}
        </div>
      </div>

      {excepciones.length > 0 && (
        <div className="card p-4">
          <p className="text-[0.7rem] font-bold text-gray-500 uppercase tracking-wide mb-2">Excepciones registradas</p>
          <div className="space-y-2">
            {excepciones.map((ex) => (
              <div key={ex.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[0.78rem] font-semibold text-gray-800">{ex.nombre} <span className="text-gray-400 font-normal">· {fmtFecha(ex.fechaIncidencia)}</span></p>
                  <p className="text-[0.72rem] text-gray-500 mt-0.5">{ex.motivo}</p>
                </div>
                {esBorrador && (
                  <button onClick={() => eliminarExcepcion.mutate(ex.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Empleado</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Sueldo</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Faltas / Asist.</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Descuento</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Neto</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Ventas</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Comisiones por campaña</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Bono ranking</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Total a pagar</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-emerald-600 uppercase tracking-wide">Ganancia empresa</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={10} className="px-4 py-3"><div className="h-3 w-full rounded-full bg-gray-100" /></td></tr>
                ))
              ) : detalle.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-gray-400 text-sm">Sin cálculo todavía. Presiona "Calcular nómina".</td></tr>
              ) : (
                detalle.map((d) => {
                  const comConVentas = (d.comisiones ?? []).filter((c) => c.numVentas > 0 || c.monto > 0)
                  return (
                    <tr key={d.neusId}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {d.lugarRanking != null && d.lugarRanking <= 3 && (
                            <span className={clsx(
                              'inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold',
                              d.lugarRanking === 1 ? 'bg-amber-100 text-amber-700' :
                              d.lugarRanking === 2 ? 'bg-gray-100 text-gray-600' :
                              'bg-orange-100 text-orange-700'
                            )}>
                              {d.lugarRanking}°
                            </span>
                          )}
                          <div>
                            <p className="font-medium text-gray-800 text-[0.82rem]">{d.nombre || <span className="text-gray-300 italic">Sin nombre</span>}</p>
                            {d.puesto && <p className="text-[0.7rem] text-gray-400">{d.puesto}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 text-[0.82rem]">{fmtMoney(d.sueldoQuincenal)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEmpleadoDesglose(d)}
                          className="group flex flex-col items-end gap-0.5 ml-auto hover:opacity-80 transition-opacity"
                          title="Ver desglose"
                        >
                          <span className={clsx('tabular-nums font-semibold text-[0.82rem]', d.diasFalta > 0 ? 'text-red-500' : 'text-gray-400')}>
                            {d.diasFalta > 0 ? `${d.diasFalta} falta${d.diasFalta !== 1 ? 's' : ''}` : '—'}
                            {d.faltaAjustadaManual && <span className="ml-1 text-amber-500 text-[0.7rem]">✎</span>}
                          </span>
                          <span className="text-[0.62rem] text-gray-400 tabular-nums">
                            {d.diasConEntrada ?? 0} asist. · <span className="text-brand group-hover:underline">detalle</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[0.82rem]">
                        {d.montoDescuento > 0 ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-red-500 block">{fmtMoney(d.montoDescuento)}</span>
                            {/* Razón del descuento por faltas */}
                            {(d.diasFalta ?? 0) > 0 && (() => {
                              const faltasDirectas = (d.diasFalta ?? 0) - (d.faltasPorRetardos ?? 0)
                              const partes: string[] = []
                              if (faltasDirectas > 0) partes.push(`${faltasDirectas} falta${faltasDirectas !== 1 ? 's' : ''}`)
                              if ((d.faltasPorRetardos ?? 0) > 0) partes.push(`${d.faltasPorRetardos} por retardos (${d.totalRetardos} ret.)`)
                              return partes.length > 0 ? (
                                <span className="block text-[0.68rem] text-red-400">{partes.join(' + ')}</span>
                              ) : null
                            })()}
                            {(d.descuentoPausa ?? 0) > 0 && (
                              <span className="block text-[0.68rem] text-orange-500">
                                {d.minutosExcesoPausa} min pausa extra · {fmtMoney(d.descuentoPausa ?? 0)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 text-[0.82rem]">{fmtMoney(d.sueldoNeto)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={clsx('tabular-nums font-semibold text-[0.82rem]', (d.totalVentas ?? 0) > 0 ? 'text-gray-800' : 'text-gray-300')}>
                          {d.totalVentas ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {comConVentas.length === 0 ? (
                          <span className="text-[0.72rem] text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {comConVentas.map((c) => {
                              const col = campColor(c.campanaId)
                              return (
                                <button
                                  key={c.campanaId}
                                  onClick={() => setEmpleadoVentas(d)}
                                  className={clsx('flex items-center gap-1 rounded-full px-2 py-0.5 hover:opacity-75 transition-opacity', col.bg)}
                                  title="Ver ventas del periodo"
                                >
                                  <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', col.dot)} />
                                  <span className={clsx('text-[0.68rem] font-semibold', col.text)}>{c.campana}</span>
                                  <span className={clsx('text-[0.68rem]', col.text)}>· {c.numVentas}v</span>
                                  {c.monto > 0 && <span className={clsx('text-[0.68rem] font-bold', col.text)}> {fmtMoney(c.monto)}</span>}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[0.82rem]">
                        {(d.bonoRanking ?? 0) > 0
                          ? <span className="font-semibold text-amber-600">{fmtMoney(d.bonoRanking)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-bold text-[0.82rem]">{fmtMoney(d.totalAPagar)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[0.82rem]">
                        {(() => {
                          const g = d.comisiones.reduce((s, c) => s + c.numVentas * c.gananciaNeta, 0)
                          return g > 0
                            ? <span className="font-semibold text-emerald-600">{fmtMoney(g)}</span>
                            : <span className="text-gray-300">—</span>
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {esBorrador && (
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setEmpleadoComisiones(d)} title="Editar comisiones"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-brand/8 hover:text-brand transition-colors">
                              <Coins className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setConfirmEliminar(d)} title="Quitar del pre-cálculo"
                              className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setConfirmExcluir(d)} title="Excluir permanentemente de todo cálculo futuro"
                              className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <UserX className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {detalle.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/50">
                  <td className="px-4 py-2.5 font-bold text-gray-700 text-[0.8rem]" colSpan={4}>Totales</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-700 tabular-nums">{fmtMoney(totalNeto)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-800 tabular-nums">{totalVentas}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-700 tabular-nums">{fmtMoney(totalComisiones)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-amber-600 tabular-nums">{fmtMoney(totalBonos)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{fmtMoney(totalAPagar)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-600 tabular-nums" colSpan={2}>{totalGanancia > 0 ? fmtMoney(totalGanancia) : '—'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showExcepcion && <ExcepcionModal periodoId={periodo.id} onClose={() => setShowExcepcion(false)} />}
      {empleadoComisiones && (
        <ComisionesModal periodoId={periodo.id} empleado={empleadoComisiones} onClose={() => setEmpleadoComisiones(null)} />
      )}
      {empleadoVentas && (
        <VentasEmpleadoModal periodoId={periodo.id} empleado={empleadoVentas} onClose={() => setEmpleadoVentas(null)} />
      )}
      {empleadoDesglose && (
        <DesgloseFaltasModal periodoId={periodo.id} empleado={empleadoDesglose} esBorrador={esBorrador} onClose={() => setEmpleadoDesglose(null)} />
      )}

      <ConfirmDialog
        isOpen={confirmBorrarPeriodo}
        onClose={() => setConfirmBorrarPeriodo(false)}
        onConfirm={() => borrarPeriodo.mutate()}
        title="Eliminar periodo"
        message={`Se eliminará el periodo ${fmtFecha(periodo.fechaInicio)} – ${fmtFecha(periodo.fechaFin)} junto con todo su pre-cálculo. Esta acción no se puede deshacer. ¿Continuar?`}
        confirmLabel="Eliminar"
        isPending={borrarPeriodo.isPending}
      />

      <ConfirmDialog
        isOpen={!!confirmEliminar}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => confirmEliminar && eliminarDetalle.mutate(confirmEliminar.neusId)}
        title="Quitar del pre-cálculo"
        message={`Se eliminará a ${confirmEliminar?.nombre} de este periodo. Puedes volver a incluirlo presionando "Calcular nómina" si tiene ventas en el rango. ¿Continuar?`}
        confirmLabel="Eliminar"
        isPending={eliminarDetalle.isPending}
      />

      <ConfirmDialog
        isOpen={confirmAprobar}
        onClose={() => setConfirmAprobar(false)}
        onConfirm={() => aprobar.mutate()}
        title="Aprobar periodo de nómina"
        message="Al aprobar, el periodo queda cerrado y no podrá recalcularse ni agregarse más excepciones. ¿Continuar?"
        confirmLabel="Aprobar"
        isPending={aprobar.isPending}
      />

      <ConfirmDialog
        isOpen={confirmRevertir}
        onClose={() => setConfirmRevertir(false)}
        onConfirm={() => revertir.mutate()}
        title="Revertir aprobación"
        message="El periodo volverá a estado 'Borrador' y podrás editar excepciones, comisiones y recalcular de nuevo. ¿Continuar?"
        confirmLabel="Revertir"
        isPending={revertir.isPending}
      />

      <ConfirmDialog
        isOpen={!!confirmExcluir}
        onClose={() => setConfirmExcluir(null)}
        onConfirm={() => confirmExcluir && excluirAgente.mutate(confirmExcluir.neusId)}
        title="Excluir agente permanentemente"
        message={`${confirmExcluir?.nombre} no volverá a aparecer en ningún cálculo de nómina futuro, sin importar asistencia o ventas, hasta que lo quites de la lista de excluidos. ¿Continuar?`}
        confirmLabel="Excluir"
        isPending={excluirAgente.isPending}
      />

      {showExcluidos && <ExcluidosModal onClose={() => setShowExcluidos(false)} />}
    </div>
  )
}

/* ── Gestión de la lista negra de agentes excluidos ── */
interface AgenteExcluido {
  id: number
  neusId: number
  nombre: string | null
  motivo: string | null
  fecha: string
}

function ExcluidosModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [confirmVaciar, setConfirmVaciar] = useState(false)

  const { data: excluidos = [], isLoading } = useQuery<AgenteExcluido[]>({
    queryKey: ['nomina-excluidos'],
    queryFn: async () => (await api.get('/nomina/agentes-excluidos')).data?.data ?? [],
    // Siempre trae datos frescos al abrir el modal — no depender solo de que
    // otra pantalla haya invalidado la query correctamente.
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const quitar = useMutation({
    mutationFn: (neusId: number) => api.delete(`/nomina/agentes-excluidos/${neusId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-excluidos'] })
      qc.invalidateQueries({ queryKey: ['nomina-excluidos-ids'] })
      toast.success('Agente quitado de la lista — podrá volver a aparecer en próximos cálculos')
    },
    onError: () => toast.error('Error al quitar de la lista'),
  })

  const vaciarTodo = useMutation({
    mutationFn: () => api.delete('/nomina/agentes-excluidos'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-excluidos'] })
      qc.invalidateQueries({ queryKey: ['nomina-excluidos-ids'] })
      toast.success('Lista de excluidos vaciada — nadie queda excluido')
      setConfirmVaciar(false)
    },
    onError: () => toast.error('Error al vaciar la lista'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Agentes excluidos de nómina" size="md">
      <div className="space-y-3">
        <p className="text-[0.78rem] text-gray-500">
          Estos agentes no aparecerán en ningún cálculo de nómina futuro, sin importar su asistencia o ventas,
          hasta que los quites de esta lista.
        </p>
        {excluidos.length > 0 && !confirmVaciar && (
          <button onClick={() => setConfirmVaciar(true)} className="text-[0.72rem] text-red-500 hover:underline">
            Vaciar toda la lista
          </button>
        )}
        {confirmVaciar && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex-1 text-[0.72rem] text-red-700">¿Quitar a todos de la lista de excluidos?</p>
            <Button variant="ghost" onClick={() => setConfirmVaciar(false)} className="text-[0.7rem] py-1 px-2">Cancelar</Button>
            <Button isLoading={vaciarTodo.isPending} onClick={() => vaciarTodo.mutate()} className="text-[0.7rem] py-1 px-2 !bg-red-600 hover:!bg-red-700">
              Vaciar
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : excluidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
            <ShieldOff className="h-7 w-7 text-gray-300" />
            <p className="text-sm">Sin agentes excluidos</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {excluidos.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[0.82rem] font-semibold text-gray-800 truncate">{e.nombre ?? `ID ${e.neusId}`}</p>
                  <p className="text-[0.68rem] text-gray-400">{e.motivo || 'Sin motivo especificado'}</p>
                </div>
                <Button
                  variant="ghost"
                  isLoading={quitar.isPending}
                  onClick={() => quitar.mutate(e.neusId)}
                  className="text-[0.72rem] py-1 px-2.5 flex-shrink-0 text-brand hover:bg-brand/8"
                >
                  Quitar de la lista
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ── Sueldos: captura del sueldo quincenal de cada empleado CC ── */
interface EmpleadoCC {
  id: number
  nombre: string
  puesto: string | null
}

function SueldoRow({ emp }: { emp: EmpleadoCC }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')

  const { data: percepciones = [], isLoading } = useQuery<{ sueldoQuincenal: number; activo: boolean }[]>({
    queryKey: ['nomina-percepciones', emp.id],
    queryFn: async () => (await api.get(`/nomina/percepciones/${emp.id}`)).data?.data ?? [],
  })
  const vigente = percepciones.find((p) => p.activo)

  const guardar = useMutation({
    mutationFn: (sueldoQuincenal: number) => api.put(`/nomina/percepciones/${emp.id}`, { sueldoQuincenal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nomina-percepciones', emp.id] })
      toast.success('Sueldo actualizado')
      setEditando(false)
    },
    onError: () => toast.error('Error al actualizar el sueldo'),
  })

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-800 text-[0.82rem]">{emp.nombre}</p>
        {emp.puesto && <p className="text-[0.7rem] text-gray-400">{emp.puesto}</p>}
      </td>
      <td className="px-4 py-3 text-right">
        {isLoading ? (
          <div className="h-4 w-20 rounded-full bg-gray-100 animate-pulse ml-auto" />
        ) : editando ? (
          <div className="flex items-center justify-end gap-1.5">
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej. 3000"
              className="field py-1 text-[0.78rem] w-28 text-right"
              onKeyDown={(e) => { if (e.key === 'Enter' && Number(valor) > 0) guardar.mutate(Number(valor)) }}
            />
            <button onClick={() => Number(valor) > 0 && guardar.mutate(Number(valor))} disabled={guardar.isPending || !(Number(valor) > 0)}
              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditando(false)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => { setValor(vigente ? String(vigente.sueldoQuincenal) : ''); setEditando(true) }}
            className="group flex items-center justify-end gap-1.5 ml-auto">
            <p className={vigente ? 'text-[0.82rem] font-semibold text-emerald-600' : 'text-[0.82rem] text-gray-300 italic'}>
              {vigente ? fmtMoney(vigente.sueldoQuincenal) : 'Sin sueldo capturado'}
            </p>
            <Pencil className="h-3 w-3 text-gray-300 group-hover:text-brand transition-colors flex-shrink-0" />
          </button>
        )}
      </td>
    </tr>
  )
}

function NominaSueldos() {
  const { data: empleadosRaw = [], isLoading } = useQuery<EmpleadoCC[]>({
    queryKey: ['nomina-empleados-cc'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/area/CC')
      const list = Array.isArray(data?.data) ? data.data : []
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id']),
        nombre: String(r['nombre'] ?? ''),
        puesto: r['puesto'] ? String(r['puesto']) : null,
      }))
    },
  })
  const { data: idsExcluidos = new Set<number>() } = useQuery<Set<number>>({
    queryKey: ['nomina-excluidos-ids'],
    queryFn: async () => {
      const { data } = await api.get('/nomina/agentes-excluidos')
      const list = Array.isArray(data?.data) ? data.data : []
      return new Set((list as Record<string, unknown>[]).map((r) => Number(r['neusId'])))
    },
  })
  const empleados = useMemo(() => empleadosRaw.filter((e) => !idsExcluidos.has(e.id)), [empleadosRaw, idsExcluidos])

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-[0.72rem] text-gray-400">Sueldo quincenal base de cada empleado de Call Center. Se usa para calcular el descuento por faltas y el total a pagar.</p>
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Empleado</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Sueldo quincenal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={2} className="px-4 py-3"><div className="h-3 w-full rounded-full bg-gray-100" /></td></tr>
                ))
              ) : empleados.length === 0 ? (
                <tr><td colSpan={2} className="px-4 py-16 text-center text-gray-400 text-sm">Sin empleados de Call Center registrados</td></tr>
              ) : (
                empleados.map((emp) => <SueldoRow key={emp.id} emp={emp} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function NominaPage() {
  const [vista, setVista] = useState<'preview' | 'dashboard' | 'sueldos' | 'config'>('preview')
  const [showCrear, setShowCrear] = useState(false)
  const [periodoId, setPeriodoId] = useState<number | null>(null)

  const { data: periodos = [], isLoading, refetch, isRefetching } = useQuery<Periodo[]>({
    queryKey: ['nomina-periodos'],
    queryFn: async () => {
      const { data } = await api.get('/nomina/periodos')
      const list = Array.isArray(data?.data) ? data.data : []
      return (list as Record<string, unknown>[]).map(parsePeriodo)
    },
  })

  const periodoDefault = periodos.find((p) => p.fechaCalculo !== null) ?? periodos[0] ?? null
  const periodoActivo = periodos.find((p) => p.id === periodoId) ?? periodoDefault

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Nómina</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">Call Center · Periodos quincenales</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {periodos.length > 1 && (
                <select
                  value={periodoActivo?.id ?? ''}
                  onChange={(e) => setPeriodoId(Number(e.target.value))}
                  className="rounded-lg bg-white/10 border-0 text-white text-[0.78rem] px-3 py-1.5 focus:ring-2 focus:ring-white/30"
                >
                  {periodos.map((p) => (
                    <option key={p.id} value={p.id} className="text-gray-800">
                      {fmtFecha(p.fechaInicio)} – {fmtFecha(p.fechaFin)}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
                <button onClick={() => setVista('preview')} title="Ver preview"
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'preview' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}>
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button onClick={() => setVista('dashboard')} title="Ver dashboard"
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'dashboard' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}>
                  <PieChart className="h-4 w-4" />
                </button>
                <button onClick={() => setVista('sueldos')} title="Editar sueldos"
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'sueldos' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}>
                  <BadgeDollarSign className="h-4 w-4" />
                </button>
                <button onClick={() => setVista('config')} title="Configuración"
                  className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'config' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}>
                  <Settings className="h-4 w-4" />
                </button>
              </div>
              <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <Button onClick={() => setShowCrear(true)} className="bg-card !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Plus className="h-3.5 w-3.5" /> Nueva quincena
              </Button>
            </div>
          </div>
        </div>
      </div>

      {vista === 'config' ? (
        <NominaConfig />
      ) : vista === 'dashboard' ? (
        <NominaDashboard />
      ) : vista === 'sueldos' ? (
        <NominaSueldos />
      ) : isLoading ? (
        <div className="card h-40 animate-pulse bg-gray-100" />
      ) : !periodoActivo ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <Wallet className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin periodos de nómina</p>
            <p className="text-xs text-gray-400 mt-0.5">Crea la primera quincena con el botón de arriba</p>
          </div>
        </div>
      ) : (
        <NominaPreview periodo={periodoActivo} />
      )}

      {showCrear && <CrearPeriodoModal onClose={() => setShowCrear(false)} ultimoPeriodo={periodos[0] ?? null} />}
    </div>
  )
}
