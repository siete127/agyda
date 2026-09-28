import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, CalendarClock, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { citaService } from '@/services/cita.service'
import {
  CITA_MODALIDAD_CONFIG, ESTATUS_CITA_CONFIG,
  type Cita, type CitaEstatus, type CitaModalidad,
} from '@/types/cita.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useCurrentUser } from '@/hooks/useAuth'
import { NuevaCitaModal } from './components/NuevaCitaModal'
import { CitaDetalleModal } from './components/CitaDetalleModal'
import { SolicitudesCitaPanel } from './components/SolicitudesCitaPanel'
import { useAgendaRango, navegar, type AgendaVista } from './components/agenda/useAgendaRango'
import { AgendaVistaSelector } from './components/agenda/AgendaVistaSelector'
import { AgendaMiniCalendario } from './components/agenda/AgendaMiniCalendario'
import { AgendaProximasCitas } from './components/agenda/AgendaProximasCitas'
import { AgendaTimelineDia } from './components/agenda/AgendaTimelineDia'
import { AgendaTimelineSemana } from './components/agenda/AgendaTimelineSemana'
import { AgendaGridMes } from './components/agenda/AgendaGridMes'

const ABIERTOS: CitaEstatus[] = ['agendada', 'confirmada', 'reprogramada']

export function AgendaCitasPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')
  const usuarioActual = useCurrentUser()
  const [params, setParams] = useSearchParams()

  const [filtroEstatus, setFiltroEstatus] = useState<CitaEstatus | ''>('')
  const [filtroModalidad, setFiltroModalidad] = useState<CitaModalidad | ''>('')
  const [vista, setVista] = useState<AgendaVista>('dia')
  const [fechaAncla, setFechaAncla] = useState(new Date())
  const [detalle, setDetalle] = useState<Cita | null>(null)
  const [nueva, setNueva] = useState(false)
  const [nuevaSlot, setNuevaSlot] = useState<string | undefined>(undefined)

  const { desde, hasta } = useAgendaRango(vista, fechaAncla)

  // Cada asesor solo ve su propia agenda — nunca la de otros compañeros.
  const { data: citas = [], isLoading } = useQuery({
    queryKey: ['citas', vista, desde, hasta, filtroEstatus, usuarioActual?.id],
    queryFn: () => citaService.getAll({
      desde, hasta,
      estatus: filtroEstatus || undefined,
      asignadoA: usuarioActual?.id,
    }),
    staleTime: 15_000,
    enabled: !!usuarioActual?.id,
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

  const abrirNuevaEnSlot = (fechaHora: string) => {
    setNuevaSlot(fechaHora)
    setNueva(true)
  }

  const citasFiltradas = filtroModalidad ? citas.filter((c) => c.modalidad === filtroModalidad) : citas

  const abiertas = citas.filter((c) => ABIERTOS.includes(c.estatus)).length
  const sinConfirmar = citas.filter((c) => c.estatus === 'agendada' || c.estatus === 'reprogramada').length

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5 animate-fade-in'}>
      {!embedded && (
        <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
          <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
        </button>
      )}

      {!embedded && (
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
      )}

      {embedded && puedeGestionar && (
        <div className="flex justify-end">
          <button onClick={() => setNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> Nueva cita
          </button>
        </div>
      )}

      <SolicitudesCitaPanel />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <AgendaMiniCalendario fechaSeleccionada={fechaAncla} onSeleccionar={setFechaAncla} citas={citas} />
          <AgendaProximasCitas citas={citas} onSeleccionar={setDetalle} />
        </aside>

        <div className="min-w-0 space-y-3">
          <AgendaVistaSelector
            vista={vista}
            onVista={setVista}
            fechaAncla={fechaAncla}
            onAnterior={() => setFechaAncla((f) => navegar(vista, f, -1))}
            onSiguiente={() => setFechaAncla((f) => navegar(vista, f, 1))}
            onHoy={() => setFechaAncla(new Date())}
          />

          <div className="flex flex-wrap gap-2">
            <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as CitaEstatus | '')} className="field w-auto">
              <option value="">Todos los estatus</option>
              {(Object.keys(ESTATUS_CITA_CONFIG) as CitaEstatus[]).map((e) => <option key={e} value={e}>{ESTATUS_CITA_CONFIG[e].label}</option>)}
            </select>
            <select value={filtroModalidad} onChange={(e) => setFiltroModalidad(e.target.value as CitaModalidad | '')} className="field w-auto">
              <option value="">Todas las modalidades</option>
              {(Object.keys(CITA_MODALIDAD_CONFIG) as CitaModalidad[]).map((m) => <option key={m} value={m}>{CITA_MODALIDAD_CONFIG[m].label}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : vista === 'mes' ? (
            <AgendaGridMes
              fechaAncla={fechaAncla}
              citas={citasFiltradas}
              onSeleccionarCita={setDetalle}
              onSeleccionarDia={(d) => { setFechaAncla(d); setVista('dia') }}
            />
          ) : vista === 'semana' ? (
            <AgendaTimelineSemana
              lunes={(() => { const d = new Date(fechaAncla); const o = (d.getDay() + 6) % 7; d.setDate(d.getDate() - o); d.setHours(0, 0, 0, 0); return d })()}
              citas={citasFiltradas}
              onSeleccionar={setDetalle}
              onSlotVacio={abrirNuevaEnSlot}
            />
          ) : (
            <AgendaTimelineDia
              fecha={fechaAncla}
              citas={citasFiltradas}
              onSeleccionar={setDetalle}
              onSlotVacio={abrirNuevaEnSlot}
            />
          )}
        </div>
      </div>

      {nueva && <NuevaCitaModal onClose={() => { setNueva(false); setNuevaSlot(undefined) }} fechaHoraPreset={nuevaSlot} />}
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
