import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Megaphone, Users, Workflow, Radio, Info, Plus, Trash2, X, ChevronDown } from 'lucide-react'
import { chatbotFlujoService } from '@/services/chatbotFlujo.service'
import { ccService } from '@/services/cc.service'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { useIsAdmin } from '@/hooks/useAuth'
import type { TipoNodoFlujo } from '@/types/chatbotFlujo.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// Cada tipo de caja tiene su propio color/ícono para distinguirse de un
// vistazo en el lienzo — mismo criterio que ya usa "Menú del Widget".
const ESTILO_TIPO: Record<TipoNodoFlujo, { icon: React.ElementType; clases: string }> = {
  respuesta: { icon: MessageCircle, clases: 'border-sky-400 bg-sky-500/10 text-sky-700' },
  etiqueta: { icon: Radio, clases: 'border-brand bg-brand/10 text-brand' },
  nodo_arbol: { icon: Workflow, clases: 'border-violet-400 bg-violet-500/10 text-violet-700' },
  campania: { icon: Megaphone, clases: 'border-emerald-400 bg-emerald-500/10 text-emerald-700' },
}

const TIPO_ETIQUETA_ACCION: Record<string, string> = {
  respuesta: 'Muestra una respuesta',
  escalar_campania: 'Escala a una campaña',
  escalar_generico: 'Escala a un agente',
  arbol_diagnostico: 'Abre el árbol',
}

type TipoEditable = 'respuesta' | 'etiqueta' | 'nodo_arbol'

interface CajaData extends Record<string, unknown> {
  tipo: TipoNodoFlujo
  titulo: string
  subtitulo?: string
  activa: boolean
  soloDestino?: boolean
}

function CajaNodo({ data, selected }: NodeProps<Node<CajaData>>) {
  const { tipo, titulo, subtitulo, activa, soloDestino } = data
  const { icon: Icon, clases } = ESTILO_TIPO[tipo]
  return (
    <div className={clsx(
      'min-w-[190px] max-w-[240px] rounded-xl border-2 bg-card px-3 py-2.5 shadow-sm transition-opacity',
      clases.split(' ')[0],
      selected && 'ring-2 ring-brand ring-offset-1',
      !activa && 'opacity-50',
    )}>
      {!soloDestino && <Handle type="target" position={Position.Left} className="!bg-ink-tertiary !w-2 !h-2" />}
      <div className="flex items-start gap-2">
        <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', clases)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{titulo}</p>
          {subtitulo && <p className="text-[0.68rem] text-ink-tertiary truncate">{subtitulo}</p>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-brand !w-2 !h-2" />
    </div>
  )
}

const nodeTypes: NodeTypes = { caja: CajaNodo }

function posicionPorDefecto(tipo: TipoNodoFlujo, indice: number) {
  const columnaBase: Record<TipoNodoFlujo, number> = { respuesta: 0, etiqueta: 360, nodo_arbol: 720, campania: 1080 }
  return { x: columnaBase[tipo], y: indice * 110 }
}

// ── Panel lateral: crea o edita el contenido de una caja ──
function NodoEditorPanel({ modo, tipo, nodoId, valores, onClose, onGuardado }: {
  modo: 'crear' | 'editar'
  tipo: TipoEditable
  nodoId?: number
  valores?: { texto: string; keywords?: string[]; tipoAccion?: string; campaniaId?: number | null; tipoNodo?: string; activa?: boolean }
  onClose: () => void
  onGuardado: () => void
}) {
  const [texto, setTexto] = useState(valores?.texto ?? '')
  const [keywords, setKeywords] = useState((valores?.keywords ?? []).join(', '))
  const [tipoAccion, setTipoAccion] = useState(valores?.tipoAccion ?? 'respuesta')
  const [campaniaId, setCampaniaId] = useState<number | ''>(valores?.campaniaId ?? '')
  const [tipoNodo, setTipoNodo] = useState(valores?.tipoNodo ?? 'pregunta')

  const { data: campanias = [] } = useQuery({
    queryKey: ['cc-campanias'],
    queryFn: () => ccService.getCampanias(),
    enabled: tipo === 'etiqueta' && tipoAccion === 'escalar_campania',
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (modo === 'crear') {
        await chatbotFlujoService.createNodo({
          tipo, texto: texto.trim(), posX: 60 + Math.random() * 120, posY: 40 + Math.random() * 200,
          keywords: tipo === 'respuesta' ? keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          tipoAccion: tipo === 'etiqueta' ? tipoAccion : undefined,
          campaniaId: tipo === 'etiqueta' && tipoAccion === 'escalar_campania' && campaniaId !== '' ? Number(campaniaId) : undefined,
          tipoNodo: tipo === 'nodo_arbol' ? tipoNodo : undefined,
        })
      } else {
        await chatbotFlujoService.updateNodo(tipo, nodoId!, {
          texto: texto.trim(),
          keywords: tipo === 'respuesta' ? keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          tipoAccion: tipo === 'etiqueta' ? tipoAccion : undefined,
          campaniaId: tipo === 'etiqueta' && tipoAccion === 'escalar_campania' ? (campaniaId !== '' ? Number(campaniaId) : null) : undefined,
          tipoNodo: tipo === 'nodo_arbol' ? tipoNodo : undefined,
        })
      }
    },
    onSuccess: () => {
      toast.success(modo === 'crear' ? 'Nodo creado' : 'Nodo actualizado')
      onGuardado()
    },
    onError: (e: unknown) => {
      const m = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(m || 'No se pudo guardar')
    },
  })

  const puedeGuardar = texto.trim().length > 0 &&
    (tipo !== 'etiqueta' || tipoAccion !== 'escalar_campania' || campaniaId !== '')

  const { icon: Icon } = ESTILO_TIPO[tipo]
  const tituloTipo = tipo === 'respuesta' ? 'Respuesta' : tipo === 'etiqueta' ? 'Botón de menú' : 'Pregunta del árbol'

  return (
    <div className="absolute right-3 top-3 bottom-3 z-10 flex w-80 flex-col rounded-2xl border border-gray-200 bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={clsx('flex h-6 w-6 items-center justify-center rounded-lg', ESTILO_TIPO[tipo].clases)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-bold text-gray-800">{modo === 'crear' ? `Nuevo · ${tituloTipo}` : tituloTipo}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">
            {tipo === 'etiqueta' ? 'Texto del botón' : tipo === 'nodo_arbol' ? 'Pregunta o mensaje' : 'Respuesta del bot'}
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={tipo === 'respuesta' ? 4 : 2}
            className="field resize-none text-sm"
            autoFocus
          />
        </div>

        {tipo === 'respuesta' && (
          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Palabras clave (coma)</label>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className="field text-sm" placeholder="precio, costo, cuánto" />
          </div>
        )}

        {tipo === 'etiqueta' && (
          <>
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Al presionarlo</label>
              <select value={tipoAccion} onChange={(e) => setTipoAccion(e.target.value)} className="field text-sm">
                {Object.entries(TIPO_ETIQUETA_ACCION).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            {tipoAccion === 'escalar_campania' && (
              <div>
                <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Campaña / skill</label>
                <select value={campaniaId} onChange={(e) => setCampaniaId(e.target.value ? Number(e.target.value) : '')} className="field text-sm">
                  <option value="">Elegir…</option>
                  {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        {tipo === 'nodo_arbol' && (
          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Tipo de nodo</label>
            <select value={tipoNodo} onChange={(e) => setTipoNodo(e.target.value)} className="field text-sm">
              <option value="pregunta">Pregunta (con opciones)</option>
              <option value="mensaje">Mensaje / resolución</option>
              <option value="escalar_chat">Escala a chat en vivo</option>
              <option value="crear_ticket">Crea un ticket</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" isLoading={guardar.isPending} disabled={!puedeGuardar} onClick={() => guardar.mutate()}>
          {modo === 'crear' ? 'Crear nodo' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

function FlujoVisualCanvas() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const [menuCrear, setMenuCrear] = useState(false)
  const [editor, setEditor] = useState<
    | { modo: 'crear'; tipo: TipoEditable }
    | { modo: 'editar'; tipo: TipoEditable; nodoId: number; valores: NonNullable<Parameters<typeof NodoEditorPanel>[0]['valores']> }
    | null
  >(null)
  const [seleccion, setSeleccion] = useState<{ tipo: TipoNodoFlujo; id: number } | null>(null)

  const { data: flujo, isLoading } = useQuery({
    queryKey: ['chatbot-flujo'],
    queryFn: () => chatbotFlujoService.getFlujo(),
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['chatbot-flujo'] })
    qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] })
    qc.invalidateQueries({ queryKey: ['chatbot-etiquetas-menu'] })
    qc.invalidateQueries({ queryKey: ['chatbot-nodos'] })
  }

  const guardarPosicion = useMutation({
    mutationFn: ({ tipo, id, posX, posY }: { tipo: Exclude<TipoNodoFlujo, 'campania'>; id: number; posX: number; posY: number }) =>
      chatbotFlujoService.updatePosicion(tipo, id, posX, posY),
  })

  const crearConexion = useMutation({
    mutationFn: (payload: { origenTipo: Exclude<TipoNodoFlujo, 'campania'>; origenId: number; destinoTipo: TipoNodoFlujo; destinoId: number }) =>
      chatbotFlujoService.createConexion(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot-flujo'] }),
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'No se pudo crear la conexión')
      qc.invalidateQueries({ queryKey: ['chatbot-flujo'] })
    },
  })

  const eliminarConexion = useMutation({
    mutationFn: (id: number) => chatbotFlujoService.deleteConexion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot-flujo'] }),
    onError: () => toast.error('No se pudo eliminar la conexión'),
  })

  const eliminarNodo = useMutation({
    mutationFn: ({ tipo, id }: { tipo: TipoEditable; id: number }) => chatbotFlujoService.deleteNodo(tipo, id),
    onSuccess: () => { toast.success('Nodo eliminado'); setSeleccion(null); invalidar() },
    onError: (err: unknown) => {
      const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(m || 'No se pudo eliminar el nodo')
    },
  })

  const initialNodes = useMemo<Node<CajaData>[]>(() => {
    if (!flujo) return []
    const nodos: Node<CajaData>[] = []
    flujo.respuestas.forEach((r, i) => nodos.push({
      id: `respuesta-${r.id}`,
      type: 'caja',
      position: r.posX != null && r.posY != null ? { x: r.posX, y: r.posY } : posicionPorDefecto('respuesta', i),
      data: { tipo: 'respuesta', titulo: r.codigo, subtitulo: r.texto, activa: r.activa },
    }))
    flujo.etiquetas.forEach((e, i) => nodos.push({
      id: `etiqueta-${e.id}`,
      type: 'caja',
      position: e.posX != null && e.posY != null ? { x: e.posX, y: e.posY } : posicionPorDefecto('etiqueta', i),
      data: { tipo: 'etiqueta', titulo: e.texto, subtitulo: TIPO_ETIQUETA_ACCION[e.tipoAccion] ?? 'Menú del widget', activa: e.activa },
    }))
    flujo.nodosArbol.forEach((n, i) => nodos.push({
      id: `nodo_arbol-${n.id}`,
      type: 'caja',
      position: n.posX != null && n.posY != null ? { x: n.posX, y: n.posY } : posicionPorDefecto('nodo_arbol', i),
      data: { tipo: 'nodo_arbol', titulo: n.codigo, subtitulo: n.texto, activa: n.activa },
    }))
    flujo.campanias.forEach((c, i) => nodos.push({
      id: `campania-${c.id}`,
      type: 'caja',
      position: posicionPorDefecto('campania', i),
      data: { tipo: 'campania', titulo: c.texto, subtitulo: 'Campaña de Chat en Vivo', activa: c.activa, soloDestino: true },
      draggable: false,
    }))
    return nodos
  }, [flujo])

  const initialEdges = useMemo<Edge[]>(() => {
    if (!flujo) return []
    return flujo.conexiones.map((c) => ({
      id: String(c.id),
      source: `${c.origenTipo}-${c.origenId}`,
      target: `${c.destinoTipo}-${c.destinoId}`,
      label: c.etiqueta || undefined,
      animated: c.esOpcionArbol,
      deletable: !c.esOpcionArbol,
      style: c.esOpcionArbol ? { stroke: 'rgb(167 139 250)' } : undefined,
    }))
  }, [flujo])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const flujoIdRef = useRef<string>('')
  const flujoKey = flujo ? JSON.stringify({ r: flujo.respuestas.length, e: flujo.etiquetas.length, n: flujo.nodosArbol.length, c: flujo.conexiones.length }) : ''
  if (flujoKey && flujoKey !== flujoIdRef.current) {
    flujoIdRef.current = flujoKey
    setNodes(initialNodes)
    setEdges(initialEdges)
  }

  const onConnect = useCallback((connection: Connection) => {
    if (!isAdmin) return
    const [origenTipo, origenIdStr] = connection.source!.split('-')
    const [destinoTipo, destinoIdStr] = connection.target!.split('-')
    if (origenTipo === 'campania') {
      toast.error('Una campaña solo puede ser destino, no origen')
      return
    }
    setEdges((eds) => addEdge(connection, eds))
    crearConexion.mutate({
      origenTipo: origenTipo as Exclude<TipoNodoFlujo, 'campania'>,
      origenId: Number(origenIdStr),
      destinoTipo: destinoTipo as TipoNodoFlujo,
      destinoId: Number(destinoIdStr),
    })
  }, [isAdmin, setEdges, crearConexion])

  const onNodeDragStop = useCallback((_: unknown, node: Node<CajaData>) => {
    if (!isAdmin || node.data.tipo === 'campania') return
    const [tipo, idStr] = node.id.split('-')
    guardarPosicion.mutate({ tipo: tipo as Exclude<TipoNodoFlujo, 'campania'>, id: Number(idStr), posX: node.position.x, posY: node.position.y })
  }, [isAdmin, guardarPosicion])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    if (!isAdmin) return
    deleted.forEach((e) => {
      const id = Number(e.id)
      if (Number.isFinite(id)) eliminarConexion.mutate(id)
    })
  }, [isAdmin, eliminarConexion])

  const onNodeClick = useCallback((_: unknown, node: Node<CajaData>) => {
    const [tipo, idStr] = node.id.split('-')
    setSeleccion({ tipo: tipo as TipoNodoFlujo, id: Number(idStr) })
  }, [])

  const onNodeDoubleClick = useCallback((_: unknown, node: Node<CajaData>) => {
    if (!isAdmin || !flujo) return
    const [tipo, idStr] = node.id.split('-')
    const id = Number(idStr)
    if (tipo === 'campania') { toast('Las campañas se editan en Contact Center', { icon: 'ℹ️' }); return }
    if (tipo === 'respuesta') {
      const r = flujo.respuestas.find((x) => x.id === id)
      if (r) setEditor({ modo: 'editar', tipo: 'respuesta', nodoId: id, valores: { texto: r.texto, keywords: [] } })
    } else if (tipo === 'etiqueta') {
      const e = flujo.etiquetas.find((x) => x.id === id)
      if (e) setEditor({ modo: 'editar', tipo: 'etiqueta', nodoId: id, valores: { texto: e.texto, tipoAccion: e.tipoAccion, campaniaId: e.campaniaId } })
    } else {
      const n = flujo.nodosArbol.find((x) => x.id === id)
      if (n) setEditor({ modo: 'editar', tipo: 'nodo_arbol', nodoId: id, valores: { texto: n.texto, tipoNodo: n.tipoNodo } })
    }
  }, [isAdmin, flujo])

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  const selEditable = seleccion && seleccion.tipo !== 'campania'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <div className="relative">
            <Button size="sm" onClick={() => setMenuCrear((m) => !m)}>
              <Plus className="h-3.5 w-3.5" /> Nodo <ChevronDown className="h-3 w-3" />
            </Button>
            {menuCrear && (
              <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-gray-200 bg-card py-1 shadow-lg">
                {([
                  { tipo: 'respuesta' as const, label: 'Respuesta', desc: 'Texto que da el bot' },
                  { tipo: 'etiqueta' as const, label: 'Botón de menú', desc: 'Opción / widget que escala' },
                  { tipo: 'nodo_arbol' as const, label: 'Pregunta del árbol', desc: 'Paso del diagnóstico' },
                ]).map(({ tipo, label, desc }) => (
                  <button
                    key={tipo}
                    onClick={() => { setEditor({ modo: 'crear', tipo }); setMenuCrear(false) }}
                    className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className="text-[0.8rem] font-semibold text-gray-700">{label}</span>
                    <span className="text-[0.66rem] text-gray-400">{desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isAdmin && selEditable && (
          <button
            onClick={() => { if (window.confirm('¿Eliminar este nodo y sus conexiones?')) eliminarNodo.mutate({ tipo: seleccion.tipo as TipoEditable, id: seleccion.id }) }}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar nodo
          </button>
        )}
        <span className="text-[0.7rem] text-ink-tertiary">
          {isAdmin ? 'Doble clic en una caja para editar su contenido · arrastra un punto al otro para conectar' : 'Solo un administrador puede editar el flujo.'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.7rem] text-ink-tertiary">
        {(Object.keys(ESTILO_TIPO) as TipoNodoFlujo[]).map((t) => {
          const { icon: Icon, clases } = ESTILO_TIPO[t]
          const label = t === 'respuesta' ? 'Respuesta' : t === 'etiqueta' ? 'Botón de menú' : t === 'nodo_arbol' ? 'Nodo del árbol' : 'Campaña'
          return (
            <span key={t} className="flex items-center gap-1">
              <span className={clsx('flex h-4 w-4 items-center justify-center rounded', clases)}><Icon className="h-2.5 w-2.5" /></span>
              {label}
            </span>
          )
        })}
      </div>

      <div className="relative h-[65vh] rounded-2xl border border-surface-border overflow-hidden bg-surface">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          nodesDraggable={isAdmin}
          nodesConnectable={isAdmin}
          elementsSelectable
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>

        {editor && (
          <NodoEditorPanel
            modo={editor.modo}
            tipo={editor.tipo}
            nodoId={editor.modo === 'editar' ? editor.nodoId : undefined}
            valores={editor.modo === 'editar' ? editor.valores : undefined}
            onClose={() => setEditor(null)}
            onGuardado={() => { setEditor(null); invalidar() }}
          />
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
        <Info size={15} className="text-brand shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary leading-relaxed">
          Este es el mismo contenido que las listas de la pestaña Conversación — editarlo aquí lo cambia allá y
          en el widget. Las cajas verdes (campañas) se administran en Configuración → Contact Center. Los enlaces
          violeta animados son las opciones del Árbol de Diagnóstico.
        </p>
      </div>

      {!isAdmin && (
        <p className="flex items-center gap-1.5 text-[0.7rem] text-ink-tertiary">
          <Users size={12} /> Solo un administrador puede crear, mover o conectar nodos.
        </p>
      )}
    </div>
  )
}

export function FlujoVisualTab() {
  return (
    <ReactFlowProvider>
      <FlujoVisualCanvas />
    </ReactFlowProvider>
  )
}
