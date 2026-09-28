import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { casoService } from '@/services/caso.service'
import { ESTATUS_CASO_CONFIG, type Caso, type CasoEstatus } from '@/types/caso.types'
import { useModuleAccess } from '@/hooks/useModuleAccess'
import { GenerarOportunidadModal } from '../GenerarOportunidadModal'
import { AccionCorrectivaSection } from './AccionCorrectivaSection'
import { CasoFilaResumen } from './CasoFilaResumen'

const CASOS_RELACIONADOS_LIMITE = 3

export function CasoInfoColumnaDerecha({ caso, puedeGestionar, queryKeysToInvalidate, onVerHistorial, onAbrirCaso }: {
  caso: Caso
  puedeGestionar: boolean
  queryKeysToInvalidate: unknown[][]
  onVerHistorial: () => void
  onAbrirCaso: (c: Caso) => void
}) {
  const { isAllowed } = useModuleAccess()
  const qc = useQueryClient()
  const [editandoSolucion, setEditandoSolucion] = useState(false)
  const [solucionPropuesta, setSolucionPropuesta] = useState(caso.solucionPropuesta ?? '')
  const [fechaCompromiso, setFechaCompromiso] = useState(caso.fechaCompromiso ?? '')
  const [generandoOportunidad, setGenerandoOportunidad] = useState(false)

  const puedeGenerarOportunidad = isAllowed('crm') && caso.contactoId != null
  const clienteMostrado = caso.contactoNombre || caso.clienteNombreLibre

  const invalidarTodo = () => {
    for (const key of queryKeysToInvalidate) qc.invalidateQueries({ queryKey: key })
  }

  const cambiarEstatus = useMutation({
    mutationFn: (estatus: CasoEstatus) => casoService.updateEstatus(caso.id, estatus),
    onSuccess: () => { toast.success('Estatus actualizado'); invalidarTodo() },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo actualizar el estatus'),
  })
  const guardarSolucion = useMutation({
    mutationFn: () => casoService.updateSolucion(caso.id, { solucionPropuesta: solucionPropuesta.trim() || undefined, fechaCompromiso: fechaCompromiso || undefined }),
    onSuccess: () => { toast.success('Solución actualizada'); setEditandoSolucion(false); invalidarTodo() },
    onError: () => toast.error('No se pudo guardar la solución'),
  })

  const { data: casosCliente = [] } = useQuery({
    queryKey: ['cliente-casos', caso.contactoId],
    queryFn: () => casoService.getByContacto(caso.contactoId as number),
    enabled: caso.contactoId != null,
    staleTime: 15_000,
  })
  const relacionados = casosCliente.filter((c) => c.id !== caso.id).slice(0, CASOS_RELACIONADOS_LIMITE)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
        <p className="mb-3 text-[0.8rem] font-bold text-gray-700">Información del caso</p>
        <div className="space-y-2.5 text-sm">
          {clienteMostrado && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
              <p className="text-gray-800">{clienteMostrado}</p>
              {caso.contactoEmpresa && <p className="text-[0.75rem] text-gray-500">{caso.contactoEmpresa}</p>}
            </div>
          )}
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Asignado a</p>
            <p className="text-gray-800">{caso.asignadoNombre ?? 'Sin asignar'}</p>
          </div>
          {caso.categoria && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Categoría</p>
              <p className="text-gray-800">{caso.categoria}</p>
            </div>
          )}
          {caso.referencia && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Referencia</p>
              <p className="text-gray-800">{caso.referencia}</p>
            </div>
          )}
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Fecha de creación</p>
            <p className="text-gray-800">{new Date(caso.fechaCreacion).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          {caso.descripcion && (
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">Descripción</p>
              <p className="text-gray-700 leading-relaxed">{caso.descripcion}</p>
            </div>
          )}
        </div>

        {puedeGenerarOportunidad && (
          <button
            onClick={() => setGenerandoOportunidad(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-[0.72rem] font-bold text-brand hover:bg-brand/10 transition-colors"
          >
            <Briefcase className="h-3.5 w-3.5" /> Generar oportunidad de venta
          </button>
        )}
      </div>

      {puedeGestionar && caso.estatus !== 'cerrado' && (
        <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
          <p className="mb-2 text-[0.8rem] font-bold text-gray-700">Estado</p>
          <select
            value={caso.estatus}
            onChange={(e) => cambiarEstatus.mutate(e.target.value as CasoEstatus)}
            disabled={cambiarEstatus.isPending}
            className="field text-sm"
          >
            {(Object.keys(ESTATUS_CASO_CONFIG) as CasoEstatus[]).map((e) => (
              <option key={e} value={e}>{ESTATUS_CASO_CONFIG[e].label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-card p-3">
        <div className="flex items-center justify-between">
          <p className="text-[0.75rem] font-bold text-gray-600">Solución propuesta</p>
          {puedeGestionar && !editandoSolucion && (
            <button onClick={() => setEditandoSolucion(true)} className="text-[0.7rem] font-semibold text-brand hover:underline">Editar</button>
          )}
        </div>
        {editandoSolucion ? (
          <div className="mt-2 space-y-2">
            <textarea value={solucionPropuesta} onChange={(e) => setSolucionPropuesta(e.target.value)} rows={3} className="field resize-none text-sm" placeholder="Describe la solución propuesta..." />
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold text-gray-500 uppercase tracking-wide">Fecha compromiso</label>
              <input type="date" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} className="field text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditandoSolucion(false)}>Cancelar</Button>
              <Button isLoading={guardarSolucion.isPending} onClick={() => guardarSolucion.mutate()}>Guardar</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-700">{caso.solucionPropuesta || 'Sin definir'}</p>
            {caso.fechaCompromiso && (
              <p className="mt-1 text-[0.72rem] text-gray-400">Fecha compromiso: {new Date(`${caso.fechaCompromiso}T00:00:00`).toLocaleDateString('es-MX')}</p>
            )}
          </>
        )}
      </div>

      {caso.tipo === 'queja' && <AccionCorrectivaSection casoId={caso.id} puedeGestionar={puedeGestionar} />}

      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Casos relacionados</p>
          {relacionados.length > 0 && (
            <button onClick={onVerHistorial} className="text-[0.7rem] font-semibold text-brand hover:underline">Ver todos</button>
          )}
        </div>
        {relacionados.length === 0 ? (
          <p className="py-6 text-center text-[0.75rem] text-gray-400">Sin otros casos</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {relacionados.map((c) => <CasoFilaResumen key={c.id} caso={c} onClick={() => onAbrirCaso(c)} />)}
          </div>
        )}
      </div>

      {generandoOportunidad && caso.contactoId != null && (
        <GenerarOportunidadModal
          contactoId={caso.contactoId}
          contactoNombre={clienteMostrado}
          tituloSugerido={`[${caso.folio}] ${caso.titulo}`}
          contextoNota={`Generada desde el caso ${caso.folio}${caso.descripcion ? `\n\n${caso.descripcion}` : ''}`}
          onClose={() => setGenerandoOportunidad(false)}
        />
      )}
    </div>
  )
}
