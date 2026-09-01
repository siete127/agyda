import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Plus, Trash2, X, AlertTriangle, AlertOctagon, CheckCircle2, Clock,
  MessageSquare, ShieldCheck, Paperclip, Upload, FileText, RotateCcw, History, FileDown, FileSpreadsheet,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  mejoraContinuaService,
  type Hallazgo,
  type Accion,
  type Severidad,
  type EstatusHallazgo,
  type TipoHallazgo,
  type OrigenHallazgo,
  type NivelImpacto,
  type TipoAccion,
} from '@/services/mejoraContinua.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import { AREA_KEYS, AREA_LABELS, type AreaKey } from '@/config/areas'
import { useUsuariosSimple } from './useUsuariosSimple'

const SEVERIDAD_CONFIG: Record<Severidad, { label: string; cls: string; dot: string }> = {
  baja: { label: 'Baja', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  alta: { label: 'Alta', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  critica: { label: 'Crítica', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const ESTATUS_CONFIG: Record<EstatusHallazgo, { label: string; cls: string; dot: string }> = {
  registrado: { label: 'Registrado', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  en_analisis_causa: { label: 'En análisis de causa', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  plan_definido: { label: 'Plan definido', cls: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  en_ejecucion: { label: 'En ejecución', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  pendiente_verificacion: { label: 'Pendiente de verificación', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  verificado_eficaz: { label: 'Verificado eficaz', cls: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  cerrado: { label: 'Cerrado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  reabierto: { label: 'Reabierto', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const TIPO_HALLAZGO_LABEL: Record<TipoHallazgo, string> = {
  no_conformidad: 'No conformidad',
  oportunidad_mejora: 'Oportunidad de mejora',
  observacion: 'Observación',
  incidente: 'Incidente',
  queja_cliente: 'Queja de cliente',
}

const ORIGEN_HALLAZGO_LABEL: Record<OrigenHallazgo, string> = {
  auditoria_interna: 'Auditoría interna',
  auditoria_externa: 'Auditoría externa',
  cliente: 'Cliente',
  proceso: 'Proceso',
  inspeccion: 'Inspección',
  denuncia: 'Denuncia',
}

const IMPACTO_LABEL: Record<NivelImpacto, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }

const TIPO_ACCION_LABEL: Record<TipoAccion, string> = { contencion: 'Contención', correctiva: 'Correctiva', preventiva: 'Preventiva' }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Nuevo hallazgo ────────────────────────────────────────────────────────
function NuevoHallazgoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [areaOrigen, setAreaOrigen] = useState<string>('')
  const [tipo, setTipo] = useState<TipoHallazgo>('no_conformidad')
  const [origen, setOrigen] = useState<OrigenHallazgo | ''>('')
  const [requisitoIncumplido, setRequisitoIncumplido] = useState('')
  const [impactoCosto, setImpactoCosto] = useState<NivelImpacto | ''>('')
  const [impactoCliente, setImpactoCliente] = useState<NivelImpacto | ''>('')
  const [impactoLegal, setImpactoLegal] = useState<NivelImpacto | ''>('')
  const [severidad, setSeveridad] = useState<Severidad>('media')
  const [responsableId, setResponsableId] = useState('')
  const [fechaDeteccion, setFechaDeteccion] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')

  const reset = () => {
    setTitulo(''); setDescripcion(''); setAreaOrigen(''); setTipo('no_conformidad'); setOrigen('')
    setRequisitoIncumplido(''); setImpactoCosto(''); setImpactoCliente(''); setImpactoLegal('')
    setSeveridad('media'); setResponsableId(''); setFechaDeteccion(''); setFechaCompromiso('')
  }

  const mutation = useMutation({
    mutationFn: () => mejoraContinuaService.crearHallazgo({
      titulo,
      descripcion: descripcion || undefined,
      areaOrigen: areaOrigen || undefined,
      tipo,
      origen: origen || undefined,
      requisitoIncumplido: requisitoIncumplido || undefined,
      impactoCosto: impactoCosto || undefined,
      impactoCliente: impactoCliente || undefined,
      impactoLegal: impactoLegal || undefined,
      severidad,
      responsableId: responsableId ? Number(responsableId) : undefined,
      fechaDeteccion: fechaDeteccion || undefined,
      fechaCompromiso: fechaCompromiso || undefined,
    }),
    onSuccess: (data) => {
      toast.success(`Hallazgo ${data.folio} registrado`)
      queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo registrar el hallazgo'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo hallazgo / no conformidad" variant="corporate" size="lg">
      <form
        className="max-h-[70vh] space-y-3 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (!titulo.trim()) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Retraso recurrente en entregas de campañas"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué pasó, cuándo y cómo se detectó (opcional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo de hallazgo</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoHallazgo)}>
              {(Object.keys(TIPO_HALLAZGO_LABEL) as TipoHallazgo[]).map((t) => (
                <option key={t} value={t}>{TIPO_HALLAZGO_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Origen</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={origen} onChange={(e) => setOrigen(e.target.value as OrigenHallazgo | '')}>
              <option value="">Sin especificar</option>
              {(Object.keys(ORIGEN_HALLAZGO_LABEL) as OrigenHallazgo[]).map((o) => (
                <option key={o} value={o}>{ORIGEN_HALLAZGO_LABEL[o]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Área de origen</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={areaOrigen}
              onChange={(e) => setAreaOrigen(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {AREA_KEYS.map((k) => (
                <option key={k} value={k}>{AREA_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Severidad</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={severidad}
              onChange={(e) => setSeveridad(e.target.value as Severidad)}
            >
              {(Object.keys(SEVERIDAD_CONFIG) as Severidad[]).map((s) => (
                <option key={s} value={s}>{SEVERIDAD_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Requisito / norma incumplida</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={requisitoIncumplido}
            onChange={(e) => setRequisitoIncumplido(e.target.value)}
            placeholder="Ej. ISO 9001:2015 cláusula 8.7 (opcional)"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Impacto / riesgo estimado</label>
          <div className="grid grid-cols-3 gap-2">
            <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={impactoCosto} onChange={(e) => setImpactoCosto(e.target.value as NivelImpacto | '')}>
              <option value="">Costo: —</option>
              {(Object.keys(IMPACTO_LABEL) as NivelImpacto[]).map((n) => <option key={n} value={n}>Costo: {IMPACTO_LABEL[n]}</option>)}
            </select>
            <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={impactoCliente} onChange={(e) => setImpactoCliente(e.target.value as NivelImpacto | '')}>
              <option value="">Cliente: —</option>
              {(Object.keys(IMPACTO_LABEL) as NivelImpacto[]).map((n) => <option key={n} value={n}>Cliente: {IMPACTO_LABEL[n]}</option>)}
            </select>
            <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={impactoLegal} onChange={(e) => setImpactoLegal(e.target.value as NivelImpacto | '')}>
              <option value="">Legal: —</option>
              {(Object.keys(IMPACTO_LABEL) as NivelImpacto[]).map((n) => <option key={n} value={n}>Legal: {IMPACTO_LABEL[n]}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={responsableId}
              onChange={(e) => setResponsableId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha de detección</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={fechaDeteccion}
              onChange={(e) => setFechaDeteccion(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha compromiso</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={fechaCompromiso}
              onChange={(e) => setFechaCompromiso(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Registrar hallazgo</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Causa raíz — 5 Porqués ─────────────────────────────────────────────────
function CausaRaizSection({ hallazgo }: { hallazgo: Hallazgo }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [porques, setPorques] = useState([hallazgo.porque1 || '', hallazgo.porque2 || '', hallazgo.porque3 || '', hallazgo.porque4 || '', hallazgo.porque5 || ''])
  const [causaRaiz, setCausaRaiz] = useState(hallazgo.causaRaiz || '')

  const mutation = useMutation({
    mutationFn: () => mejoraContinuaService.actualizarHallazgo(hallazgo.id, {
      titulo: hallazgo.titulo,
      descripcion: hallazgo.descripcion || undefined,
      areaOrigen: hallazgo.areaOrigen || undefined,
      tipo: hallazgo.tipo,
      origen: hallazgo.origen || undefined,
      requisitoIncumplido: hallazgo.requisitoIncumplido || undefined,
      impactoCosto: hallazgo.impactoCosto || undefined,
      impactoCliente: hallazgo.impactoCliente || undefined,
      impactoLegal: hallazgo.impactoLegal || undefined,
      severidad: hallazgo.severidad,
      estatus: hallazgo.estatus,
      porque1: porques[0] || undefined,
      porque2: porques[1] || undefined,
      porque3: porques[2] || undefined,
      porque4: porques[3] || undefined,
      porque5: porques[4] || undefined,
      causaRaiz,
      responsableId: hallazgo.responsableId,
      fechaCompromiso: hallazgo.fechaCompromiso,
    }),
    onSuccess: () => {
      toast.success('Análisis de causa raíz actualizado')
      queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const hayAnalisis = porques.some((p) => p) || hallazgo.causaRaiz

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-tertiary">Análisis de causa raíz (5 Porqués)</h3>
        {!editando && (
          <button onClick={() => setEditando(true)} className="text-[11px] font-semibold text-brand hover:underline">
            {hayAnalisis ? 'Editar' : 'Agregar'}
          </button>
        )}
      </div>
      {!editando ? (
        hayAnalisis ? (
          <div className="space-y-1.5 rounded-lg bg-gray-50 px-3 py-2">
            {[hallazgo.porque1, hallazgo.porque2, hallazgo.porque3, hallazgo.porque4, hallazgo.porque5].map((p, i) => p && (
              <p key={i} className="text-xs text-ink-secondary"><span className="font-semibold">¿Por qué {i + 1}?</span> {p}</p>
            ))}
            {hallazgo.causaRaiz && (
              <p className="mt-1 border-t border-gray-200 pt-1.5 text-xs text-ink"><span className="font-semibold">Causa raíz identificada:</span> {hallazgo.causaRaiz}</p>
            )}
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-ink-secondary">Aún no se ha documentado el análisis de causa raíz.</p>
        )
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
          {porques.map((p, i) => (
            <input
              key={i}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
              value={p}
              onChange={(e) => setPorques((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
              placeholder={`¿Por qué ${i + 1}?`}
            />
          ))}
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={causaRaiz}
            onChange={(e) => setCausaRaiz(e.target.value)}
            placeholder="Causa raíz identificada (formal)"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={mutation.isPending}>Guardar</Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Acciones ──────────────────────────────────────────────────────────────
function NuevaAccionForm({ hallazgoId, onDone }: { hallazgoId: number; onDone: () => void }) {
  const { data: usuarios } = useUsuariosSimple()
  const [tipo, setTipo] = useState<TipoAccion>('correctiva')
  const [descripcion, setDescripcion] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')

  const mutation = useMutation({
    mutationFn: () => mejoraContinuaService.crearAccion(hallazgoId, {
      tipo, descripcion, responsableId: responsableId ? Number(responsableId) : undefined, fechaCompromiso: fechaCompromiso || undefined,
    }),
    onSuccess: () => { onDone(); setDescripcion(''); setResponsableId(''); setFechaCompromiso('') },
    onError: () => toast.error('No se pudo agregar la acción'),
  })

  return (
    <form
      className="space-y-2 rounded-lg border border-gray-100 p-3"
      onSubmit={(e) => { e.preventDefault(); if (!descripcion.trim()) return; mutation.mutate() }}
    >
      <div className="grid grid-cols-2 gap-2">
        <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAccion)}>
          {(Object.keys(TIPO_ACCION_LABEL) as TipoAccion[]).map((t) => (
            <option key={t} value={t}>{TIPO_ACCION_LABEL[t]}</option>
          ))}
        </select>
        <input type="date" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={fechaCompromiso} onChange={(e) => setFechaCompromiso(e.target.value)} />
      </div>
      <textarea
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        rows={2}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Describe la acción de contención / correctiva / preventiva"
      />
      <select className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
        <option value="">Responsable de la acción</option>
        {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={mutation.isPending}>Agregar acción</Button>
      </div>
    </form>
  )
}

function AccionesSection({ hallazgoId }: { hallazgoId: number }) {
  const queryClient = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['mejora-continua-acciones', hallazgoId],
    queryFn: () => mejoraContinuaService.listAcciones(hallazgoId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mejora-continua-acciones', hallazgoId] })
    queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
  }

  const completarMutation = useMutation({
    mutationFn: (accion: Accion) => mejoraContinuaService.actualizarAccion(accion.id, {
      tipo: accion.tipo, descripcion: accion.descripcion, responsableId: accion.responsableId,
      fechaCompromiso: accion.fechaCompromiso, estatus: accion.estatus === 'completada' ? 'pendiente' : 'completada',
    }),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo actualizar la acción'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => mejoraContinuaService.eliminarAccion(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar la acción'),
  })

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Plan de acción (contención / correctiva / preventiva)</h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {data?.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="chip bg-blue-50 text-blue-700">{TIPO_ACCION_LABEL[a.tipo]}</span>
                  <span className={clsx('text-[11px] font-semibold', a.estatus === 'completada' ? 'text-emerald-600' : 'text-ink-tertiary')}>
                    {a.estatus === 'completada' ? 'Completada' : a.estatus === 'en_proceso' ? 'En proceso' : 'Pendiente'}
                  </span>
                </div>
                <p className={clsx('mt-1 text-xs', a.estatus === 'completada' ? 'text-ink-tertiary line-through' : 'text-ink')}>{a.descripcion}</p>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">
                  {a.responsableNombre || 'Sin responsable'}
                  {a.fechaCompromiso ? ` · compromiso ${new Date(a.fechaCompromiso).toLocaleDateString()}` : ''}
                  {a.fechaRealCierre ? ` · cerrada ${new Date(a.fechaRealCierre).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button onClick={() => completarMutation.mutate(a)} className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600" title="Marcar completada">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => eliminarMutation.mutate(a.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin acciones registradas aún.</p>}
        </ul>
      )}
      {mostrarForm ? (
        <NuevaAccionForm hallazgoId={hallazgoId} onDone={() => { invalidate(); setMostrarForm(false) }} />
      ) : (
        <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
          <Plus className="h-3.5 w-3.5" /> Agregar acción
        </button>
      )}
    </div>
  )
}

// ── Adjuntos ──────────────────────────────────────────────────────────────
function AdjuntosSection({ hallazgoId }: { hallazgoId: number }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({
    queryKey: ['mejora-continua-adjuntos', hallazgoId],
    queryFn: () => mejoraContinuaService.listAdjuntos(hallazgoId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mejora-continua-adjuntos', hallazgoId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => mejoraContinuaService.subirAdjuntos(hallazgoId, files),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir el adjunto')
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => mejoraContinuaService.eliminarAdjunto(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el adjunto'),
  })

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      if (files.length) subirMutation.mutate(files)
    }
    input.click()
  }

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <Paperclip className="h-3.5 w-3.5" /> Evidencia / adjuntos
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = mejoraContinuaService.getUrlVerAdjunto(ad.id)
              return (
                <div key={ad.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <button onClick={() => window.open(url, '_blank')} className="flex h-full w-full items-center justify-center" title={ad.nombreOriginal}>
                    {esImagen ? (
                      <img src={url} alt={ad.nombreOriginal} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-gray-400" />
                        <span className="line-clamp-2 text-[10px] text-ink-tertiary">{ad.nombreOriginal}</span>
                      </div>
                    )}
                  </button>
                  {(ad.usuarioId === currentUserId) && (
                    <button
                      onClick={() => eliminarMutation.mutate(ad.id)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">
                    {formatBytes(ad.tamanio)}
                  </span>
                </div>
              )
            })}
            {(!data || data.length === 0) && (
              <p className="col-span-full text-xs text-ink-tertiary">Sin adjuntos aún.</p>
            )}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
            <Upload className="h-3.5 w-3.5" /> Subir adjunto
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Comentarios ───────────────────────────────────────────────────────────
function ComentariosSection({ hallazgoId }: { hallazgoId: number }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['mejora-continua-comentarios', hallazgoId],
    queryFn: () => mejoraContinuaService.listComentarios(hallazgoId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mejora-continua-comentarios', hallazgoId] })

  const crearMutation = useMutation({
    mutationFn: () => mejoraContinuaService.crearComentario(hallazgoId, texto),
    onSuccess: () => { setTexto(''); invalidate() },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => mejoraContinuaService.eliminarComentario(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el comentario'),
  })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <MessageSquare className="h-3.5 w-3.5" /> Comentarios
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {data?.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink">{c.texto}</p>
                  <p className="mt-1 text-[11px] text-ink-tertiary">
                    {c.autorNombre || 'Usuario'} · {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                {c.usuarioId === currentUserId && (
                  <button onClick={() => eliminarMutation.mutate(c.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin comentarios aún.</p>}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (!texto.trim()) return; crearMutation.mutate() }}
      >
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Agregar comentario..."
        />
        <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Comentar</Button>
      </form>
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────
function HistorialSection({ hallazgoId }: { hallazgoId: number }) {
  const [visible, setVisible] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['mejora-continua-historial', hallazgoId],
    queryFn: () => mejoraContinuaService.listHistorial(hallazgoId),
    enabled: visible,
  })

  return (
    <div>
      <button onClick={() => setVisible((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary hover:text-ink">
        <History className="h-3.5 w-3.5" /> Historial {visible ? '▲' : '▼'}
      </button>
      {visible && (
        <div className="mt-2">
          {isLoading ? (
            <p className="text-xs text-ink-tertiary">Cargando...</p>
          ) : !data || data.length === 0 ? (
            <p className="text-xs text-ink-tertiary">Sin movimientos registrados.</p>
          ) : (
            <ul className="space-y-1.5 border-l-2 border-gray-100 pl-3">
              {data.map((h) => (
                <li key={h.id} className="text-xs">
                  <span className="font-semibold text-ink">{h.usuarioNombre || 'Sistema'}</span>{' '}
                  <span className="text-ink-tertiary">{h.accion.replace(/-/g, ' ')} · {new Date(h.fecha).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Verificación de cierre ────────────────────────────────────────────────
function VerificacionSection({ hallazgo }: { hallazgo: Hallazgo }) {
  const queryClient = useQueryClient()
  const [evidencia, setEvidencia] = useState('')
  const [eficaz, setEficaz] = useState<'si' | 'no' | ''>('')
  const [motivoReapertura, setMotivoReapertura] = useState('')
  const [reabriendo, setReabriendo] = useState(false)

  const verificarMutation = useMutation({
    mutationFn: (cerrar: boolean) => mejoraContinuaService.verificarCierre(hallazgo.id, evidencia, cerrar, eficaz === 'si'),
    onSuccess: () => {
      toast.success('Hallazgo actualizado')
      queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
      setEvidencia(''); setEficaz('')
    },
    onError: () => toast.error('No se pudo verificar el cierre'),
  })

  const reabrirMutation = useMutation({
    mutationFn: () => mejoraContinuaService.reabrirHallazgo(hallazgo.id, motivoReapertura),
    onSuccess: () => {
      toast.success('Hallazgo reabierto')
      queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
      setMotivoReapertura(''); setReabriendo(false)
    },
    onError: () => toast.error('No se pudo reabrir el hallazgo'),
  })

  if (hallazgo.estatus === 'cerrado') {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Cerrado
        </p>
        <p className="mt-1 text-xs text-ink-secondary">{hallazgo.evidenciaCierre}</p>
        {hallazgo.fechaVerificacion && (
          <p className="mt-1 text-[11px] text-ink-tertiary">Verificado el {new Date(hallazgo.fechaVerificacion).toLocaleString()}</p>
        )}
      </div>
    )
  }

  if (hallazgo.estatus === 'verificado_eficaz') {
    if (hallazgo.eficaz === false && !reabriendo) {
      return (
        <div className="space-y-2 rounded-lg border border-red-100 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700">La verificación indicó que la acción no fue eficaz.</p>
          <p className="text-xs text-ink-secondary">{hallazgo.evidenciaCierre}</p>
          <Button size="sm" variant="secondary" onClick={() => setReabriendo(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reabrir hallazgo
          </Button>
        </div>
      )
    }
    if (reabriendo) {
      return (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!motivoReapertura.trim()) return; reabrirMutation.mutate() }}>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={motivoReapertura}
            onChange={(e) => setMotivoReapertura(e.target.value)}
            placeholder="Motivo de la reapertura"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setReabriendo(false)}>Cancelar</Button>
            <Button type="submit" size="sm" isLoading={reabrirMutation.isPending}>Confirmar reapertura</Button>
          </div>
        </form>
      )
    }
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-purple-50 px-3 py-2 text-xs text-ink-secondary">{hallazgo.evidenciaCierre}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => { setEvidencia(hallazgo.evidenciaCierre || ''); setEficaz('si'); verificarMutation.mutate(true) }} isLoading={verificarMutation.isPending}>
            Cerrar hallazgo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setReabriendo(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reabrir
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Verificación de eficacia</h3>
      <form
        className="space-y-2"
        onSubmit={(e) => { e.preventDefault(); if (!evidencia.trim() || !eficaz) return; verificarMutation.mutate(false) }}
      >
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={2}
          value={evidencia}
          onChange={(e) => setEvidencia(e.target.value)}
          placeholder="Evidencia de que la acción fue (o no) efectiva"
        />
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-ink-secondary">¿Fue eficaz?</span>
          <label className="flex items-center gap-1"><input type="radio" checked={eficaz === 'si'} onChange={() => setEficaz('si')} /> Sí</label>
          <label className="flex items-center gap-1"><input type="radio" checked={eficaz === 'no'} onChange={() => setEficaz('no')} /> No</label>
        </div>
        <Button type="submit" size="sm" isLoading={verificarMutation.isPending}>Marcar como verificado</Button>
      </form>
    </div>
  )
}

// ── Modal de detalle ──────────────────────────────────────────────────────
function HallazgoDetalleModal({ hallazgo, onClose }: { hallazgo: Hallazgo | null; onClose: () => void }) {
  if (!hallazgo) return null
  const sevCfg = SEVERIDAD_CONFIG[hallazgo.severidad] ?? { label: hallazgo.severidad, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  const estCfg = ESTATUS_CONFIG[hallazgo.estatus] ?? { label: hallazgo.estatus, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }

  return (
    <Modal isOpen={!!hallazgo} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {hallazgo.folio && <span className="chip bg-gray-100 text-ink-secondary font-mono">{hallazgo.folio}</span>}
              <span className="chip bg-indigo-50 text-indigo-700">{TIPO_HALLAZGO_LABEL[hallazgo.tipo]}</span>
              {hallazgo.areaOrigenLabel && <span className="chip bg-blue-50 text-blue-700">{hallazgo.areaOrigenLabel}</span>}
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', sevCfg.cls)}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', sevCfg.dot)} /> {sevCfg.label}
              </span>
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', estCfg.cls)}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
              </span>
            </div>
            <h2 className="text-base font-bold text-ink">{hallazgo.titulo}</h2>
            {hallazgo.descripcion && <p className="mt-1 text-sm text-ink-tertiary">{hallazgo.descripcion}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable</p>
            <p className="mt-0.5 text-ink">{hallazgo.responsableNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha compromiso</p>
            <p className={clsx('mt-0.5', hallazgo.vencido ? 'font-semibold text-red-600' : 'text-ink')}>
              {hallazgo.fechaCompromiso ? new Date(hallazgo.fechaCompromiso).toLocaleDateString() : '—'}
              {hallazgo.vencido && ' (vencido)'}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha de detección</p>
            <p className="mt-0.5 text-ink">{hallazgo.fechaDeteccion ? new Date(hallazgo.fechaDeteccion).toLocaleDateString() : '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Origen</p>
            <p className="mt-0.5 text-ink">{hallazgo.origen ? ORIGEN_HALLAZGO_LABEL[hallazgo.origen] : '—'}</p>
          </div>
          {hallazgo.requisitoIncumplido && (
            <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Requisito / norma incumplida</p>
              <p className="mt-0.5 text-ink">{hallazgo.requisitoIncumplido}</p>
            </div>
          )}
          {(hallazgo.impactoCosto || hallazgo.impactoCliente || hallazgo.impactoLegal) && (
            <div className="col-span-2 flex flex-wrap gap-2">
              {hallazgo.impactoCosto && <span className="chip bg-gray-100 text-ink-secondary">Costo: {IMPACTO_LABEL[hallazgo.impactoCosto]}</span>}
              {hallazgo.impactoCliente && <span className="chip bg-gray-100 text-ink-secondary">Cliente: {IMPACTO_LABEL[hallazgo.impactoCliente]}</span>}
              {hallazgo.impactoLegal && <span className="chip bg-gray-100 text-ink-secondary">Legal: {IMPACTO_LABEL[hallazgo.impactoLegal]}</span>}
            </div>
          )}
        </div>

        <CausaRaizSection hallazgo={hallazgo} />
        <AccionesSection hallazgoId={hallazgo.id} />
        <VerificacionSection hallazgo={hallazgo} />
        <AdjuntosSection hallazgoId={hallazgo.id} />
        <ComentariosSection hallazgoId={hallazgo.id} />
        <HistorialSection hallazgoId={hallazgo.id} />
      </div>
    </Modal>
  )
}

// ── Tarjeta compacta ──────────────────────────────────────────────────────
function HallazgoCard({ hallazgo, onClick, onEliminar, puedeEliminar }: { hallazgo: Hallazgo; onClick: () => void; onEliminar: () => void; puedeEliminar: boolean }) {
  const sevCfg = SEVERIDAD_CONFIG[hallazgo.severidad] ?? { label: hallazgo.severidad, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  const estCfg = ESTATUS_CONFIG[hallazgo.estatus] ?? { label: hallazgo.estatus, cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  return (
    <button onClick={onClick} className="group relative flex h-full flex-col rounded-2xl border border-gray-100 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {puedeEliminar && (
        <span
          onClick={(e) => { e.stopPropagation(); onEliminar() }}
          role="button"
          title="Eliminar hallazgo"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      )}

      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {hallazgo.folio && <span className="font-mono text-[11px] font-semibold text-ink-tertiary">{hallazgo.folio}</span>}
        {hallazgo.areaOrigenLabel && <span className="chip bg-blue-50 text-blue-700">{hallazgo.areaOrigenLabel}</span>}
      </div>
      <h3 className="pr-6 text-sm font-semibold text-ink">{hallazgo.titulo}</h3>
      {hallazgo.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{hallazgo.descripcion}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', sevCfg.cls)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', sevCfg.dot)} /> {sevCfg.label}
        </span>
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', estCfg.cls)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
        </span>
        {hallazgo.vencido && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            <Clock className="h-3 w-3" /> Vencido
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span>{hallazgo.accionesTotal} acción{hallazgo.accionesTotal !== 1 ? 'es' : ''} · {hallazgo.accionesPendientes} pendiente{hallazgo.accionesPendientes !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-2">
          {hallazgo.adjuntosCount > 0 && (
            <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {hallazgo.adjuntosCount}</span>
          )}
          {hallazgo.comentariosCount > 0 && (
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {hallazgo.comentariosCount}</span>
          )}
        </span>
      </div>
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function MejoraContinuaPage() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [hallazgoActivoId, setHallazgoActivoId] = useState<number | null>(null)
  const [filtroArea, setFiltroArea] = useState<AreaKey | ''>('')
  const [filtroSeveridad, setFiltroSeveridad] = useState<Severidad | ''>('')
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusHallazgo | ''>('')
  const [filtroResponsable, setFiltroResponsable] = useState('')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const { can } = useActionAccess()
  const puedeCrear = can('direccion-general', 'mejora-continua-crear')
  const puedeEliminar = can('direccion-general', 'mejora-continua-eliminar')

  const { data, isLoading } = useQuery({
    queryKey: ['mejora-continua-hallazgos'],
    queryFn: () => mejoraContinuaService.listHallazgos(),
    staleTime: 30_000,
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => mejoraContinuaService.eliminarHallazgo(id),
    onSuccess: () => {
      toast.success('Hallazgo eliminado')
      queryClient.invalidateQueries({ queryKey: ['mejora-continua-hallazgos'] })
    },
    onError: () => toast.error('No se pudo eliminar el hallazgo'),
  })

  const hallazgosFiltrados = useMemo(() => {
    return (data || []).filter((h) => {
      if (filtroArea && h.areaOrigen !== filtroArea) return false
      if (filtroSeveridad && h.severidad !== filtroSeveridad) return false
      if (filtroEstatus && h.estatus !== filtroEstatus) return false
      if (filtroResponsable && String(h.responsableId) !== filtroResponsable) return false
      if (filtroFechaDesde && new Date(h.fechaDeteccion) < new Date(filtroFechaDesde)) return false
      if (filtroFechaHasta && new Date(h.fechaDeteccion) > new Date(filtroFechaHasta)) return false
      return true
    })
  }, [data, filtroArea, filtroSeveridad, filtroEstatus, filtroResponsable, filtroFechaDesde, filtroFechaHasta])

  const hallazgoActivo = (data || []).find((h) => h.id === hallazgoActivoId) || null

  const stats: DashboardStat[] = useMemo(() => {
    const total = data?.length || 0
    const abiertos = data?.filter((h) => h.estatus !== 'cerrado').length || 0
    const vencidos = data?.filter((h) => h.vencido).length || 0
    const cerrados = data?.filter((h) => h.estatus === 'cerrado').length || 0
    const cerradosATiempo = data?.filter((h) => h.estatus === 'cerrado' && !h.vencido).length || 0
    const cumplimiento = cerrados > 0 ? Math.round((cerradosATiempo / cerrados) * 100) : 0
    return [
      { key: 'total', icon: ClipboardCheck, label: 'Total de hallazgos', value: total, tone: 'brand' },
      { key: 'abiertos', icon: AlertTriangle, label: 'Abiertos', value: abiertos, tone: 'warn' },
      { key: 'vencidos', icon: AlertOctagon, label: 'Vencidos', value: vencidos, tone: 'critical' },
      { key: 'cerrados', icon: CheckCircle2, label: 'Cerrados', value: cerrados, tone: 'success' },
      { key: 'cumplimiento', icon: ShieldCheck, label: '% cumplimiento de plazos', value: `${cumplimiento}%`, tone: 'brand' },
    ]
  }, [data])

  const hayFiltrosActivos = !!filtroArea || !!filtroSeveridad || !!filtroEstatus || !!filtroResponsable || !!filtroFechaDesde || !!filtroFechaHasta

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await mejoraContinuaService.exportarPdf({
        estatus: filtroEstatus || undefined,
        area: filtroArea || undefined,
        severidad: filtroSeveridad || undefined,
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'mejora_continua.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = () => {
    if (hallazgosFiltrados.length === 0) {
      toast.error('No hay hallazgos para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Folio', 'Título', 'Tipo', 'Área', 'Severidad', 'Estatus', 'Responsable', 'Fecha detección', 'Fecha compromiso'],
      ...hallazgosFiltrados.map((h) => [
        h.folio || '',
        h.titulo,
        TIPO_HALLAZGO_LABEL[h.tipo],
        h.areaOrigenLabel || '',
        SEVERIDAD_CONFIG[h.severidad].label,
        ESTATUS_CONFIG[h.estatus].label,
        h.responsableNombre || '',
        h.fechaDeteccion ? new Date(h.fechaDeteccion).toLocaleDateString() : '',
        h.fechaCompromiso ? new Date(h.fechaCompromiso).toLocaleDateString() : '',
      ]),
    ])
    sheet['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Mejora Continua')
    XLSX.writeFile(wb, 'mejora_continua.xlsx')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Seguimiento y mejora continua</h1>
            <p className="text-xs text-blue-200/70">Hallazgos, causa raíz y acciones correctivas/preventivas</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Hallazgos registrados</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          {puedeCrear && (
            <Button size="sm" onClick={() => setNuevoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nuevo hallazgo
            </Button>
          )}
        </div>
      </div>

      {!isLoading && data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-card p-3">
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value as AreaKey | '')}>
            <option value="">Todas las áreas</option>
            {AREA_KEYS.map((k) => <option key={k} value={k}>{AREA_LABELS[k]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroSeveridad} onChange={(e) => setFiltroSeveridad(e.target.value as Severidad | '')}>
            <option value="">Toda severidad</option>
            {(Object.keys(SEVERIDAD_CONFIG) as Severidad[]).map((s) => <option key={s} value={s}>{SEVERIDAD_CONFIG[s].label}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as EstatusHallazgo | '')}>
            <option value="">Todos los estatus</option>
            {(Object.keys(ESTATUS_CONFIG) as EstatusHallazgo[]).map((s) => <option key={s} value={s}>{ESTATUS_CONFIG[s].label}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)}>
            <option value="">Todos los responsables</option>
            {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <input type="date" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)} title="Detectado desde" />
          <input type="date" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)} title="Detectado hasta" />
          {hayFiltrosActivos && (
            <button
              onClick={() => { setFiltroArea(''); setFiltroSeveridad(''); setFiltroEstatus(''); setFiltroResponsable(''); setFiltroFechaDesde(''); setFiltroFechaHasta('') }}
              className="ml-auto text-[11px] font-semibold text-brand hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay hallazgos registrados.</p>
        </div>
      ) : (
        <>
          <DashboardStatRow stats={stats} />
          {hallazgosFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
              <p className="text-sm text-ink-tertiary">Ningún hallazgo coincide con los filtros aplicados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hallazgosFiltrados.map((h) => (
                <HallazgoCard key={h.id} hallazgo={h} onClick={() => setHallazgoActivoId(h.id)} onEliminar={() => eliminarMutation.mutate(h.id)} puedeEliminar={puedeEliminar} />
              ))}
            </div>
          )}
        </>
      )}

      <NuevoHallazgoModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} />
      <HallazgoDetalleModal hallazgo={hallazgoActivo} onClose={() => setHallazgoActivoId(null)} />
    </div>
  )
}
