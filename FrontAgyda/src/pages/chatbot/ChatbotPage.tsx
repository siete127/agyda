import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, MessageSquare, RefreshCw, Tag, Sparkles,
  LayoutList, LayoutDashboard, ListChecks, Power, Users, DollarSign, ExternalLink, GitBranch,
} from 'lucide-react'
import { chatbotService } from '@/services/chatbot.service'
import { chatbotArbolService } from '@/services/chatbotArbol.service'
import { useIsAdmin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import type { RespuestaChatbot } from '@/types/chatbot.types'
import { NODO_TIPO_LABELS, type ChatbotNodo, type ChatbotNodoTipo } from '@/types/chatbotArbol.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

function splitList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function formatFechaHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatMoneda(valor: number | null) {
  if (valor === null) return '—'
  return valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

/* ── Formulario crear/editar respuesta ── */
function RespuestaFormModal({ respuesta, onClose }: { respuesta?: RespuestaChatbot; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!respuesta

  const [form, setForm] = useState({
    id: respuesta?.id ?? '',
    keywords: (respuesta?.keywords ?? []).join(', '),
    textoEs: respuesta?.textoEs ?? '',
    textoEn: respuesta?.textoEn ?? '',
    botones: (respuesta?.botones ?? []).join(', '),
    senalInteres: respuesta?.senalInteres ?? false,
    orden: respuesta?.orden ?? 0,
  })

  const canSave = form.id.trim().length > 0 && form.textoEs.trim().length > 0 && splitList(form.keywords).length > 0

  const buildPayload = () => ({
    id: form.id.trim(),
    keywords: splitList(form.keywords),
    textoEs: form.textoEs.trim(),
    textoEn: form.textoEn.trim() || null,
    botones: splitList(form.botones),
    senalInteres: form.senalInteres,
    orden: Number(form.orden) || 0,
  })

  const guardar = useMutation({
    mutationFn: () =>
      isEdit
        ? chatbotService.update(respuesta!.pk, { ...buildPayload(), activa: respuesta!.activa })
        : chatbotService.create(buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] })
      toast.success(isEdit ? 'Respuesta actualizada' : 'Respuesta creada')
      onClose()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Error al guardar la respuesta')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar respuesta' : 'Nueva respuesta'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Id de la intención</label>
          <input
            value={form.id}
            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value.trim().replace(/\s+/g, '_').toLowerCase() }))}
            className="field"
            placeholder="ej. soporte_precio"
            disabled={isEdit}
          />
          {isEdit && <p className="mt-1 text-[0.68rem] text-gray-400">El id no se puede cambiar una vez creada la respuesta.</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Palabras clave (separadas por coma)</label>
          <input
            value={form.keywords}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            className="field"
            placeholder="precio, costo, cuanto cuesta, tarifa"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Respuesta en español</label>
          <textarea
            value={form.textoEs}
            onChange={(e) => setForm((f) => ({ ...f, textoEs: e.target.value }))}
            className="field min-h-[90px]"
            placeholder="El costo depende del alcance del proyecto..."
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Respuesta en inglés (opcional)</label>
          <textarea
            value={form.textoEn}
            onChange={(e) => setForm((f) => ({ ...f, textoEn: e.target.value }))}
            className="field min-h-[70px]"
            placeholder="The cost depends on the scope of the project..."
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Botones sugeridos (separados por coma)</label>
          <input
            value={form.botones}
            onChange={(e) => setForm((f) => ({ ...f, botones: e.target.value }))}
            className="field"
            placeholder="Quiero cotización, Ver servicios"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Orden</label>
            <input
              type="number"
              value={form.orden}
              onChange={(e) => setForm((f) => ({ ...f, orden: Number(e.target.value) }))}
              className="field"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setForm((f) => ({ ...f, senalInteres: !f.senalInteres }))}
                className={clsx('h-4 w-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0',
                  form.senalInteres ? 'bg-brand border-brand' : 'border-gray-300')}
              >
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ visibility: form.senalInteres ? 'visible' : 'hidden' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[0.78rem] text-gray-700">Cuenta como señal de interés (dispara captura de lead)</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>
            {isEdit ? 'Guardar cambios' : 'Crear respuesta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tarjeta de métrica del dashboard ── */
function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  )
}

/* ── Dashboard: métricas del diccionario + leads capturados desde el CRM ── */
function DashboardTab() {
  const { data: respuestas = [], isLoading: isLoadingRespuestas } = useQuery({
    queryKey: ['chatbot-respuestas'],
    queryFn: () => chatbotService.getAll(),
  })

  const { data: leads = [], isLoading: isLoadingLeads, refetch, isRefetching } = useQuery({
    queryKey: ['chatbot-leads'],
    queryFn: () => chatbotService.getLeads(),
  })

  const isLoading = isLoadingRespuestas || isLoadingLeads

  const totalRespuestas = respuestas.length
  const respuestasActivas = respuestas.filter((r) => r.activa).length
  const respuestasConSenal = respuestas.filter((r) => r.senalInteres).length

  return (
    <div className="space-y-5">
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={ListChecks} label="Respuestas totales" value={totalRespuestas} />
            <StatCard icon={Power} label="Respuestas activas" value={respuestasActivas} />
            <StatCard icon={Sparkles} label="Con señal de interés" value={respuestasConSenal} />
            <StatCard icon={Users} label="Leads capturados" value={leads.length} />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Leads generados por el chatbot</h3>
            <Button variant="ghost" size="sm" onClick={() => refetch()} isLoading={isRefetching}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
          </div>

          {leads.length === 0 ? (
            <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
              <Users className="h-8 w-8" />
              <p className="text-sm">Aún no hay leads capturados por el chatbot</p>
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Contacto</th>
                    <th className="px-4 py-2.5 font-semibold">Empresa / Cargo</th>
                    <th className="px-4 py-2.5 font-semibold">Interés</th>
                    <th className="px-4 py-2.5 font-semibold">Valor</th>
                    <th className="px-4 py-2.5 font-semibold">Etapa</th>
                    <th className="px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="px-4 py-2.5 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        <div>{l.contactoNombre ?? '—'}</div>
                        <div className="text-gray-400">{l.contactoEmail || l.contactoTelefono || '—'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        <div>{l.contactoEmpresa ?? '—'}</div>
                        {l.contactoCargo && <div className="text-gray-400">{l.contactoCargo}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{l.nombre}</td>
                      <td className="px-4 py-2.5 text-gray-600 flex items-center gap-1">
                        {l.valor !== null && <DollarSign className="h-3 w-3 text-gray-400" />} {formatMoneda(l.valor)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[0.7rem] font-semibold capitalize">{l.etapa}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatFechaHora(l.fecha)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href="/crm-interno"
                          className="flex items-center justify-end gap-1 font-semibold text-brand hover:underline"
                        >
                          Ver en CRM <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Árbol de diagnóstico básico ── */
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

function ArbolTab() {
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

/* ── Página principal ── */
export function ChatbotPage() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const [tab, setTab] = useState<'respuestas' | 'dashboard' | 'arbol'>('respuestas')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<RespuestaChatbot | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<RespuestaChatbot | null>(null)

  const { data: respuestas = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['chatbot-respuestas'],
    queryFn: () => chatbotService.getAll(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] })

  const eliminarMut = useMutation({
    mutationFn: (pk: number) => chatbotService.delete(pk),
    onSuccess: () => { invalidate(); toast.success('Respuesta eliminada') },
    onError: () => toast.error('Error al eliminar la respuesta'),
  })

  const activaMut = useMutation({
    mutationFn: ({ pk, activa }: { pk: number; activa: boolean }) => chatbotService.toggleActiva(pk, activa),
    onSuccess: invalidate,
    onError: () => toast.error('Error al cambiar el estado'),
  })

  const ordenadas = [...respuestas].sort((a, b) => a.orden - b.orden || a.pk - b.pk)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" /> Chatbot
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">{respuestas.length} respuesta{respuestas.length !== 1 ? 's' : ''} en el diccionario del widget público</p>
        </div>
        {tab === 'respuestas' && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} isLoading={isRefetching}>
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCrear(true)}>
                <Plus className="h-3.5 w-3.5" /> Nueva respuesta
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('respuestas')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'respuestas' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutList className="h-3.5 w-3.5" /> Respuestas
        </button>
        <button
          onClick={() => setTab('dashboard')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'dashboard' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
        </button>
        <button
          onClick={() => setTab('arbol')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'arbol' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <GitBranch className="h-3.5 w-3.5" /> Árbol de Diagnóstico
        </button>
      </div>

      {tab === 'arbol' ? <ArbolTab /> : tab === 'dashboard' ? <DashboardTab /> : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : ordenadas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <MessageSquare className="h-8 w-8" />
          <p className="text-sm">Aún no hay respuestas configuradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordenadas.map((r) => (
            <div key={r.pk} className={clsx('card p-4 flex flex-col gap-2.5', !r.activa && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono font-semibold text-brand bg-brand/10 rounded px-1.5 py-0.5">{r.id}</code>
                    {r.senalInteres && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[0.65rem] font-semibold">
                        <Sparkles className="h-3 w-3" /> señal de interés
                      </span>
                    )}
                    <span className={clsx(
                      'rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
                      r.activa ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {r.activa ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 mt-1.5">{r.textoEs}</p>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => activaMut.mutate({ pk: r.pk, activa: !r.activa })}
                      title={r.activa ? 'Pausar' : 'Activar'}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      {r.activa ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditando(r)}
                      title="Editar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmEliminar(r)}
                      title="Eliminar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {r.keywords.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.68rem] text-gray-600">
                    <Tag className="h-2.5 w-2.5" /> {k}
                  </span>
                ))}
              </div>

              {r.botones.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                  {r.botones.map((b) => (
                    <span key={b} className="rounded-lg border border-gray-200 px-2 py-0.5 text-[0.68rem] text-gray-500">{b}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCrear && <RespuestaFormModal onClose={() => setShowCrear(false)} />}
      {editando && <RespuestaFormModal respuesta={editando} onClose={() => setEditando(null)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.pk) }}
        title="Eliminar respuesta"
        message={`¿Seguro que deseas eliminar la respuesta "${confirmEliminar?.id}"? Dejará de mostrarse en el chatbot público.`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
