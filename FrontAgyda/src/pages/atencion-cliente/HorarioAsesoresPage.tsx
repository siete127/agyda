import { useState } from 'react'
import { Clock, Inbox, Check, X, ChevronDown, ChevronRight, Loader2, History } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useCurrentUser } from '@/hooks/useAuth'
import { horarioAsesorService, type PropuestaHorario } from '@/services/horarioAsesor.service'
import { HorarioAsesorSeccion } from '@/pages/usuarios/HorarioAsesorSeccion'
import { MiHorarioPanel } from './components/MiHorarioPanel'

const DIA_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Resume los días de una propuesta a algo legible en una línea, sin tener que
// abrir el editor completo: agrupa días consecutivos con el mismo horario
// ("Lun-Vie 9:00-18:00") o, si es irregular, cuenta los días activos.
function resumenDias(dias: PropuestaHorario['dias']): string {
  const activos = dias.filter((d) => d.activo !== false).sort((a, b) => a.diaSemana - b.diaSemana)
  if (activos.length === 0) return 'Sin días configurados'
  const mismoHorario = activos.every((d) => d.horaInicio === activos[0].horaInicio && d.horaFin === activos[0].horaFin)
  const consecutivos = activos.every((d, i) => i === 0 || d.diaSemana === activos[i - 1].diaSemana + 1)
  if (mismoHorario && consecutivos) {
    const rango = activos.length === 1 ? DIA_CORTO[activos[0].diaSemana] : `${DIA_CORTO[activos[0].diaSemana]}-${DIA_CORTO[activos[activos.length - 1].diaSemana]}`
    return `${rango} ${activos[0].horaInicio}-${activos[0].horaFin}`
  }
  return `${activos.length} día${activos.length !== 1 ? 's' : ''} configurado${activos.length !== 1 ? 's' : ''}`
}

function fmtFecha(iso: string): string {
  try { return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}

function TarjetaPropuesta({ propuesta }: { propuesta: PropuestaHorario }) {
  const qc = useQueryClient()
  const [expandido, setExpandido] = useState(false)

  const invalidarTodo = () => {
    qc.invalidateQueries({ queryKey: ['horario-asesor-propuestas-pendientes'] })
    qc.invalidateQueries({ queryKey: ['horario-asesor-historial'] })
    qc.invalidateQueries({ queryKey: ['horario-asesor', propuesta.usuarioId] })
    qc.invalidateQueries({ queryKey: ['horario-asesor-propuesta', propuesta.usuarioId] })
  }

  const resolver = useMutation({
    mutationFn: (accion: 'aprobar' | 'rechazar') => horarioAsesorService.resolverPropuesta(propuesta.id, accion),
    onSuccess: (_d, accion) => {
      toast.success(accion === 'aprobar' ? 'Horario aprobado' : 'Propuesta rechazada')
      invalidarTodo()
    },
    onError: () => toast.error('No se pudo resolver la propuesta'),
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button onClick={() => setExpandido((v) => !v)} className="flex flex-1 items-center gap-2 text-left min-w-0">
          {expandido ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />}
          <div className="min-w-0">
            <p className="truncate text-[0.85rem] font-semibold text-gray-800">{propuesta.usuarioNombre ?? `Asesor #${propuesta.usuarioId}`}</p>
            <p className="truncate text-[0.72rem] text-gray-400">{resumenDias(propuesta.dias)} · enviada {fmtFecha(propuesta.enviadaEn)}</p>
          </div>
        </button>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => resolver.mutate('aprobar')}
            disabled={resolver.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {resolver.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprobar
          </button>
          <button
            onClick={() => resolver.mutate('rechazar')}
            disabled={resolver.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-[0.72rem] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Rechazar
          </button>
        </div>
      </div>
      {expandido && (
        <div className="border-t border-gray-100">
          <HorarioAsesorSeccion usuarioId={propuesta.usuarioId} puedeGestionar />
        </div>
      )}
    </div>
  )
}

function FilaHistorial({ p }: { p: PropuestaHorario }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.85rem] font-semibold text-gray-800">{p.usuarioNombre ?? `Asesor #${p.usuarioId}`}</p>
        <p className="truncate text-[0.72rem] text-gray-400">{resumenDias(p.dias)}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className={clsx(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold',
          p.estatus === 'aprobada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600',
        )}>
          {p.estatus === 'aprobada' ? 'Aprobada' : 'Rechazada'}
        </span>
        <p className="mt-0.5 text-[0.68rem] text-gray-400">
          {p.resueltaEn && fmtFecha(p.resueltaEn)}{p.resueltaPorNombre ? ` · ${p.resueltaPorNombre}` : ''}
        </p>
      </div>
    </div>
  )
}

// Vista del SUPERVISOR/ADMIN (permiso citas-gestionar): bandeja de propuestas
// pendientes de todos los asesores + historial de resoluciones. Nunca ve "Mi
// horario" aquí — si además es asesor, gestiona el suyo desde otra cuenta o
// vista, para no mezclar ambos roles en la misma pantalla.
function VistaSupervisor() {
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')

  const { data: pendientes, isLoading: cargandoPendientes } = useQuery({
    queryKey: ['horario-asesor-propuestas-pendientes'],
    queryFn: () => horarioAsesorService.listarPropuestasPendientes(),
  })
  const { data: historial, isLoading: cargandoHistorial } = useQuery({
    queryKey: ['horario-asesor-historial'],
    queryFn: () => horarioAsesorService.listarHistorial(),
    enabled: tab === 'historial',
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setTab('pendientes')}
          className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-all', tab === 'pendientes' ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}
        >
          Pendientes de aprobación
          {(pendientes?.length ?? 0) > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.62rem] font-bold text-white">{pendientes!.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('historial')}
          className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold transition-all', tab === 'historial' ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}
        >
          <History className="h-3.5 w-3.5" /> Historial
        </button>
      </div>

      {tab === 'pendientes' ? (
        cargandoPendientes ? (
          <p className="py-6 text-center text-[0.8rem] text-gray-400">Cargando…</p>
        ) : !pendientes || pendientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200/60 bg-card py-8 text-gray-400">
            <Inbox className="h-6 w-6" />
            <p className="text-[0.8rem]">Sin propuestas pendientes.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendientes.map((p) => <TarjetaPropuesta key={p.id} propuesta={p} />)}
          </div>
        )
      ) : cargandoHistorial ? (
        <p className="py-6 text-center text-[0.8rem] text-gray-400">Cargando…</p>
      ) : !historial || historial.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200/60 bg-card py-8 text-gray-400">
          <History className="h-6 w-6" />
          <p className="text-[0.8rem]">Sin propuestas resueltas todavía.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {historial.map((p) => <FilaHistorial key={p.id} p={p} />)}
        </div>
      )}
    </div>
  )
}

// Reubicado dentro de Seguimiento de clientes (antes solo vivía enterrado en
// la ficha expandida de Recursos Humanos → Usuarios, página sin entrada en
// el menú lateral — prácticamente inencontrable para configurar el horario
// que usan las validaciones de citas).
//
// Separado estrictamente por rol: quien tiene permiso de aprobar ve SOLO la
// bandeja de pendientes + historial de todos los asesores (nunca su propio
// horario mezclado ahí); un asesor sin ese permiso ve SOLO "Mi horario".
export function HorarioAsesoresPage({ embedded = false }: { embedded?: boolean }) {
  const usuarioActual = useCurrentUser()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5 animate-fade-in'}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-bold text-gray-900">Horario</h1>
        </div>
      )}

      {puedeGestionar ? (
        <VistaSupervisor />
      ) : usuarioActual?.id ? (
        <MiHorarioPanel usuarioId={usuarioActual.id} />
      ) : (
        <p className="text-[0.8rem] text-gray-400">No se pudo identificar tu usuario.</p>
      )}
    </div>
  )
}
