import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, MessageSquare, RefreshCw, Sparkles,
  LayoutDashboard, ListChecks, Power, Users, DollarSign, ExternalLink, GitBranch,
  ListOrdered, GripVertical, MessageCircle, Megaphone, Workflow, X, Loader2, Check,
  Search, ChevronRight, ChevronDown, FolderOpen, Hand, MessagesSquare, ArrowRight, Map as MapIcon,
} from 'lucide-react'
import { chatbotService } from '@/services/chatbot.service'
import { ccService } from '@/services/cc.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { useIsAdmin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import type { RespuestaChatbot, EtiquetaMenuChatbot, TipoEtiquetaMenu, ChatbotConfig } from '@/types/chatbot.types'
import { ArbolDiagnosticoTab } from './ArbolDiagnosticoTab'
import { FlujoVisualTab } from './FlujoVisualTab'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

function splitList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const SIN_CATEGORIA = '__sin__'

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
function RespuestaFormModal({ respuesta, categoriaInicial, keywordsIniciales, onClose }: {
  respuesta?: RespuestaChatbot
  categoriaInicial?: string
  keywordsIniciales?: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!respuesta

  const { data: categorias = [] } = useQuery({
    queryKey: ['chatbot-categorias'],
    queryFn: () => chatbotService.getCategorias(),
  })

  const [form, setForm] = useState({
    titulo: respuesta?.titulo ?? '',
    categoria: respuesta?.categoria ?? categoriaInicial ?? '',
    keywords: respuesta?.keywords?.join(', ') ?? keywordsIniciales ?? '',
    textoEs: respuesta?.textoEs ?? '',
    textoEn: respuesta?.textoEn ?? '',
    botones: (respuesta?.botones ?? []).join(', '),
    senalInteres: respuesta?.senalInteres ?? false,
    orden: respuesta?.orden ?? 0,
  })
  const [nuevaCategoria, setNuevaCategoria] = useState('')

  const canSave = form.textoEs.trim().length > 0 && splitList(form.keywords).length > 0

  const buildPayload = () => ({
    titulo: form.titulo.trim() || null,
    categoria: (nuevaCategoria.trim() || form.categoria.trim()) || null,
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
      qc.invalidateQueries({ queryKey: ['chatbot-categorias'] })
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              className="field"
              placeholder="ej. Costo de un proyecto"
              maxLength={120}
            />
            {!isEdit && <p className="mt-1 text-[0.68rem] text-gray-400">El id técnico se genera solo a partir del título.</p>}
            {isEdit && <p className="mt-1 text-[0.68rem] text-gray-400">id técnico: <code className="text-gray-500">{respuesta!.id}</code></p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
            <select
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              className="field"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria}</option>)}
              {form.categoria && !categorias.some((c) => c.categoria === form.categoria) && (
                <option value={form.categoria}>{form.categoria}</option>
              )}
            </select>
            <input
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              className="field mt-1.5 text-sm"
              placeholder="…o escribe una categoría nueva"
              maxLength={60}
            />
          </div>
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

/* ── Menú del widget: botones que ve el visitante al abrir el chat público ── */
const TIPO_INFO: Record<TipoEtiquetaMenu, { label: string; icon: React.ElementType; desc: string }> = {
  respuesta: { label: 'Respuesta del diccionario', icon: MessageCircle, desc: 'Dispara la respuesta enlatada cuyas palabras clave coincidan con este texto.' },
  escalar_campania: { label: 'Escalar a campaña', icon: Megaphone, desc: 'Pide nombre y contacto, y escala directo a Chat en Vivo con la campaña elegida.' },
  escalar_generico: { label: 'Escalar (sin campaña)', icon: Users, desc: 'Pide nombre y contacto, y escala a Chat en Vivo sin campaña específica — un agente cualquiera lo puede tomar.' },
  arbol_diagnostico: { label: 'Árbol de diagnóstico', icon: Workflow, desc: 'Abre el árbol de decisión guiado configurado en la pestaña "Árbol de Diagnóstico".' },
}

// Wizard "todo en uno": crea campaña + su canal 'web_publica' (habilitado,
// con token propio) + un skill/grupo + agentes asignados, sin salir del
// editor del chatbot. Reusa las mismas rutas que Configuración > Contact
// Center > Configuraciones del módulo de Asesor — esto no duplica lógica de
// backend, solo empaqueta 4 llamadas que ahí se hacen en pantallas separadas.
function NuevaCampaniaWebInline({ onCreada, onCancel }: { onCreada: (campaniaId: number, grupoId: number) => void; onCancel: () => void }) {
  const [nombreCampania, setNombreCampania] = useState('')
  const [nombreSkill, setNombreSkill] = useState('Atención general')
  const [agentesIds, setAgentesIds] = useState<number[]>([])
  const { data: usuarios = [] } = useUsuariosSimple()

  const canCrear = nombreCampania.trim().length > 0 && nombreSkill.trim().length > 0

  const crear = useMutation({
    mutationFn: async () => {
      const campania = await ccService.createCampania({ nombre: nombreCampania.trim() })
      const campaniaId = campania.data.id as number
      const grupo = await ccService.createGrupo({ campaniaId, nombre: nombreSkill.trim() })
      const grupoId = grupo.data.id as number
      for (const usuarioId of agentesIds) {
        await ccService.asignarAgente(grupoId, usuarioId)
      }
      const canal = await ccService.createCanal({ tipo: 'web_publica', nombre: `Widget Web - ${nombreCampania.trim()}` })
      const canalId = canal.data.id as number
      await ccService.updateCanal(canalId, { campaniaId, grupoId, habilitado: true })
      return { campaniaId, grupoId }
    },
    onSuccess: ({ campaniaId, grupoId }) => {
      toast.success('Campaña, skill y canal web creados')
      onCreada(campaniaId, grupoId)
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Error al crear la campaña')
    },
  })

  const toggleAgente = (id: number) => {
    setAgentesIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-700">Nueva campaña con widget web</p>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="text-[0.68rem] text-gray-500">
        Crea de un golpe la campaña, un skill de atención, el canal "Web pública" ya habilitado con su token, y
        opcionalmente los agentes que la van a atender. Lo demás (SLA, tipificaciones, motivos de cierre) lo puedes
        afinar después en Configuración → Contact Center.
      </p>

      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-gray-600 uppercase tracking-wide">Nombre de la campaña</label>
        <input value={nombreCampania} onChange={(e) => setNombreCampania(e.target.value)} className="field" placeholder="ej. Ventas Web" />
      </div>

      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-gray-600 uppercase tracking-wide">Nombre del skill / grupo de atención</label>
        <input value={nombreSkill} onChange={(e) => setNombreSkill(e.target.value)} className="field" placeholder="ej. Atención general" />
      </div>

      <div>
        <label className="mb-1 block text-[0.68rem] font-semibold text-gray-600 uppercase tracking-wide">
          Agentes que atenderán <span className="normal-case font-normal text-gray-400">(opcional, puedes asignarlos después)</span>
        </label>
        <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 bg-card">
          {usuarios.length === 0 && <p className="px-2.5 py-2 text-[0.7rem] text-gray-400">Cargando usuarios…</p>}
          {usuarios.map((u) => {
            const checked = agentesIds.includes(u.id)
            return (
              <button
                key={u.id} type="button" onClick={() => toggleAgente(u.id)}
                className={clsx('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.75rem] transition-colors hover:bg-gray-50',
                  checked && 'bg-brand/10')}
              >
                <span className={clsx('flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2', checked ? 'border-brand bg-brand' : 'border-gray-300')}>
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                {u.nombre}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button isLoading={crear.isPending} disabled={!canCrear} onClick={() => crear.mutate()}>
          {crear.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Crear y usar esta campaña
        </Button>
      </div>
    </div>
  )
}

function EtiquetaMenuFormModal({ etiqueta, onClose }: { etiqueta?: EtiquetaMenuChatbot; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!etiqueta

  const [textoEs, setTextoEs] = useState(etiqueta?.textoEs ?? '')
  const [textoEn, setTextoEn] = useState(etiqueta?.textoEn ?? '')
  const [tipo, setTipo] = useState<TipoEtiquetaMenu>(etiqueta?.tipo ?? 'respuesta')
  const [campaniaId, setCampaniaId] = useState<number | ''>(etiqueta?.campaniaId ?? '')
  const [grupoId, setGrupoId] = useState<number | ''>(etiqueta?.grupoId ?? '')
  const [orden, setOrden] = useState(etiqueta?.orden ?? 0)
  const [creandoCampania, setCreandoCampania] = useState(false)

  // Campañas/grupos de Omnicanal (CCO_*) — no del motor viejo de Livechat:
  // "escalar_campania" apunta a una campaña real que un agente atiende desde
  // Contact Center, y el token que el widget necesita sale del canal
  // 'web_publica' de esa campaña (ver chatbotController.SELECT_ETIQUETA).
  const { data: campanias = [] } = useQuery({
    queryKey: ['cc-campanias'],
    queryFn: () => ccService.getCampanias(),
    enabled: tipo === 'escalar_campania',
  })
  const { data: grupos = [] } = useQuery({
    queryKey: ['cc-grupos', campaniaId],
    queryFn: () => ccService.getGrupos(Number(campaniaId)),
    enabled: tipo === 'escalar_campania' && campaniaId !== '',
  })

  const canSave = textoEs.trim().length > 0 && (tipo !== 'escalar_campania' || campaniaId !== '')

  const buildPayload = () => ({
    textoEs: textoEs.trim(),
    textoEn: textoEn.trim() || null,
    tipo,
    campaniaId: tipo === 'escalar_campania' ? Number(campaniaId) : null,
    grupoId: tipo === 'escalar_campania' && grupoId !== '' ? Number(grupoId) : null,
    orden: Number(orden) || 0,
  })

  const guardar = useMutation({
    mutationFn: () =>
      isEdit
        ? chatbotService.updateEtiquetaMenu(etiqueta!.id, { ...buildPayload(), activa: etiqueta!.activa })
        : chatbotService.createEtiquetaMenu(buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-etiquetas-menu'] })
      toast.success(isEdit ? 'Etiqueta actualizada' : 'Etiqueta creada')
      onClose()
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message || 'Error al guardar la etiqueta')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar etiqueta' : 'Nueva etiqueta'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Texto en español</label>
          <input value={textoEs} onChange={(e) => setTextoEs(e.target.value)} className="field" placeholder="ej. Hablar con ventas" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Texto en inglés (opcional)</label>
          <input value={textoEn} onChange={(e) => setTextoEn(e.target.value)} className="field" placeholder="ej. Talk to sales" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Qué hace al presionarla</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(TIPO_INFO) as TipoEtiquetaMenu[]).map((t) => {
              const info = TIPO_INFO[t]
              const Icon = info.icon
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={clsx(
                    'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                    tipo === t ? 'border-brand bg-brand/5' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <Icon className={clsx('h-4 w-4', tipo === t ? 'text-brand' : 'text-gray-400')} />
                  <span className={clsx('text-xs font-semibold', tipo === t ? 'text-brand' : 'text-gray-700')}>{info.label}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[0.68rem] text-gray-400">{TIPO_INFO[tipo].desc}</p>
        </div>

        {tipo === 'escalar_campania' && (
          <div className="space-y-3 rounded-xl bg-gray-50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña</label>
                <select
                  value={campaniaId}
                  onChange={(e) => { setCampaniaId(e.target.value ? Number(e.target.value) : ''); setGrupoId('') }}
                  className="field"
                  disabled={creandoCampania}
                >
                  <option value="">Elegir campaña…</option>
                  {campanias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Grupo <span className="normal-case font-normal text-gray-400">(opcional)</span>
                </label>
                <select
                  value={grupoId}
                  onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : '')}
                  className="field"
                  disabled={campaniaId === '' || creandoCampania}
                >
                  <option value="">Cualquiera disponible</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>{g.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {!creandoCampania ? (
              <button
                type="button"
                onClick={() => setCreandoCampania(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Crear una campaña nueva con su widget web
              </button>
            ) : (
              <NuevaCampaniaWebInline
                onCancel={() => setCreandoCampania(false)}
                onCreada={(nuevaCampaniaId, nuevoGrupoId) => {
                  qc.invalidateQueries({ queryKey: ['cc-campanias'] })
                  qc.invalidateQueries({ queryKey: ['cc-grupos', nuevaCampaniaId] })
                  setCampaniaId(nuevaCampaniaId)
                  setGrupoId(nuevoGrupoId)
                  setCreandoCampania(false)
                }}
              />
            )}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Orden</label>
          <input type="number" value={orden} onChange={(e) => setOrden(Number(e.target.value))} className="field w-32" />
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} disabled={!canSave} onClick={() => guardar.mutate()}>
            {isEdit ? 'Guardar cambios' : 'Crear etiqueta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function MenuTab() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<EtiquetaMenuChatbot | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<EtiquetaMenuChatbot | null>(null)

  const { data: etiquetas = [], isLoading } = useQuery({
    queryKey: ['chatbot-etiquetas-menu'],
    queryFn: () => chatbotService.getEtiquetasMenu(),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['chatbot-etiquetas-menu'] })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => chatbotService.deleteEtiquetaMenu(id),
    onSuccess: () => { invalidate(); toast.success('Etiqueta eliminada') },
    onError: () => toast.error('Error al eliminar la etiqueta'),
  })

  const activaMut = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => chatbotService.updateEtiquetaMenu(id, { activa }),
    onSuccess: invalidate,
    onError: () => toast.error('Error al cambiar el estado'),
  })

  const ordenadas = [...etiquetas].sort((a, b) => a.orden - b.orden || a.id - b.id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Botones que ve el visitante al abrir el chat en la página pública. Se muestran en este orden.
        </p>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCrear(true)}>
            <Plus className="h-3.5 w-3.5" /> Nueva etiqueta
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : ordenadas.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ListOrdered className="h-8 w-8" />
          <p className="text-sm">Aún no hay etiquetas configuradas para el menú</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenadas.map((e) => {
            const info = TIPO_INFO[e.tipo]
            const Icon = info.icon
            return (
              <div key={e.id} className={clsx('card flex items-center gap-3 p-3', !e.activa && 'opacity-60')}>
                <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{e.textoEs}</p>
                    <span className={clsx(
                      'rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
                      e.activa ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                    )}>
                      {e.activa ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {info.label}
                    {e.tipo === 'escalar_campania' && e.campaniaNombre && ` → ${e.campaniaNombre}`}
                  </p>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => activaMut.mutate({ id: e.id, activa: !e.activa })}
                      title={e.activa ? 'Pausar' : 'Activar'}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      {e.activa ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditando(e)}
                      title="Editar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmEliminar(e)}
                      title="Eliminar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCrear && <EtiquetaMenuFormModal onClose={() => setShowCrear(false)} />}
      {editando && <EtiquetaMenuFormModal etiqueta={editando} onClose={() => setEditando(null)} />}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Eliminar etiqueta"
        message={`¿Seguro que deseas eliminar la etiqueta "${confirmEliminar?.textoEs}"? Dejará de mostrarse en el menú del chat público.`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
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

/* ── Respuestas que fallan + preguntas sin match (Fase 2) ── */
function RendimientoCalidad() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const [crearDesde, setCrearDesde] = useState<{ texto: string; id: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['chatbot-rendimiento'],
    queryFn: () => chatbotService.getRendimiento(),
  })

  const resolver = useMutation({
    mutationFn: (id: number) => chatbotService.resolverSinMatch(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatbot-rendimiento'] }) },
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner size="sm" /></div>

  const conFeedback = (data?.respuestas ?? []).filter((r) => r.noUtiles > 0)
  const sinMatch = data?.sinMatch ?? []
  const embudo = data?.embudo ?? []
  const embudoMax = Math.max(1, ...embudo.map((e) => e.sesiones))

  return (
    <>
      {embudo.length > 0 && embudo[0].sesiones > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-[0.78rem] font-bold text-gray-700">Embudo de conversación</p>
            <p className="text-[0.68rem] text-gray-400">Sesiones distintas por hito, últimos 30 días</p>
          </div>
          <div className="space-y-2 px-4 py-3">
            {embudo.map((e) => {
              const pct = embudo[0].sesiones ? Math.round((e.sesiones / embudo[0].sesiones) * 100) : 0
              return (
                <div key={e.tipo} className="flex items-center gap-3">
                  <span className="w-32 flex-shrink-0 text-[0.75rem] text-gray-600">{e.label}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
                    <div
                      className="h-full rounded bg-brand/70"
                      style={{ width: `${Math.max(2, (e.sesiones / embudoMax) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 flex-shrink-0 text-right text-[0.72rem] font-semibold text-gray-700">
                    {e.sesiones} · {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-[0.78rem] font-bold text-gray-700">Respuestas que fallan</p>
            <p className="text-[0.68rem] text-gray-400">Ordenadas por votos 👎 del visitante</p>
          </div>
          {conFeedback.length === 0 ? (
            <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin votos negativos todavía</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {conFeedback.map((r) => (
                <div key={r.pk} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <p className="min-w-0 truncate text-[0.8rem] font-medium text-gray-700">{r.titulo || r.id}</p>
                  <div className="flex flex-shrink-0 items-center gap-3 text-[0.72rem]">
                    <span className="text-emerald-600">👍 {r.utiles}</span>
                    <span className="font-bold text-red-500">👎 {r.noUtiles}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="text-[0.78rem] font-bold text-gray-700">Preguntas sin respuesta</p>
            <p className="text-[0.68rem] text-gray-400">Lo que la gente escribió y el bot no supo contestar</p>
          </div>
          {sinMatch.length === 0 ? (
            <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin preguntas pendientes 🎉</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {sinMatch.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[0.8rem] text-gray-700">"{s.texto}"</p>
                    <p className="text-[0.66rem] text-gray-400">{s.veces} vez{s.veces !== 1 ? 'ces' : ''}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        onClick={() => setCrearDesde({ texto: s.texto, id: s.id })}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-[0.68rem] font-semibold text-brand hover:border-brand"
                      >
                        Crear respuesta
                      </button>
                      <button
                        onClick={() => resolver.mutate(s.id)}
                        title="Descartar"
                        className="rounded-lg p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {crearDesde && (
        <RespuestaFormModal
          keywordsIniciales={crearDesde.texto}
          onClose={() => { resolver.mutate(crearDesde.id); setCrearDesde(null) }}
        />
      )}
    </>
  )
}

/* ── Rendimiento: métricas + calidad + leads capturados desde el CRM ── */
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

          <RendimientoCalidad />

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

/* ════════════════════════════════════════════════════════
   SECCIÓN 1 — CONVERSACIÓN
   Saludo + Menú inicial + Temas + Diagnóstico guiado, en el
   orden en que el bot conversa. Reemplaza las pestañas
   Respuestas / Menú del Widget / Árbol de Diagnóstico.
════════════════════════════════════════════════════════ */

function BloqueColapsable({ icon: Icon, titulo, resumen, defaultOpen = true, children }: {
  icon: React.ElementType
  titulo: string
  resumen?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-800">{titulo}</p>
          {resumen && <p className="text-xs text-gray-400 truncate">{resumen}</p>}
        </div>
        {abierto ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-300" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}
      </button>
      {abierto && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </div>
  )
}

function SaludoSection() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: config, isLoading } = useQuery({
    queryKey: ['chatbot-config'],
    queryFn: () => chatbotService.getConfig(),
  })
  const [borrador, setBorrador] = useState<Partial<ChatbotConfig>>({})
  const editado = borrador.saludoEs !== undefined || borrador.saludoEn !== undefined

  const guardar = useMutation({
    mutationFn: () => chatbotService.updateConfig(borrador),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chatbot-config'] })
      setBorrador({})
      toast.success('Saludo actualizado')
    },
    onError: () => toast.error('No se pudo guardar el saludo'),
  })

  if (isLoading || !config) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>

  const saludoEs = borrador.saludoEs ?? config.saludoEs
  const saludoEn = borrador.saludoEn ?? config.saludoEn

  return (
    <BloqueColapsable icon={Hand} titulo="Saludo" resumen={config.saludoEs} defaultOpen={false}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Español</label>
          <textarea
            value={saludoEs}
            onChange={(e) => setBorrador((b) => ({ ...b, saludoEs: e.target.value }))}
            rows={2}
            className="field resize-none text-sm"
            disabled={!isAdmin}
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Inglés</label>
          <textarea
            value={saludoEn}
            onChange={(e) => setBorrador((b) => ({ ...b, saludoEn: e.target.value }))}
            rows={2}
            className="field resize-none text-sm"
            disabled={!isAdmin}
          />
        </div>
        {isAdmin && editado && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setBorrador({})}>Descartar</Button>
            <Button size="sm" isLoading={guardar.isPending} onClick={() => guardar.mutate()}>Guardar saludo</Button>
          </div>
        )}
      </div>
    </BloqueColapsable>
  )
}

function TemaCard({ r, onEditar, onEliminar }: {
  r: RespuestaChatbot
  onEditar: () => void
  onEliminar: () => void
}) {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const activaMut = useMutation({
    mutationFn: ({ pk, activa }: { pk: number; activa: boolean }) => chatbotService.toggleActiva(pk, activa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] }),
    onError: () => toast.error('Error al cambiar el estado'),
  })
  return (
    <div className={clsx('rounded-xl border border-gray-200/70 bg-card p-3', !r.activa && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[0.82rem] font-bold text-gray-800">{r.titulo || r.id}</p>
            {r.senalInteres && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[0.6rem] font-semibold">
                <Sparkles className="h-2.5 w-2.5" /> señal de interés
              </span>
            )}
            {!r.activa && <span className="rounded-full bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[0.6rem] font-semibold">Pausada</span>}
          </div>
          <p className="mt-1 text-[0.8rem] text-gray-600 line-clamp-2">{r.textoEs}</p>
          <p className="mt-1 text-[0.68rem] text-gray-400">
            Responde a: {r.keywords.slice(0, 4).join(', ')}{r.keywords.length > 4 ? ` +${r.keywords.length - 4}` : ''}
          </p>
          {r.botones.length > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-[0.68rem] text-gray-400">
              <ArrowRight className="h-3 w-3" /> botones: {r.botones.join(' · ')}
            </p>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => activaMut.mutate({ pk: r.pk, activa: !r.activa })} title={r.activa ? 'Pausar' : 'Activar'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              {r.activa ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button onClick={onEditar} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEliminar} title="Eliminar" className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TemasSection() {
  const isAdmin = useIsAdmin()
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [crearEn, setCrearEn] = useState<string | null>(null)  // categoría o '' para crear
  const [editando, setEditando] = useState<RespuestaChatbot | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<RespuestaChatbot | null>(null)

  const { data: respuestas = [], isLoading } = useQuery({
    queryKey: ['chatbot-respuestas'],
    queryFn: () => chatbotService.getAll(),
  })

  const eliminarMut = useMutation({
    mutationFn: (pk: number) => chatbotService.delete(pk),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['chatbot-respuestas'] }); toast.success('Respuesta eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const grupos = useMemo(() => {
    const q = normaliza(busqueda.trim())
    const filtradas = q
      ? respuestas.filter((r) =>
          normaliza(`${r.titulo ?? ''} ${r.id} ${r.textoEs} ${r.keywords.join(' ')}`).includes(q))
      : respuestas
    const map = new Map<string, RespuestaChatbot[]>()
    for (const r of filtradas) {
      const cat = r.categoria?.trim() || SIN_CATEGORIA
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(r)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === SIN_CATEGORIA) return 1
      if (b === SIN_CATEGORIA) return -1
      return a.localeCompare(b)
    })
  }, [respuestas, busqueda])

  const toggle = (cat: string) => setAbiertas((prev) => {
    const next = new Set(prev)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    return next
  })

  if (isLoading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>

  return (
    <BloqueColapsable
      icon={MessagesSquare}
      titulo="Temas"
      resumen={`${respuestas.length} respuestas en ${grupos.length} categoría${grupos.length !== 1 ? 's' : ''}`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar tema o palabra clave…"
              className="w-full rounded-lg border border-gray-200 bg-card pl-9 pr-3 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setCrearEn('')}>
              <Plus className="h-3.5 w-3.5" /> Nueva
            </Button>
          )}
        </div>

        {grupos.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Sin resultados</p>
        ) : grupos.map(([cat, items]) => {
          const esSinCat = cat === SIN_CATEGORIA
          const abierta = abiertas.has(cat) || !!busqueda.trim()
          return (
            <div key={cat} className={clsx('rounded-xl border', esSinCat ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200')}>
              <button onClick={() => toggle(cat)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                {abierta ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                <FolderOpen className={clsx('h-3.5 w-3.5', esSinCat ? 'text-amber-500' : 'text-gray-400')} />
                <span className="text-[0.8rem] font-bold text-gray-700">
                  {esSinCat ? 'Sin categoría' : cat}
                </span>
                <span className="text-[0.7rem] text-gray-400">({items.length})</span>
                {esSinCat && <span className="ml-1 text-[0.65rem] font-semibold text-amber-600">organiza estas</span>}
              </button>
              {abierta && (
                <div className="space-y-2 px-3 pb-3">
                  {items.map((r) => (
                    <TemaCard
                      key={r.pk}
                      r={r}
                      onEditar={() => setEditando(r)}
                      onEliminar={() => setConfirmEliminar(r)}
                    />
                  ))}
                  {isAdmin && !esSinCat && (
                    <button onClick={() => setCrearEn(cat)} className="text-[0.72rem] font-semibold text-brand hover:underline">
                      + Nueva respuesta en "{cat}"
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {crearEn !== null && <RespuestaFormModal categoriaInicial={crearEn || undefined} onClose={() => setCrearEn(null)} />}
      {editando && <RespuestaFormModal respuesta={editando} onClose={() => setEditando(null)} />}
      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.pk) }}
        title="Eliminar respuesta"
        message={`¿Eliminar "${confirmEliminar?.titulo || confirmEliminar?.id}"? Dejará de mostrarse en el chatbot público.`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </BloqueColapsable>
  )
}

function DiagnosticoSection() {
  const [editor, setEditor] = useState(false)
  return (
    <BloqueColapsable icon={GitBranch} titulo="Diagnóstico guiado" resumen="Árbol de preguntas que puede resolver, escalar a chat o crear un ticket" defaultOpen={false}>
      {editor ? (
        <ArbolDiagnosticoTab />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8rem] text-gray-500">
            El visitante lo abre desde el menú inicial (botón "Diagnóstico guiado").
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEditor(true)}>
            <Pencil className="h-3.5 w-3.5" /> Editar el árbol
          </Button>
        </div>
      )}
    </BloqueColapsable>
  )
}

function ConversacionTab() {
  return (
    <div className="space-y-3">
      <SaludoSection />
      <BloqueColapsable icon={ListOrdered} titulo="Menú inicial" resumen="Botones que ve el visitante al abrir el chat">
        <MenuTab />
      </BloqueColapsable>
      <TemasSection />
      <DiagnosticoSection />
    </div>
  )
}

const TABS = [
  { key: 'conversacion' as const, label: 'Conversación', icon: MessagesSquare },
  { key: 'rendimiento' as const, label: 'Rendimiento', icon: LayoutDashboard },
]

/* ── Página principal ── */
export function ChatbotPage() {
  const [tab, setTab] = useState<'conversacion' | 'rendimiento' | 'mapa'>('conversacion')

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" /> Chatbot
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Configura cómo conversa el asistente de la página pública</p>
        </div>
        <button
          onClick={() => setTab('mapa')}
          className={clsx(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
            tab === 'mapa' ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-500 hover:border-brand/40 hover:text-brand',
          )}
        >
          <MapIcon className="h-3.5 w-3.5" /> Mapa completo
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
              tab === key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'mapa' ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Vista de auditoría: así se conectan las respuestas, el menú, el árbol y las campañas. Para editar el
            contenido usa la pestaña Conversación.
          </p>
          <FlujoVisualTab />
        </div>
      ) : tab === 'rendimiento' ? (
        <DashboardTab />
      ) : (
        <ConversacionTab />
      )}
    </div>
  )
}
