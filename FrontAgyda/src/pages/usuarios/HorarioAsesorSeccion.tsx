import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Send, Loader2, Pencil, X, UtensilsCrossed, Check, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { horarioAsesorService, type DiaHorarioAsesor } from '@/services/horarioAsesor.service'
import { useCurrentUser } from '@/hooks/useAuth'

const DIAS = [
  { valor: 1, label: 'Lunes' },
  { valor: 2, label: 'Martes' },
  { valor: 3, label: 'Miércoles' },
  { valor: 4, label: 'Jueves' },
  { valor: 5, label: 'Viernes' },
  { valor: 6, label: 'Sábado' },
  { valor: 7, label: 'Domingo' },
]

const field =
  'w-full rounded-lg border border-gray-200 bg-card px-2.5 py-1.5 text-[0.8rem] text-gray-900 ' +
  'outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-gray-50 disabled:text-gray-500'

type FormDia = { horaInicio: string; horaFin: string; comidaInicio: string; comidaFin: string; activo: boolean }
type Form = Record<number, FormDia>

function formVacio(): Form {
  const f: Form = {}
  for (const d of DIAS) f[d.valor] = { horaInicio: '09:00', horaFin: '18:00', comidaInicio: '', comidaFin: '', activo: false }
  return f
}

function aForm(dias: DiaHorarioAsesor[]): Form {
  const f = formVacio()
  for (const d of dias) {
    f[d.diaSemana] = {
      horaInicio: d.horaInicio, horaFin: d.horaFin,
      comidaInicio: d.comidaInicio ?? '', comidaFin: d.comidaFin ?? '',
      activo: d.activo ?? true,
    }
  }
  return f
}

function formADias(form: Form): DiaHorarioAsesor[] {
  return DIAS
    .filter((d) => form[d.valor].activo)
    .map((d) => ({
      diaSemana: d.valor,
      horaInicio: form[d.valor].horaInicio,
      horaFin: form[d.valor].horaFin,
      comidaInicio: form[d.valor].comidaInicio || null,
      comidaFin: form[d.valor].comidaFin || null,
    }))
}

/* ── Editor de días — reusado por el asesor (propuesta) y el supervisor (aprobar/editar) ── */
function EditorDias({ form, onChange, disabled }: { form: Form; onChange: (form: Form) => void; disabled: boolean }) {
  function set(dia: number, patch: Partial<FormDia>) {
    onChange({ ...form, [dia]: { ...form[dia], ...patch } })
  }

  if (disabled) {
    const activos = DIAS.filter((d) => form[d.valor].activo)
    if (activos.length === 0) return <p className="text-[0.8rem] text-gray-400">Sin días configurados.</p>
    return (
      <div className="flex flex-col gap-1.5">
        {activos.map((d) => (
          <div key={d.valor} className="flex items-center gap-2 text-[0.8rem] text-gray-700">
            <span className="w-20 flex-shrink-0 font-semibold">{d.label}</span>
            <span>{form[d.valor].horaInicio} – {form[d.valor].horaFin}</span>
            {form[d.valor].comidaInicio && form[d.valor].comidaFin && (
              <span className="flex items-center gap-1 text-[0.72rem] text-gray-400">
                <UtensilsCrossed className="h-3 w-3" /> Comida {form[d.valor].comidaInicio}–{form[d.valor].comidaFin}
              </span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {DIAS.map((d) => (
        <div key={d.valor} className={clsx('flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2', form[d.valor].activo ? 'border-brand/20 bg-brand/5' : 'border-gray-100')}>
          <button
            type="button"
            onClick={() => set(d.valor, { activo: !form[d.valor].activo })}
            className={clsx('relative h-5 w-9 flex-shrink-0 rounded-full border-0 p-0 transition-colors', form[d.valor].activo ? 'bg-brand' : 'bg-gray-200')}
          >
            <span className={clsx('absolute left-[3px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white shadow transition-transform', form[d.valor].activo && 'translate-x-4')} />
          </button>
          <span className="w-16 flex-shrink-0 text-[0.78rem] font-semibold text-gray-700">{d.label}</span>
          {form[d.valor].activo && (
            <>
              <input type="time" className={clsx(field, 'w-28')} value={form[d.valor].horaInicio} onChange={(e) => set(d.valor, { horaInicio: e.target.value })} />
              <span className="text-[0.72rem] text-gray-400">a</span>
              <input type="time" className={clsx(field, 'w-28')} value={form[d.valor].horaFin} onChange={(e) => set(d.valor, { horaFin: e.target.value })} />
              <span className="ml-2 flex items-center gap-1 text-[0.68rem] text-gray-400"><UtensilsCrossed className="h-3 w-3" /> Comida</span>
              <input type="time" className={clsx(field, 'w-24')} value={form[d.valor].comidaInicio} onChange={(e) => set(d.valor, { comidaInicio: e.target.value })} />
              <span className="text-[0.72rem] text-gray-400">a</span>
              <input type="time" className={clsx(field, 'w-24')} value={form[d.valor].comidaFin} onChange={(e) => set(d.valor, { comidaFin: e.target.value })} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function HorarioAsesorSeccion({ usuarioId, puedeGestionar }: { usuarioId: number; puedeGestionar: boolean }) {
  const qc = useQueryClient()
  const yo = useCurrentUser()
  const esMiPropioHorario = yo?.id === usuarioId
  const [editandoPropuesta, setEditandoPropuesta] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [editandoAprobacion, setEditandoAprobacion] = useState(false)

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
      toast.success('Horario enviado — queda pendiente de aprobación de tu supervisor')
      setEditandoPropuesta(false)
      setForm(null)
    },
    onError: () => toast.error('No se pudo enviar el horario propuesto'),
  })

  const resolver = useMutation({
    mutationFn: (accion: 'aprobar' | 'rechazar') => {
      if (!propuesta) return Promise.resolve()
      const dias = accion === 'aprobar' && editandoAprobacion && form ? formADias(form) : undefined
      return horarioAsesorService.resolverPropuesta(propuesta.id, accion, dias)
    },
    onSuccess: (_data, accion) => {
      qc.invalidateQueries({ queryKey: ['horario-asesor', usuarioId] })
      qc.invalidateQueries({ queryKey: ['horario-asesor-propuesta', usuarioId] })
      toast.success(accion === 'aprobar' ? 'Horario aprobado' : 'Propuesta rechazada')
      setEditandoAprobacion(false)
      setForm(null)
    },
    onError: () => toast.error('No se pudo resolver la propuesta'),
  })

  if (cargandoVigente || cargandoPropuesta) {
    return (
      <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-5 text-[0.8rem] text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando horario…
      </div>
    )
  }

  const hayPendiente = propuesta?.estatus === 'pendiente'
  const formVigenteView = aForm(vigente ?? [])

  return (
    <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-5">
      <p className="mb-3 flex items-center gap-1.5 text-[0.78rem] font-bold text-gray-700">
        <Clock className="h-3.5 w-3.5" /> Horario de disponibilidad
      </p>

      {/* Horario vigente */}
      <div className="mb-4">
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Vigente (aprobado)</p>
        <EditorDias form={formVigenteView} onChange={() => {}} disabled />
      </div>

      {/* Propuesta pendiente — vista para el supervisor con permiso de gestionar */}
      {hayPendiente && puedeGestionar && !esMiPropioHorario && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-bold text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" /> Propuesta pendiente de aprobación
          </p>
          <EditorDias form={editandoAprobacion ? (form ?? aForm(propuesta.dias)) : aForm(propuesta.dias)} onChange={setForm} disabled={!editandoAprobacion} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!editandoAprobacion ? (
              <button
                onClick={() => { setForm(aForm(propuesta.dias)); setEditandoAprobacion(true) }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar antes de aprobar
              </button>
            ) : (
              <button
                onClick={() => setEditandoAprobacion(false)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-100"
              >
                <X className="h-3.5 w-3.5" /> Cancelar edición
              </button>
            )}
            <button
              onClick={() => resolver.mutate('aprobar')}
              disabled={resolver.isPending}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {resolver.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {editandoAprobacion ? 'Aprobar con cambios' : 'Aprobar'}
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
      )}

      {/* Estatus de mi propia propuesta */}
      {esMiPropioHorario && propuesta && (
        <div className={clsx(
          'mb-4 rounded-xl border p-3 text-[0.78rem]',
          propuesta.estatus === 'pendiente' && 'border-amber-200 bg-amber-50 text-amber-700',
          propuesta.estatus === 'rechazada' && 'border-red-200 bg-red-50 text-red-600',
          propuesta.estatus === 'aprobada' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        )}>
          {propuesta.estatus === 'pendiente' && 'Tu horario propuesto está pendiente de aprobación de tu supervisor.'}
          {propuesta.estatus === 'rechazada' && `Tu propuesta fue rechazada${propuesta.comentario ? `: ${propuesta.comentario}` : '.'}`}
          {propuesta.estatus === 'aprobada' && 'Tu último horario propuesto fue aprobado.'}
        </div>
      )}

      {/* Formulario de propuesta — solo el propio asesor */}
      {esMiPropioHorario && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
              {editandoPropuesta ? 'Nueva propuesta' : 'Proponer un cambio'}
            </p>
            {!editandoPropuesta ? (
              <button
                onClick={() => { setForm(aForm(vigente ?? [])); setEditandoPropuesta(true) }}
                disabled={hayPendiente}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={hayPendiente ? 'Ya tienes una propuesta pendiente de aprobación' : undefined}
              >
                <Pencil className="h-3.5 w-3.5" /> Proponer horario
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditandoPropuesta(false); setForm(null) }} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-100">
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
          {editandoPropuesta && form && (
            <>
              <EditorDias form={form} onChange={setForm} disabled={false} />
              <p className="mt-2 text-[0.7rem] text-gray-400">Las vacaciones y permisos aprobados se excluyen automáticamente — no hace falta marcarlos aquí.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
