import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShieldAlert, ShieldCheck, Plus, Trash2, X, FileText, Upload, CheckCircle2, Clock, FileDown, FileSpreadsheet, AlertTriangle,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  cumplimientoNormativoService,
  type ObligacionCumplimiento,
  type CategoriaCumplimiento,
  type FrecuenciaCumplimiento,
  type NivelRiesgoCumplimiento,
  type EstatusCumplimiento,
  type TipoAdjuntoCumplimiento,
} from '@/services/cumplimientoNormativo.service'
import { proteccionDatosService } from '@/services/proteccionDatos.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const CATEGORIA_LABEL: Record<CategoriaCumplimiento, string> = {
  fiscal: 'Fiscal', laboral: 'Laboral', ambiental: 'Ambiental', proteccion_datos: 'Protección de datos',
  salud_seguridad: 'Salud y seguridad', financiero: 'Financiero', comercial: 'Comercial', otra: 'Otra',
}

const FRECUENCIA_LABEL: Record<FrecuenciaCumplimiento, string> = {
  unica_vez: 'Única vez', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}

const NIVEL_RIESGO_CONFIG: Record<NivelRiesgoCumplimiento, { label: string; cls: string }> = {
  bajo: { label: 'Bajo', cls: 'bg-emerald-100 text-emerald-700' },
  medio: { label: 'Medio', cls: 'bg-blue-50 text-blue-700' },
  alto: { label: 'Alto', cls: 'bg-amber-100 text-amber-700' },
  critico: { label: 'Crítico', cls: 'bg-red-100 text-red-700' },
}

const ESTATUS_CONFIG: Record<EstatusCumplimiento, { label: string; cls: string; dot: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  vencida: { label: 'Vencida', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  cumplida: { label: 'Cumplida', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

const ADJUNTO_LABEL: Record<TipoAdjuntoCumplimiento, string> = { evidencia: 'Evidencia', norma: 'Norma', otro: 'Otro' }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Sección colapsable ────────────────────────────────────────────────────
function Seccion({ titulo, defaultOpen = false, children }: { titulo: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-gray-200 [&_summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold uppercase tracking-wide text-ink-secondary hover:bg-gray-50">
        {titulo}
      </summary>
      <div className="space-y-3 border-t border-gray-100 p-3">{children}</div>
    </details>
  )
}

// ── Tarjeta de integración con RAT ────────────────────────────────────────
function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'critical' | 'warn' }) {
  const toneCls = { brand: 'text-brand', critical: 'text-red-600', warn: 'text-amber-600' }[tone]
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-2 text-center">
      <p className={clsx('text-base font-bold', toneCls)}>{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-ink-tertiary">{label}</p>
    </div>
  )
}

function IntegracionRatCard() {
  const navigate = useNavigate()
  const { data: resumenRat, isLoading } = useQuery({
    queryKey: ['rat-resumen'],
    queryFn: () => proteccionDatosService.getResumen(),
    staleTime: 30_000,
  })

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-ink">Protección de datos (RAT)</h3>
        </div>
        <button onClick={() => navigate('/legal/proteccion-datos')} className="text-[11px] font-semibold text-brand hover:underline">
          Ver módulo completo →
        </button>
      </div>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : resumenRat ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <MiniStat label="Actividades activas" value={resumenRat.activas} tone="brand" />
          <MiniStat label="Revisión vencida" value={resumenRat.revisionVencida} tone="critical" />
          <MiniStat label="Revisión próxima" value={resumenRat.revisionProxima} tone="warn" />
          <MiniStat label="Transf. internacional" value={resumenRat.conTransferenciaInternacional} tone="brand" />
          <MiniStat label="Datos sensibles" value={resumenRat.conDatosSensibles} tone="critical" />
        </div>
      ) : (
        <p className="text-xs text-ink-tertiary">No se pudo cargar el resumen del RAT.</p>
      )}
    </div>
  )
}

// ── Formulario (crear/editar) ─────────────────────────────────────────────
function ObligacionFormModal({ isOpen, onClose, obligacion }: { isOpen: boolean; onClose: () => void; obligacion: ObligacionCumplimiento | null }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const esEdicion = !!obligacion

  const [nombre, setNombre] = useState(obligacion?.nombre || '')
  const [categoria, setCategoria] = useState<CategoriaCumplimiento>(obligacion?.categoria || 'fiscal')
  const [autoridad, setAutoridad] = useState(obligacion?.autoridad || '')
  const [responsableId, setResponsableId] = useState(obligacion?.responsableId ? String(obligacion.responsableId) : '')
  const [baseLegal, setBaseLegal] = useState(obligacion?.baseLegal || '')
  const [descripcion, setDescripcion] = useState(obligacion?.descripcion || '')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCumplimiento>(obligacion?.frecuencia || 'anual')
  const [fechaLimite, setFechaLimite] = useState(obligacion?.fechaLimite ? obligacion.fechaLimite.slice(0, 10) : '')
  const [nivelRiesgo, setNivelRiesgo] = useState<NivelRiesgoCumplimiento>(obligacion?.nivelRiesgo || 'medio')
  const [consecuenciaIncumplimiento, setConsecuenciaIncumplimiento] = useState(obligacion?.consecuenciaIncumplimiento || '')
  const [notas, setNotas] = useState(obligacion?.notas || '')

  const payload = {
    nombre, categoria, autoridad: autoridad || undefined, responsableId: responsableId ? Number(responsableId) : undefined,
    baseLegal: baseLegal || undefined, descripcion: descripcion || undefined, frecuencia, fechaLimite, nivelRiesgo,
    consecuenciaIncumplimiento: consecuenciaIncumplimiento || undefined, notas: notas || undefined,
  }

  const mutation = useMutation({
    mutationFn: () => (esEdicion ? cumplimientoNormativoService.actualizarObligacion(obligacion!.id, payload) : cumplimientoNormativoService.crearObligacion(payload)).then(() => undefined),
    onSuccess: () => {
      toast.success(esEdicion ? 'Obligación actualizada' : 'Obligación creada')
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-obligaciones'] })
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-resumen'] })
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo guardar la obligación')
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={esEdicion ? 'Editar obligación normativa' : 'Nueva obligación normativa'} variant="corporate" size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nombre.trim() || !fechaLimite) return
          mutation.mutate()
        }}
      >
        <Seccion titulo="Identificación" defaultOpen>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre / norma aplicable</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Declaración anual ISR" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Categoría</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCumplimiento)}>
                {(Object.keys(CATEGORIA_LABEL) as CategoriaCumplimiento[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Autoridad / ente regulador</label>
              <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={autoridad} onChange={(e) => setAutoridad(e.target.value)} placeholder="Ej. SAT, IMSS, INAI" />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Responsabilidad y base legal">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Base legal / referencia normativa</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={baseLegal} onChange={(e) => setBaseLegal(e.target.value)} placeholder="Ley/artículo aplicable (opcional)" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle de la obligación (opcional)" />
          </div>
        </Seccion>

        <Seccion titulo="Frecuencia y plazo">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Frecuencia de cumplimiento</label>
              <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaCumplimiento)}>
                {(Object.keys(FRECUENCIA_LABEL) as FrecuenciaCumplimiento[]).map((f) => <option key={f} value={f}>{FRECUENCIA_LABEL[f]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha límite {esEdicion ? 'actual' : ''}</label>
              <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} required />
            </div>
          </div>
          {frecuencia !== 'unica_vez' && (
            <p className="text-[11px] text-ink-tertiary">Esta fecha se reprogramará automáticamente al marcar la obligación como cumplida.</p>
          )}
        </Seccion>

        <Seccion titulo="Riesgo">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nivel de riesgo si se incumple</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nivelRiesgo} onChange={(e) => setNivelRiesgo(e.target.value as NivelRiesgoCumplimiento)}>
              {(Object.keys(NIVEL_RIESGO_CONFIG) as NivelRiesgoCumplimiento[]).map((n) => <option key={n} value={n}>{NIVEL_RIESGO_CONFIG[n].label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Consecuencia de incumplimiento</label>
            <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={consecuenciaIncumplimiento} onChange={(e) => setConsecuenciaIncumplimiento(e.target.value)} placeholder="Multas, sanciones, etc. (opcional)" />
          </div>
        </Seccion>

        <Seccion titulo="Notas">
          <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Seccion>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>{esEdicion ? 'Guardar cambios' : 'Crear obligación'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Marcar como cumplida (mini-formulario inline) ─────────────────────────
function MarcarCumplidaForm({ obligacionId, onDone }: { obligacionId: number; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [fechaCumplimiento, setFechaCumplimiento] = useState(new Date().toISOString().slice(0, 10))
  const [comentario, setComentario] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const resultado = await cumplimientoNormativoService.marcarCumplida(obligacionId, { fechaCumplimiento, comentario: comentario || undefined })
      if (archivo) await cumplimientoNormativoService.subirAdjuntos(obligacionId, [archivo], 'evidencia')
      return resultado
    },
    onSuccess: () => {
      toast.success('Obligación marcada como cumplida')
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-obligaciones'] })
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-resumen'] })
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-historial', obligacionId] })
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-adjuntos', obligacionId] })
      onDone()
    },
    onError: () => toast.error('No se pudo marcar como cumplida'),
  })

  return (
    <form
      className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3"
      onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha de cumplimiento</label>
          <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaCumplimiento} onChange={(e) => setFechaCumplimiento(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Evidencia (opcional)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="w-full text-xs" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-secondary">Comentario</label>
        <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Opcional" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>Cancelar</Button>
        <Button type="submit" size="sm" isLoading={mutation.isPending}>Confirmar cumplimiento</Button>
      </div>
    </form>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────
function HistorialCumplimientoSection({ obligacionId }: { obligacionId: number }) {
  const { data, isLoading } = useQuery({ queryKey: ['cumplimiento-historial', obligacionId], queryFn: () => cumplimientoNormativoService.listHistorial(obligacionId) })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <Clock className="h-3.5 w-3.5" /> Historial de cumplimientos
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="space-y-2">
          {data?.map((h) => (
            <li key={h.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">{new Date(h.fechaCumplimiento).toLocaleDateString()}</span>
                <span className="text-ink-tertiary">{h.usuarioNombre || 'Usuario'}</span>
              </div>
              {h.comentario && <p className="mt-1 text-xs text-ink-secondary">{h.comentario}</p>}
              <p className="mt-1 text-[11px] text-ink-tertiary">Fecha límite que cumplió: {new Date(h.fechaLimiteOriginal).toLocaleDateString()}</p>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin cumplimientos registrados aún.</p>}
        </ul>
      )}
    </div>
  )
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
function AdjuntosCumplimientoSection({ obligacionId, puedeGestionar }: { obligacionId: number; puedeGestionar: boolean }) {
  const queryClient = useQueryClient()
  const [tipoSubida, setTipoSubida] = useState<TipoAdjuntoCumplimiento>('evidencia')

  const { data, isLoading } = useQuery({ queryKey: ['cumplimiento-adjuntos', obligacionId], queryFn: () => cumplimientoNormativoService.listAdjuntos(obligacionId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cumplimiento-adjuntos', obligacionId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => cumplimientoNormativoService.subirAdjuntos(obligacionId, files, tipoSubida),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: () => toast.error('No se pudo subir el adjunto'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => cumplimientoNormativoService.eliminarAdjunto(id),
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
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Evidencias y documentos</h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = cumplimientoNormativoService.getUrlVerAdjunto(ad.id)
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
                  <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-ink-secondary">{ADJUNTO_LABEL[ad.tipo]}</span>
                  {puedeGestionar && (
                    <button onClick={() => eliminarMutation.mutate(ad.id)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100" title="Eliminar">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">{formatBytes(ad.tamanio)}</span>
                </div>
              )
            })}
            {(!data || data.length === 0) && <p className="col-span-full text-xs text-ink-tertiary">Sin documentos aún.</p>}
          </div>
          {puedeGestionar && (
            <div className="flex items-center gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={tipoSubida} onChange={(e) => setTipoSubida(e.target.value as TipoAdjuntoCumplimiento)}>
                {(Object.keys(ADJUNTO_LABEL) as TipoAdjuntoCumplimiento[]).map((t) => <option key={t} value={t}>{ADJUNTO_LABEL[t]}</option>)}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
                <Upload className="h-3.5 w-3.5" /> Subir documento
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal de detalle ─────────────────────────────────────────────────────
function ObligacionDetalleModal({ obligacion, onClose, onEditar, puedeEditar, puedeMarcarCumplida }: {
  obligacion: ObligacionCumplimiento | null
  onClose: () => void
  onEditar: () => void
  puedeEditar: boolean
  puedeMarcarCumplida: boolean
}) {
  const [mostrarMarcarCumplida, setMostrarMarcarCumplida] = useState(false)

  if (!obligacion) return null
  const cfgEstatus = ESTATUS_CONFIG[obligacion.estatusCalculado]
  const cfgRiesgo = NIVEL_RIESGO_CONFIG[obligacion.nivelRiesgo]

  return (
    <Modal isOpen={!!obligacion} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="chip bg-blue-50 text-blue-700">{CATEGORIA_LABEL[obligacion.categoria]}</span>
            <h2 className="mt-1 text-base font-bold text-ink">{obligacion.nombre}</h2>
            {obligacion.autoridad && <p className="mt-0.5 text-xs text-ink-tertiary">{obligacion.autoridad}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfgEstatus.cls)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', cfgEstatus.dot)} /> {cfgEstatus.label}
          </span>
          <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', cfgRiesgo.cls)}>Riesgo: {cfgRiesgo.label}</span>
          <span className="chip bg-gray-100 text-gray-600">{FRECUENCIA_LABEL[obligacion.frecuencia]}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable</p>
            <p className="mt-0.5 text-ink">{obligacion.responsableNombre || '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha límite</p>
            <p className={clsx('mt-0.5', obligacion.estatusCalculado === 'vencida' ? 'font-semibold text-red-600' : 'text-ink')}>
              {new Date(obligacion.fechaLimite).toLocaleDateString()}
            </p>
          </div>
          {obligacion.baseLegal && (
            <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Base legal</p>
              <p className="mt-0.5 text-ink">{obligacion.baseLegal}</p>
            </div>
          )}
          {obligacion.descripcion && (
            <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Descripción</p>
              <p className="mt-0.5 text-ink">{obligacion.descripcion}</p>
            </div>
          )}
          {obligacion.consecuenciaIncumplimiento && (
            <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-700"><AlertTriangle className="h-3 w-3" /> Consecuencia de incumplimiento</p>
              <p className="mt-0.5 text-ink">{obligacion.consecuenciaIncumplimiento}</p>
            </div>
          )}
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
            <Button size="sm" onClick={onEditar}>Editar obligación</Button>
            {puedeMarcarCumplida && !mostrarMarcarCumplida && (
              <Button size="sm" variant="secondary" onClick={() => setMostrarMarcarCumplida(true)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como cumplida
              </Button>
            )}
          </div>
        )}

        {mostrarMarcarCumplida && (
          <MarcarCumplidaForm obligacionId={obligacion.id} onDone={() => setMostrarMarcarCumplida(false)} />
        )}

        <HistorialCumplimientoSection obligacionId={obligacion.id} />
        <AdjuntosCumplimientoSection obligacionId={obligacion.id} puedeGestionar={puedeEditar} />
      </div>
    </Modal>
  )
}

// ── Tabla ─────────────────────────────────────────────────────────────────
function TablaObligaciones({ obligaciones, onSelect, onEliminar, puedeEliminar }: {
  obligaciones: ObligacionCumplimiento[]
  onSelect: (o: ObligacionCumplimiento) => void
  onEliminar: (id: number) => void
  puedeEliminar: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-ink-tertiary">
          <tr>
            <th className="px-4 py-2 font-semibold">Obligación</th>
            <th className="px-4 py-2 font-semibold">Categoría</th>
            <th className="px-4 py-2 font-semibold">Responsable</th>
            <th className="px-4 py-2 font-semibold">Frecuencia</th>
            <th className="px-4 py-2 font-semibold">Fecha límite</th>
            <th className="px-4 py-2 font-semibold">Estatus</th>
            <th className="px-4 py-2 font-semibold">Riesgo</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {obligaciones.map((o) => {
            const cfgEstatus = ESTATUS_CONFIG[o.estatusCalculado]
            const cfgRiesgo = NIVEL_RIESGO_CONFIG[o.nivelRiesgo]
            return (
              <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onSelect(o)}>
                <td className="px-4 py-2.5"><p className="font-medium text-ink">{o.nombre}</p></td>
                <td className="px-4 py-2.5"><span className="chip bg-blue-50 text-blue-700">{CATEGORIA_LABEL[o.categoria]}</span></td>
                <td className="px-4 py-2.5 text-ink-tertiary">{o.responsableNombre || '—'}</td>
                <td className="px-4 py-2.5 text-ink-tertiary">{FRECUENCIA_LABEL[o.frecuencia]}</td>
                <td className={clsx('px-4 py-2.5', o.estatusCalculado === 'vencida' ? 'font-semibold text-red-600' : 'text-ink-tertiary')}>
                  {new Date(o.fechaLimite).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5">
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfgEstatus.cls)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', cfgEstatus.dot)} /> {cfgEstatus.label}
                  </span>
                </td>
                <td className="px-4 py-2.5"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold', cfgRiesgo.cls)}>{cfgRiesgo.label}</span></td>
                <td className="px-4 py-2.5">
                  {puedeEliminar && (
                    <button onClick={(e) => { e.stopPropagation(); onEliminar(o.id) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {obligaciones.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-tertiary">No hay obligaciones registradas.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function CumplimientoNormativoPage() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [obligacionActivaId, setObligacionActivaId] = useState<number | null>(null)
  const [obligacionEditandoId, setObligacionEditandoId] = useState<number | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaCumplimiento | ''>('')
  const [filtroFrecuencia, setFiltroFrecuencia] = useState<FrecuenciaCumplimiento | ''>('')
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusCumplimiento | ''>('')
  const [filtroRiesgo, setFiltroRiesgo] = useState<NivelRiesgoCumplimiento | ''>('')
  const [busqueda, setBusqueda] = useState('')
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const queryClient = useQueryClient()
  const { can } = useActionAccess()

  const puedeCrear = can('legal', 'obligacion-crear')
  const puedeEditar = can('legal', 'obligacion-editar')
  const puedeEliminar = can('legal', 'obligacion-eliminar')
  const puedeMarcarCumplida = can('legal', 'obligacion-marcar-cumplida')
  const puedeExportar = can('legal', 'obligacion-exportar')

  const { data: resumen } = useQuery({ queryKey: ['cumplimiento-resumen'], queryFn: () => cumplimientoNormativoService.getResumen(), staleTime: 30_000 })
  const { data, isLoading } = useQuery({ queryKey: ['cumplimiento-obligaciones'], queryFn: () => cumplimientoNormativoService.listObligaciones(), staleTime: 30_000 })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => cumplimientoNormativoService.eliminarObligacion(id),
    onSuccess: () => {
      toast.success('Obligación eliminada')
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-obligaciones'] })
      queryClient.invalidateQueries({ queryKey: ['cumplimiento-resumen'] })
    },
    onError: () => toast.error('No se pudo eliminar la obligación'),
  })

  const obligacionesFiltradas = useMemo(() => {
    return (data || []).filter((o) => {
      if (filtroCategoria && o.categoria !== filtroCategoria) return false
      if (filtroFrecuencia && o.frecuencia !== filtroFrecuencia) return false
      if (filtroEstatus && o.estatusCalculado !== filtroEstatus) return false
      if (filtroRiesgo && o.nivelRiesgo !== filtroRiesgo) return false
      if (busqueda && !o.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
  }, [data, filtroCategoria, filtroFrecuencia, filtroEstatus, filtroRiesgo, busqueda])

  const obligacionActiva = (data || []).find((o) => o.id === obligacionActivaId) || null
  const obligacionEditando = (data || []).find((o) => o.id === obligacionEditandoId) || null

  const stats: DashboardStat[] = resumen ? [
    { key: 'total', icon: ShieldAlert, label: 'Total obligaciones', value: resumen.total, tone: 'brand' },
    { key: 'pendientes', icon: Clock, label: 'Pendientes', value: resumen.pendientes, tone: 'brand' },
    { key: 'vencidas', icon: AlertTriangle, label: 'Vencidas', value: resumen.vencidas, tone: 'critical' },
    { key: 'cumplidas', icon: CheckCircle2, label: 'Cumplidas', value: resumen.cumplidas, tone: 'success' },
    { key: 'alto-riesgo', icon: AlertTriangle, label: 'Alto riesgo', value: resumen.altoRiesgo, tone: 'warn' },
  ] : []

  const hayFiltrosActivos = !!filtroCategoria || !!filtroFrecuencia || !!filtroEstatus || !!filtroRiesgo || !!busqueda

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await cumplimientoNormativoService.exportarPdf()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'cumplimiento_normativo.pdf'
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
    if (obligacionesFiltradas.length === 0) {
      toast.error('No hay obligaciones para exportar')
      return
    }
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Obligación', 'Categoría', 'Autoridad', 'Responsable', 'Base legal', 'Frecuencia', 'Fecha límite', 'Estatus', 'Nivel de riesgo'],
      ...obligacionesFiltradas.map((o) => [
        o.nombre, CATEGORIA_LABEL[o.categoria], o.autoridad || '', o.responsableNombre || '', o.baseLegal || '',
        FRECUENCIA_LABEL[o.frecuencia], new Date(o.fechaLimite).toLocaleDateString(), ESTATUS_CONFIG[o.estatusCalculado].label,
        NIVEL_RIESGO_CONFIG[o.nivelRiesgo].label,
      ]),
    ])
    sheet['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Cumplimiento')
    XLSX.writeFile(wb, 'cumplimiento_normativo.xlsx')
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Cumplimiento normativo</h1>
            <p className="text-xs text-blue-200/70">Obligaciones, plazos y evidencias de cumplimiento</p>
          </div>
        </div>
      </div>

      {resumen && <DashboardStatRow stats={stats} />}

      <IntegracionRatCard />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Obligaciones normativas</h2>
        <div className="flex items-center gap-2">
          {puedeExportar && (
            <>
              <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
                <FileDown className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={() => setNuevoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva obligación
            </Button>
          )}
        </div>
      </div>

      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3">
          <input
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            placeholder="Buscar por nombre..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value as CategoriaCumplimiento | '')}>
            <option value="">Todas las categorías</option>
            {(Object.keys(CATEGORIA_LABEL) as CategoriaCumplimiento[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroFrecuencia} onChange={(e) => setFiltroFrecuencia(e.target.value as FrecuenciaCumplimiento | '')}>
            <option value="">Todas las frecuencias</option>
            {(Object.keys(FRECUENCIA_LABEL) as FrecuenciaCumplimiento[]).map((f) => <option key={f} value={f}>{FRECUENCIA_LABEL[f]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as EstatusCumplimiento | '')}>
            <option value="">Todos los estatus</option>
            {(Object.keys(ESTATUS_CONFIG) as EstatusCumplimiento[]).map((s) => <option key={s} value={s}>{ESTATUS_CONFIG[s].label}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroRiesgo} onChange={(e) => setFiltroRiesgo(e.target.value as NivelRiesgoCumplimiento | '')}>
            <option value="">Todos los riesgos</option>
            {(Object.keys(NIVEL_RIESGO_CONFIG) as NivelRiesgoCumplimiento[]).map((n) => <option key={n} value={n}>{NIVEL_RIESGO_CONFIG[n].label}</option>)}
          </select>
          {hayFiltrosActivos && (
            <button onClick={() => { setFiltroCategoria(''); setFiltroFrecuencia(''); setFiltroEstatus(''); setFiltroRiesgo(''); setBusqueda('') }} className="ml-auto text-[11px] font-semibold text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay obligaciones normativas registradas.</p>
        </div>
      ) : (
        <TablaObligaciones
          obligaciones={obligacionesFiltradas}
          onSelect={(o) => setObligacionActivaId(o.id)}
          onEliminar={(id) => eliminarMutation.mutate(id)}
          puedeEliminar={puedeEliminar}
        />
      )}

      {puedeCrear && <ObligacionFormModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} obligacion={null} />}
      {puedeEditar && <ObligacionFormModal isOpen={!!obligacionEditando} onClose={() => setObligacionEditandoId(null)} obligacion={obligacionEditando} />}
      <ObligacionDetalleModal
        obligacion={obligacionActiva}
        onClose={() => setObligacionActivaId(null)}
        onEditar={() => { setObligacionEditandoId(obligacionActiva!.id); setObligacionActivaId(null) }}
        puedeEditar={puedeEditar}
        puedeMarcarCumplida={puedeMarcarCumplida}
      />
    </div>
  )
}
