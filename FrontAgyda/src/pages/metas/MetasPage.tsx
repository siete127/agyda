import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Target, Plus, Trash2, Headset, User } from 'lucide-react'
import { api } from '@/lib/axios'
import { metasService } from '@/services/metas.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { MetaOperaciones, MetaTipo } from '@/types/metas.types'

interface Campania { id: number; nombre: string }
interface AgenteOpcion { id: number; nombre: string }

function hoyPeriodo() {
  return new Date().toISOString().slice(0, 7)
}

function MetaCard({ meta, isAdmin, onDelete }: { meta: MetaOperaciones; isAdmin: boolean; onDelete: (id: number) => void }) {
  const pct = meta.metaRegistros > 0 ? Math.min(100, Math.round((meta.avance / meta.metaRegistros) * 100)) : 0
  const cumplida = pct >= 100
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', meta.tipo === 'campania' ? 'bg-brand/10 text-brand' : 'bg-purple-100 text-purple-600')}>
            {meta.tipo === 'campania' ? <Headset className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{meta.tipo === 'campania' ? meta.campaniaNombre : meta.agenteNombre}</p>
            <p className="text-[0.68rem] text-gray-500">{meta.tipo === 'campania' ? 'Meta de campaña' : 'Meta de agente'}</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => onDelete(meta.id)} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-gray-600">{meta.avance} / {meta.metaRegistros} registros</span>
          <span className={clsx('font-bold', cumplida ? 'text-emerald-600' : 'text-gray-700')}>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={clsx('h-full rounded-full transition-all', cumplida ? 'bg-emerald-500' : 'bg-brand')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function CrearMetaModal({ periodo, onClose }: { periodo: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<MetaTipo>('campania')
  const [campaniaId, setCampaniaId] = useState<number | ''>('')
  const [agenteId, setAgenteId] = useState<number | ''>('')
  const [metaRegistros, setMetaRegistros] = useState<number | ''>('')

  const { data: campanias = [] } = useQuery({
    queryKey: ['operaciones-campanias'],
    queryFn: async () => {
      const { data } = await api.get('/operaciones/campanias')
      return (data?.data ?? []) as Campania[]
    },
    enabled: tipo === 'campania',
  })
  const { data: agentes = [] } = useQuery({
    queryKey: ['tiempos-mis-agentes'],
    queryFn: async () => {
      const { data } = await api.get('/operaciones/tiempos/mis-agentes')
      return (data?.data ?? []) as AgenteOpcion[]
    },
    enabled: tipo === 'agente',
  })

  const crear = useMutation({
    mutationFn: () => metasService.crear({
      tipo,
      periodo,
      metaRegistros: Number(metaRegistros),
      ...(tipo === 'campania' ? { campaniaId: Number(campaniaId) } : { agenteId: Number(agenteId) }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operaciones-metas'] })
      toast.success('Meta creada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear la meta'),
  })

  const puedeCrear = metaRegistros !== '' && Number(metaRegistros) > 0 && (tipo === 'campania' ? campaniaId !== '' : agenteId !== '')

  return (
    <Modal isOpen onClose={onClose} title={`Nueva meta — ${periodo}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de meta</label>
          <div className="flex gap-2">
            <button
              onClick={() => setTipo('campania')}
              className={clsx('flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors', tipo === 'campania' ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              Por campaña
            </button>
            <button
              onClick={() => setTipo('agente')}
              className={clsx('flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors', tipo === 'agente' ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50')}
            >
              Por agente
            </button>
          </div>
        </div>

        {tipo === 'campania' ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña</label>
            <select value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')} className="field">
              <option value="">Selecciona una campaña</option>
              {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Agente</label>
            <select value={agenteId} onChange={(e) => setAgenteId(e.target.value ? Number(e.target.value) : '')} className="field">
              <option value="">Selecciona un agente</option>
              {agentes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Meta de registros gestionados</label>
          <input
            type="number"
            min={1}
            value={metaRegistros}
            onChange={(e) => setMetaRegistros(e.target.value ? Number(e.target.value) : '')}
            className="field"
            placeholder="Ej. 500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Crear meta</Button>
        </div>
      </div>
    </Modal>
  )
}

export function MetasPage() {
  const isAdmin = useIsADorTI()
  const qc = useQueryClient()
  const [periodo, setPeriodo] = useState(hoyPeriodo())
  const [showCrear, setShowCrear] = useState(false)

  const { data: metas = [], isLoading } = useQuery({
    queryKey: ['operaciones-metas', periodo],
    queryFn: () => metasService.list(periodo),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => metasService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operaciones-metas'] })
      toast.success('Meta eliminada')
    },
    onError: () => toast.error('Error al eliminar la meta'),
  })

  const metasCampania = metas.filter((m) => m.tipo === 'campania')
  const metasAgente = metas.filter((m) => m.tipo === 'agente')

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Target className="h-5 w-5 text-brand" /> Metas
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Metas operativas del Call Center</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="field" />
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva meta</Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : metas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Target className="h-8 w-8" />
          <p className="text-sm">Sin metas registradas para este periodo</p>
        </div>
      ) : (
        <div className="space-y-6">
          {metasCampania.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-ink">Metas por campaña</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metasCampania.map((m) => <MetaCard key={m.id} meta={m} isAdmin={isAdmin} onDelete={(id) => eliminar.mutate(id)} />)}
              </div>
            </div>
          )}
          {metasAgente.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-ink">Metas por agente</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metasAgente.map((m) => <MetaCard key={m.id} meta={m} isAdmin={isAdmin} onDelete={(id) => eliminar.mutate(id)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {showCrear && <CrearMetaModal periodo={periodo} onClose={() => setShowCrear(false)} />}
    </div>
  )
}
