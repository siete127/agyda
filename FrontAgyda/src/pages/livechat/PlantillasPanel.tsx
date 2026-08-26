import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, Edit2, X, Globe, Lock } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { LivechatPlantilla } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

function PlantillaForm({ grupoId, plantilla, onDone }: { grupoId: number; plantilla?: LivechatPlantilla; onDone: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '')
  const [contenido, setContenido] = useState(plantilla?.contenido ?? '')
  const [visibilidad, setVisibilidad] = useState<'publica' | 'privada'>(plantilla?.visibilidad ?? 'publica')

  const guardar = useMutation({
    mutationFn: () => plantilla
      ? livechatService.updatePlantilla(plantilla.id, { nombre: nombre.trim(), contenido, visibilidad })
      : livechatService.createPlantilla(grupoId, { nombre: nombre.trim(), contenido, visibilidad }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-plantillas-admin', grupoId] })
      toast.success(plantilla ? 'Plantilla actualizada' : 'Plantilla creada')
      onDone()
    },
    onError: () => toast.error('No se pudo guardar la plantilla'),
  })

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white">
      <input
        type="text"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre de la plantilla"
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
        autoFocus
      />
      <textarea
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
        placeholder="Contenido del mensaje…"
        rows={2}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1 text-xs resize-none"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['publica', 'privada'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibilidad(v)}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border',
                visibilidad === v ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200',
              )}
            >
              {v === 'publica' ? <Globe size={10} /> : <Lock size={10} />}
              {v === 'publica' ? 'Pública' : 'Privada'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={onDone} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          <Button size="sm" onClick={() => guardar.mutate()} disabled={!nombre.trim() || !contenido.trim() || guardar.isPending}>
            {guardar.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PlantillasPanel({ grupoId }: { grupoId: number }) {
  const qc = useQueryClient()
  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ['livechat-plantillas-admin', grupoId],
    queryFn: () => livechatService.getPlantillas(grupoId),
  })
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const eliminar = useMutation({
    mutationFn: (id: number) => livechatService.deletePlantilla(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-plantillas-admin', grupoId] })
      toast.success('Plantilla eliminada')
    },
  })

  return (
    <div className="space-y-2">
      {isLoading ? (
        <Spinner size="sm" />
      ) : plantillas.length === 0 && !creando ? (
        <p className="text-xs text-gray-400">Sin plantillas en este grupo</p>
      ) : (
        <div className="space-y-1.5">
          {plantillas.map((p) => (
            editandoId === p.id ? (
              <PlantillaForm key={p.id} grupoId={grupoId} plantilla={p} onDone={() => setEditandoId(null)} />
            ) : (
              <div key={p.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 bg-white">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 flex items-center gap-1">
                    {p.visibilidad === 'publica' ? <Globe size={10} className="text-gray-400" /> : <Lock size={10} className="text-gray-400" />}
                    {p.nombre}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">{p.contenido}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setEditandoId(p.id)} className="text-gray-300 hover:text-brand p-1"><Edit2 size={12} /></button>
                  <button type="button" onClick={() => { if (window.confirm('¿Eliminar esta plantilla?')) eliminar.mutate(p.id) }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {creando ? (
        <PlantillaForm grupoId={grupoId} onDone={() => setCreando(false)} />
      ) : (
        <button type="button" onClick={() => setCreando(true)} className="text-xs font-semibold text-brand hover:underline flex items-center gap-1">
          <Plus size={12} />
          Nueva plantilla
        </button>
      )}
    </div>
  )
}
