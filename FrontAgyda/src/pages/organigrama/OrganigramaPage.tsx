import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Pencil, Trash2, ArrowRightLeft, ChevronDown, ChevronUp,
  RefreshCw, ToggleLeft, ToggleRight, X, List, Share2,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/auth.store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

/* ─── Modelo ─────────────────────────────────────────────── */
interface OrgNode {
  id: number
  parentId: number | null
  titulo: string
  descripcion: string
  departamento: string
  orden: number
  activo: boolean
  fotoUrl: string | null
  neusId: number | null
  children: OrgNode[]
}

function parseNode(r: Record<string, unknown>): OrgNode {
  const kids = Array.isArray(r['children']) ? r['children'] : []
  return {
    id:           Number(r['ORG_ID']          ?? r['id']          ?? 0),
    parentId:     r['ORG_PADRE_ID'] != null    ? Number(r['ORG_PADRE_ID'])  : (r['parentId'] != null ? Number(r['parentId']) : null),
    titulo:       String(r['ORG_TITULO']       ?? r['titulo']      ?? ''),
    descripcion:  String(r['ORG_DESCRIPCION']  ?? r['descripcion'] ?? ''),
    departamento: String(r['ORG_DEPARTAMENTO'] ?? r['departamento']?? ''),
    orden:        Number(r['ORG_ORDEN']        ?? r['orden']       ?? 0),
    activo:       Boolean(r['ORG_ACTIVO']      ?? r['activo']      ?? true),
    fotoUrl:      (r['ORG_FOTO_URL'] as string) || null,
    neusId:       r['ORG_NEUS_ID'] != null ? Number(r['ORG_NEUS_ID']) : null,
    children:     (kids as Record<string, unknown>[]).map(parseNode),
  }
}

function flattenTree(nodes: OrgNode[]): OrgNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

function getInitials(titulo: string) {
  return titulo.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

/* ─── Colores por profundidad (igual que la imagen) ─────── */
// depth 0: fondo navy oscuro, borde/texto dorado  → Director
// depth 1: blanco, borde gris, avatar navy        → Subdirección
// depth 2 rama 0 (idx 0): morado                 → RRHH
// depth 2 rama 1 (idx 1): ámbar/dorado            → Operación
// depth 2 rama 2 (idx 2): teal                   → TI
// depth 2 rama 3 (idx 3): azul                   → SELEG
// depth 3+: hereda color de su rama

const BRANCH_COLORS = [
  { avatar: 'bg-[#7B2D8B]', border: 'border-[#9C27B0]', text: 'text-[#7B2D8B]', line: '#9C27B0' },   // morado - RRHH
  { avatar: 'bg-[#B08D00]', border: 'border-[#C9A84C]', text: 'text-[#B08D00]', line: '#C9A84C' },   // dorado - Operación
  { avatar: 'bg-[#006064]', border: 'border-[#00838F]', text: 'text-[#006064]', line: '#00838F' },   // teal   - TI
  { avatar: 'bg-[#1565C0]', border: 'border-[#1976D2]', text: 'text-[#1565C0]', line: '#1976D2' },   // azul   - SELEG
]

function getBranchColor(branchIdx: number) {
  return BRANCH_COLORS[branchIdx % BRANCH_COLORS.length]
}

/* ─── Avatar con foto o iniciales ───────────────────────── */
function Avatar({ fotoUrl, titulo, size, className }: {
  fotoUrl: string | null; titulo: string; size: number; className?: string
}) {
  const initials = getInitials(titulo)
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={titulo}
        className={clsx('rounded-full object-cover flex-shrink-0', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={clsx('rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold', className)}
      style={{ width: size, height: size, fontSize: size * 0.3 }}
    >
      {initials}
    </div>
  )
}

/* ─── Formularios (crear / editar / mover / eliminar) ───── */
function NodoFormModal({ parentId, node, onClose }: {
  parentId?: number | null; node?: OrgNode; onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!node
  const [titulo,       setTitulo]       = useState(node?.titulo       ?? '')
  const [descripcion,  setDescripcion]  = useState(node?.descripcion  ?? '')
  const [departamento, setDepartamento] = useState(node?.departamento ?? '')

  const mut = useMutation({
    mutationFn: () => isEdit
      ? api.put(`/organigrama/nodo/${node!.id}`, { titulo, descripcion, departamento })
      : api.post('/organigrama/nodo', { padreId: parentId ?? null, titulo, descripcion, departamento }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organigrama-tree'] })
      toast.success(isEdit ? 'Nodo actualizado' : 'Nodo creado')
      onClose()
    },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose}
      title={isEdit ? 'Editar nodo' : parentId != null ? 'Nuevo nodo hijo' : 'Nuevo nodo raíz'}
      size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Nombre *</label>
          <input className="field" placeholder="Ej: Edgar Montoya" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Cargo / Puesto</label>
          <input className="field" placeholder="Ej: Director General" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Departamento</label>
          <input className="field" placeholder="Ej: Dirección" value={departamento} onChange={(e) => setDepartamento(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={mut.isPending} disabled={!titulo.trim()} onClick={() => mut.mutate()}>
            {isEdit ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MoverNodoModal({ node, allNodes, onClose }: { node: OrgNode; allNodes: OrgNode[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [nuevoPadreId, setNuevoPadreId] = useState<string>(node.parentId != null ? String(node.parentId) : '')
  const [nuevoOrden,   setNuevoOrden]   = useState(String(node.orden))
  const opciones = allNodes.filter((n) => n.id !== node.id)

  const mut = useMutation({
    mutationFn: () => api.patch(`/organigrama/nodo/${node.id}/mover`, {
      nuevoPadreId: nuevoPadreId === '' ? null : Number(nuevoPadreId),
      nuevoOrden: Number(nuevoOrden),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organigrama-tree'] }); toast.success('Nodo movido'); onClose() },
    onError: () => toast.error('Error al mover'),
  })

  return (
    <Modal isOpen onClose={onClose} title={`Mover: ${node.titulo}`} size="sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Nuevo padre</label>
          <select className="field" value={nuevoPadreId} onChange={(e) => setNuevoPadreId(e.target.value)}>
            <option value="">— Sin padre (raíz) —</option>
            {opciones.map((n) => <option key={n.id} value={n.id}>{n.titulo}{n.descripcion ? ` · ${n.descripcion}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">Orden</label>
          <input type="number" className="field" value={nuevoOrden} min={0} onChange={(e) => setNuevoOrden(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={mut.isPending} onClick={() => mut.mutate()}>Mover</Button>
        </div>
      </div>
    </Modal>
  )
}

function EliminarModal({ node, onClose }: { node: OrgNode; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => api.delete(`/organigrama/nodo/${node.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organigrama-tree'] }); toast.success('Nodo eliminado'); onClose() },
    onError: () => toast.error('Error al eliminar'),
  })
  return (
    <Modal isOpen onClose={onClose} title="Eliminar nodo" size="sm">
      <div className="flex items-center gap-3 rounded-xl bg-red-50 p-3 mb-4">
        <Trash2 className="h-5 w-5 text-red-500 flex-shrink-0" />
        <p className="text-sm text-gray-700">¿Eliminar <span className="font-bold">"{node.titulo}"</span>?</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
          {mut.isPending && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          Eliminar
        </button>
      </div>
    </Modal>
  )
}

/* ─── Bottom sheet ───────────────────────────────────────── */
type Action = 'edit' | 'add' | 'move' | 'delete'

function NodeBottomSheet({ node, hasChildren, expanded, onExpand, onAction, onClose }: {
  node: OrgNode; hasChildren: boolean; expanded: boolean
  onExpand: () => void; onAction: (a: Action) => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{node.titulo}</p>
            {node.descripcion && <p className="text-xs text-gray-400">{node.descripcion}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-2">
          {hasChildren && (
            <button onClick={() => { onExpand(); onClose() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              {expanded ? 'Contraer' : 'Expandir'}
            </button>
          )}
          <button onClick={() => { onAction('add'); onClose() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700">
            <Plus className="h-4 w-4 text-blue-600" /> Agregar hijo
          </button>
          <button onClick={() => { onAction('edit'); onClose() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Pencil className="h-4 w-4 text-gray-400" /> Editar
          </button>
          <button onClick={() => { onAction('move'); onClose() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ArrowRightLeft className="h-4 w-4 text-gray-400" /> Mover
          </button>
          <button onClick={() => { onAction('delete'); onClose() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-500 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Tarjeta de nodo (estilo imagen de referencia) ─────── */
const CARD_W = 170

function OrgCard({ node, depth, branchIdx, editMode, hasChildren, onContextMenu }: {
  node: OrgNode; depth: number; branchIdx: number; editMode: boolean; hasChildren: boolean; onContextMenu: () => void
}) {
  const isRoot     = depth === 0
  const isSubDir   = depth === 1
  const bc = getBranchColor(branchIdx)
  const avatarSize = isRoot ? 60 : isSubDir ? 52 : 44

  // Nodo de agentes (sin foto, sin NEUS_ID): mostrar icono grupo
  const isGroup = node.titulo.includes('AGENTES')

  return (
    <div
      style={{ width: CARD_W }}
      className={clsx('relative select-none', editMode && 'cursor-pointer')}
      onClick={editMode ? onContextMenu : undefined}
    >
      {/* Avatar flotante sobre el borde superior de la card */}
      <div className="absolute left-1/2 z-10" style={{ top: -(avatarSize / 2), transform: 'translateX(-50%)' }}>
        <div className={clsx(
          'rounded-full border-[3px] border-white shadow-md overflow-hidden',
          isRoot ? 'bg-[#0D1B3E]' : isSubDir ? 'bg-white border-gray-200' : bc.avatar,
        )} style={{ width: avatarSize, height: avatarSize }}>
          {isGroup ? (
            <div className={clsx('w-full h-full flex items-center justify-center', bc.avatar)}>
              <Users className="text-white" style={{ width: avatarSize * 0.45, height: avatarSize * 0.45 }} />
            </div>
          ) : node.fotoUrl ? (
            <img src={node.fotoUrl} alt={node.titulo} className="w-full h-full object-cover" />
          ) : (
            <div className={clsx(
              'w-full h-full flex items-center justify-center font-bold text-white',
              isRoot ? 'bg-[#0D1B3E]' : isSubDir ? 'bg-gray-200' : bc.avatar,
            )} style={{ fontSize: avatarSize * 0.28, color: isSubDir ? '#555' : 'white' }}>
              {getInitials(node.titulo)}
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className={clsx(
        'rounded-2xl border-2 bg-white text-center transition-all',
        isRoot
          ? 'border-[#C9A84C] bg-[#0D1B3E] shadow-[0_6px_24px_rgba(0,0,0,0.35)]'
          : isSubDir
            ? 'border-gray-200 shadow-[0_4px_16px_rgba(0,0,0,0.10)]'
            : `${bc.border} shadow-sm`,
        editMode && 'hover:scale-[1.03] hover:shadow-lg',
      )} style={{ paddingTop: avatarSize / 2 + 8, paddingBottom: 14, paddingLeft: 10, paddingRight: 10 }}>

        {hasChildren && !editMode && (
          <ChevronDown className={clsx('absolute right-2.5 top-2.5 h-[13px] w-[13px]', isRoot ? 'text-[#C9A84C]/60' : 'text-gray-300')} />
        )}

        <p className={clsx(
          'font-bold uppercase tracking-wide leading-tight',
          isRoot ? 'text-white text-[0.85rem]' : 'text-[#0D1B3E] text-[0.72rem]',
        )}>
          {node.titulo}
        </p>

        {node.descripcion && (
          <p className={clsx(
            'mt-1 uppercase tracking-wide leading-snug font-semibold',
            isRoot ? 'text-[#C9A84C] text-[0.6rem]' : `${bc.text} text-[0.58rem]`,
          )}>
            {node.descripcion}
          </p>
        )}
      </div>
    </div>
  )
}

/* ─── Fila de raíces múltiples (co-directores) ───────────── */
function RootRow({ nodes, editMode, allNodes }: {
  nodes: OrgNode[]; editMode: boolean; allNodes: OrgNode[]
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth))
    ro.observe(el)
    setW(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  // Primer root con hijos es el que "posee" el árbol compartido debajo
  const mainRoot = nodes[0]
  const otherRoots = nodes.slice(1)
  const mainSorted = mainRoot.children.slice().sort((a, b) => a.orden - b.orden)
  const hasChildren = mainSorted.length > 0
  const lineColor = '#C9A84C'

  return (
    <div className="flex flex-col items-center">
      {/* Fila de co-directores juntos y centrados */}
      <div className="relative flex items-center" style={{ gap: 24 }}>
        {/* Línea horizontal entre los roots */}
        {w > 0 && (
          <svg className="absolute top-1/2 left-0 overflow-visible pointer-events-none" style={{ transform: 'translateY(-50%)' }} width={w} height={2}>
            <line x1={0} y1={1} x2={w} y2={1} stroke={lineColor} strokeWidth={1.5} strokeOpacity={0.4} />
          </svg>
        )}
        <div ref={rowRef} className="relative flex items-start" style={{ gap: 24 }}>
          {/* Tarjeta del director principal (sin hijos inline) */}
          <div className="flex flex-col items-center" style={{ paddingTop: 30 }}>
            <OrgCard node={mainRoot} depth={0} branchIdx={0} editMode={editMode}
              hasChildren={hasChildren} onContextMenu={() => {}} />
          </div>
          {/* Co-directores */}
          {otherRoots.map((root) => (
            <div key={root.id} className="flex flex-col items-center" style={{ paddingTop: 30 }}>
              <OrgCard node={root} depth={0} branchIdx={0} editMode={editMode}
                hasChildren={root.children.length > 0} onContextMenu={() => {}} />
            </div>
          ))}
        </div>
      </div>

      {/* Línea bajando al árbol compartido */}
      {hasChildren && (
        <>
          <div style={{ width: 1.5, height: V_STEM, background: lineColor, opacity: 0.5 }} />
          <div style={{ width: 1.5, height: V_BRANCH, background: lineColor, opacity: 0.4 }} />
          <ChildrenRow nodes={mainSorted} depth={0} branchIdx={0} editMode={editMode} allNodes={allNodes} />
        </>
      )}
    </div>
  )
}

/* ─── Nodo del árbol ─────────────────────────────────────── */
const V_STEM   = 36
const V_BRANCH = 22
const H_GAP    = 24

function TreeNode({ node, depth, branchIdx, editMode, allNodes }: {
  node: OrgNode; depth: number; branchIdx: number; editMode: boolean; allNodes: OrgNode[]
}) {
  const [expanded,    setExpanded]    = useState(depth < 4)
  const [bottomSheet, setBottomSheet] = useState(false)
  const [modal,       setModal]       = useState<Action | null>(null)
  const hasChildren = node.children.length > 0
  const sorted = node.children.slice().sort((a, b) => a.orden - b.orden)
  const handleAction = useCallback((a: Action) => setModal(a), [])
  const bc = getBranchColor(branchIdx)
  const lineColor = depth === 0 ? '#C9A84C' : bc.line

  return (
    <div className="flex flex-col items-center" style={{ paddingTop: depth === 0 ? 30 : 22 }}>
      <OrgCard node={node} depth={depth} branchIdx={branchIdx} editMode={editMode}
        hasChildren={hasChildren} onContextMenu={() => setBottomSheet(true)} />

      {hasChildren && (
        <>
          <div style={{ width: 1.5, height: V_STEM, background: lineColor, opacity: 0.5 }} />
          <button
            onClick={() => setExpanded(!expanded)}
            className="relative z-10 flex h-[20px] w-[20px] items-center justify-center rounded-full border-2 bg-white shadow-sm transition-all"
            style={{ borderColor: lineColor, color: lineColor }}
          >
            {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
          </button>
          {expanded && <div style={{ width: 1.5, height: V_BRANCH, background: lineColor, opacity: 0.4 }} />}
        </>
      )}

      {expanded && hasChildren && (
        <ChildrenRow nodes={sorted} depth={depth} branchIdx={branchIdx} editMode={editMode} allNodes={allNodes} />
      )}

      {bottomSheet && (
        <NodeBottomSheet node={node} hasChildren={hasChildren} expanded={expanded}
          onExpand={() => setExpanded(!expanded)} onAction={handleAction}
          onClose={() => setBottomSheet(false)} />
      )}
      {modal === 'edit'   && <NodoFormModal node={node} onClose={() => setModal(null)} />}
      {modal === 'add'    && <NodoFormModal parentId={node.id} onClose={() => setModal(null)} />}
      {modal === 'move'   && <MoverNodoModal node={node} allNodes={allNodes} onClose={() => setModal(null)} />}
      {modal === 'delete' && <EliminarModal node={node} onClose={() => setModal(null)} />}
    </div>
  )
}

/* ─── Fila de hijos ──────────────────────────────────────── */
function ChildrenRow({ nodes, depth, branchIdx, editMode, allNodes }: {
  nodes: OrgNode[]; depth: number; branchIdx: number; editMode: boolean; allNodes: OrgNode[]
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.offsetWidth))
    ro.observe(el)
    setW(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  // A nivel 2 (hijos del Director/SubDir) cada hijo inicia su propia rama con color propio
  const getChildBranchIdx = (idx: number) => depth === 1 ? idx : branchIdx
  const bc = getBranchColor(branchIdx)
  const lineColor = depth === 0 ? '#C9A84C' : bc.line

  if (nodes.length === 1) {
    return <TreeNode node={nodes[0]} depth={depth + 1} branchIdx={getChildBranchIdx(0)} editMode={editMode} allNodes={allNodes} />
  }

  return (
    <div className="relative flex flex-col items-center">
      {w > 0 && (
        <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" width={w} height={2}>
          <line x1={CARD_W / 2} y1={1} x2={w - CARD_W / 2} y2={1} stroke={lineColor} strokeWidth={1.5} strokeOpacity={0.45} />
        </svg>
      )}
      <div ref={rowRef} className="flex items-start" style={{ gap: H_GAP }}>
        {nodes.map((child, idx) => {
          const childBranch = getChildBranchIdx(idx)
          const childBc = getBranchColor(childBranch)
          const childLine = depth === 0 ? '#C9A84C' : childBc.line
          return (
            <div key={child.id} className="flex flex-col items-center">
              <div style={{ width: 1.5, height: V_BRANCH, background: childLine, opacity: 0.4 }} />
              <TreeNode node={child} depth={depth + 1} branchIdx={childBranch} editMode={editMode} allNodes={allNodes} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Vista lista ─────────────────────────────────────────── */
function ListView({ nodes, depth = 0, branchIdx = 0, editMode, allNodes }: {
  nodes: OrgNode[]; depth?: number; branchIdx?: number; editMode: boolean; allNodes: OrgNode[]
}) {
  return (
    <div>
      {nodes.map((node, idx) => (
        <ListItem key={node.id} node={node} depth={depth} branchIdx={depth === 1 ? idx : branchIdx} editMode={editMode} allNodes={allNodes} />
      ))}
    </div>
  )
}

function ListItem({ node, depth, branchIdx, editMode, allNodes }: {
  node: OrgNode; depth: number; branchIdx: number; editMode: boolean; allNodes: OrgNode[]
}) {
  const [expanded,    setExpanded]    = useState(depth < 2)
  const [bottomSheet, setBottomSheet] = useState(false)
  const [modal,       setModal]       = useState<Action | null>(null)
  const hasChildren = node.children.length > 0
  const bc = getBranchColor(branchIdx)
  const handleAction = useCallback((a: Action) => setModal(a), [])
  const isRoot = depth === 0

  return (
    <div className={clsx('relative', depth > 0 && 'ml-7 pl-4')} style={depth > 0 ? { borderLeft: `2px solid ${bc.line}30` } : {}}>
      <div className="flex items-start gap-1.5 py-1">
        <div className="mt-3.5 w-5 flex-shrink-0 flex justify-center">
          {hasChildren && (
            <button onClick={() => setExpanded(!expanded)} className="rounded-md p-0.5 transition-colors" style={{ color: bc.line }}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div
          className={clsx(
            'group/card flex flex-1 min-w-0 items-center gap-3 rounded-2xl border-2 bg-white px-3 py-3 transition-all shadow-sm',
            editMode && 'cursor-pointer hover:scale-[1.01]',
          )}
          style={{ borderColor: isRoot ? '#C9A84C' : `${bc.line}60` }}
          onClick={editMode ? () => setBottomSheet(true) : undefined}
        >
          <div className="h-10 w-10 flex-shrink-0 rounded-full overflow-hidden border-2 border-white shadow-sm"
            style={{ background: isRoot ? '#0D1B3E' : bc.avatar }}>
            {node.fotoUrl ? (
              <img src={node.fotoUrl} alt={node.titulo} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[0.7rem] font-bold text-white">
                {getInitials(node.titulo)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.85rem] font-bold text-[#0D1B3E] uppercase tracking-wide truncate">{node.titulo}</p>
            {node.descripcion && <p className="text-[0.68rem] font-semibold uppercase tracking-wide truncate" style={{ color: isRoot ? '#C9A84C' : bc.line }}>{node.descripcion}</p>}
          </div>
          {hasChildren && (
            <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-bold text-white" style={{ background: bc.avatar }}>
              {node.children.length}
            </span>
          )}
          {editMode && <Pencil className="hidden group-hover/card:block h-3.5 w-3.5 flex-shrink-0 text-blue-400" />}
        </div>
      </div>

      {expanded && hasChildren && (
        <ListView nodes={node.children.slice().sort((a, b) => a.orden - b.orden)} depth={depth + 1} branchIdx={branchIdx} editMode={editMode} allNodes={allNodes} />
      )}

      {bottomSheet && (
        <NodeBottomSheet node={node} hasChildren={hasChildren} expanded={expanded}
          onExpand={() => setExpanded(!expanded)} onAction={handleAction}
          onClose={() => setBottomSheet(false)} />
      )}
      {modal === 'edit'   && <NodoFormModal node={node} onClose={() => setModal(null)} />}
      {modal === 'add'    && <NodoFormModal parentId={node.id} onClose={() => setModal(null)} />}
      {modal === 'move'   && <MoverNodoModal node={node} allNodes={allNodes} onClose={() => setModal(null)} />}
      {modal === 'delete' && <EliminarModal node={node} onClose={() => setModal(null)} />}
    </div>
  )
}

/* ─── Página principal ───────────────────────────────────── */
export function OrganigramaPage() {
  const tipoUsuario = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase() ?? '')
  const canEdit     = tipoUsuario === 'AD'
  const [editMode,  setEditMode]  = useState(false)
  const [viewMode,  setViewMode]  = useState<'tree' | 'list'>('tree')
  const [showCrear, setShowCrear] = useState(false)
  const qc = useQueryClient()

  const { data: tree = [], isLoading, isFetching } = useQuery({
    queryKey: ['organigrama-tree'],
    queryFn: async () => {
      const { data } = await api.get('/organigrama/tree')
      const raw = Array.isArray(data) ? data : (data?.data ?? data?.tree ?? [])
      return (raw as Record<string, unknown>[]).map(parseNode)
    },
    staleTime: 60_000,
  })

  const allNodes = flattenTree(tree)
  const sorted   = tree.slice().sort((a, b) => a.orden - b.orden)

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner: degradado azul animado ── */}
      <div className="relative overflow-hidden rounded-2xl shadow-xl">
        <div
          className="animate-gradient-x absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-white/[0.03]" />

        <div className="relative flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Organigrama</h1>
              <p className="mt-0.5 text-[0.7rem] text-blue-200/80 uppercase tracking-widest">Estructura Organizacional</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/20 overflow-hidden">
              <button onClick={() => setViewMode('tree')}
                className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors',
                  viewMode === 'tree' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80')}>
                <Share2 className="h-3.5 w-3.5" /> Árbol
              </button>
              <button onClick={() => setViewMode('list')}
                className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-l border-white/20',
                  viewMode === 'list' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white/80')}>
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>

            <button onClick={() => qc.invalidateQueries({ queryKey: ['organigrama-tree'] })}
              disabled={isFetching}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white disabled:opacity-50">
              <RefreshCw className={clsx('h-4 w-4', isFetching && 'animate-spin')} />
            </button>

            {canEdit && (
              <button onClick={() => setEditMode(!editMode)}
                className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all',
                  editMode
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20 hover:text-white')}>
                {editMode ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                {editMode ? 'Editando' : 'Editar'}
              </button>
            )}

            {editMode && (
              <button onClick={() => setShowCrear(true)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-brand shadow hover:bg-blue-50 transition-colors">
                <Plus className="h-4 w-4" /> Nodo raíz
              </button>
            )}
          </div>
        </div>
      </div>

      {editMode && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <Pencil className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-medium">Modo edición — toca cualquier nodo para editarlo</p>
        </div>
      )}

      {/* ── Contenido ── */}
      {isLoading ? (
        /* Skeleton */
        <div className="flex flex-col items-center gap-6 py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#C9A84C]/20 border-t-[#C9A84C]" />
          <p className="text-sm text-gray-400">Cargando organigrama…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-gray-200 bg-white px-8 py-16 text-center shadow-sm">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0D1B3E]/5">
            <Users className="h-10 w-10 text-[#0D1B3E]/30" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-700">Sin datos en el organigrama</p>
            <p className="mt-1 text-sm text-gray-400">Crea el primer nodo raíz para comenzar</p>
          </div>
          {canEdit && (
            <button onClick={() => { setEditMode(true); setShowCrear(true) }}
              className="flex items-center gap-2 rounded-xl bg-[#0D1B3E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#162850] transition-colors">
              <Plus className="h-4 w-4" /> Crear nodo raíz
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* Vista lista sobre fondo blanco */
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {sorted.length > 1 ? (
            <div className="flex gap-6 items-start">
              {sorted.map((root) => (
                <div key={root.id} className="flex-1 min-w-0">
                  <ListView nodes={[root]} editMode={editMode} allNodes={allNodes} />
                </div>
              ))}
            </div>
          ) : (
            <ListView nodes={sorted} editMode={editMode} allNodes={allNodes} />
          )}
        </div>
      ) : (
        /* Vista árbol: fondo claro con sutil textura */
        <div className="overflow-x-auto overflow-y-visible rounded-2xl border border-gray-100 shadow-sm"
          style={{ background: 'linear-gradient(160deg, #f8f9fb 0%, #eef1f6 100%)' }}>
          <div className="min-w-max px-10 pt-6 pb-10 flex flex-col items-center">
            {sorted.length === 1 ? (
              <TreeNode node={sorted[0]} depth={0} branchIdx={0} editMode={editMode} allNodes={allNodes} />
            ) : (
              <RootRow nodes={sorted} editMode={editMode} allNodes={allNodes} />
            )}
          </div>
        </div>
      )}

      {showCrear && <NodoFormModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}
