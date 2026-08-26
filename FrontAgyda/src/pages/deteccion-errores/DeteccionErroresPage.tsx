import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { AlertOctagon, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { deteccionErroresService } from '@/services/deteccionErrores.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { SEVERIDAD_LABELS, type SeveridadError, type EstatusError } from '@/types/deteccionErrores.types'

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

const SEVERIDAD_COLOR: Record<SeveridadError, string> = {
  leve: 'bg-amber-100 text-amber-700',
  moderado: 'bg-orange-100 text-orange-700',
  grave: 'bg-red-100 text-red-700',
}

function CrearErrorModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [agenteId, setAgenteId] = useState<number | ''>('')
  const [categoria, setCategoria] = useState('')
  const [severidad, setSeveridad] = useState<SeveridadError>('leve')
  const [descripcion, setDescripcion] = useState('')

  const crear = useMutation({
    mutationFn: () => deteccionErroresService.crear({ agenteId: Number(agenteId), categoria: categoria.trim(), severidad, descripcion: descripcion.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-errores'] })
      qc.invalidateQueries({ queryKey: ['calidad-errores-resumen'] })
      toast.success('Error registrado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar'),
  })

  const puedeCrear = agenteId !== '' && categoria.trim() !== '' && descripcion.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title="Registrar error detectado" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">ID del agente</label>
          <input type="number" min={1} value={agenteId} onChange={(e) => setAgenteId(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="ID del usuario" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
          <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field" placeholder="Ej. Manejo de datos, Protocolo de saludo" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Severidad</label>
          <div className="grid grid-cols-3 gap-2">
            {(['leve', 'moderado', 'grave'] as SeveridadError[]).map((s) => (
              <button
                key={s}
                onClick={() => setSeveridad(s)}
                className={clsx('rounded-xl border px-2 py-2 text-xs font-semibold transition-colors', severidad === s ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
              >
                {SEVERIDAD_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field" rows={3} placeholder="Detalle del error detectado" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

export function DeteccionErroresPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusError | ''>('abierto')

  const { data: resumen } = useQuery({
    queryKey: ['calidad-errores-resumen'],
    queryFn: () => deteccionErroresService.getResumen(),
  })

  const { data: errores = [], isLoading } = useQuery({
    queryKey: ['calidad-errores', filtroEstatus],
    queryFn: () => deteccionErroresService.list(filtroEstatus ? { estatus: filtroEstatus } : undefined),
  })

  const resolver = useMutation({
    mutationFn: (id: number) => deteccionErroresService.resolver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-errores'] })
      qc.invalidateQueries({ queryKey: ['calidad-errores-resumen'] })
      toast.success('Marcado como resuelto')
    },
    onError: () => toast.error('Error al resolver'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => deteccionErroresService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-errores'] })
      qc.invalidateQueries({ queryKey: ['calidad-errores-resumen'] })
      toast.success('Registro eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-brand" /> Detección de errores
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Registro de errores detectados</p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Registrar error</Button>
        )}
      </div>

      {resumen && (
        <DashboardStatRow
          stats={[
            { key: 'abiertos', icon: AlertOctagon, label: 'Errores abiertos', value: resumen.abiertos, tone: 'critical' },
            { key: 'resueltos', icon: CheckCircle2, label: 'Errores resueltos', value: resumen.resueltos, tone: 'success' },
            ...resumen.porSeveridad.map((s) => ({ key: s.severidad, icon: AlertOctagon, label: `${SEVERIDAD_LABELS[s.severidad]} (abiertos)`, value: s.total, tone: 'warn' as const })),
          ]}
        />
      )}

      <div className="flex gap-1 rounded-xl border border-gray-200 p-1 w-fit">
        {(['abierto', 'resuelto', ''] as (EstatusError | '')[]).map((e) => (
          <button
            key={e || 'todos'}
            onClick={() => setFiltroEstatus(e)}
            className={clsx('rounded-lg px-3 py-1 text-xs font-semibold transition-colors', filtroEstatus === e ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            {e === 'abierto' ? 'Abiertos' : e === 'resuelto' ? 'Resueltos' : 'Todos'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : errores.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <AlertOctagon className="h-8 w-8" />
          <p className="text-sm">Sin errores registrados</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Agente</th>
                <th className="px-4 py-2.5 font-semibold">Categoría</th>
                <th className="px-4 py-2.5 font-semibold">Severidad</th>
                <th className="px-4 py-2.5 font-semibold">Descripción</th>
                <th className="px-4 py-2.5 font-semibold">Estatus</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                {isAdmin && <th className="px-4 py-2.5 font-semibold"></th>}
              </tr>
            </thead>
            <tbody>
              {errores.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{e.agenteNombre ?? `Agente ${e.agenteId}`}</td>
                  <td className="px-4 py-2.5 text-gray-700">{e.categoria}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('inline-flex rounded-full px-2 py-0.5 font-semibold', SEVERIDAD_COLOR[e.severidad])}>{SEVERIDAD_LABELS[e.severidad]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[280px] truncate">{e.descripcion}</td>
                  <td className="px-4 py-2.5">
                    {e.estatus === 'resuelto' ? <span className="text-emerald-600 font-semibold">Resuelto</span> : <span className="text-red-600 font-semibold">Abierto</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatFecha(e.fecha)}</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {e.estatus === 'abierto' && (
                          <button onClick={() => resolver.mutate(e.id)} title="Marcar como resuelto" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-emerald-50 hover:text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => eliminar.mutate(e.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCrear && <CrearErrorModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
