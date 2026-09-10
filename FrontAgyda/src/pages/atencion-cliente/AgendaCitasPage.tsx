import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { ChevronLeft, CalendarClock, Plus, Video, Phone, Calendar } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { citaService } from '@/services/cita.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import {
  CITA_MODALIDAD_CONFIG, ESTATUS_CITA_CONFIG,
  type Cita, type CitaEstatus,
} from '@/types/cita.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevaCitaModal } from './components/NuevaCitaModal'
import { CitaDetalleModal } from './components/CitaDetalleModal'
import { SolicitudesCitaPanel } from './components/SolicitudesCitaPanel'

const MODALIDAD_ICON = { videollamada: Video, telefonica: Phone, generica: Calendar }
const ABIERTOS: CitaEstatus[] = ['agendada', 'confirmada', 'reprogramada']

function fmtDia(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) }
  catch { return f }
}
function fmtHora(f: string) {
  try { return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export function AgendaCitasPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')
  const { data: usuarios } = useUsuariosSimple()
  const [params, setParams] = useSearchParams()

  const [filtroEstatus, setFiltroEstatus] = useState<CitaEstatus | ''>('')
  const [filtroAsesor, setFiltroAsesor] = useState('')
  const [rango, setRango] = useState<'proximas' | 'hoy' | 'semana' | 'todas'>('proximas')
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [nueva, setNueva] = useState(false)

  const { desde, hasta } = useMemo(() => {
    const now = new Date()
    if (rango === 'hoy') {
      const d = new Date(now); d.setHours(0, 0, 0, 0)
      const h = new Date(now); h.setHours(23, 59, 59, 999)
      return { desde: d.toISOString(), hasta: h.toISOString() }
    }
    if (rango === 'semana') {
      const d = new Date(now); d.setHours(0, 0, 0, 0)
      const h = new Date(now); h.setDate(h.getDate() + 7)
      return { desde: d.toISOString(), hasta: h.toISOString() }
    }
    if (rango === 'proximas') {
      return { desde: now.toISOString(), hasta: undefined }
    }
    return { desde: undefined, hasta: undefined }
  }, [rango])

  const { data: citas = [], isLoading } = useQuery({
    queryKey: ['citas', rango, filtroEstatus, filtroAsesor],
    queryFn: () => citaService.getAll({
      desde, hasta,
      estatus: filtroEstatus || undefined,
      asignadoA: filtroAsesor ? Number(filtroAsesor) : undefined,
    }),
    staleTime: 15_000,
  })

  // Deep-link ?citaId=
  const citaIdParam = params.get('citaId')
  useEffect(() => {
    if (!citaIdParam) return
    const id = Number(citaIdParam)
    if (detalle?.id === id) return
    const enLista = citas.find((c) => c.id === id)
    if (enLista) { setDetalle(enLista); return }
    citaService.getById(id).then(setDetalle).catch(() => {
      setParams((p) => { p.delete('citaId'); return p }, { replace: true })
    })
  }, [citaIdParam, citas]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrarDetalle = () => {
    setDetalle(null)
    if (params.has('citaId')) setParams((p) => { p.delete('citaId'); return p }, { replace: true })
  }

  // Agrupa por día para la lista.
  const porDia = useMemo(() => {
    const map = new Map<string, Cita[]>()
    for (const c of citas) {
      const dia = new Date(c.fechaHora).toISOString().slice(0, 10)
      if (!map.has(dia)) map.set(dia, [])
      map.get(dia)!.push(c)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [citas])

  const abiertas = citas.filter((c) => ABIERTOS.includes(c.estatus)).length
  const sinConfirmar = citas.filter((c) => c.estatus === 'agendada' || c.estatus === 'reprogramada').length

  return (
    <div className="space-y-5 animate-fade-in">
      {!embedded && (
        <>
          <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
          </button>

          <div className="card overflow-hidden">
            <div className="animate-gradient-x relative overflow-hidden px-6 py-5"
              style={{ backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)', backgroundSize: '200% 100%' }}>
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <CalendarClock className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">Agenda</h1>
                    <p className="mt-0.5 text-xs text-blue-100/80">
                      {abiertas} cita{abiertas !== 1 ? 's' : ''} próxima{abiertas !== 1 ? 's' : ''}
                      {sinConfirmar > 0 && ` · ${sinConfirmar} sin confirmar`}
                    </p>
                  </div>
                </div>
                {puedeGestionar && (
                  <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-white/25 transition-colors">
                    <Plus className="h-4 w-4" /> Nueva cita
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {embedded && puedeGestionar && (
        <div className="flex justify-end">
          <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> Nueva cita
          </button>
        </div>
      )}

      <SolicitudesCitaPanel />

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {(['proximas', 'hoy', 'semana', 'todas'] as const).map((r) => (
            <button key={r} onClick={() => setRango(r)}
              className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
                rango === r ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
              {r === 'proximas' ? 'Próximas' : r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Semana' : 'Todas'}
            </button>
          ))}
        </div>
        <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as CitaEstatus | '')} className="field w-auto">
          <option value="">Todos los estatus</option>
          {(Object.keys(ESTATUS_CITA_CONFIG) as CitaEstatus[]).map((e) => <option key={e} value={e}>{ESTATUS_CITA_CONFIG[e].label}</option>)}
        </select>
        <select value={filtroAsesor} onChange={(e) => setFiltroAsesor(e.target.value)} className="field w-auto">
          <option value="">Todos los asesores</option>
          {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : citas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <CalendarClock className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Sin citas en este rango</p>
        </div>
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, delDia]) => (
            <div key={dia}>
              <p className="mb-1.5 px-1 text-[0.72rem] font-bold uppercase tracking-wide text-gray-400">{fmtDia(dia)}</p>
              <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden divide-y divide-gray-50">
                {delDia.map((c) => {
                  const modalCfg = CITA_MODALIDAD_CONFIG[c.modalidad]
                  const estCfg = ESTATUS_CITA_CONFIG[c.estatus]
                  const Icon = MODALIDAD_ICON[c.modalidad]
                  return (
                    <button key={c.id} onClick={() => setDetalle(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[0.8rem] font-bold text-gray-700 tabular-nums w-12 flex-shrink-0">{fmtHora(c.fechaHora)}</span>
                        <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0', modalCfg.bg)}>
                          <Icon className={clsx('h-3.5 w-3.5', modalCfg.text)} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{c.titulo}</p>
                          <p className="text-[0.7rem] text-gray-400 truncate">
                            {c.contactoNombre || 'Cliente'}
                            {c.tratamientoNombre ? ` · ${c.tratamientoNombre}${c.numeroSesion ? ` (${c.numeroSesion})` : ''}` : ''}
                            {c.asignadoNombre ? ` · ${c.asignadoNombre}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {c.confirmadaPorCliente && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">✓ cliente</span>}
                        {c.solicitudPendiente && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700">solicitud</span>}
                        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>
                          <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {nueva && <NuevaCitaModal onClose={() => setNueva(false)} />}
      {detalle && (
        <CitaDetalleModal
          cita={detalle}
          onClose={cerrarDetalle}
          queryKeysToInvalidate={[['citas'], ['citas-solicitudes'], ...(detalle.contactoId ? [['cliente-citas', detalle.contactoId]] : [])]}
        />
      )}
    </div>
  )
}
