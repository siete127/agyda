import { useCallback, useMemo, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Megaphone, Users, Workflow, Radio, Info } from 'lucide-react'
import { chatbotFlujoService } from '@/services/chatbotFlujo.service'
import { Spinner } from '@/components/ui/Spinner'
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

interface CajaData extends Record<string, unknown> {
  tipo: TipoNodoFlujo
  titulo: string
  subtitulo?: string
  activa: boolean
  soloDestino?: boolean
}

function CajaNodo({ data }: NodeProps<Node<CajaData>>) {
  const { tipo, titulo, subtitulo, activa, soloDestino } = data
  const { icon: Icon, clases } = ESTILO_TIPO[tipo]
  return (
    <div className={clsx(
      'min-w-[190px] max-w-[240px] rounded-xl border-2 bg-card px-3 py-2.5 shadow-sm transition-opacity',
      clases.split(' ')[0],
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

// Sin posición guardada aún: acomoda las cajas nuevas en una grilla simple
// por tipo, para que no aparezcan todas amontonadas en (0,0).
function posicionPorDefecto(tipo: TipoNodoFlujo, indice: number) {
  const columnaBase: Record<TipoNodoFlujo, number> = { respuesta: 0, etiqueta: 360, nodo_arbol: 720, campania: 1080 }
  return { x: columnaBase[tipo], y: indice * 110 }
}

function FlujoVisualCanvas() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const dirtyRef = useRef(new Set<string>())

  const { data: flujo, isLoading } = useQuery({
    queryKey: ['chatbot-flujo'],
    queryFn: () => chatbotFlujoService.getFlujo(),
  })

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

  const initialNodes = useMemo<Node<CajaData>[]>(() => {
    if (!flujo) return []
    const nodos: Node<CajaData>[] = []

    flujo.respuestas.forEach((r, i) => {
      nodos.push({
        id: `respuesta-${r.id}`,
        type: 'caja',
        position: r.posX != null && r.posY != null ? { x: r.posX, y: r.posY } : posicionPorDefecto('respuesta', i),
        data: { tipo: 'respuesta', titulo: r.codigo, subtitulo: r.texto, activa: r.activa },
      })
    })
    flujo.etiquetas.forEach((e, i) => {
      nodos.push({
        id: `etiqueta-${e.id}`,
        type: 'caja',
        position: e.posX != null && e.posY != null ? { x: e.posX, y: e.posY } : posicionPorDefecto('etiqueta', i),
        data: { tipo: 'etiqueta', titulo: e.texto, subtitulo: 'Menú del widget', activa: e.activa },
      })
    })
    flujo.nodosArbol.forEach((n, i) => {
      nodos.push({
        id: `nodo_arbol-${n.id}`,
        type: 'caja',
        position: n.posX != null && n.posY != null ? { x: n.posX, y: n.posY } : posicionPorDefecto('nodo_arbol', i),
        data: { tipo: 'nodo_arbol', titulo: n.codigo, subtitulo: n.texto, activa: n.activa },
      })
    })
    flujo.campanias.forEach((c, i) => {
      nodos.push({
        id: `campania-${c.id}`,
        type: 'caja',
        position: posicionPorDefecto('campania', i),
        data: { tipo: 'campania', titulo: c.texto, subtitulo: 'Campaña de Chat en Vivo', activa: c.activa, soloDestino: true },
        draggable: false,
      })
    })
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

  // React Flow no vuelve a llamar useMemo cuando cambia `flujo` sin remontar el
  // componente — se sincroniza el estado local cada vez que llega data nueva.
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

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
        <Info size={15} className="text-brand shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary leading-relaxed">
          Arrastrá las cajas para acomodarlas, y conectá el punto de la derecha de una caja con el punto
          de la izquierda de otra para enlazarlas. Las respuestas, etiquetas y nodos del árbol pueden
          conectarse entre sí o hacia una campaña. Los enlaces violeta animados son las opciones del
          Árbol de Diagnóstico — se editan desde esa pestaña.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.7rem] text-ink-tertiary">
        {(Object.keys(ESTILO_TIPO) as TipoNodoFlujo[]).map((t) => {
          const { icon: Icon, clases } = ESTILO_TIPO[t]
          const label = t === 'respuesta' ? 'Respuesta' : t === 'etiqueta' ? 'Etiqueta del menú' : t === 'nodo_arbol' ? 'Nodo del árbol' : 'Campaña'
          return (
            <span key={t} className="flex items-center gap-1">
              <span className={clsx('flex h-4 w-4 items-center justify-center rounded', clases)}><Icon className="h-2.5 w-2.5" /></span>
              {label}
            </span>
          )
        })}
      </div>

      <div className="h-[65vh] rounded-2xl border border-surface-border overflow-hidden bg-surface">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          nodesDraggable={isAdmin}
          nodesConnectable={isAdmin}
          elementsSelectable={isAdmin}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
      </div>

      {!isAdmin && (
        <p className="flex items-center gap-1.5 text-[0.7rem] text-ink-tertiary">
          <Users size={12} /> Solo un administrador puede mover cajas o crear/eliminar conexiones.
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
