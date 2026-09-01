import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Megaphone, Plus, Trash2, X, Wallet, TrendingUp, Target, DollarSign, Image as ImageIcon, Upload,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  publicidadService,
  type CampaniaPublicidad,
  type AnuncioPublicidad,
  type Plataforma,
  type EstatusCampaniaPublicidad,
  type EstatusAnuncio,
} from '@/services/publicidad.service'
import { marketingService } from '@/services/marketing.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { EnConstruccion } from '@/components/ui/EnConstruccion'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  google_ads: 'Google Ads', meta_ads: 'Meta Ads', tiktok_ads: 'TikTok Ads', linkedin_ads: 'LinkedIn Ads', otro: 'Otro',
}

const PLATAFORMA_COLOR: Record<Plataforma, string> = {
  google_ads: 'bg-blue-50 text-blue-700', meta_ads: 'bg-indigo-50 text-indigo-700', tiktok_ads: 'bg-purple-50 text-purple-700',
  linkedin_ads: 'bg-sky-50 text-sky-700', otro: 'bg-gray-100 text-gray-600',
}

const ESTATUS_CAMPANIA_CONFIG: Record<EstatusCampaniaPublicidad, { label: string; cls: string; dot: string }> = {
  planeada: { label: 'Planeada', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  activa: { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  pausada: { label: 'Pausada', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  finalizada: { label: 'Finalizada', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
}

const ESTATUS_ANUNCIO_LABEL: Record<EstatusAnuncio, string> = { activo: 'Activo', pausado: 'Pausado', finalizado: 'Finalizado' }

function formatMoney(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

// ── Nueva campaña ─────────────────────────────────────────────────────────
function NuevaCampaniaModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const { data: campanias } = useQuery({ queryKey: ['marketing-campanias'], queryFn: () => marketingService.getCampanias() })

  const [nombre, setNombre] = useState('')
  const [plataforma, setPlataforma] = useState<Plataforma>('google_ads')
  const [objetivo, setObjetivo] = useState('')
  const [presupuesto, setPresupuesto] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [campaniaId, setCampaniaId] = useState('')

  const reset = () => {
    setNombre(''); setPlataforma('google_ads'); setObjetivo(''); setPresupuesto('')
    setFechaInicio(''); setFechaFin(''); setResponsableId(''); setCampaniaId('')
  }

  const mutation = useMutation({
    mutationFn: () => publicidadService.crearCampania({
      nombre, plataforma, objetivo: objetivo || undefined, presupuesto: presupuesto ? Number(presupuesto) : undefined,
      fechaInicio: fechaInicio || undefined, fechaFin: fechaFin || undefined,
      responsableId: responsableId ? Number(responsableId) : undefined, campaniaId: campaniaId ? Number(campaniaId) : undefined,
    }),
    onSuccess: () => {
      toast.success('Campaña publicitaria creada')
      queryClient.invalidateQueries({ queryKey: ['publicidad-campanias'] })
      queryClient.invalidateQueries({ queryKey: ['publicidad-dashboard'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear la campaña'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva campaña publicitaria" variant="corporate" size="lg">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!nombre.trim()) return; mutation.mutate() }}>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nombre</label>
          <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Campaña de tráfico Q3" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Plataforma</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma)}>
              {(Object.keys(PLATAFORMA_LABEL) as Plataforma[]).map((p) => <option key={p} value={p}>{PLATAFORMA_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Objetivo</label>
            <input className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Ej. Tráfico, conversiones" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Presupuesto</label>
            <input type="number" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Campaña de marketing (opcional)</label>
            <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={campaniaId} onChange={(e) => setCampaniaId(e.target.value)}>
              <option value="">Sin vincular</option>
              {campanias?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha inicio</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Fecha fin</label>
            <input type="date" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable</label>
          <select className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
            <option value="">Sin asignar</option>
            {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear campaña</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Métricas de anuncio ───────────────────────────────────────────────────
function MetricasAnuncioSection({ anuncioId }: { anuncioId: number }) {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['publicidad-metricas', anuncioId], queryFn: () => publicidadService.getMetricas(anuncioId) })
  const [impresiones, setImpresiones] = useState('')
  const [clics, setClics] = useState('')
  const [conversiones, setConversiones] = useState('')
  const [gasto, setGasto] = useState('')

  const mutation = useMutation({
    mutationFn: () => publicidadService.guardarMetricas(anuncioId, {
      impresiones: impresiones ? Number(impresiones) : undefined,
      clics: clics ? Number(clics) : undefined,
      conversiones: conversiones ? Number(conversiones) : undefined,
      gasto: gasto ? Number(gasto) : undefined,
    }),
    onSuccess: () => {
      toast.success('Métricas guardadas')
      queryClient.invalidateQueries({ queryKey: ['publicidad-metricas', anuncioId] })
      queryClient.invalidateQueries({ queryKey: ['publicidad-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['publicidad-campanias'] })
    },
    onError: () => toast.error('No se pudieron guardar las métricas'),
  })

  const impresionesVal = Number(impresiones || data?.impresiones || 0)
  const clicsVal = Number(clics || data?.clics || 0)
  const gastoVal = Number(gasto || data?.gasto || 0)
  const ctr = impresionesVal > 0 ? ((clicsVal / impresionesVal) * 100).toFixed(2) : '—'
  const cpc = clicsVal > 0 ? formatMoney(gastoVal / clicsVal) : '—'

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-tertiary">
        <TrendingUp className="h-3.5 w-3.5" /> Métricas
      </h4>
      <form className="grid grid-cols-4 gap-2" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Impresiones" defaultValue={data?.impresiones ?? ''} onChange={(e) => setImpresiones(e.target.value)} />
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Clics" defaultValue={data?.clics ?? ''} onChange={(e) => setClics(e.target.value)} />
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Conversiones" defaultValue={data?.conversiones ?? ''} onChange={(e) => setConversiones(e.target.value)} />
        <input type="number" className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" placeholder="Gasto" defaultValue={data?.gasto ?? ''} onChange={(e) => setGasto(e.target.value)} />
        <div className="col-span-4 flex items-center justify-between">
          <span className="text-[11px] text-ink-tertiary">CTR: {ctr}{ctr !== '—' && '%'} · CPC: {cpc}</span>
          <Button type="submit" size="sm" isLoading={mutation.isPending}>Guardar métricas</Button>
        </div>
      </form>
    </div>
  )
}

// ── Anuncio individual ────────────────────────────────────────────────────
function AnuncioItem({ anuncio, onDelete }: { anuncio: AnuncioPublicidad; onDelete: () => void }) {
  const queryClient = useQueryClient()
  const [expandido, setExpandido] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['publicidad-anuncios', anuncio.campaniaId] })

  const actualizarMutation = useMutation({
    mutationFn: (estatus: EstatusAnuncio) => publicidadService.actualizarAnuncio(anuncio.id, { titulo: anuncio.titulo, copy: anuncio.copy || undefined, presupuesto: anuncio.presupuesto || undefined, estatus }),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo actualizar el anuncio'),
  })

  const subirImagenMutation = useMutation({
    mutationFn: (file: File) => publicidadService.subirImagenAnuncio(anuncio.id, file),
    onSuccess: () => { toast.success('Imagen subida'); invalidate() },
    onError: () => toast.error('No se pudo subir la imagen'),
  })

  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/webp'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) subirImagenMutation.mutate(file)
    }
    input.click()
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50">
      <button onClick={() => setExpandido((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        {anuncio.imagenArchivo ? (
          <img src={publicidadService.getUrlVerImagen(anuncio.id)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-gray-300"><ImageIcon className="h-4 w-4" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{anuncio.titulo}</p>
          <p className="text-[11px] text-ink-tertiary">{ESTATUS_ANUNCIO_LABEL[anuncio.estatus]}{anuncio.presupuesto ? ` · ${formatMoney(anuncio.presupuesto)}` : ''}</p>
        </div>
        <span onClick={(e) => { e.stopPropagation(); onDelete() }} role="button" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      </button>
      {expandido && (
        <div className="space-y-3 border-t border-gray-200 p-3">
          {anuncio.copy && <p className="text-xs text-ink-secondary">{anuncio.copy}</p>}
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              value={anuncio.estatus}
              onChange={(e) => actualizarMutation.mutate(e.target.value as EstatusAnuncio)}
            >
              {(Object.keys(ESTATUS_ANUNCIO_LABEL) as EstatusAnuncio[]).map((s) => <option key={s} value={s}>{ESTATUS_ANUNCIO_LABEL[s]}</option>)}
            </select>
            <Button type="button" variant="secondary" size="sm" onClick={pickFile} isLoading={subirImagenMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> {anuncio.imagenArchivo ? 'Reemplazar imagen' : 'Subir imagen'}
            </Button>
          </div>
          <MetricasAnuncioSection anuncioId={anuncio.id} />
        </div>
      )}
    </div>
  )
}

function NuevoAnuncioForm({ campaniaId, onDone }: { campaniaId: number; onDone: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [copy, setCopy] = useState('')
  const [presupuesto, setPresupuesto] = useState('')

  const mutation = useMutation({
    mutationFn: () => publicidadService.crearAnuncio(campaniaId, { titulo, copy: copy || undefined, presupuesto: presupuesto ? Number(presupuesto) : undefined }),
    onSuccess: () => { onDone(); setTitulo(''); setCopy(''); setPresupuesto('') },
    onError: () => toast.error('No se pudo crear el anuncio'),
  })

  return (
    <form className="space-y-2 rounded-lg border border-gray-100 p-3" onSubmit={(e) => { e.preventDefault(); if (!titulo.trim()) return; mutation.mutate() }}>
      <input className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título del anuncio" />
      <textarea className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" rows={2} value={copy} onChange={(e) => setCopy(e.target.value)} placeholder="Copy / texto del anuncio (opcional)" />
      <input type="number" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="Presupuesto (opcional)" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={mutation.isPending}>Agregar anuncio</Button>
      </div>
    </form>
  )
}

// ── Modal de detalle de campaña ────────────────────────────────────────────
function CampaniaDetalleModal({ campania, onClose }: { campania: CampaniaPublicidad | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)

  const { data: anuncios, isLoading } = useQuery({
    queryKey: ['publicidad-anuncios', campania?.id],
    queryFn: () => publicidadService.listAnuncios(campania!.id),
    enabled: !!campania,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['publicidad-anuncios', campania?.id] })
    queryClient.invalidateQueries({ queryKey: ['publicidad-campanias'] })
    queryClient.invalidateQueries({ queryKey: ['publicidad-dashboard'] })
  }

  const eliminarAnuncioMutation = useMutation({
    mutationFn: (id: number) => publicidadService.eliminarAnuncio(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el anuncio'),
  })

  if (!campania) return null
  const cfg = ESTATUS_CAMPANIA_CONFIG[campania.estatus]

  return (
    <Modal isOpen={!!campania} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className={clsx('chip', PLATAFORMA_COLOR[campania.plataforma])}>{PLATAFORMA_LABEL[campania.plataforma]}</span>
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
                <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
              </span>
            </div>
            <h2 className="text-base font-bold text-ink">{campania.nombre}</h2>
            {campania.objetivo && <p className="mt-1 text-sm text-ink-tertiary">{campania.objetivo}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Presupuesto</p>
            <p className="mt-0.5 text-ink">{campania.presupuesto ? formatMoney(campania.presupuesto) : '—'}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Gasto real</p>
            <p className="mt-0.5 text-ink">{formatMoney(campania.gastoTotal)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Responsable</p>
            <p className="mt-0.5 text-ink">{campania.responsableNombre || '—'}</p>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Anuncios</h3>
          {isLoading ? (
            <p className="text-xs text-ink-tertiary">Cargando...</p>
          ) : (
            <div className="mb-2 space-y-2">
              {anuncios?.map((a) => (
                <AnuncioItem key={a.id} anuncio={a} onDelete={() => eliminarAnuncioMutation.mutate(a.id)} />
              ))}
              {(!anuncios || anuncios.length === 0) && <p className="text-xs text-ink-tertiary">Sin anuncios registrados aún.</p>}
            </div>
          )}
          {mostrarForm ? (
            <NuevoAnuncioForm campaniaId={campania.id} onDone={() => { invalidate(); setMostrarForm(false) }} />
          ) : (
            <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
              <Plus className="h-3.5 w-3.5" /> Agregar anuncio
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── Tarjeta de campaña ─────────────────────────────────────────────────────
function CampaniaCard({ campania, onClick, onEliminar }: { campania: CampaniaPublicidad; onClick: () => void; onEliminar: () => void }) {
  const cfg = ESTATUS_CAMPANIA_CONFIG[campania.estatus]
  return (
    <button onClick={onClick} className="group relative flex h-full flex-col rounded-2xl border border-gray-100 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <span
        onClick={(e) => { e.stopPropagation(); onEliminar() }}
        role="button"
        title="Eliminar campaña"
        className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </span>

      <span className={clsx('mb-1 inline-flex w-fit chip', PLATAFORMA_COLOR[campania.plataforma])}>{PLATAFORMA_LABEL[campania.plataforma]}</span>
      <h3 className="pr-6 text-sm font-semibold text-ink">{campania.nombre}</h3>
      {campania.objetivo && <p className="mt-0.5 line-clamp-1 text-xs text-ink-tertiary">{campania.objetivo}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
      </span>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span>{campania.anunciosTotal} anuncio{campania.anunciosTotal !== 1 ? 's' : ''}</span>
        <span>{campania.presupuesto ? formatMoney(campania.presupuesto) : 'Sin presupuesto'}</span>
      </div>
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function PublicidadPage() {
  return <EnConstruccion titulo="Publicidad" subtitulo="Campañas y anuncios pagados" />
}

function PublicidadPageContent() {
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [campaniaActivaId, setCampaniaActivaId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: dashboard } = useQuery({ queryKey: ['publicidad-dashboard'], queryFn: () => publicidadService.getDashboard(), staleTime: 30_000 })
  const { data, isLoading } = useQuery({ queryKey: ['publicidad-campanias'], queryFn: () => publicidadService.listCampanias(), staleTime: 30_000 })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => publicidadService.eliminarCampania(id),
    onSuccess: () => {
      toast.success('Campaña eliminada')
      queryClient.invalidateQueries({ queryKey: ['publicidad-campanias'] })
      queryClient.invalidateQueries({ queryKey: ['publicidad-dashboard'] })
    },
    onError: () => toast.error('No se pudo eliminar la campaña'),
  })

  const campaniaActiva = useMemo(() => (data || []).find((c) => c.id === campaniaActivaId) || null, [data, campaniaActivaId])

  const stats: DashboardStat[] = dashboard ? [
    { key: 'activas', icon: Megaphone, label: 'Campañas activas', value: dashboard.campaniasActivas, tone: 'brand' },
    { key: 'presupuesto', icon: Wallet, label: 'Presupuesto total', value: formatMoney(dashboard.presupuestoTotal), tone: 'brand' },
    { key: 'gasto', icon: DollarSign, label: 'Gasto del mes', value: formatMoney(dashboard.gastoMes), tone: 'warn' },
    { key: 'ctr', icon: Target, label: 'CTR promedio', value: `${dashboard.ctrPromedio.toFixed(2)}%`, tone: 'success' },
  ] : []

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Publicidad</h1>
            <p className="text-xs text-blue-200/70">Campañas publicitarias pagadas y su desempeño</p>
          </div>
        </div>
      </div>

      {dashboard && <DashboardStatRow stats={stats} />}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Campañas</h2>
        <Button size="sm" onClick={() => setNuevaOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nueva campaña
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay campañas publicitarias registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <CampaniaCard key={c.id} campania={c} onClick={() => setCampaniaActivaId(c.id)} onEliminar={() => eliminarMutation.mutate(c.id)} />
          ))}
        </div>
      )}

      <NuevaCampaniaModal isOpen={nuevaOpen} onClose={() => setNuevaOpen(false)} />
      <CampaniaDetalleModal campania={campaniaActiva} onClose={() => setCampaniaActivaId(null)} />
    </div>
  )
}
