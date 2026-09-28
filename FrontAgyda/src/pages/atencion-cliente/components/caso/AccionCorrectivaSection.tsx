import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'
import type { AccionCorrectivaEstado } from '@/types/caso.types'

const AC_ESTADO_LABEL: Record<AccionCorrectivaEstado, string> = {
  pendiente: 'Pendiente', aplicada: 'Aplicada', verificada: 'Verificada',
}

// Copiado de CasoDetalleModal.tsx sin cambios de lógica — solo visible para
// tipo 'queja' (decisión ya existente, ver casoController.js verificarPermisoQueja).
export function AccionCorrectivaSection({ casoId, puedeGestionar }: { casoId: number; puedeGestionar: boolean }) {
  const qc = useQueryClient()
  const queryKey = ['caso-accion-correctiva', casoId]
  const [creando, setCreando] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [responsable, setResponsable] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')
  const [estado, setEstado] = useState<AccionCorrectivaEstado>('pendiente')

  const { data: ac, isLoading, error } = useQuery({
    queryKey, queryFn: () => casoService.getAccionCorrectiva(casoId), staleTime: 15_000, retry: false,
  })
  const sinAcceso = (error as { response?: { status?: number } })?.response?.status === 403

  const crear = useMutation({
    mutationFn: () => casoService.createAccionCorrectiva(casoId, { descripcion: descripcion.trim(), responsable: responsable.trim(), fechaCompromiso, estado }),
    onSuccess: () => { toast.success('Acción correctiva registrada'); setCreando(false); qc.invalidateQueries({ queryKey }) },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo registrar'),
  })

  if (sinAcceso) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] font-bold text-gray-600">Acción correctiva</p>
        {puedeGestionar && !ac && !creando && !isLoading && (
          <button onClick={() => setCreando(true)} className="text-[0.7rem] font-semibold text-brand hover:underline">Registrar</button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : ac ? (
        <div className="mt-1 space-y-1">
          <p className="text-sm text-gray-700">{ac.descripcion}</p>
          <p className="text-[0.72rem] text-gray-400">
            Responsable: {ac.responsable} · Compromiso: {new Date(`${ac.fechaCompromiso}T00:00:00`).toLocaleDateString('es-MX')}
            {' · '}<span className="font-semibold">{AC_ESTADO_LABEL[ac.estado]}</span>
          </p>
          {ac.redactorNombre && <p className="text-[0.68rem] text-gray-400">Redactó: {ac.redactorNombre}</p>}
        </div>
      ) : creando ? (
        <div className="mt-2 space-y-2">
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="field resize-none text-sm" placeholder="Descripción de la acción correctiva..." />
          <div className="grid grid-cols-2 gap-2">
            <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className="field text-sm" placeholder="Responsable" />
            <input type="date" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} className="field text-sm" />
          </div>
          <select value={estado} onChange={(e) => setEstado(e.target.value as AccionCorrectivaEstado)} className="field text-sm">
            <option value="pendiente">Pendiente</option>
            <option value="aplicada">Aplicada</option>
            <option value="verificada">Verificada</option>
          </select>
          <p className="text-[0.68rem] text-amber-600">Una vez registrada no se puede modificar.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreando(false)}>Cancelar</Button>
            <Button isLoading={crear.isPending} disabled={!descripcion.trim() || !responsable.trim() || !fechaCompromiso} onClick={() => crear.mutate()}>Guardar</Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-400">Sin definir</p>
      )}
    </div>
  )
}
