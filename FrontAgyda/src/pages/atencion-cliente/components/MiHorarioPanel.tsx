import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, Clock3, Pencil, Send, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { horarioAsesorService } from '@/services/horarioAsesor.service'
import {
  DIAS, EditorDias, aForm, formADias, type Form,
} from '@/pages/usuarios/HorarioAsesorSeccion'

const DIA_CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function fmtHora12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h < 12 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// Resume el horario vigente a una línea: "Lunes a Viernes · 09:00 a. m. – 06:00 p. m."
// o, si es irregular entre días, "N días configurados".
function resumenVigente(form: Form): string {
  const activos = DIAS.filter((d) => form[d.valor].activo)
  if (activos.length === 0) return 'Sin horario configurado'
  const mismo = activos.every((d) => form[d.valor].horaInicio === form[activos[0].valor].horaInicio && form[d.valor].horaFin === form[activos[0].valor].horaFin)
  const consecutivos = activos.every((d, i) => i === 0 || d.valor === activos[i - 1].valor + 1)
  if (mismo && consecutivos) {
    const ini = activos[0], fin = activos[activos.length - 1]
    const rango = ini.valor === fin.valor ? ini.label : `${ini.label} a ${fin.label}`
    return `${rango} · ${fmtHora12(form[ini.valor].horaInicio)} – ${fmtHora12(form[ini.valor].horaFin)}`
  }
  return `${activos.length} día${activos.length !== 1 ? 's' : ''} configurado${activos.length !== 1 ? 's' : ''}`
}

// Próximos 7 días reales a partir de hoy, con su disponibilidad según el
// horario vigente (no inventa "periodos" que el sistema no maneja).
function proximosDias(form: Form): { fecha: Date; diaSemana: number }[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(hoy)
    fecha.setDate(fecha.getDate() + i)
    const diaSemana = ((fecha.getDay() + 6) % 7) + 1
    return { fecha, diaSemana }
  })
}

export function MiHorarioPanel({ usuarioId }: { usuarioId: number }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Form | null>(null)

  const { data: vigente, isLoading: cargandoVigente } = useQuery({
    queryKey: ['horario-asesor', usuarioId],
    queryFn: () => horarioAsesorService.getHorario(usuarioId),
  })
  const { data: propuesta, isLoading: cargandoPropuesta } = useQuery({
    queryKey: ['horario-asesor-propuesta', usuarioId],
    queryFn: () => horarioAsesorService.getMiPropuestaPendiente(usuarioId),
  })

  const proponer = useMutation({
    mutationFn: () => {
      if (!form) return Promise.resolve()
      return horarioAsesorService.proponerHorario(usuarioId, formADias(form))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['horario-asesor-propuesta', usuarioId] })
      toast.success('Horario enviado — queda pendiente de aprobación')
      setEditando(false)
      setForm(null)
    },
    onError: () => toast.error('No se pudo enviar el horario propuesto'),
  })

  if (cargandoVigente || cargandoPropuesta) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200/60 bg-card py-10 text-[0.8rem] text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando horario…
      </div>
    )
  }

  const hayPendiente = propuesta?.estatus === 'pendiente'
  const formVigente = aForm(vigente ?? [])
  const formEditor = editando ? (form ?? formVigente) : formVigente

  return (
    <div className="space-y-4">
      {/* Tarjetas de resumen — solo datos reales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <Clock3 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Horario vigente</p>
            <p className="truncate text-[0.85rem] font-bold text-gray-800">{resumenVigente(formVigente)}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Aprobado
            </span>
          </div>
        </div>

        <div className={clsx(
          'flex items-start gap-3 rounded-2xl border p-4 shadow-sm',
          hayPendiente ? 'border-amber-200 bg-amber-50' : propuesta?.estatus === 'rechazada' ? 'border-red-200 bg-red-50' : 'border-gray-200/60 bg-card',
        )}>
          <div className={clsx(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl',
            hayPendiente ? 'bg-amber-100 text-amber-600' : propuesta?.estatus === 'rechazada' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400',
          )}>
            <CalendarCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Cambios pendientes</p>
            {!propuesta && <p className="text-[0.85rem] font-bold text-gray-800">Ninguno</p>}
            {hayPendiente && <p className="text-[0.85rem] font-bold text-amber-700">Tu propuesta está en revisión</p>}
            {propuesta?.estatus === 'rechazada' && <p className="text-[0.85rem] font-bold text-red-600">Tu última propuesta fue rechazada</p>}
            {propuesta?.estatus === 'aprobada' && <p className="text-[0.85rem] font-bold text-gray-800">Ninguno</p>}
            {propuesta?.estatus === 'rechazada' && propuesta.comentario && (
              <p className="mt-0.5 truncate text-[0.72rem] text-red-500">{propuesta.comentario}</p>
            )}
          </div>
        </div>
      </div>

      {/* Editor + vista previa */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[0.85rem] font-bold text-gray-800">Configura tu horario</p>
              <p className="text-[0.72rem] text-gray-400">Define los días y horas en que atiendes citas de clientes.</p>
            </div>
            {!editando ? (
              <button
                onClick={() => { setForm(formVigente); setEditando(true) }}
                disabled={hayPendiente}
                title={hayPendiente ? 'Ya tienes una propuesta pendiente de aprobación' : undefined}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Proponer cambio
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditando(false); setForm(null) }} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-100">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
                <button
                  onClick={() => proponer.mutate()}
                  disabled={proponer.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  {proponer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar a aprobación
                </button>
              </div>
            )}
          </div>
          <EditorDias form={formEditor} onChange={editando ? setForm : () => {}} disabled={!editando} />
        </div>

        <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
          <p className="mb-1 text-[0.85rem] font-bold text-gray-800">Próximos 7 días</p>
          <p className="mb-3 text-[0.7rem] text-gray-400">Según tu horario vigente.</p>
          <div className="space-y-1.5">
            {proximosDias(formVigente).map(({ fecha, diaSemana }) => {
              const cfg = formVigente[diaSemana]
              return (
                <div key={fecha.toISOString()} className="flex items-center justify-between rounded-lg border border-gray-100 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] font-semibold text-gray-700">{DIA_CORTO[diaSemana]} {fecha.getDate()}</p>
                    <p className="truncate text-[0.65rem] text-gray-400">
                      {cfg.activo ? `${fmtHora12(cfg.horaInicio)} – ${fmtHora12(cfg.horaFin)}` : 'No disponible'}
                    </p>
                  </div>
                  <span className={clsx(
                    'flex-shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-bold',
                    cfg.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400',
                  )}>
                    {cfg.activo ? 'Disponible' : 'Cerrado'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
