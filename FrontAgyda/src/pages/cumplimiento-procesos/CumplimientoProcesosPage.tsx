import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ListChecks, Plus, Trash2, X } from 'lucide-react'
import { cumplimientoProcesosService } from '@/services/cumplimientoProcesos.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { Proceso, PasoRegistro } from '@/types/cumplimientoProcesos.types'

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function CrearProcesoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pasos, setPasos] = useState<string[]>([''])

  const crear = useMutation({
    mutationFn: () => cumplimientoProcesosService.crearProceso({ nombre: nombre.trim(), descripcion: descripcion.trim() || undefined, pasos: pasos.map((p) => p.trim()).filter(Boolean) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-procesos'] })
      toast.success('Proceso creado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear el proceso'),
  })

  const puedeCrear = nombre.trim() !== '' && pasos.some((p) => p.trim() !== '')

  return (
    <Modal isOpen onClose={onClose} title="Nuevo proceso" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Ej. Apertura de llamada" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción (opcional)</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field" rows={2} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Pasos del checklist</label>
          <div className="space-y-2">
            {pasos.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={p}
                  onChange={(e) => setPasos(pasos.map((x, idx) => (idx === i ? e.target.value : x)))}
                  className="field"
                  placeholder={`Paso ${i + 1}`}
                />
                {pasos.length > 1 && (
                  <button onClick={() => setPasos(pasos.filter((_, idx) => idx !== i))} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setPasos([...pasos, ''])} className="mt-2 text-xs font-semibold text-brand hover:underline">+ Agregar paso</button>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Crear proceso</Button>
        </div>
      </div>
    </Modal>
  )
}

function RegistrarCumplimientoModal({ proceso, onClose }: { proceso: Proceso; onClose: () => void }) {
  const qc = useQueryClient()
  const [agenteId, setAgenteId] = useState<number | ''>('')
  const [pasos, setPasos] = useState<PasoRegistro[]>(proceso.pasos.map((nombre) => ({ nombre, cumplido: false })))
  const [notas, setNotas] = useState('')

  const crear = useMutation({
    mutationFn: () => cumplimientoProcesosService.crearRegistro({ procesoId: proceso.id, agenteId: Number(agenteId), pasos, notas: notas.trim() || undefined }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['calidad-procesos-registros'] })
      toast.success(`Cumplimiento registrado: ${data.pctCumplimiento}%`)
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar el cumplimiento'),
  })

  const puedeCrear = agenteId !== ''

  return (
    <Modal isOpen onClose={onClose} title={`Registrar cumplimiento — ${proceso.nombre}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">ID del agente</label>
          <input type="number" min={1} value={agenteId} onChange={(e) => setAgenteId(e.target.value ? Number(e.target.value) : '')} className="field" placeholder="ID del usuario evaluado" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist</label>
          <div className="space-y-1.5">
            {pasos.map((p, i) => (
              <label key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={p.cumplido}
                  onChange={(e) => setPasos(pasos.map((x, idx) => (idx === i ? { ...x, cumplido: e.target.checked } : x)))}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-700">{p.nombre}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Notas (opcional)</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="field" rows={2} />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ProcesosTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [registrarPara, setRegistrarPara] = useState<Proceso | null>(null)

  const { data: procesos = [], isLoading } = useQuery({
    queryKey: ['calidad-procesos'],
    queryFn: () => cumplimientoProcesosService.listProcesos(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => cumplimientoProcesosService.eliminarProceso(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-procesos'] })
      toast.success('Proceso eliminado')
    },
    onError: () => toast.error('Error al eliminar el proceso'),
  })

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nuevo proceso</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : procesos.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ListChecks className="h-8 w-8" />
          <p className="text-sm">Sin procesos definidos todavía</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {procesos.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.nombre}</p>
                  {p.descripcion && <p className="text-xs text-gray-500">{p.descripcion}</p>}
                </div>
                {isAdmin && (
                  <button onClick={() => eliminar.mutate(p.id)} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {p.pasos.map((paso, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-gray-400">{i + 1}.</span> {paso}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="secondary" onClick={() => setRegistrarPara(p)} className="mt-3 w-full">Registrar cumplimiento</Button>
            </div>
          ))}
        </div>
      )}

      {showCrear && <CrearProcesoModal onClose={() => setShowCrear(false)} />}
      {registrarPara && <RegistrarCumplimientoModal proceso={registrarPara} onClose={() => setRegistrarPara(null)} />}
    </div>
  )
}

function RegistrosTab() {
  const qc = useQueryClient()
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['calidad-procesos-registros'],
    queryFn: () => cumplimientoProcesosService.listRegistros(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => cumplimientoProcesosService.eliminarRegistro(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-procesos-registros'] })
      toast.success('Registro eliminado')
    },
    onError: () => toast.error('Error al eliminar el registro'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (registros.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <ListChecks className="h-8 w-8" />
        <p className="text-sm">Sin registros de cumplimiento todavía</p>
      </div>
    )
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Proceso</th>
            <th className="px-4 py-2.5 font-semibold">Agente</th>
            <th className="px-4 py-2.5 font-semibold">Cumplimiento</th>
            <th className="px-4 py-2.5 font-semibold">Fecha</th>
            <th className="px-4 py-2.5 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.procesoNombre}</td>
              <td className="px-4 py-2.5 text-gray-700">{r.agenteNombre ?? `Agente ${r.agenteId}`}</td>
              <td className="px-4 py-2.5">
                <span className={clsx('inline-flex rounded-full px-2 py-0.5 font-semibold', r.pctCumplimiento >= 100 ? 'bg-emerald-100 text-emerald-700' : r.pctCumplimiento >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                  {r.pctCumplimiento}%
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-500">{formatFecha(r.fecha)}</td>
              <td className="px-4 py-2.5 text-right">
                <button onClick={() => eliminar.mutate(r.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CumplimientoProcesosPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'procesos' | 'registros'>('procesos')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-brand" /> Cumplimiento de procesos
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Seguimiento de cumplimiento de procesos</p>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('procesos')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'procesos' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          Procesos
        </button>
        <button
          onClick={() => setTab('registros')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'registros' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          Registros
        </button>
      </div>

      {tab === 'procesos' && <ProcesosTab isAdmin={isAdmin} />}
      {tab === 'registros' && <RegistrosTab />}
    </div>
  )
}
