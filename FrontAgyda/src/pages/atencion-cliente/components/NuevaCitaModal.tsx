import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { citaService } from '@/services/cita.service'
import { horarioAsesorService } from '@/services/horarioAsesor.service'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import {
  CITA_MODALIDAD_CONFIG, RECORDAR_OPCIONES, type CitaModalidad,
} from '@/types/cita.types'

// 1=Lunes...7=Domingo, igual que HA_DIA_SEMANA en el backend.
function diaSemanaISO(fecha: string): number {
  const d = new Date(`${fecha}T00:00:00`)
  return ((d.getDay() + 6) % 7) + 1
}

// Modal único de creación de citas. Puede abrirse suelto (agenda global),
// con un contacto ya fijo (desde el expediente), o como sesión de un
// tratamiento existente.
export function NuevaCitaModal({ onClose, onCreated, contactoPreset, tratamientoPreset, fechaHoraPreset }: {
  onClose: () => void
  onCreated?: (id: number) => void
  contactoPreset?: { id: number; nombre: string }
  tratamientoPreset?: { id: number; nombre: string }
  // 'YYYY-MM-DDTHH:mm' — prellenado al crear desde un slot vacío del timeline de Agenda.
  fechaHoraPreset?: string
}) {
  const qc = useQueryClient()
  const usuarioActual = useCurrentUser()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'citas-gestionar')
  const { data: usuarios } = useUsuariosSimple()
  const [contactoId, setContactoId] = useState(contactoPreset ? String(contactoPreset.id) : '')
  const [modalidad, setModalidad] = useState<CitaModalidad>('videollamada')
  const [titulo, setTitulo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(fechaHoraPreset ? fechaHoraPreset.slice(0, 10) : '')
  const [hora, setHora] = useState(fechaHoraPreset ? fechaHoraPreset.slice(11, 16) : '')
  const [duracionMin, setDuracionMin] = useState('30')
  const [telefono, setTelefono] = useState('')
  const [enlace, setEnlace] = useState('')
  const [recordar, setRecordar] = useState<number[]>([1440, 60])
  const [tratamientoId, setTratamientoId] = useState(tratamientoPreset ? String(tratamientoPreset.id) : '')
  // Solo el supervisor puede elegir otro asesor; para cualquier otro usuario
  // la cita siempre se asigna a sí mismo, sin selector visible.
  const [asignadoA, setAsignadoA] = useState('')

  const { data: clientes } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 60_000,
    enabled: !contactoPreset,
  })

  // Tratamientos activos del contacto seleccionado (para ligarla como sesión).
  const contIdNum = contactoId ? Number(contactoId) : (contactoPreset?.id ?? 0)
  const { data: tratamientos } = useQuery({
    queryKey: ['cliente-tratamientos', contIdNum],
    queryFn: () => citaService.getTratamientos({ contactoId: contIdNum, estatus: 'activo' }),
    staleTime: 30_000,
    enabled: !tratamientoPreset && contIdNum > 0,
  })

  const toggleRecordar = (min: number) =>
    setRecordar((prev) => prev.includes(min) ? prev.filter((m) => m !== min) : [...prev, min].sort((a, b) => b - a))

  // Sin permiso de gestionar, siempre se asigna al usuario actual. Con
  // permiso, por default también es el usuario actual, pero puede cambiarse.
  const asignadoAIdNum = puedeGestionar && asignadoA ? Number(asignadoA) : (usuarioActual?.id ?? 0)
  const { data: horarioAsesor } = useQuery({
    queryKey: ['horario-asesor', asignadoAIdNum],
    queryFn: () => horarioAsesorService.getHorario(asignadoAIdNum),
    staleTime: 60_000,
    enabled: asignadoAIdNum > 0,
  })

  // Citas del asesor ese día, para detectar solapamiento antes de guardar
  // (el backend repite esta validación como defensa en profundidad).
  const { data: citasDelDia } = useQuery({
    queryKey: ['citas', 'dia', asignadoAIdNum, fecha],
    queryFn: () => citaService.getAll({ desde: `${fecha} 00:00:00`, hasta: `${fecha} 23:59:59`, asignadoA: asignadoAIdNum }),
    staleTime: 15_000,
    enabled: asignadoAIdNum > 0 && !!fecha,
  })

  let errorHorario: string | null = null
  if (asignadoAIdNum > 0 && fecha && hora && horarioAsesor) {
    const dia = diaSemanaISO(fecha)
    const cfgDia = horarioAsesor.find((h) => h.diaSemana === dia && h.activo !== false)
    if (!cfgDia) {
      errorHorario = 'El asesor seleccionado no tiene horario configurado ese día.'
    } else if (hora < cfgDia.horaInicio || hora > cfgDia.horaFin) {
      errorHorario = `Fuera de horario: el asesor atiende de ${cfgDia.horaInicio} a ${cfgDia.horaFin} ese día.`
    } else if (cfgDia.comidaInicio && cfgDia.comidaFin && hora >= cfgDia.comidaInicio && hora < cfgDia.comidaFin) {
      errorHorario = `Ese horario cae en la comida del asesor (${cfgDia.comidaInicio}-${cfgDia.comidaFin}).`
    }
  }

  if (!errorHorario && fecha && hora && citasDelDia) {
    const inicio = new Date(`${fecha}T${hora}:00`).getTime()
    const fin = inicio + (Number(duracionMin) || 30) * 60_000
    const choque = citasDelDia.find((c) => {
      if (c.estatus === 'cancelada') return false
      const cIni = new Date(c.fechaHora).getTime()
      const cFin = cIni + c.duracionMin * 60_000
      return cIni < fin && cFin > inicio
    })
    if (choque) errorHorario = `Ya tienes otra cita en ese horario: "${choque.titulo}".`
  }

  const fechaHora = fecha && hora ? `${fecha}T${hora}:00` : ''
  const puedeGuardar = (contactoId || contactoPreset) && titulo.trim() && fechaHora && !errorHorario
    && (modalidad !== 'videollamada' || enlace.trim())

  const crear = useMutation({
    mutationFn: async () => {
      const body = {
        titulo: titulo.trim(),
        modalidad,
        fechaHora,
        duracionMin: Number(duracionMin) || 30,
        motivo: motivo.trim() || undefined,
        telefono: modalidad === 'telefonica' && telefono.trim() ? telefono.trim() : undefined,
        enlace: modalidad === 'videollamada' ? enlace.trim() : undefined,
        asignadoA: asignadoAIdNum || undefined,
        recordarMinAntes: recordar,
      }
      if (tratamientoId) {
        return citaService.addSesion(Number(tratamientoId), body)
      }
      return citaService.create({ ...body, contactoId: Number(contactoId || contactoPreset?.id) })
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      if (contIdNum) qc.invalidateQueries({ queryKey: ['cliente-citas', contIdNum] })
      if (tratamientoId) qc.invalidateQueries({ queryKey: ['tratamiento', Number(tratamientoId)] })
      toast.success('Cita agendada')
      onCreated?.(r?.data?.id)
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo agendar la cita')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title={tratamientoPreset ? `Nueva sesión — ${tratamientoPreset.nombre}` : 'Nueva cita'} size="md">
      <div className="space-y-4">
        {contactoPreset ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
            <input value={contactoPreset.nombre} disabled className="field bg-gray-50 text-gray-500" />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
            <select value={contactoId} onChange={(e) => { setContactoId(e.target.value); setTratamientoId('') }} className="field">
              <option value="">Selecciona un cliente</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        {!tratamientoPreset && tratamientos && tratamientos.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Parte de un tratamiento (opcional)</label>
            <select value={tratamientoId} onChange={(e) => setTratamientoId(e.target.value)} className="field">
              <option value="">Cita suelta</option>
              {tratamientos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}{t.totalSesiones ? ` (${t.sesionesCompletadas}/${t.totalSesiones})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Modalidad</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(CITA_MODALIDAD_CONFIG) as CitaModalidad[]).map((m) => {
              const cfg = CITA_MODALIDAD_CONFIG[m]
              return (
                <button key={m} type="button" onClick={() => setModalidad(m)}
                  className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all',
                    modalidad === m ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Motivo de la cita" maxLength={200} autoFocus />
        </div>

        {puedeGestionar && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asignar a</label>
            <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className="field">
              <option value="">Yo ({usuarioActual?.nombres || 'sin asignar'})</option>
              {usuarios?.filter((u) => u.id !== usuarioActual?.id).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Hora</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={errorHorario ? 'field border-red-300 focus:border-red-400 focus:ring-red-400/15' : 'field'} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Duración</label>
            <select value={duracionMin} onChange={(e) => setDuracionMin(e.target.value)} className="field">
              {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>
        {errorHorario && <p className="-mt-2 text-[0.72rem] font-semibold text-red-500">{errorHorario}</p>}

        {modalidad === 'videollamada' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Enlace de la videollamada</label>
            <input value={enlace} onChange={(e) => setEnlace(e.target.value)} className="field" placeholder="https://meet.google.com/xxx-xxxx-xxx" />
          </div>
        )}
        {modalidad === 'telefonica' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Teléfono a marcar</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="field" placeholder="55 1234 5678" maxLength={30} />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Recordar al cliente</label>
          <div className="flex flex-wrap gap-1.5">
            {RECORDAR_OPCIONES.map((o) => (
              <button key={o.min} type="button" onClick={() => toggleRecordar(o.min)}
                className={clsx('rounded-lg border px-2.5 py-1 text-[0.7rem] font-semibold transition-colors',
                  recordar.includes(o.min) ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notas internas (opcional)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="field resize-none" placeholder="Contexto de la cita..." />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>Agendar</Button>
        </div>
      </div>
    </Modal>
  )
}
