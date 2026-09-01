import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, MessageSquare, RefreshCw, Tag, Sparkles,
  LayoutList, LayoutDashboard, ListChecks, Power, Users, DollarSign, ExternalLink, GitBranch,
  ListOrdered, GripVertical, MessageCircle, Megaphone, Workflow,
} from 'lucide-react'
import { chatbotService } from '@/services/chatbot.service'
import { livechatService } from '@/services/livechat.service'
import { useIsAdmin } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import type { RespuestaChatbot, EtiquetaMenuChatbot, TipoEtiquetaMenu } from '@/types/chatbot.types'
import { ArbolDiagnosticoTab } from './ArbolDiagnosticoTab'
import { FlujoVisualTab } from './FlujoVisualTab'
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

/* ── Menú del widget: botones que ve el visitante al abrir el chat público ── */
const TIPO_INFO: Record<TipoEtiquetaMenu, { label: string; icon: React.ElementType; desc: string }> = {
  respuesta: { label: 'Respuesta del diccionario', icon: MessageCircle, desc: 'Dispara la respuesta enlatada cuyas palabras clave coincidan con este texto.' },
  escalar_campania: { label: 'Escalar a campaña', icon: Megaphone, desc: 'Pide nombre y contacto, y escala directo a Chat en Vivo con la campaña elegida.' },
  escalar_generico: { label: 'Escalar (sin campaña)', icon: Users, desc: 'Pide nombre y contacto, y escala a Chat en Vivo sin campaña específica — un agente cualquiera lo puede tomar.' },
  arbol_diagnostico: { label: 'Árbol de diagnóstico', icon: Workflow, desc: 'Abre el árbol de decisión guiado configurado en la pestaña "Árbol de Diagnóstico".' },
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

  const { data: campanias = [] } = useQuery({
    queryKey: ['livechat-campanias'],
    queryFn: () => livechatService.getCampanias(),
    enabled: tipo === 'escalar_campania',
  })
  const { data: grupos = [] } = useQuery({
    queryKey: ['livechat-grupos', campaniaId],
    queryFn: () => livechatService.getGrupos(Number(campaniaId)),
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
          <div className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Campaña</label>
              <select
                value={campaniaId}
                onChange={(e) => { setCampaniaId(e.target.value ? Number(e.target.value) : ''); setGrupoId('') }}
                className="field"
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
                disabled={campaniaId === ''}
              >
                <option value="">Cualquiera disponible</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nombre}</option>
                ))}
              </select>
            </div>
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

/* ── Página principal ── */
export function ChatbotPage() {
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const [tab, setTab] = useState<'respuestas' | 'menu' | 'dashboard' | 'arbol' | 'flujo'>('respuestas')
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
          onClick={() => setTab('menu')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'menu' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <ListOrdered className="h-3.5 w-3.5" /> Menú del Widget
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
        <button
          onClick={() => setTab('flujo')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
            tab === 'flujo' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          <Workflow className="h-3.5 w-3.5" /> Flujo Visual
        </button>
      </div>

      {tab === 'flujo' ? <FlujoVisualTab /> : tab === 'arbol' ? <ArbolDiagnosticoTab /> : tab === 'menu' ? <MenuTab /> : tab === 'dashboard' ? <DashboardTab /> : isLoading ? (
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
