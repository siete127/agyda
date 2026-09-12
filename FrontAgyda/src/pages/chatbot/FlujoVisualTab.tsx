import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, useReactFlow,
  useNodesState, useEdgesState, addEdge, ReactFlowProvider,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle, Megaphone, Users, Workflow, Radio, Info, Plus, Trash2, X, ChevronDown,
  Sparkles, Search, Layers,
} from 'lucide-react'
import { chatbotFlujoService } from '@/services/chatbotFlujo.service'
import { ccService } from '@/services/cc.service'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useIsAdmin } from '@/hooks/useAuth'
import type { TipoNodoFlujo, GeneraLead, FlujoCompleto } from '@/types/chatbotFlujo.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// Mismo criterio de normalización/"sin categoría" que la pestaña Conversación
// (ChatbotPage.tsx) — acentos fuera para que la búsqueda no dependa de tildes.
function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
const SIN_CATEGORIA = '__sin__'

// Paleta fija por índice para las franjas de categoría del canvas — solo
// decorativa, no se persiste ni se relaciona con ESTILO_TIPO.
const COLOR_SWIMLANE = [
  'rgba(56,189,248,.07)', 'rgba(167,139,250,.07)', 'rgba(52,211,153,.07)',
  'rgba(251,191,36,.07)', 'rgba(244,114,182,.07)', 'rgba(148,163,184,.07)',
]

// Cada tipo de caja tiene su propio color/ícono para distinguirse de un
// vistazo en el lienzo — mismo criterio que ya usa "Menú del Widget".
const ESTILO_TIPO: Record<TipoNodoFlujo, { icon: React.ElementType; clases: string }> = {
  respuesta: { icon: MessageCircle, clases: 'border-sky-400 bg-sky-500/10 text-sky-700' },
  etiqueta: { icon: Radio, clases: 'border-brand bg-brand/10 text-brand' },
  nodo_arbol: { icon: Workflow, clases: 'border-violet-400 bg-violet-500/10 text-violet-700' },
  campania: { icon: Megaphone, clases: 'border-emerald-400 bg-emerald-500/10 text-emerald-700' },
  captura_lead: { icon: Sparkles, clases: 'border-amber-400 bg-amber-500/10 text-amber-700' },
}

const CAPTURA_LEAD_NODE_ID = 'captura_lead-0'

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
  esEntrada?: boolean
  genera?: GeneraLead | null
  categoria?: string | null
}

function CajaNodo({ data, selected }: NodeProps<Node<CajaData>>) {
  const { tipo, titulo, subtitulo, activa, soloDestino, esEntrada, genera } = data
  const { icon: Icon, clases } = ESTILO_TIPO[tipo]
  const puedeGenerar = tipo === 'respuesta' || tipo === 'etiqueta' || tipo === 'nodo_arbol'
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
          {esEntrada && <p className="mt-0.5 text-[0.6rem] font-semibold text-sky-500">entrada por texto</p>}
          {puedeGenerar && genera === 'oportunidad' && (
            <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[0.58rem] font-bold text-emerald-700">→ oportunidad</span>
          )}
          {puedeGenerar && genera === 'contacto' && (
            <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[0.58rem] font-semibold text-gray-500">→ contacto</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-brand !w-2 !h-2" />
    </div>
  )
}

// Franja de fondo decorativa de una categoría — no interactiva, siempre
// detrás (zIndex -1), solo pinta el rótulo en la esquina.
function SwimlaneNodo({ data }: NodeProps<Node<CajaData>>) {
  return (
    <div className="h-full w-full rounded-2xl border border-dashed border-ink-tertiary/15">
      <p className="px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-wide text-ink-tertiary/60">
        {data.titulo}
      </p>
    </div>
  )
}

const nodeTypes: NodeTypes = { caja: CajaNodo, swimlane: SwimlaneNodo }

function posicionPorDefecto(tipo: TipoNodoFlujo, indice: number) {
  const columnaBase: Record<TipoNodoFlujo, number> = { respuesta: 0, etiqueta: 360, nodo_arbol: 720, campania: 1080, captura_lead: 1080 }
  return { x: columnaBase[tipo], y: indice * 110 }
}

// Grid por categoría para respuestas sin posición guardada: antes se
// apilaban todas en una sola columna infinita (184 cajas sueltas una debajo
// de otra); ahora cada categoría arranca en su propia banda horizontal y
// llena varias columnas antes de bajar de fila, como el resto del canvas.
const RESP_COLS_POR_CATEGORIA = 3
const RESP_COL_W = 260
const RESP_ROW_H = 110
const RESP_CAT_GAP = 60

function posicionesRespuestasPorCategoria(respuestas: { id: number; categoria: string | null; posX: number | null; posY: number | null }[]) {
  const porCat = new Map<string, typeof respuestas>()
  for (const r of respuestas) {
    const cat = r.categoria?.trim() || SIN_CATEGORIA
    if (!porCat.has(cat)) porCat.set(cat, [])
    porCat.get(cat)!.push(r)
  }
  const categorias = [...porCat.keys()].sort((a, b) => {
    if (a === SIN_CATEGORIA) return 1
    if (b === SIN_CATEGORIA) return -1
    return a.localeCompare(b)
  })

  const posiciones = new Map<number, { x: number; y: number }>()
  let yBanda = 0
  for (const cat of categorias) {
    const items = porCat.get(cat)!
    let sinPos = 0
    for (const r of items) {
      if (r.posX != null && r.posY != null) continue
      const fila = Math.floor(sinPos / RESP_COLS_POR_CATEGORIA)
      const col = sinPos % RESP_COLS_POR_CATEGORIA
      posiciones.set(r.id, { x: col * RESP_COL_W, y: yBanda + fila * RESP_ROW_H })
      sinPos += 1
    }
    const filas = Math.max(1, Math.ceil(sinPos / RESP_COLS_POR_CATEGORIA))
    yBanda += filas * RESP_ROW_H + RESP_CAT_GAP
  }
  return posiciones
}

// Mini-preview de cómo se ve el texto como burbuja del bot en el widget
// público — mismos colores/radios que extra/Pagina de Intranet_1/css/styles.css
// (.chat-bubble-bot), hardcodeados aquí porque ese CSS no se importa en el
// panel de administración.
function PreviewBurbujaBot({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#EEF2F6' }}>
      <p className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">
        Así se ve en el widget
      </p>
      <div
        className="max-w-[82%] whitespace-pre-wrap rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed"
        style={{ background: '#fff', color: '#0A2540', borderColor: '#E2E8F0', borderBottomLeftRadius: 4 }}
      >
        {texto.trim() || <span className="text-gray-300">La respuesta aparecerá aquí…</span>}
      </div>
    </div>
  )
}

// ── Panel lateral: crea o edita el contenido de una caja ──
function NodoEditorPanel({ modo, tipo, nodoId, valores, onClose, onGuardado }: {
  modo: 'crear' | 'editar'
  tipo: TipoEditable
  nodoId?: number
  valores?: { texto: string; keywords?: string[]; tipoAccion?: string; campaniaId?: number | null; tipoNodo?: string; activa?: boolean; genera?: GeneraLead | null }
  onClose: () => void
  onGuardado: () => void
}) {
  const [texto, setTexto] = useState(valores?.texto ?? '')
  const [keywords, setKeywords] = useState((valores?.keywords ?? []).join(', '))
  const [tipoAccion, setTipoAccion] = useState(valores?.tipoAccion ?? 'respuesta')
  const [campaniaId, setCampaniaId] = useState<number | ''>(valores?.campaniaId ?? '')
  const [tipoNodo, setTipoNodo] = useState(valores?.tipoNodo ?? 'pregunta')
  const [genera, setGenera] = useState<GeneraLead | ''>(valores?.genera ?? '')

  const { data: campanias = [] } = useQuery({
    queryKey: ['cc-campanias'],
    queryFn: () => ccService.getCampanias(),
    enabled: tipo === 'etiqueta' && tipoAccion === 'escalar_campania',
  })

  const guardar = useMutation({
    mutationFn: async () => {
      const generaVal = genera === '' ? null : genera
      if (modo === 'crear') {
        await chatbotFlujoService.createNodo({
          tipo, texto: texto.trim(), posX: 60 + Math.random() * 120, posY: 40 + Math.random() * 200,
          keywords: tipo === 'respuesta' ? keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          tipoAccion: tipo === 'etiqueta' ? tipoAccion : undefined,
          campaniaId: tipo === 'etiqueta' && tipoAccion === 'escalar_campania' && campaniaId !== '' ? Number(campaniaId) : undefined,
          tipoNodo: tipo === 'nodo_arbol' ? tipoNodo : undefined,
          genera: generaVal,
        })
      } else {
        await chatbotFlujoService.updateNodo(tipo, nodoId!, {
          texto: texto.trim(),
          keywords: tipo === 'respuesta' ? keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          tipoAccion: tipo === 'etiqueta' ? tipoAccion : undefined,
          campaniaId: tipo === 'etiqueta' && tipoAccion === 'escalar_campania' ? (campaniaId !== '' ? Number(campaniaId) : null) : undefined,
          tipoNodo: tipo === 'nodo_arbol' ? tipoNodo : undefined,
          genera: generaVal,
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

        {tipo === 'respuesta' && <PreviewBurbujaBot texto={texto} />}

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

        <div className="rounded-lg bg-gray-50 p-2.5">
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">
            Si el visitante deja sus datos aquí, el bot crea…
          </label>
          <select value={genera} onChange={(e) => setGenera(e.target.value as GeneraLead | '')} className="field text-sm">
            <option value="">Sin especificar (solo contacto)</option>
            <option value="contacto">Solo un contacto (dudas / info)</option>
            <option value="oportunidad">Contacto + oportunidad de venta</option>
            <option value="ninguno">Nada (no pedir datos)</option>
          </select>
          <p className="mt-1 text-[0.62rem] text-gray-400">
            "Oportunidad" solo cuando el camino demuestra intención de compra. Un presupuesto dado en la
            conversación también genera oportunidad.
          </p>
        </div>
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

// Mismo algoritmo que el widget público (extra/Pagina de Intranet_1/index.html
// → buscarRespuesta): la keyword contenida más larga gana. Client-side, sin
// telemetría ni round-trip — solo para previsualizar sin salir del editor.
function buscarRespuestaSimulada(mensaje: string, respuestas: { id: number; codigo: string; texto: string; keywords: string[]; activa: boolean }[]) {
  const textoNorm = normaliza(mensaje)
  let mejor: typeof respuestas[number] | null = null
  let mejorPuntaje = 0
  for (const r of respuestas) {
    if (!r.activa) continue
    for (const kw of r.keywords) {
      const kwNorm = normaliza(kw)
      if (kwNorm && textoNorm.includes(kwNorm) && kwNorm.length > mejorPuntaje) {
        mejorPuntaje = kwNorm.length
        mejor = r
      }
    }
  }
  return mejor
}

interface MensajeProbador { de: 'yo' | 'bot'; texto: string; nodeId?: string }

// Modo "Probar flujo": chat simulado dentro del editor — escribe un mensaje y
// ve qué respuesta dispararía en el widget real, sin salir del canvas ni
// generar telemetría. Usa los mismos datos ya cargados de `flujo`.
function PanelProbarFlujo({ flujo, onIrANodo, onClose }: {
  flujo: FlujoCompleto
  onIrANodo: (nodeId: string) => void
  onClose: () => void
}) {
  const [historial, setHistorial] = useState<MensajeProbador[]>([
    { de: 'bot', texto: 'Escribe como si fueras un visitante — te muestro qué respuesta dispararía.' },
  ])
  const [entrada, setEntrada] = useState('')

  const enviar = () => {
    const texto = entrada.trim()
    if (!texto) return
    const match = buscarRespuestaSimulada(texto, flujo.respuestas)
    setHistorial((h) => [
      ...h,
      { de: 'yo', texto },
      match
        ? { de: 'bot', texto: match.texto, nodeId: `respuesta-${match.id}` }
        : { de: 'bot', texto: '(sin match — el bot no encontró ninguna palabra clave en este mensaje)' },
    ])
    setEntrada('')
  }

  return (
    <div className="absolute right-3 top-3 bottom-3 z-10 flex w-80 flex-col rounded-2xl border border-gray-200 bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Sparkles className="h-4 w-4 text-brand" /> Probar flujo
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3" style={{ background: '#EEF2F6' }}>
        {historial.map((m, i) => (
          <div key={i} className={clsx('flex flex-col', m.de === 'yo' ? 'items-end' : 'items-start')}>
            <div
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
              style={m.de === 'yo'
                ? { background: 'linear-gradient(135deg,#017EFD 0%,#0040CC 100%)', color: '#fff', borderBottomRightRadius: 4 }
                : { background: '#fff', color: '#0A2540', border: '1px solid #E2E8F0', borderBottomLeftRadius: 4 }}
            >
              {m.texto}
            </div>
            {m.nodeId && (
              <button
                onClick={() => onIrANodo(m.nodeId!)}
                className="mt-1 text-[0.65rem] font-semibold text-brand hover:underline"
              >
                Ver este nodo en el lienzo →
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5">
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
          placeholder="Escribe un mensaje…"
          className="field flex-1 text-sm"
          autoFocus
        />
        <Button size="sm" onClick={enviar} disabled={!entrada.trim()}>Enviar</Button>
      </div>
    </div>
  )
}

function FlujoVisualCanvas() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const { fitView } = useReactFlow()
  const [menuCrear, setMenuCrear] = useState(false)
  const [leyendaAbierta, setLeyendaAbierta] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [resultadosAbiertos, setResultadosAbiertos] = useState(false)
  const [editor, setEditor] = useState<
    | { modo: 'crear'; tipo: TipoEditable }
    | { modo: 'editar'; tipo: TipoEditable; nodoId: number; valores: NonNullable<Parameters<typeof NodoEditorPanel>[0]['valores']> }
    | null
  >(null)
  const [seleccion, setSeleccion] = useState<{ tipo: TipoNodoFlujo; id: number } | null>(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)
  const [confirmarMaterializar, setConfirmarMaterializar] = useState(false)
  const [probando, setProbando] = useState(false)

  const { data: flujo, isLoading } = useQuery({
    queryKey: ['chatbot-flujo'],
    queryFn: () => chatbotFlujoService.getFlujo(),
  })

  const invalidar = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['chatbot-flujo'] })
    qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] })
    qc.invalidateQueries({ queryKey: ['chatbot-etiquetas-menu'] })
    qc.invalidateQueries({ queryKey: ['chatbot-nodos'] })
  }, [qc])

  // Snapshot del nodo (contenido + conexiones manuales donde participa) justo
  // antes de borrarlo — lo que "Deshacer" necesita para recrearlo. Las
  // conexiones automáticas (esAutomatica) no se capturan: se vuelven a
  // derivar solas en cuanto el nodo reaparece.
  const capturarSnapshotNodo = useCallback((tipo: TipoEditable, id: number) => {
    if (!flujo) return null
    const conexiones = flujo.conexiones
      .filter((c) => !c.esAutomatica && !c.esOpcionArbol)
      .filter((c) => (c.origenTipo === tipo && c.origenId === id) || (c.destinoTipo === tipo && c.destinoId === id))
      .map((c) => ({ origenTipo: c.origenTipo, origenId: c.origenId, destinoTipo: c.destinoTipo, destinoId: c.destinoId, etiqueta: c.etiqueta }))

    if (tipo === 'respuesta') {
      const r = flujo.respuestas.find((x) => x.id === id)
      if (!r) return null
      return {
        tipo, idViejo: id, conexiones,
        payload: { tipo: 'respuesta' as const, texto: r.texto, genera: r.genera, posX: r.posX ?? 0, posY: r.posY ?? 0 },
      }
    }
    if (tipo === 'etiqueta') {
      const e = flujo.etiquetas.find((x) => x.id === id)
      if (!e) return null
      return {
        tipo, idViejo: id, conexiones,
        payload: { tipo: 'etiqueta' as const, texto: e.texto, tipoAccion: e.tipoAccion, campaniaId: e.campaniaId, genera: e.genera, posX: e.posX ?? 0, posY: e.posY ?? 0 },
      }
    }
    const n = flujo.nodosArbol.find((x) => x.id === id)
    if (!n) return null
    return {
      tipo, idViejo: id, conexiones,
      payload: { tipo: 'nodo_arbol' as const, texto: n.texto, tipoNodo: n.tipoNodo, genera: n.genera, posX: n.posX ?? 0, posY: n.posY ?? 0 },
    }
  }, [flujo])

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

  // Deshacer un nodo eliminado no puede "revivir" el mismo ID — recrea una
  // caja nueva con el mismo contenido y vuelve a tender sus conexiones
  // (capturadas del `flujo` justo antes de borrar). No es un historial
  // completo: cubre el caso más costoso de un error de un clic.
  const rehacerNodo = useCallback(async (snapshot: {
    tipo: TipoEditable
    payload: Parameters<typeof chatbotFlujoService.createNodo>[0]
    conexiones: { origenTipo: TipoNodoFlujo; origenId: number; destinoTipo: TipoNodoFlujo; destinoId: number; etiqueta: string | null }[]
    idViejo: number
  }) => {
    try {
      const creado = await chatbotFlujoService.createNodo(snapshot.payload)
      await Promise.all(snapshot.conexiones.map((c) => chatbotFlujoService.createConexion({
        origenTipo: (c.origenId === snapshot.idViejo && c.origenTipo === snapshot.tipo ? snapshot.tipo : c.origenTipo) as Exclude<TipoNodoFlujo, 'campania'>,
        origenId: c.origenId === snapshot.idViejo ? creado.id : c.origenId,
        destinoTipo: c.destinoId === snapshot.idViejo ? snapshot.tipo : c.destinoTipo,
        destinoId: c.destinoId === snapshot.idViejo ? creado.id : c.destinoId,
        etiqueta: c.etiqueta || undefined,
      }).catch(() => {})))
      toast.success('Nodo restaurado')
      invalidar()
    } catch {
      toast.error('No se pudo restaurar el nodo')
    }
  }, [invalidar])

  const eliminarNodo = useMutation({
    mutationFn: ({ tipo, id }: { tipo: TipoEditable; id: number; snapshot: ReturnType<typeof capturarSnapshotNodo> }) =>
      chatbotFlujoService.deleteNodo(tipo, id),
    onSuccess: (_data, variables) => {
      setSeleccion(null)
      invalidar()
      if (variables.snapshot) {
        const snapshot = variables.snapshot
        toast.success((t) => (
          <span className="flex items-center gap-3">
            Nodo eliminado
            <button
              onClick={() => { toast.dismiss(t.id); rehacerNodo(snapshot) }}
              className="rounded-md bg-ink px-2 py-1 text-[0.7rem] font-bold text-white hover:bg-ink/80"
            >
              Deshacer
            </button>
          </span>
        ), { duration: 6000 })
      } else {
        toast.success('Nodo eliminado')
      }
    },
    onError: (err: unknown) => {
      const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(m || 'No se pudo eliminar el nodo')
    },
  })

  const materializar = useMutation({
    mutationFn: () => chatbotFlujoService.materializar(),
    onSuccess: (d) => { toast.success(`${d.creadas} conexión(es) fijada(s) — ahora las controla el bot`); invalidar() },
    onError: () => toast.error('No se pudo fijar el flujo'),
  })

  // Franjas de fondo por categoría: un rectángulo decorativo (no
  // interactivo, no se guarda) detrás de las respuestas de cada categoría,
  // para que 184+ cajas sueltas se lean como grupos en vez de una nube.
  const swimlanes = useMemo(() => {
    if (!flujo) return [] as { categoria: string; x: number; y: number; w: number; h: number; color: string }[]
    const posiciones = posicionesRespuestasPorCategoria(flujo.respuestas)
    const porCat = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
    flujo.respuestas.forEach((r) => {
      const cat = r.categoria?.trim() || SIN_CATEGORIA
      const pos = r.posX != null && r.posY != null ? { x: r.posX, y: r.posY } : posiciones.get(r.id)
      if (!pos) return
      const box = porCat.get(cat) ?? { minX: pos.x, minY: pos.y, maxX: pos.x, maxY: pos.y }
      box.minX = Math.min(box.minX, pos.x); box.minY = Math.min(box.minY, pos.y)
      box.maxX = Math.max(box.maxX, pos.x); box.maxY = Math.max(box.maxY, pos.y)
      porCat.set(cat, box)
    })
    return [...porCat.entries()].map(([categoria, box], i) => ({
      categoria,
      x: box.minX - 24, y: box.minY - 36,
      w: (box.maxX - box.minX) + 216, h: (box.maxY - box.minY) + 96,
      color: COLOR_SWIMLANE[i % COLOR_SWIMLANE.length],
    }))
  }, [flujo])

  const initialNodes = useMemo<Node<CajaData>[]>(() => {
    if (!flujo) return []
    const nodos: Node<CajaData>[] = []
    const posicionesResp = posicionesRespuestasPorCategoria(flujo.respuestas)
    swimlanes.forEach((lane) => nodos.push({
      id: `swimlane-${lane.categoria}`,
      type: 'swimlane',
      position: { x: lane.x, y: lane.y },
      data: {
        tipo: 'respuesta', titulo: lane.categoria === SIN_CATEGORIA ? 'Sin categoría' : lane.categoria,
        activa: true, soloDestino: true,
      } as CajaData,
      style: { width: lane.w, height: lane.h, background: lane.color },
      draggable: false, selectable: false, connectable: false,
      zIndex: -1,
    }))
    flujo.respuestas.forEach((r) => nodos.push({
      id: `respuesta-${r.id}`,
      type: 'caja',
      position: r.posX != null && r.posY != null ? { x: r.posX, y: r.posY } : (posicionesResp.get(r.id) ?? { x: 0, y: 0 }),
      data: { tipo: 'respuesta', titulo: r.codigo, subtitulo: r.texto, activa: r.activa, esEntrada: r.esEntrada, genera: r.genera, categoria: r.categoria },
    }))
    flujo.etiquetas.forEach((e, i) => nodos.push({
      id: `etiqueta-${e.id}`,
      type: 'caja',
      position: e.posX != null && e.posY != null ? { x: e.posX, y: e.posY } : posicionPorDefecto('etiqueta', i),
      data: { tipo: 'etiqueta', titulo: e.texto, subtitulo: TIPO_ETIQUETA_ACCION[e.tipoAccion] ?? 'Menú del widget', activa: e.activa, genera: e.genera },
    }))
    flujo.nodosArbol.forEach((n, i) => nodos.push({
      id: `nodo_arbol-${n.id}`,
      type: 'caja',
      position: n.posX != null && n.posY != null ? { x: n.posX, y: n.posY } : posicionPorDefecto('nodo_arbol', i),
      data: { tipo: 'nodo_arbol', titulo: n.codigo, subtitulo: n.texto, activa: n.activa, genera: n.genera },
    }))
    flujo.campanias.forEach((c, i) => nodos.push({
      id: `campania-${c.id}`,
      type: 'caja',
      position: posicionPorDefecto('campania', i),
      data: { tipo: 'campania', titulo: c.texto, subtitulo: 'Campaña de Chat en Vivo', activa: c.activa, soloDestino: true },
      draggable: false,
    }))
    if (flujo.capturaLead) {
      nodos.push({
        id: CAPTURA_LEAD_NODE_ID,
        type: 'caja',
        position: { x: 1080, y: -140 },
        data: { tipo: 'captura_lead', titulo: 'Captura de lead', subtitulo: 'pide nombre y contacto', activa: true, soloDestino: true },
        draggable: false,
      })
    }
    return nodos
  }, [flujo, swimlanes])

  const initialEdges = useMemo<Edge[]>(() => {
    if (!flujo) return []
    return flujo.conexiones.map((c) => {
      const target = c.destinoTipo === 'captura_lead'
        ? CAPTURA_LEAD_NODE_ID
        : `${c.destinoTipo}-${c.destinoId}`
      return {
        id: String(c.id),
        source: `${c.origenTipo}-${c.origenId}`,
        target,
        label: c.etiqueta || undefined,
        animated: c.esOpcionArbol,
        deletable: !c.esOpcionArbol && !c.esAutomatica,
        // opciones del árbol = violeta animado · automáticas = gris punteado · manuales = azul sólido
        style: c.esOpcionArbol
          ? { stroke: 'rgb(167 139 250)' }
          : c.esAutomatica
            ? { stroke: 'rgb(148 163 184)', strokeDasharray: '5 4' }
            : undefined,
      }
    })
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
    if (!isAdmin || node.data.tipo === 'campania' || node.id.startsWith('swimlane-')) return
    const [tipo, idStr] = node.id.split('-')
    guardarPosicion.mutate(
      { tipo: tipo as Exclude<TipoNodoFlujo, 'campania'>, id: Number(idStr), posX: node.position.x, posY: node.position.y },
      { onError: () => toast.error('No se pudo guardar la posición') },
    )
  }, [isAdmin, guardarPosicion])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    if (!isAdmin || !flujo) return
    deleted.forEach((e) => {
      const id = Number(e.id)
      if (!Number.isFinite(id)) return
      const c = flujo.conexiones.find((x) => String(x.id) === e.id)
      eliminarConexion.mutate(id, {
        onSuccess: () => {
          if (!c) { toast.success('Conexión eliminada'); return }
          toast.success((t) => (
            <span className="flex items-center gap-3">
              Conexión eliminada
              <button
                onClick={() => {
                  toast.dismiss(t.id)
                  chatbotFlujoService.createConexion({
                    origenTipo: c.origenTipo as Exclude<TipoNodoFlujo, 'campania'>,
                    origenId: c.origenId, destinoTipo: c.destinoTipo, destinoId: c.destinoId,
                    etiqueta: c.etiqueta || undefined,
                  }).then(() => { toast.success('Conexión restaurada'); invalidar() })
                    .catch(() => toast.error('No se pudo restaurar la conexión'))
                }}
                className="rounded-md bg-ink px-2 py-1 text-[0.7rem] font-bold text-white hover:bg-ink/80"
              >
                Deshacer
              </button>
            </span>
          ), { duration: 6000 })
        },
      })
    })
  }, [isAdmin, flujo, eliminarConexion, invalidar])

  const onNodeClick = useCallback((_: unknown, node: Node<CajaData>) => {
    if (node.id.startsWith('swimlane-')) return
    if (node.data.tipo === 'captura_lead') { setSeleccion(null); return }
    const [tipo, idStr] = node.id.split('-')
    setSeleccion({ tipo: tipo as TipoNodoFlujo, id: Number(idStr) })
  }, [])

  const onNodeDoubleClick = useCallback((_: unknown, node: Node<CajaData>) => {
    if (!isAdmin || !flujo || node.id.startsWith('swimlane-')) return
    if (node.data.tipo === 'captura_lead') {
      toast('Se dispara sola con las respuestas marcadas "señal de interés"', { icon: 'ℹ️' })
      return
    }
    const [tipo, idStr] = node.id.split('-')
    const id = Number(idStr)
    if (tipo === 'campania') { toast('Las campañas se editan en Contact Center', { icon: 'ℹ️' }); return }
    setProbando(false)
    if (tipo === 'respuesta') {
      const r = flujo.respuestas.find((x) => x.id === id)
      if (r) setEditor({ modo: 'editar', tipo: 'respuesta', nodoId: id, valores: { texto: r.texto, keywords: [], genera: r.genera } })
    } else if (tipo === 'etiqueta') {
      const e = flujo.etiquetas.find((x) => x.id === id)
      if (e) setEditor({ modo: 'editar', tipo: 'etiqueta', nodoId: id, valores: { texto: e.texto, tipoAccion: e.tipoAccion, campaniaId: e.campaniaId, genera: e.genera } })
    } else {
      const n = flujo.nodosArbol.find((x) => x.id === id)
      if (n) setEditor({ modo: 'editar', tipo: 'nodo_arbol', nodoId: id, valores: { texto: n.texto, tipoNodo: n.tipoNodo, genera: n.genera } })
    }
  }, [isAdmin, flujo])

  // Título legible por nodeId ("respuesta-12" -> "precios_cotizacion") — lo
  // usa el detalle de "Fijar flujo" para mostrar origen -> destino con
  // nombres en vez de solo el conteo.
  const tituloPorNodeId = useMemo(() => {
    const m = new Map<string, string>()
    nodes.forEach((n) => { if (n.type === 'caja') m.set(n.id, (n.data as CajaData).titulo) })
    return m
  }, [nodes])

  // Detalle de "Fijar flujo": qué conexiones automáticas concretas se van a
  // volver reales — antes solo se veía el conteo en el window.confirm.
  const pendientesDetalle = useMemo(() => {
    if (!flujo) return []
    return flujo.conexiones
      .filter((c) => c.esAutomatica && c.destinoTipo !== 'captura_lead')
      .map((c) => ({
        origen: tituloPorNodeId.get(`${c.origenTipo}-${c.origenId}`) ?? `${c.origenTipo} #${c.origenId}`,
        destino: tituloPorNodeId.get(`${c.destinoTipo}-${c.destinoId}`) ?? `${c.destinoTipo} #${c.destinoId}`,
        etiqueta: c.etiqueta,
      }))
  }, [flujo, tituloPorNodeId])

  // Buscador: filtra por título/subtítulo/categoría entre las cajas reales
  // (no swimlanes) — con 200+ nodos, encontrar uno a ojo en el lienzo es
  // impráctico sin esto.
  const resultadosBusqueda = useMemo(() => {
    const q = normaliza(busqueda.trim())
    if (!q) return []
    return nodes
      .filter((n) => n.type === 'caja')
      .filter((n) => {
        const d = n.data as CajaData
        return normaliza(`${d.titulo} ${d.subtitulo ?? ''} ${d.categoria ?? ''}`).includes(q)
      })
      .slice(0, 30)
  }, [nodes, busqueda])

  const irANodo = useCallback((nodeId: string) => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
    fitView({ nodes: [{ id: nodeId }], duration: 400, padding: 0.6, maxZoom: 1.2 })
    const [tipo, idStr] = nodeId.split('-')
    if (tipo !== 'campania' && tipo !== 'captura_lead') setSeleccion({ tipo: tipo as TipoNodoFlujo, id: Number(idStr) })
    setResultadosAbiertos(false)
  }, [setNodes, fitView])

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
                    onClick={() => { setEditor({ modo: 'crear', tipo }); setMenuCrear(false); setProbando(false) }}
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
            onClick={() => setConfirmarEliminar(true)}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar nodo
          </button>
        )}
        {isAdmin && flujo && flujo.automaticasPendientes > 0 && (
          <button
            onClick={() => setConfirmarMaterializar(true)}
            disabled={materializar.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/5 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10 disabled:opacity-50"
          >
            {materializar.isPending ? <Spinner size="sm" /> : <Sparkles className="h-3.5 w-3.5" />}
            Fijar flujo ({flujo.automaticasPendientes})
          </button>
        )}
        {flujo && (
          <button
            onClick={() => { setProbando((v) => !v); setEditor(null) }}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold',
              probando ? 'border-brand bg-brand text-white' : 'border-gray-200 text-ink-secondary hover:bg-gray-50',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> Probar flujo
          </button>
        )}
        <div className="relative ml-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setResultadosAbiertos(true) }}
              onFocus={() => setResultadosAbiertos(true)}
              placeholder="Buscar nodo…"
              className="w-48 rounded-lg border border-gray-200 bg-card py-1.5 pl-8 pr-2 text-xs outline-none focus:border-brand sm:w-60"
            />
          </div>
          {resultadosAbiertos && busqueda.trim() && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-xl border border-gray-200 bg-card py-1 shadow-lg">
              {resultadosBusqueda.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
              ) : resultadosBusqueda.map((n) => {
                const d = n.data as CajaData
                const { icon: Icon, clases } = ESTILO_TIPO[d.tipo]
                return (
                  <button
                    key={n.id}
                    onClick={() => irANodo(n.id)}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded', clases)}><Icon className="h-3 w-3" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-gray-700">{d.titulo}</span>
                      {d.subtitulo && <span className="block truncate text-[0.66rem] text-gray-400">{d.subtitulo}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setLeyendaAbierta((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-gray-50"
          >
            <Layers className="h-3.5 w-3.5" /> Leyenda
          </button>
          {leyendaAbierta && (
            <div className="absolute right-0 top-full z-20 mt-1 w-64 space-y-2 rounded-xl border border-gray-200 bg-card p-3 shadow-lg">
              {(['respuesta', 'etiqueta', 'nodo_arbol', 'campania', 'captura_lead'] as TipoNodoFlujo[]).map((t) => {
                const { icon: Icon, clases } = ESTILO_TIPO[t]
                const label = t === 'respuesta' ? 'Respuesta' : t === 'etiqueta' ? 'Botón de menú' : t === 'nodo_arbol' ? 'Nodo del árbol' : t === 'campania' ? 'Campaña' : 'Captura de lead'
                return (
                  <div key={t} className="flex items-center gap-1.5 text-[0.72rem] text-ink-secondary">
                    <span className={clsx('flex h-4 w-4 items-center justify-center rounded', clases)}><Icon className="h-2.5 w-2.5" /></span>
                    {label}
                  </div>
                )
              })}
              <div className="flex items-center gap-1.5 text-[0.72rem] text-ink-secondary"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" /> conexión automática</div>
              <div className="flex items-center gap-1.5 text-[0.72rem] text-ink-secondary"><span className="inline-block h-0 w-5 border-t-2 border-brand" /> conexión manual</div>
            </div>
          )}
        </div>
      </div>

      <p className="text-[0.7rem] text-ink-tertiary">
        {isAdmin ? 'Doble clic en una caja para editar su contenido · arrastra un punto al otro para conectar' : 'Solo un administrador puede editar el flujo.'}
      </p>

      <div className="relative h-[65vh] rounded-2xl border border-surface-border overflow-hidden bg-surface"
        onClick={() => { if (resultadosAbiertos) setResultadosAbiertos(false); if (leyendaAbierta) setLeyendaAbierta(false) }}>
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
          <MiniMap
            pannable zoomable className="!bg-card"
            nodeColor={(n) => (n.id.startsWith('swimlane-') ? 'transparent' : '#94a3b8')}
          />
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
        {!editor && probando && flujo && (
          <PanelProbarFlujo flujo={flujo} onIrANodo={irANodo} onClose={() => setProbando(false)} />
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-brand/5 border border-brand/10 px-3.5 py-2.5">
        <Info size={15} className="text-brand shrink-0 mt-0.5" />
        <p className="text-xs text-ink-secondary leading-relaxed">
          Editar aquí cambia el contenido en la pestaña Conversación y en el widget. Las líneas <b>punteadas
          grises</b> son el flujo que el bot ya sigue por convención — usa <b>"Fijar flujo"</b> para convertirlas
          en conexiones reales que puedas editar y borrar. Las respuestas marcadas <b>"entrada por texto"</b> no
          necesitan flecha de entrada: el visitante llega a ellas escribiendo una de sus palabras clave. Los
          enlaces violeta son el Árbol de Diagnóstico; las cajas verdes se administran en Contact Center.
        </p>
      </div>

      {!isAdmin && (
        <p className="flex items-center gap-1.5 text-[0.7rem] text-ink-tertiary">
          <Users size={12} /> Solo un administrador puede crear, mover o conectar nodos.
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmarEliminar}
        onClose={() => setConfirmarEliminar(false)}
        onConfirm={() => {
          if (!seleccion) return
          const tipo = seleccion.tipo as TipoEditable
          eliminarNodo.mutate({ tipo, id: seleccion.id, snapshot: capturarSnapshotNodo(tipo, seleccion.id) })
        }}
        title="Eliminar nodo"
        message="¿Eliminar este nodo y sus conexiones? Podrás deshacerlo justo después de confirmar."
        confirmLabel="Eliminar"
        variant="danger"
        isPending={eliminarNodo.isPending}
      />

      <Modal isOpen={confirmarMaterializar} onClose={() => setConfirmarMaterializar(false)} title="Fijar flujo" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary leading-relaxed">
            Estas {pendientesDetalle.length} conexión(es) automática(s) se van a fijar como reales.
            A partir de ahí las editas y las borras aquí, y el bot las obedece.
          </p>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg bg-gray-50 p-2.5">
            {pendientesDetalle.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                <span className="truncate font-medium">{c.origen}</span>
                <ChevronDown className="h-3 w-3 shrink-0 -rotate-90 text-ink-tertiary" />
                <span className="truncate font-medium">{c.destino}</span>
                {c.etiqueta && <span className="shrink-0 text-ink-tertiary">· {c.etiqueta}</span>}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmarMaterializar(false)} disabled={materializar.isPending}>Cancelar</Button>
            <Button
              isLoading={materializar.isPending}
              onClick={() => { materializar.mutate(); setConfirmarMaterializar(false) }}
              className="bg-yellow-500 hover:bg-yellow-600 border-yellow-500"
            >
              Fijar flujo
            </Button>
          </div>
        </div>
      </Modal>
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
