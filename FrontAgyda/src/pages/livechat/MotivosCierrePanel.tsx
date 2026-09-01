import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2, Edit2, X, MessageSquareWarning } from 'lucide-react'
import { livechatService } from '@/services/livechat.service'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { LivechatMotivoCierre } from '@/types/livechat.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

function MotivoForm({ grupoId, motivo, orden, onDone }: { grupoId: number; motivo?: LivechatMotivoCierre; orden: number; onDone: () => void }) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState(motivo?.motivo ?? '')
  const [requiereComentario, setRequiereComentario] = useState(motivo?.requiereComentario ?? false)

  const guardar = useMutation({
    mutationFn: () => motivo
      ? livechatService.updateMotivoCierre(motivo.id, { motivo: texto.trim(), requiereComentario })
      : livechatService.createMotivoCierre(grupoId, { motivo: texto.trim(), requiereComentario, orden }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-motivos-admin', grupoId] })
      toast.success(motivo ? 'Motivo actualizado' : 'Motivo creado')
      onDone()
    },
    onError: () => toast.error('No se pudo guardar el motivo'),
  })

  return (
    <div className="flex items-center gap-2 border border-surface-border rounded-lg p-2 bg-card">
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej. Resuelto, No contestó…"
        className="flex-1 rounded-lg border border-surface-border bg-card px-2.5 py-1 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && texto.trim() && guardar.mutate()}
      />
      <label className="flex items-center gap-1 text-[11px] text-ink-tertiary whitespace-nowrap">
        <input type="checkbox" checked={requiereComentario} onChange={(e) => setRequiereComentario(e.target.checked)} />
        Requiere comentario
      </label>
      <button type="button" onClick={onDone} className="text-ink-tertiary hover:text-ink-secondary"><X size={14} /></button>
      <Button size="sm" onClick={() => guardar.mutate()} disabled={!texto.trim() || guardar.isPending}>
        {guardar.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Guardar'}
      </Button>
    </div>
  )
}

export function MotivosCierrePanel({ grupoId }: { grupoId: number }) {
  const qc = useQueryClient()
  const { data: motivos = [], isLoading } = useQuery({
    queryKey: ['livechat-motivos-admin', grupoId],
    queryFn: () => livechatService.getMotivosCierre(grupoId),
  })
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)

  const eliminar = useMutation({
    mutationFn: (id: number) => livechatService.deleteMotivoCierre(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['livechat-motivos-admin', grupoId] })
      toast.success('Motivo eliminado')
    },
  })

  return (
    <div className="space-y-2">
      {isLoading ? (
        <Spinner size="sm" />
      ) : motivos.length === 0 && !creando ? (
        <p className="text-xs text-ink-tertiary flex items-center gap-1.5">
          <MessageSquareWarning size={13} />
          Sin motivos de cierre — el agente no podrá cerrar chats de este grupo hasta que agregues al menos uno.
        </p>
      ) : (
        <div className="space-y-1.5">
          {motivos.map((m) => (
            editandoId === m.id ? (
              <MotivoForm key={m.id} grupoId={grupoId} motivo={m} orden={m.orden} onDone={() => setEditandoId(null)} />
            ) : (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-2.5 py-1.5 bg-card">
                <span className="text-xs text-ink-secondary flex items-center gap-1.5">
                  {m.motivo}
                  {m.requiereComentario && (
                    <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500')}>
                      requiere comentario
                    </span>
                  )}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setEditandoId(m.id)} className="text-ink-tertiary hover:text-brand p-1"><Edit2 size={12} /></button>
                  <button type="button" onClick={() => { if (window.confirm('¿Eliminar este motivo?')) eliminar.mutate(m.id) }} className="text-ink-tertiary hover:text-red-500 p-1"><Trash2 size={12} /></button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {creando ? (
        <MotivoForm grupoId={grupoId} orden={motivos.length} onDone={() => setCreando(false)} />
      ) : (
        <button type="button" onClick={() => setCreando(true)} className="text-xs font-semibold text-brand hover:underline flex items-center gap-1">
          <Plus size={12} />
          Nuevo motivo de cierre
        </button>
      )}
    </div>
  )
}
