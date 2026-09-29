import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { horarioAsesorService } from '@/services/horarioAsesor.service'
import { portalClienteService } from '@/services/portalCliente.service'

const MODALIDADES = [
  { key: 'videollamada', label: 'Videollamada' },
  { key: 'telefonica', label: 'Llamada' },
  { key: 'generica', label: 'Presencial' },
] as const

function fmtFecha(f: string) {
  try { return new Date(`${f}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) }
  catch { return f }
}

// El cliente propone una reunión dentro de la disponibilidad real de su
// asesor (getDisponibilidadAsesor: horario aprobado, menos vacaciones y
// citas ya ocupadas) — nunca escribe una hora libre. Queda pendiente hasta
// que el asesor apruebe (ver SolicitudesCitaPanel del lado interno).
export function SolicitarReunionModal({ onClose, modalidadPreset }: { onClose: () => void; modalidadPreset?: 'videollamada' | 'telefonica' | 'generica' }) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [modalidad, setModalidad] = useState<'videollamada' | 'telefonica' | 'generica'>(modalidadPreset ?? 'videollamada')
  const [fecha, setFecha] = useState<string | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [duracionMin, setDuracionMin] = useState(30)

  const { data: disponibilidad, isLoading } = useQuery({
    queryKey: ['portal-disponibilidad-asesor'],
    queryFn: () => horarioAsesorService.getDisponibilidadAsesor(),
    staleTime: 60_000,
  })

  const dias = (disponibilidad?.dias ?? []).filter((d) => d.slots.length > 0)
  const diaActivo = dias.find((d) => d.fecha === fecha) ?? null

  const puedeGuardar = titulo.trim() && fecha && hora

  const enviar = useMutation({
    mutationFn: () => portalClienteService.crearPropuestaReunion({
      titulo: titulo.trim(),
      motivo: motivo.trim() || undefined,
      modalidad,
      fechaPropuesta: `${fecha}T${hora}:00`,
      duracionMin,
    }),
    onSuccess: () => {
      toast.success('Reunión propuesta — tu asesor la revisará pronto')
      qc.invalidateQueries({ queryKey: ['portal-propuestas-reunion'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo enviar la propuesta')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title="Solicitar reunión" size="md">
      <div className="space-y-4">
        {!isLoading && disponibilidad?.asesorId == null && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600">
            Aún no tienes un asesor asignado — no podemos calcular horarios disponibles. Contáctanos por otro canal.
          </p>
        )}
        {!isLoading && disponibilidad?.asesorId != null && dias.length === 0 && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-600">
            Tu asesor no tiene horario disponible en los próximos días.
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Motivo de la reunión" maxLength={200} autoFocus />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Modalidad</label>
          <div className="grid grid-cols-3 gap-1.5">
            {MODALIDADES.map((m) => (
              <button key={m.key} type="button" onClick={() => setModalidad(m.key)}
                className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all',
                  modalidad === m.key ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-tertiary hover:border-gray-300')}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-xs text-ink-tertiary">Cargando disponibilidad…</p>
        ) : dias.length > 0 && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Día</label>
              <div className="flex flex-wrap gap-1.5">
                {dias.slice(0, 14).map((d) => (
                  <button key={d.fecha} type="button" onClick={() => { setFecha(d.fecha); setHora(null) }}
                    className={clsx('rounded-lg border-2 px-2.5 py-1.5 text-[0.7rem] font-semibold capitalize transition-colors',
                      fecha === d.fecha ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-tertiary hover:border-gray-300')}>
                    {fmtFecha(d.fecha)}
                  </button>
                ))}
              </div>
            </div>

            {diaActivo && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Hora</label>
                <div className="flex flex-wrap gap-1.5">
                  {diaActivo.slots.map((s) => (
                    <button key={s} type="button" onClick={() => setHora(s)}
                      className={clsx('rounded-lg border-2 px-2.5 py-1.5 text-[0.7rem] font-semibold transition-colors',
                        hora === s ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-tertiary hover:border-gray-300')}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Duración</label>
          <div className="flex gap-1.5">
            {[15, 30, 45, 60].map((d) => (
              <button key={d} type="button" onClick={() => setDuracionMin(d)}
                className={clsx('rounded-lg border-2 px-3 py-1.5 text-[0.7rem] font-semibold transition-colors',
                  duracionMin === d ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-ink-tertiary hover:border-gray-300')}>
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-tertiary uppercase tracking-wide">Notas (opcional)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="field resize-none" placeholder="Cuéntanos brevemente de qué se trata..." maxLength={500} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={enviar.isPending} disabled={!puedeGuardar} onClick={() => enviar.mutate()}>Enviar solicitud</Button>
        </div>
      </div>
    </Modal>
  )
}
