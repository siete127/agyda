import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileSignature, Plus, Trash2, X, FileText, Upload, RotateCcw, Ban, Clock,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  contratosService,
  type Contrato,
  type TipoContrato,
  type EstatusContrato,
  type TipoAdjuntoContrato,
} from '@/services/contratos.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { useAuthStore } from '@/stores/auth.store'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const TIPO_LABEL: Record<TipoContrato, string> = {
  arrendamiento: 'Arrendamiento', servicios: 'Prestación de servicios', confidencialidad: 'Confidencialidad (NDA)',
  laboral: 'Laboral', proveedor: 'Proveedor', otro: 'Otro',
}

const ESTATUS_CONFIG: Record<EstatusContrato, { label: string; cls: string; dot: string }> = {
  vigente: { label: 'Vigente', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  por_vencer: { label: 'Por vencer', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  renovado: { label: 'Renovado', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

const ADJUNTO_LABEL: Record<TipoAdjuntoContrato, string> = { firmado: 'Firmado', anexo: 'Anexo', addendum: 'Addendum' }
const ADMIN_ROLES = ['ADMINISTRADOR', 'ADMIN', 'AD', 'ADM']

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMoney(monto: number | null, moneda: string | null) {
  if (monto == null) return '—'
  return `${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${moneda || ''}`.trim()
}

// ── Nuevo contrato ────────────────────────────────────────────────────────
function NuevoContratoModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoContrato>('servicios')
  const [contraparte, setContraparte] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')
  const [renovacionAutomatica, setRenovacionAutomatica] = useState(false)
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('MXN')
  const [responsableId, setResponsableId] = useState('')

  const reset = () => {
    setTitulo(''); setTipo('servicios'); setContraparte(''); setFechaInicio(''); setFechaVencimiento('')
    setRenovacionAutomatica(false); setMonto(''); setMoneda('MXN'); setResponsableId('')
  }

  const mutation = useMutation({
    mutationFn: () => contratosService.crearContrato({
      titulo, tipo, contraparte: contraparte || undefined, fechaInicio: fechaInicio || undefined,
      fechaVencimiento: fechaVencimiento || undefined, renovacionAutomatica, monto: monto ? Number(monto) : undefined,
      moneda: moneda || undefined, responsableId: responsableId ? Number(responsableId) : undefined,
    }),
    onSuccess: () => {
      toast.success('Contrato creado')
      queryClient.invalidateQueries({ queryKey: ['contratos'] })
      queryClient.invalidateQueries({ queryKey: ['contratos-resumen'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear el contrato'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo contrato" variant="corporate" size="lg">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!titulo.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Contrato de arrendamiento de oficina" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoContrato)}>
              {(Object.keys(TIPO_LABEL) as TipoContrato[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Contraparte</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={contraparte} onChange={(e) => setContraparte(e.target.value)} placeholder="Nombre de la otra parte" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha de inicio</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha de vencimiento</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Monto</label>
            <input type="number" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Moneda</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={moneda} onChange={(e) => setMoneda(e.target.value)} placeholder="MXN" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input type="checkbox" checked={renovacionAutomatica} onChange={(e) => setRenovacionAutomatica(e.target.checked)} />
          Renovación automática
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear contrato</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Adjuntos ─────────────────────────────────────────────────────────────
function AdjuntosSection({ contratoId, esAdmin }: { contratoId: number; esAdmin: boolean }) {
  const queryClient = useQueryClient()
  const [tipoSubida, setTipoSubida] = useState<TipoAdjuntoContrato>('firmado')

  const { data, isLoading } = useQuery({ queryKey: ['contrato-adjuntos', contratoId], queryFn: () => contratosService.listAdjuntos(contratoId) })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['contrato-adjuntos', contratoId] })

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => contratosService.subirAdjuntos(contratoId, files, tipoSubida),
    onSuccess: () => { toast.success('Adjunto subido'); invalidate() },
    onError: () => toast.error('No se pudo subir el adjunto'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => contratosService.eliminarAdjunto(id),
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
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Documentos del contrato</h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ad) => {
              const esImagen = ad.mime?.startsWith('image/')
              const url = contratosService.getUrlVerAdjunto(ad.id)
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
                  {esAdmin && (
                    <button
                      onClick={() => eliminarMutation.mutate(ad.id)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">{formatBytes(ad.tamanio)}</span>
                </div>
              )
            })}
            {(!data || data.length === 0) && <p className="col-span-full text-xs text-ink-tertiary">Sin documentos aún.</p>}
          </div>
          {esAdmin && (
            <div className="flex items-center gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={tipoSubida} onChange={(e) => setTipoSubida(e.target.value as TipoAdjuntoContrato)}>
                {(Object.keys(ADJUNTO_LABEL) as TipoAdjuntoContrato[]).map((t) => <option key={t} value={t}>{ADJUNTO_LABEL[t]}</option>)}
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

// ── Modal de detalle ──────────────────────────────────────────────────────
function ContratoDetalleModal({ contrato, esAdmin, onClose }: { contrato: Contrato | null; esAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [nuevaFecha, setNuevaFecha] = useState('')
  const [mostrarRenovar, setMostrarRenovar] = useState(false)

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['contratos'] })
    queryClient.invalidateQueries({ queryKey: ['contratos-resumen'] })
  }

  const renovarMutation = useMutation({
    mutationFn: () => contratosService.marcarRenovado(contrato!.id, nuevaFecha),
    onSuccess: () => { toast.success('Contrato renovado'); invalidateAll(); setMostrarRenovar(false); setNuevaFecha('') },
    onError: () => toast.error('No se pudo renovar el contrato'),
  })

  const cancelarMutation = useMutation({
    mutationFn: () => contratosService.cancelarContrato(contrato!.id),
    onSuccess: () => { toast.success('Contrato cancelado'); invalidateAll(); onClose() },
    onError: () => toast.error('No se pudo cancelar el contrato'),
  })

  if (!contrato) return null
  const cfg = ESTATUS_CONFIG[contrato.estatus]
  const puedeGestionar = esAdmin && !['cancelado'].includes(contrato.estatus)

  return (
    <Modal isOpen={!!contrato} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="chip bg-blue-50 text-blue-700">{TIPO_LABEL[contrato.tipo]}</span>
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
              </span>
            </div>
            <h2 className="text-base font-bold text-ink">{contrato.titulo}</h2>
            {contrato.contraparte && <p className="mt-1 text-sm text-ink-tertiary">{contrato.contraparte}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha de inicio</p>
            <p className="mt-0.5 text-ink">{contrato.fechaInicio ? new Date(contrato.fechaInicio).toLocaleDateString() : '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha de vencimiento</p>
            <p className={clsx('mt-0.5', contrato.estatus === 'vencido' ? 'font-semibold text-red-600' : 'text-ink')}>
              {contrato.fechaVencimiento ? new Date(contrato.fechaVencimiento).toLocaleDateString() : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Monto</p>
            <p className="mt-0.5 text-ink">{formatMoney(contrato.monto, contrato.moneda)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable</p>
            <p className="mt-0.5 text-ink">{contrato.responsableNombre || '—'}</p>
          </div>
        </div>

        {contrato.renovacionAutomatica && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-tertiary"><RotateCcw className="h-3 w-3" /> Renovación automática habilitada</p>
        )}
        {contrato.notas && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Notas</p>
            <p className="mt-0.5 text-xs text-ink">{contrato.notas}</p>
          </div>
        )}

        {puedeGestionar && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 p-3">
            {!mostrarRenovar && (
              <>
                <Button size="sm" onClick={() => setMostrarRenovar(true)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Marcar como renovado
                </Button>
                <Button size="sm" variant="secondary" onClick={() => cancelarMutation.mutate()} isLoading={cancelarMutation.isPending}>
                  <Ban className="h-3.5 w-3.5" /> Cancelar contrato
                </Button>
              </>
            )}
          </div>
        )}

        {mostrarRenovar && (
          <form
            className="space-y-2 rounded-lg border border-gray-100 p-3"
            onSubmit={(e) => { e.preventDefault(); if (!nuevaFecha) return; renovarMutation.mutate() }}
          >
            <label className="block text-xs font-semibold text-ink-secondary">Nueva fecha de vencimiento</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} required />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setMostrarRenovar(false)}>Cancelar</Button>
              <Button type="submit" size="sm" isLoading={renovarMutation.isPending}>Confirmar renovación</Button>
            </div>
          </form>
        )}

        <AdjuntosSection contratoId={contrato.id} esAdmin={esAdmin} />
      </div>
    </Modal>
  )
}

// ── Tarjeta compacta ──────────────────────────────────────────────────────
function ContratoCard({ contrato, esAdmin, onClick, onEliminar }: { contrato: Contrato; esAdmin: boolean; onClick: () => void; onEliminar: () => void }) {
  const cfg = ESTATUS_CONFIG[contrato.estatus]
  return (
    <button onClick={onClick} className="group relative flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      {esAdmin && (
        <span
          onClick={(e) => { e.stopPropagation(); onEliminar() }}
          role="button"
          title="Eliminar contrato"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="mb-1 inline-flex w-fit chip bg-blue-50 text-blue-700">{TIPO_LABEL[contrato.tipo]}</span>
      <h3 className="pr-6 text-sm font-semibold text-ink">{contrato.titulo}</h3>
      {contrato.contraparte && <p className="mt-0.5 line-clamp-1 text-xs text-ink-tertiary">{contrato.contraparte}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
      </span>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {contrato.fechaVencimiento ? new Date(contrato.fechaVencimiento).toLocaleDateString() : 'Sin fecha'}</span>
        <span>{formatMoney(contrato.monto, contrato.moneda)}</span>
      </div>
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function ContratosPage() {
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [contratoActivoId, setContratoActivoId] = useState<number | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<TipoContrato | ''>('')
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusContrato | ''>('')
  const queryClient = useQueryClient()

  const rol = useAuthStore((s) => s.user?.tipoUsuario?.toUpperCase() ?? '')
  const esAdmin = ADMIN_ROLES.includes(rol)

  const { data: resumen } = useQuery({ queryKey: ['contratos-resumen'], queryFn: () => contratosService.getResumen(), staleTime: 30_000 })
  const { data, isLoading } = useQuery({ queryKey: ['contratos'], queryFn: () => contratosService.listContratos(), staleTime: 30_000 })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => contratosService.eliminarContrato(id),
    onSuccess: () => {
      toast.success('Contrato eliminado')
      queryClient.invalidateQueries({ queryKey: ['contratos'] })
      queryClient.invalidateQueries({ queryKey: ['contratos-resumen'] })
    },
    onError: () => toast.error('No se pudo eliminar el contrato'),
  })

  const contratosFiltrados = useMemo(() => {
    return (data || []).filter((c) => {
      if (filtroTipo && c.tipo !== filtroTipo) return false
      if (filtroEstatus && c.estatus !== filtroEstatus) return false
      return true
    })
  }, [data, filtroTipo, filtroEstatus])

  const contratoActivo = (data || []).find((c) => c.id === contratoActivoId) || null

  const stats: DashboardStat[] = resumen ? [
    { key: 'vigentes', icon: FileSignature, label: 'Vigentes', value: resumen.vigentes, tone: 'success' },
    { key: 'por-vencer', icon: Clock, label: 'Por vencer', value: resumen.porVencer, tone: 'warn' },
    { key: 'vencidos', icon: Ban, label: 'Vencidos', value: resumen.vencidos, tone: 'critical' },
    { key: 'activos', icon: FileText, label: 'Contratos activos', value: resumen.activos, tone: 'brand' },
  ] : []

  const hayFiltrosActivos = !!filtroTipo || !!filtroEstatus

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <FileSignature className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Contratos</h1>
            <p className="text-xs text-blue-200/70">Vigencia, renovación y documentos firmados</p>
          </div>
        </div>
      </div>

      {resumen && <DashboardStatRow stats={stats} />}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Contratos</h2>
        {esAdmin && (
          <Button size="sm" onClick={() => setNuevoOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo contrato
          </Button>
        )}
      </div>

      {data && data.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3">
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoContrato | '')}>
            <option value="">Todos los tipos</option>
            {(Object.keys(TIPO_LABEL) as TipoContrato[]).map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
          <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as EstatusContrato | '')}>
            <option value="">Todos los estatus</option>
            {(Object.keys(ESTATUS_CONFIG) as EstatusContrato[]).map((s) => <option key={s} value={s}>{ESTATUS_CONFIG[s].label}</option>)}
          </select>
          {hayFiltrosActivos && (
            <button onClick={() => { setFiltroTipo(''); setFiltroEstatus('') }} className="ml-auto text-[11px] font-semibold text-brand hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay contratos registrados.</p>
        </div>
      ) : contratosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-ink-tertiary">Ningún contrato coincide con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {contratosFiltrados.map((c) => (
            <ContratoCard key={c.id} contrato={c} esAdmin={esAdmin} onClick={() => setContratoActivoId(c.id)} onEliminar={() => eliminarMutation.mutate(c.id)} />
          ))}
        </div>
      )}

      {esAdmin && <NuevoContratoModal isOpen={nuevoOpen} onClose={() => setNuevoOpen(false)} />}
      <ContratoDetalleModal contrato={contratoActivo} esAdmin={esAdmin} onClose={() => setContratoActivoId(null)} />
    </div>
  )
}
