import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Send } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { ccService } from '@/services/cc.service'
import { Modal } from '@/components/ui/Modal'

interface NotasPostulanteModalProps {
  postulanteId: number
  onClose: () => void
}

export function NotasPostulanteModal({ postulanteId, onClose }: NotasPostulanteModalProps) {
  const [texto, setTexto] = useState('')
  const qc = useQueryClient()

  const { data: notas = [], isLoading } = useQuery({
    queryKey: ['cc-postulante-notas', postulanteId],
    queryFn: () => ccService.getNotasPostulante(postulanteId),
  })

  const agregar = useMutation({
    mutationFn: () => ccService.crearNotaPostulante(postulanteId, texto.trim()),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['cc-postulante-notas', postulanteId] })
    },
    onError: () => toast.error('No se pudo guardar la nota'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Notas del postulante" size="md">
      <div className="space-y-4">
        <div className="max-h-72 space-y-2.5 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-ink-tertiary" /></div>
          ) : notas.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-tertiary">Todavía no hay notas para este postulante.</p>
          ) : (
            notas.map((n) => (
              <div key={n.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.72rem] font-semibold text-ink">{n.usuarioNombre || 'Agente'}</span>
                  <span className="text-[0.65rem] text-ink-tertiary">
                    {new Date(n.fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm text-ink-secondary">{n.nota}</p>
              </div>
            ))
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-gray-100 pt-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Escribe una nota de seguimiento..."
            className="w-full resize-none rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            type="button"
            disabled={!texto.trim() || agregar.isPending}
            onClick={() => agregar.mutate()}
            className={clsx(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white transition',
              !texto.trim() || agregar.isPending ? 'bg-violet-300' : 'bg-violet-600 hover:bg-violet-700',
            )}
          >
            {agregar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </Modal>
  )
}
