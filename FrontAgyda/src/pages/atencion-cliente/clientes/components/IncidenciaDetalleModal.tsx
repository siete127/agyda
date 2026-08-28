import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Send, Clock, Paperclip, Plus, Download, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { incidenciaService } from '@/services/incidencia.service'
import { PRIORIDAD_INCIDENCIA_CONFIG, ESTATUS_INCIDENCIA_CONFIG, ORIGEN_INCIDENCIA_LABEL, type Incidencia, type IncidenciaEstatus } from '@/types/incidencia.types'
import { useActionAccess } from '@/hooks/useActionAccess'

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

function fmtSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function EvidenciasSection({ incidenciaId, puedeGestionar }: { incidenciaId: number; puedeGestionar: boolean }) {
  const qc = useQueryClient()
  const queryKey = ['incidencia-evidencias', incidenciaId]

  const { data: evidencias = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => incidenciaService.getEvidencias(incidenciaId),
    staleTime: 15_000,
  })

  const subir = useMutation({
    mutationFn: (file: File) => incidenciaService.subirEvidencia(incidenciaId, file),
    onSuccess: () => { toast.success('Evidencia subida'); qc.invalidateQueries({ queryKey }) },
    onError: () => toast.error('Error al subir evidencia'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => incidenciaService.deleteEvidencia(id),
    onSuccess: () => { toast.success('Evidencia eliminada'); qc.invalidateQueries({ queryKey }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) subir.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[0.75rem] font-bold text-gray-600">Evidencias</p>
        {puedeGestionar && (
          <label className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[0.68rem] font-bold text-white hover:bg-brand-dark transition-colors cursor-pointer">
            {subir.isPending ? <Spinner size="sm" /> : <Plus className="h-3 w-3" />} Adjuntar
            <input type="file" className="hidden" onChange={handleFile} disabled={subir.isPending} />
          </label>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : evidencias.length === 0 ? (
        <p className="pb-4 text-center text-[0.7rem] text-gray-400">Sin evidencias adjuntas</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {evidencias.map((ev) => (
            <div key={ev.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0 flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[0.75rem] font-semibold text-gray-800 truncate">{ev.nombreOriginal}</p>
                  <p className="text-[0.65rem] text-gray-400">{fmtSize(ev.tamanoBytes)} · {new Date(ev.fechaSubida).toLocaleDateString('es-MX')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => incidenciaService.downloadEvidencia(ev.id, ev.nombreOriginal)} title="Descargar" className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                  <Download className="h-3.5 w-3.5" />
                </button>
                {puedeGestionar && (
                  <button
                    onClick={() => { if (window.confirm('¿Eliminar esta evidencia?')) eliminar.mutate(ev.id) }}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function IncidenciaDetalleModal({ incidencia, onClose, queryKeysToInvalidate }: {
  incidencia: Incidencia
  onClose: () => void
  queryKeysToInvalidate: unknown[][]
}) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'incidencias-gestionar')
  const qc = useQueryClient()
  const [comentario, setComentario] = useState('')
  const [editandoSolucion, setEditandoSolucion] = useState(false)
  const [solucionPropuesta, setSolucionPropuesta] = useState(incidencia.solucionPropuesta ?? '')
  const [fechaCompromiso, setFechaCompromiso] = useState(incidencia.fechaCompromiso ?? '')

  const prioCfg = PRIORIDAD_INCIDENCIA_CONFIG[incidencia.prioridad]
  const estCfg = ESTATUS_INCIDENCIA_CONFIG[incidencia.estatus]

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey: ['incidencia-comentarios', incidencia.id],
    queryFn: () => incidenciaService.getComentarios(incidencia.id),
    staleTime: 15_000,
  })

  const invalidarTodo = () => {
    for (const key of queryKeysToInvalidate) qc.invalidateQueries({ queryKey: key })
  }

  const cambiarEstatus = useMutation({
    mutationFn: (estatus: IncidenciaEstatus) => incidenciaService.updateEstatus(incidencia.id, estatus),
    onSuccess: () => { toast.success('Estatus actualizado'); invalidarTodo() },
    onError: () => toast.error('No se pudo actualizar el estatus'),
  })

  const enviarComentario = useMutation({
    mutationFn: () => incidenciaService.addComentario(incidencia.id, comentario.trim()),
    onSuccess: () => {
      setComentario('')
      qc.invalidateQueries({ queryKey: ['incidencia-comentarios', incidencia.id] })
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const guardarSolucion = useMutation({
    mutationFn: () => incidenciaService.updateSolucion(incidencia.id, { solucionPropuesta: solucionPropuesta.trim() || undefined, fechaCompromiso: fechaCompromiso || undefined }),
    onSuccess: () => { toast.success('Solución actualizada'); setEditandoSolucion(false); invalidarTodo() },
    onError: () => toast.error('No se pudo guardar la solución'),
  })

  const vencida = incidencia.fechaLimiteSla && incidencia.estatus !== 'resuelto' && incidencia.estatus !== 'cerrado' && new Date(incidencia.fechaLimiteSla) < new Date()

  return (
    <Modal isOpen onClose={onClose} title={incidencia.folio} size="lg">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>
            <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', estCfg.bg, estCfg.text)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-gray-500">{ORIGEN_INCIDENCIA_LABEL[incidencia.origen]}</span>
            {vencida && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-red-700"><Clock className="h-3 w-3" /> SLA vencido</span>}
          </div>
          <h3 className="mt-2 text-base font-bold text-gray-800">{incidencia.titulo}</h3>
          <p className="text-xs text-gray-500">{incidencia.contactoNombre}</p>
          {incidencia.descripcion && <p className="mt-2 text-sm text-gray-600 leading-relaxed">{incidencia.descripcion}</p>}
        </div>

        {puedeGestionar && incidencia.estatus !== 'cerrado' && (
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ESTATUS_INCIDENCIA_CONFIG) as IncidenciaEstatus[])
              .filter((e) => e !== incidencia.estatus)
              .map((e) => {
                const cfg = ESTATUS_INCIDENCIA_CONFIG[e]
                return (
                  <button
                    key={e}
                    onClick={() => cambiarEstatus.mutate(e)}
                    disabled={cambiarEstatus.isPending}
                    className={clsx('rounded-lg border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors disabled:opacity-50', cfg.bg, cfg.text, 'border-transparent hover:opacity-80')}
                  >
                    Marcar como {cfg.label.toLowerCase()}
                  </button>
                )
              })}
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
              <p className="mt-1 text-sm text-gray-700">{incidencia.solucionPropuesta || 'Sin definir'}</p>
              {incidencia.fechaCompromiso && (
                <p className="mt-1 text-[0.72rem] text-gray-400">Fecha compromiso: {new Date(`${incidencia.fechaCompromiso}T00:00:00`).toLocaleDateString('es-MX')}</p>
              )}
            </>
          )}
        </div>

        <EvidenciasSection incidenciaId={incidencia.id} puedeGestionar={puedeGestionar} />

        <div className="rounded-2xl border border-gray-100 bg-gray-50/50 overflow-hidden">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-[0.75rem] font-bold text-gray-600">Comentarios</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : comentarios.length === 0 ? (
            <p className="py-6 text-center text-[0.72rem] text-gray-400">Sin comentarios</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {comentarios.map((c) => (
                <div key={c.id} className="px-3 py-2">
                  <p className="text-[0.72rem] font-semibold text-gray-600">{c.usuarioNombre ?? 'Usuario'} · {fmtFecha(c.fecha)}</p>
                  <p className="text-sm text-gray-700">{c.comentario}</p>
                </div>
              ))}
            </div>
          )}
          {puedeGestionar && (
            <div className="flex items-center gap-2 border-t border-gray-100 p-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && comentario.trim()) enviarComentario.mutate() }}
                placeholder="Agregar comentario..."
                className="field flex-1 text-sm"
              />
              <button
                onClick={() => enviarComentario.mutate()}
                disabled={!comentario.trim() || enviarComentario.isPending}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
              >
                {enviarComentario.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}
