import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { chatbotArbolService } from '@/services/chatbotArbol.service'
import { useIsAdmin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { NODO_TIPO_LABELS, type ChatbotNodo, type ChatbotNodoTipo } from '@/types/chatbotArbol.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

function NodoFormModal({ nodo, nodos, onClose }: { nodo?: ChatbotNodo; nodos: ChatbotNodo[]; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!nodo
  const [form, setForm] = useState({
    codigo: nodo?.codigo ?? '',
    texto: nodo?.texto ?? '',
    tipo: (nodo?.tipo ?? 'pregunta') as ChatbotNodoTipo,
  })

  const guardar = useMutation({
    mutationFn: () => isEdit
      ? chatbotArbolService.updateNodo(nodo!.id, { texto: form.texto, tipo: form.tipo })
      : chatbotArbolService.createNodo({ codigo: form.codigo, texto: form.texto, tipo: form.tipo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-nodos'] })
      toast.success(isEdit ? 'Nodo actualizado' : 'Nodo creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar el nodo'),
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar nodo' : 'Nuevo nodo'} size="md">
      <div className="space-y-4">
        {!isEdit && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Código único</label>
            <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="field" placeholder="ej: hw_no_enciende" />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Texto (pregunta o mensaje)</label>
          <textarea value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} rows={3} className="field resize-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de nodo</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ChatbotNodoTipo })} className="field">
            {Object.entries(NODO_TIPO_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!form.texto.trim() || (!isEdit && !form.codigo.trim())} onClick={() => guardar.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}

function OpcionFormModal({ nodoId, nodos, onClose }: { nodoId: number; nodos: ChatbotNodo[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [destinoId, setDestinoId] = useState<string>('')

  const guardar = useMutation({
    mutationFn: () => chatbotArbolService.createOpcion({ nodoId, texto, nodoDestinoId: destinoId ? Number(destinoId) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-nodos'] })
      toast.success('Opción creada')
      onClose()
    },
    onError: () => toast.error('Error al crear la opción'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nueva opción" size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Texto del botón</label>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} className="field" placeholder="ej: Problema de hardware" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nodo destino</label>
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} className="field">
            <option value="">Sin destino (opción terminal)</option>
            {nodos.map((n) => <option key={n.id} value={n.id}>{n.codigo} — {n.texto.slice(0, 40)}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!texto.trim()} onClick={() => guardar.mutate()}>Crear</Button>
        </div>
      </div>
    </Modal>
  )
}

// Árbol de diagnóstico básico del Chatbot — componente compartido, usado tanto
// en /chatbot (módulo standalone) como en Configuración > Tecnología/TI >
// Chatbot, para no tener el editor real duplicado en dos lugares.
export function ArbolDiagnosticoTab() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const [showNuevoNodo, setShowNuevoNodo] = useState(false)
  const [editandoNodo, setEditandoNodo] = useState<ChatbotNodo | null>(null)
  const [agregandoOpcionA, setAgregandoOpcionA] = useState<number | null>(null)

  const { data: nodos = [], isLoading } = useQuery({
    queryKey: ['chatbot-nodos'],
    queryFn: () => chatbotArbolService.getNodos(),
  })

  const eliminarNodo = useMutation({
    mutationFn: (id: number) => chatbotArbolService.deleteNodo(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatbot-nodos'] }); toast.success('Nodo eliminado') },
    onError: () => toast.error('No se pudo eliminar: puede ser destino de otra opción o tener sesiones activas'),
  })

  const eliminarOpcion = useMutation({
    mutationFn: (id: number) => chatbotArbolService.deleteOpcion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatbot-nodos'] }); toast.success('Opción eliminada') },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Árbol de preguntas guiadas: cada nodo puede resolver, escalar a chat en vivo, o crear un ticket automáticamente.</p>
        {isAdmin && <Button size="sm" onClick={() => setShowNuevoNodo(true)}><Plus className="h-3.5 w-3.5" /> Nuevo nodo</Button>}
      </div>

      {nodos.map((n) => (
        <div key={n.id} className={clsx('card p-4 space-y-2', !n.activo && 'opacity-60')}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono font-semibold text-brand bg-brand/10 rounded px-1.5 py-0.5">{n.codigo}</code>
                <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[0.65rem] font-semibold">{NODO_TIPO_LABELS[n.tipo]}</span>
              </div>
              <p className="text-sm text-gray-800 mt-1.5">{n.texto}</p>
            </div>
            {isAdmin && n.codigo !== 'inicio' && (
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => setEditandoNodo(n)} className="p-1.5 text-gray-400 hover:text-brand rounded-lg hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => eliminarNodo.mutate(n.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {isAdmin && n.codigo === 'inicio' && (
              <button onClick={() => setEditandoNodo(n)} className="p-1.5 text-gray-400 hover:text-brand rounded-lg hover:bg-gray-50"><Pencil className="h-3.5 w-3.5" /></button>
            )}
          </div>

          {n.tipo === 'pregunta' && (
            <div className="pl-2 border-l-2 border-gray-100 space-y-1.5">
              {n.opciones.map((o) => {
                const destino = nodos.find((x) => x.id === o.nodoDestinoId)
                return (
                  <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-700">→ {o.texto} {destino && <span className="text-gray-400">({destino.codigo})</span>}</span>
                    {isAdmin && (
                      <button onClick={() => eliminarOpcion.mutate(o.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                    )}
                  </div>
                )
              })}
              {isAdmin && (
                <button onClick={() => setAgregandoOpcionA(n.id)} className="text-[0.7rem] font-semibold text-brand hover:underline">+ Agregar opción</button>
              )}
            </div>
          )}
        </div>
      ))}

      {showNuevoNodo && <NodoFormModal nodos={nodos} onClose={() => setShowNuevoNodo(false)} />}
      {editandoNodo && <NodoFormModal nodo={editandoNodo} nodos={nodos} onClose={() => setEditandoNodo(null)} />}
      {agregandoOpcionA !== null && <OpcionFormModal nodoId={agregandoOpcionA} nodos={nodos} onClose={() => setAgregandoOpcionA(null)} />}
    </div>
  )
}
