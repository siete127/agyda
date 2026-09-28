import { useState } from 'react'
import { Clock, Inbox, Check, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
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
  try { return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) }
  catch { return '' }
}

function TarjetaPropuesta({ propuesta }: { propuesta: PropuestaHorario }) {
  const qc = useQueryClient()
  const [expandido, setExpandido] = useState(false)

  const invalidarTodo = () => {
    qc.invalidateQueries({ queryKey: ['horario-asesor-propuestas-pendientes'] })
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

// Reubicado dentro de Seguimiento de clientes (antes solo vivía enterrado en
// la ficha expandida de Recursos Humanos → Usuarios, página sin entrada en
// el menú lateral — prácticamente inencontrable para configurar el horario
// que usan las validaciones de citas).
//
// Cada asesor solo ve y propone SU PROPIO horario (nunca el de otros). Quien
// tiene el permiso de gestionar ve además una bandeja compacta de propuestas
// pendientes de otros asesores — resumen en una línea, con Aprobar/Rechazar
// directos; el editor completo solo se abre si se quiere revisar a detalle.
export function HorarioAsesoresPage({ embedded = false }: { embedded?: boolean }) {
  const usuarioActual = useCurrentUser()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')

  const { data: pendientes, isLoading: cargandoPendientes } = useQuery({
    queryKey: ['horario-asesor-propuestas-pendientes'],
    queryFn: () => horarioAsesorService.listarPropuestasPendientes(),
    enabled: puedeGestionar,
  })

  const pendientesDeOtros = (pendientes ?? []).filter((p) => p.usuarioId !== usuarioActual?.id)

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5 animate-fade-in'}>
      {!embedded && (
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-bold text-gray-900">Horario</h1>
        </div>
      )}

      {puedeGestionar && (
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-700">
            Propuestas pendientes de aprobación
            {pendientesDeOtros.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.62rem] font-bold text-white">
                {pendientesDeOtros.length}
              </span>
            )}
          </p>
          {cargandoPendientes ? (
            <p className="py-6 text-center text-[0.8rem] text-gray-400">Cargando…</p>
          ) : pendientesDeOtros.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200/60 bg-card py-8 text-gray-400">
              <Inbox className="h-6 w-6" />
              <p className="text-[0.8rem]">Sin propuestas pendientes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendientesDeOtros.map((p) => <TarjetaPropuesta key={p.id} propuesta={p} />)}
            </div>
          )}
        </section>
      )}

      <section>
        <p className={clsx('mb-2 text-[0.78rem] font-bold text-gray-700', puedeGestionar && 'mt-2')}>Mi horario</p>
        {usuarioActual?.id ? (
          <MiHorarioPanel usuarioId={usuarioActual.id} />
        ) : (
          <p className="text-[0.8rem] text-gray-400">No se pudo identificar tu usuario.</p>
        )}
      </section>
    </div>
  )
}
