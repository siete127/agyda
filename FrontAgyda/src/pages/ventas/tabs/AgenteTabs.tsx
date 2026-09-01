import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasStore } from '@/stores/ventas.store'
import { ventasService } from '@/services/ventas.service'
import { VENTA_ESTADO_COLORS, type VentaAgendada, type VentaEstado } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ShoppingCart, CalendarClock, Phone, User, AlertCircle,
  ImageIcon, Calendar, Clock, ChevronDown, CheckCircle2,
  XCircle, Trash2, Eye, ExternalLink, NotebookPen, Download,
  Plus, X, Save,
} from 'lucide-react'

type Tab = 'ventas' | 'agendadas'

function parseFechaLocal(fechaStr: string): Date {
  // Fechas con hora (ISO del SQL Server): reemplazar T por espacio para que JS las lea como hora local
  if (fechaStr.includes('T') || fechaStr.includes(' ')) {
    const clean = fechaStr.replace('T', ' ').replace(/\.\d+$/, '')
    return new Date(clean)
  }
  // Fechas solo de día "YYYY-MM-DD": agregar mediodía local para evitar el salto de día por UTC
  return new Date(fechaStr + 'T12:00:00')
}

/* ══════════════════════════════════════════════════════════
   AGENTE TABS  —  tabs: Mis Ventas | Agendadas
══════════════════════════════════════════════════════════ */
export function AgenteTabs() {
  const [tab,        setTab]        = useState<Tab>('ventas')
  const [notasOpen,  setNotasOpen]  = useState(false)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header + tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-brand" /> Ventas
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">Centro de call center</p>
        </div>
        <div className="flex items-center gap-2">
          <CampaignSelector />
          {/* Botón flotante de notas */}
          <button
            onClick={() => setNotasOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.78rem] font-semibold text-amber-700 shadow-sm hover:bg-amber-100 transition-colors"
          >
            <NotebookPen className="h-3.5 w-3.5" /> Notas
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <TabBtn active={tab === 'ventas'}    onClick={() => setTab('ventas')}    icon={<ShoppingCart className="h-3.5 w-3.5" />}   label="Mis Ventas" />
        <TabBtn active={tab === 'agendadas'} onClick={() => setTab('agendadas')} icon={<CalendarClock className="h-3.5 w-3.5" />}  label="Agendadas" />
      </div>

      {tab === 'ventas'    && <MisVentasTab />}
      {tab === 'agendadas' && <AgendadasTab />}

      {/* Ventana emergente de notas */}
      {notasOpen && <NotasModal onClose={() => setNotasOpen(false)} />}
    </div>
  )
}

/* ─── Selector de campaña ──────────────────────────────── */
function CampaignSelector() {
  const { ventasCampaigns, activeCampaignId, setActiveCampaign } = useVentasStore()

  // Solo usar las campañas asignadas al agente — nunca cargar todas
  const campaigns = ventasCampaigns

  // Auto-inicializar activeCampaignId cuando se cargan las campañas y aún no hay una activa
  useEffect(() => {
    if (activeCampaignId == null && campaigns.length > 0) {
      setActiveCampaign(campaigns[0].id)
    }
  }, [campaigns.length, activeCampaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (campaigns.length <= 1) return null

  const effectiveId = activeCampaignId ?? campaigns[0]?.id ?? ''

  return (
    <div className="relative">
      <select
        value={effectiveId}
        onChange={(e) => setActiveCampaign(Number(e.target.value))}
        className="appearance-none rounded-xl border border-gray-200 bg-card py-2 pl-3 pr-8 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
      >
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

/* ─── Tab: Mis Ventas (formulario + lista hoy) ─────────── */
function MisVentasTab() {
  const qc = useQueryClient()
  const { activeCampaignId, ventasCampaigns, ventasNombre, setActiveCampaign } = useVentasStore()

  const availableCampaigns = ventasCampaigns

  // Inicializar activeCampaignId en cuanto haya campañas disponibles
  useEffect(() => {
    if (activeCampaignId == null && availableCampaigns.length > 0) {
      setActiveCampaign(availableCampaigns[0].id)
    }
  }, [availableCampaigns.length, activeCampaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState({
    nombreCliente:  '',
    telefonoCliente: '',
    estatus:        'Pendiente' as VentaEstado,
    fechaAgendada:  '',
    horaAgendada:   '',
  })
  const [isScheduled,      setIsScheduled]      = useState(false)
  const [evidenciaFile,    setEvidenciaFile]    = useState<File | null>(null)
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null)
  const [phoneWarning,     setPhoneWarning]     = useState(false)
  const [editingAgendada,  setEditingAgendada]  = useState<VentaAgendada | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Banamex campaign (id=4) has special statuses */
  const isBanamex = activeCampaignId === 4
  const normalStatuses: VentaEstado[] = isBanamex
    ? ['Aprobada', 'Declinado', 'Formalizada']
    : ['Aprobada', 'Rechazada', 'Pendiente']

  const effectiveCamId = activeCampaignId ?? availableCampaigns[0]?.id ?? null

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-hoy', effectiveCamId, ventasNombre],
    queryFn:  () => ventasService.getVentasHoy(effectiveCamId ?? undefined, ventasNombre ?? undefined),
    enabled:  effectiveCamId != null,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: agendadas = [] } = useQuery({
    queryKey: ['ventas-agendadas-agente'],
    queryFn:  () => ventasService.getScheduled(),
    staleTime: 30_000,
  })

  const checkPhone = async (tel: string) => {
    if (tel.length >= 10) {
      const dup = await ventasService.checkPhone(tel)
      setPhoneWarning(dup)
    } else {
      setPhoneWarning(false)
    }
  }

  const capitalizeWords = (s: string) =>
    s.replace(/\b\w/g, (c) => c.toUpperCase())

  const crear = useMutation({
    mutationFn: async () => {
      const camId = effectiveCamId ?? 0
      if (isScheduled) {
        return ventasService.createVenta({
          nombreCliente:   form.nombreCliente.trim(),
          telefonoCliente: form.telefonoCliente.trim(),
          estatus:         'Agendada',
          campaignId:      camId,
          nombreAgente:    ventasNombre ?? undefined,
          fechaAgendada:   form.fechaAgendada,
          horaAgendada:    form.horaAgendada,
        })
      }
      let evidenciaUrl: string | undefined
      if (evidenciaFile) evidenciaUrl = await ventasService.uploadEvidencia(evidenciaFile)
      return ventasService.createVenta({
        nombreCliente:   form.nombreCliente.trim(),
        telefonoCliente: form.telefonoCliente.trim(),
        estatus:         form.estatus,
        campaignId:      camId,
        nombreAgente:    ventasNombre ?? undefined,
        evidencia:       evidenciaUrl,
      })
    },
    onSuccess: () => {
      toast.success(isScheduled ? 'Venta agendada correctamente' : 'Venta registrada correctamente')
      setForm({ nombreCliente: '', telefonoCliente: '', estatus: normalStatuses[0], fechaAgendada: '', horaAgendada: '' })
      setEvidenciaFile(null); setEvidenciaPreview(null); setPhoneWarning(false); setIsScheduled(false)
      qc.invalidateQueries({ queryKey: ['ventas-hoy'] })
      qc.invalidateQueries({ queryKey: ['ventas-agendadas-agente'] })
    },
    onError: () => toast.error('Error al registrar la venta'),
  })

  /* Completar agendada desde formulario */
  const completar = useMutation({
    mutationFn: async () => {
      if (!editingAgendada) return
      let evidenciaUrl: string | undefined
      if (evidenciaFile) evidenciaUrl = await ventasService.uploadEvidencia(evidenciaFile)
      return ventasService.completeScheduled(editingAgendada.id)
    },
    onSuccess: () => {
      toast.success('Venta agendada completada')
      setEditingAgendada(null)
      setEvidenciaFile(null); setEvidenciaPreview(null)
      setForm({ nombreCliente: '', telefonoCliente: '', estatus: normalStatuses[0], fechaAgendada: '', horaAgendada: '' })
      qc.invalidateQueries({ queryKey: ['ventas-agendadas-agente'] })
      qc.invalidateQueries({ queryKey: ['ventas-hoy'] })
    },
    onError: () => toast.error('Error al completar'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEvidenciaFile(file)
    setEvidenciaPreview(URL.createObjectURL(file))
  }

  const loadAgendada = (a: VentaAgendada) => {
    setEditingAgendada(a)
    setForm((f) => ({ ...f, nombreCliente: a.nombreCliente, telefonoCliente: a.telefonoCliente }))
    setIsScheduled(false)
  }

  const canSubmit = form.nombreCliente.trim().length >= 2 &&
    form.telefonoCliente.trim().length === 10 &&
    (isScheduled ? form.fechaAgendada && form.horaAgendada : true) &&
    !crear.isPending

  /* stats rápidas */
  const aprobadas  = ventas.filter((v) => v.estatus === 'Aprobada'   || v.estatus === 'Formalizada').length
  const pendientes = ventas.filter((v) => v.estatus === 'Pendiente').length
  const rechazadas = ventas.filter((v) => v.estatus === 'Rechazada'  || v.estatus === 'Declinado').length

  return (
    <div className="space-y-5">
      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aprobadas',  value: aprobadas,  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Pendientes', value: pendientes, color: 'text-yellow-600',  bg: 'bg-yellow-50',  border: 'border-yellow-100'  },
          { label: 'Rechazadas', value: rechazadas, color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-100'     },
        ].map((s) => (
          <div key={s.label} className={clsx('rounded-2xl border p-4 shadow-sm', s.bg, s.border)}>
            <p className={clsx('text-2xl font-black tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[0.72rem] font-medium text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr]">
        {/* ── Formulario ── */}
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <h2 className="text-[0.88rem] font-bold text-gray-900">
              {editingAgendada ? 'Completar venta agendada' : 'Nueva venta'}
            </h2>
            {editingAgendada && (
              <button
                onClick={() => { setEditingAgendada(null); setForm({ nombreCliente: '', telefonoCliente: '', estatus: normalStatuses[0], fechaAgendada: '', horaAgendada: '' }) }}
                className="text-[0.72rem] font-semibold text-gray-400 hover:text-red-500 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
          <div className="p-5 space-y-4">
            {/* Nombre */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre del cliente</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.nombreCliente}
                  onChange={(e) => setForm((f) => ({ ...f, nombreCliente: capitalizeWords(e.target.value) }))}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] text-gray-800 placeholder-gray-400 outline-none transition focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/10"
                />
              </div>
            </div>

            {/* Teléfono */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Teléfono (10 dígitos)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.telefonoCliente}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm((f) => ({ ...f, telefonoCliente: v }))
                    checkPhone(v)
                  }}
                  placeholder="5512345678"
                  maxLength={10}
                  inputMode="numeric"
                  className={clsx(
                    'w-full rounded-xl border bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-card focus:ring-2',
                    phoneWarning
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                      : 'border-gray-200 focus:border-brand focus:ring-brand/10',
                  )}
                />
              </div>
              {phoneWarning && (
                <p className="mt-1 flex items-center gap-1 text-[0.68rem] text-red-500">
                  <AlertCircle className="h-3 w-3" /> Este teléfono ya fue registrado
                </p>
              )}
              {form.telefonoCliente.length > 0 && form.telefonoCliente.length < 10 && (
                <p className="mt-1 text-[0.68rem] text-gray-400">{form.telefonoCliente.length}/10 dígitos</p>
              )}
            </div>

            {/* Botón Web Form */}
            <button
              type="button"
              onClick={() => window.open(`https://agyda.ardabytec.vip/crm?cliente=${form.telefonoCliente.replace(/\D/g,'')}&agente=&agenteId=`, '_blank')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[0.82rem] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Web Form del CRM
            </button>

            {/* Checkbox agendar */}
            {!editingAgendada && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand accent-brand"
                />
                <span className="text-[0.82rem] font-medium text-gray-700">Agendar esta venta para después</span>
              </label>
            )}

            {/* Estado (solo si no agendada) */}
            {!isScheduled && (
              <div>
                <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Estatus</label>
                <div className="relative">
                  <select
                    value={form.estatus}
                    onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value as VentaEstado }))}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] text-gray-800 outline-none transition focus:border-brand focus:bg-card focus:ring-2 focus:ring-brand/10"
                  >
                    {normalStatuses.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            )}

            {/* Fecha/hora si es agendada */}
            {isScheduled && !editingAgendada && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Fecha</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={form.fechaAgendada}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setForm((f) => ({ ...f, fechaAgendada: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Hora</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="time"
                      value={form.horaAgendada}
                      onChange={(e) => setForm((f) => ({ ...f, horaAgendada: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Evidencia (solo si no agendada) */}
            {!isScheduled && (
              <div>
                <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">
                  Evidencia {editingAgendada ? '' : '(opcional)'}
                </label>
                <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handleFile} />
                {evidenciaPreview ? (
                  <div className="relative overflow-hidden rounded-xl border border-gray-200">
                    <img src={evidenciaPreview} alt="Evidencia" className="h-36 w-full object-cover" />
                    <button
                      onClick={() => { setEvidenciaFile(null); setEvidenciaPreview(null) }}
                      className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-1 text-[0.65rem] font-semibold text-white hover:bg-black/70 transition-colors"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-5 text-[0.78rem] font-medium text-gray-400 transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                  >
                    <ImageIcon className="h-4 w-4" /> Subir imagen de evidencia
                  </button>
                )}
              </div>
            )}

            {/* Botón */}
            <button
              onClick={() => editingAgendada ? completar.mutate() : crear.mutate()}
              disabled={!canSubmit && !editingAgendada}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[0.82rem] font-bold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(crear.isPending || completar.isPending) && <Spinner size="sm" />}
              {editingAgendada
                ? (completar.isPending ? 'Completando...' : 'Completar venta agendada')
                : isScheduled
                  ? (crear.isPending ? 'Agendando...' : 'Agendar venta')
                  : (crear.isPending ? 'Registrando...' : 'Registrar venta')}
            </button>
          </div>
        </div>

        {/* ── Panel derecho: lista + agendadas pendientes ── */}
        <div className="space-y-5">
          {/* Agendadas pendientes */}
          {agendadas.length > 0 && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 border-b border-blue-100 px-5 py-3.5">
                <CalendarClock className="h-4 w-4 text-blue-500" />
                <h2 className="text-[0.85rem] font-bold text-blue-800">Ventas agendadas pendientes</h2>
                <span className="ml-auto rounded-full bg-blue-500 px-2.5 py-0.5 text-[0.68rem] font-bold text-white">{agendadas.length}</span>
              </div>
              <div className="divide-y divide-blue-100 max-h-48 overflow-y-auto">
                {agendadas.map((a) => (
                  <AgendadaMiniCard
                    key={a.id}
                    agendada={a}
                    isEditing={editingAgendada?.id === a.id}
                    onEdit={() => loadAgendada(a)}
                    onCancel={() => setEditingAgendada(null)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ventas del día */}
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-[0.88rem] font-bold text-gray-900">Ventas del día</h2>
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-brand">{ventas.length}</span>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : ventas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                <ShoppingCart className="h-8 w-8 opacity-30" />
                <p className="text-[0.82rem]">Sin ventas registradas hoy</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                {ventas.map((v) => (
                  <div key={v.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    {v.evidencia ? (
                      <a href={v.evidencia} target="_blank" rel="noreferrer" className="block">
                        <img src={v.evidencia} alt="ev" className="h-12 w-12 flex-shrink-0 rounded-xl object-cover border border-gray-100 hover:opacity-80 transition-opacity" />
                      </a>
                    ) : (
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
                        <ImageIcon className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[0.82rem] font-semibold text-gray-900 truncate">{v.nombreCliente}</p>
                        <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold', VENTA_ESTADO_COLORS[v.estatus])}>
                          {v.estatus}
                        </span>
                      </div>
                      <p className="text-[0.72rem] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />{v.telefonoCliente}
                      </p>
                      <p className="text-[0.68rem] text-gray-300 mt-0.5">
                        {v.fecha ? parseFechaLocal(v.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Mini card de venta agendada ────────────────────────── */
function AgendadaMiniCard({
  agendada, isEditing, onEdit, onCancel,
}: {
  agendada: VentaAgendada
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const del = useMutation({
    mutationFn: () => ventasService.deleteScheduled(agendada.id),
    onSuccess: () => { toast.success('Agendada eliminada'); qc.invalidateQueries({ queryKey: ['ventas-agendadas-agente'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const fechaFmt = agendada.fechaAgendada
    ? parseFechaLocal(agendada.fechaAgendada).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  return (
    <div className={clsx('flex items-center gap-3 px-5 py-3 transition-colors', isEditing ? 'bg-blue-100/60' : 'hover:bg-blue-50/60')}>
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-semibold text-blue-900 truncate">{agendada.nombreCliente}</p>
        <p className="text-[0.70rem] text-blue-600 flex items-center gap-1">
          <Phone className="h-3 w-3" />{agendada.telefonoCliente}
          <span className="mx-1">·</span>
          <Calendar className="h-3 w-3" />{fechaFmt}
          {agendada.horaAgendada && <span className="ml-1 flex items-center gap-0.5"><Clock className="h-3 w-3" />{agendada.horaAgendada}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {isEditing ? (
          <button onClick={onCancel} className="rounded-lg px-2 py-1 text-[0.68rem] font-semibold text-blue-600 hover:bg-blue-100 transition-colors">
            Cancelar
          </button>
        ) : (
          <button onClick={onEdit} className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-100 transition-colors" title="Completar">
            <CheckCircle2 className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => del.mutate()} disabled={del.isPending} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 transition-colors" title="Eliminar">
          {del.isPending ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

/* ─── Tab: Agendadas (lista completa) ─────────────────────── */
function AgendadasTab() {
  const qc = useQueryClient()
  const [completing, setCompleting] = useState<VentaAgendada | null>(null)

  const { data: agendadas = [], isLoading } = useQuery({
    queryKey: ['ventas-agendadas-agente'],
    queryFn:  () => ventasService.getScheduled(),
    staleTime: 30_000,
  })

  const del = useMutation({
    mutationFn: (id: number) => ventasService.deleteScheduled(id),
    onSuccess: () => { toast.success('Eliminada'); qc.invalidateQueries({ queryKey: ['ventas-agendadas-agente'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[0.88rem] font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-brand" /> Mis ventas agendadas
          </h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-brand">{agendadas.length}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : agendadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <CalendarClock className="h-10 w-10 opacity-20" />
            <p className="text-[0.85rem] font-medium">Sin ventas agendadas</p>
            <p className="text-[0.75rem]">Cuando agendes una venta aparecerá aquí</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {agendadas.map((a) => {
              const fechaFmt = a.fechaAgendada
                ? parseFechaLocal(a.fechaAgendada).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
                : '—'
              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <CalendarClock className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.88rem] font-bold text-gray-900">{a.nombreCliente}</p>
                    <p className="text-[0.75rem] text-gray-500 flex items-center gap-1.5 mt-0.5">
                      <Phone className="h-3 w-3" />{a.telefonoCliente}
                    </p>
                    <p className="text-[0.72rem] text-blue-600 mt-1 capitalize">{fechaFmt}{a.horaAgendada ? ` · ${a.horaAgendada}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setCompleting(a)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[0.72rem] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Completar
                    </button>
                    <button onClick={() => del.mutate(a.id)} disabled={del.isPending}
                      className="rounded-xl border border-red-100 bg-red-50 p-1.5 text-red-400 hover:bg-red-100 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {completing && (
        <CompletarModal
          agendada={completing}
          onClose={() => setCompleting(null)}
          onDone={() => {
            setCompleting(null)
            qc.invalidateQueries({ queryKey: ['ventas-agendadas-agente'] })
            qc.invalidateQueries({ queryKey: ['ventas-hoy'] })
          }}
        />
      )}
    </div>
  )
}

/* ─── Modal completar agendada ───────────────────────────── */
function CompletarModal({ agendada, onClose, onDone }: {
  agendada: VentaAgendada; onClose: () => void; onDone: () => void
}) {
  const [estatus, setEstatus] = useState<VentaEstado>('Aprobada')
  const [file,    setFile]    = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isBanamex = agendada.campaignId === 4
  const opciones: VentaEstado[] = isBanamex ? ['Aprobada', 'Declinado', 'Formalizada'] : ['Aprobada', 'Rechazada', 'Pendiente']

  const completar = useMutation({
    mutationFn: async () => {
      let evidenciaUrl: string | undefined
      if (file) evidenciaUrl = await ventasService.uploadEvidencia(file)
      return ventasService.completeScheduled(agendada.id)
    },
    onSuccess: () => { toast.success('Venta completada'); onDone() },
    onError: () => toast.error('Error al completar'),
  })

  return (
    <Modal isOpen title="Completar venta agendada" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
          <p className="text-[0.82rem] font-semibold text-blue-900">{agendada.nombreCliente}</p>
          <p className="text-[0.72rem] text-blue-600 flex items-center gap-1"><Phone className="h-3 w-3" />{agendada.telefonoCliente}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Estatus</label>
          <div className="relative">
            <select value={estatus} onChange={(e) => setEstatus(e.target.value as VentaEstado)}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10">
              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Evidencia (opcional)</label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { setFile(f); setPreview(URL.createObjectURL(f)) }
          }} />
          {preview ? (
            <div className="relative overflow-hidden rounded-xl border border-gray-200">
              <img src={preview} alt="prev" className="h-32 w-full object-cover" />
              <button onClick={() => { setFile(null); setPreview(null) }} className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-1 text-[0.65rem] text-white">Cambiar</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-4 text-[0.78rem] text-gray-400 hover:border-brand/40 hover:text-brand transition-colors">
              <ImageIcon className="h-4 w-4" /> Subir imagen
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => completar.mutate()} disabled={completar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {completar.isPending && <Spinner size="sm" />} Completar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Ventana emergente de Notas ─────────────────────────── */
type Nota = { id: number; titulo: string; contenido: string; fecha: string }

function NotasModal({ onClose }: { onClose: () => void }) {
  const { ventasNombre } = useVentasStore()
  const queryClient = useQueryClient()

  const { data: notasData } = useQuery({
    queryKey: ['ventas', 'notas-agente'],
    queryFn: ventasService.getNotasAgente,
  })
  const notas = notasData ?? []

  const [activa,       setActiva]       = useState<number | null>(null)
  const [editTitulo,   setEditTitulo]   = useState('')
  const [editContenido,setEditContenido]= useState('')
  const [dirty,        setDirty]        = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragRef     = useRef<HTMLDivElement>(null)

  // Al cargar las notas por primera vez, seleccionar la más reciente
  useEffect(() => {
    if (activa === null && notas.length > 0) {
      setActiva(notas[0].id); setEditTitulo(notas[0].titulo); setEditContenido(notas[0].contenido)
    }
  }, [notas, activa])

  const createMutation = useMutation({
    mutationFn: () => ventasService.createNotaAgente('Nueva nota', ''),
    onSuccess: (nueva) => {
      queryClient.setQueryData<Nota[]>(['ventas', 'notas-agente'], (prev) => [nueva, ...(prev ?? [])])
      setActiva(nueva.id); setEditTitulo(nueva.titulo); setEditContenido(''); setDirty(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, titulo, contenido }: { id: number; titulo: string; contenido: string }) =>
      ventasService.updateNotaAgente(id, titulo, contenido),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Nota[]>(['ventas', 'notas-agente'], (prev) =>
        (prev ?? []).map((n) => n.id === vars.id ? { ...n, titulo: vars.titulo, contenido: vars.contenido, fecha: new Date().toISOString() } : n)
      )
      setDirty(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ventasService.deleteNotaAgente(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Nota[]>(['ventas', 'notas-agente'], (prev) => (prev ?? []).filter((n) => n.id !== id))
    },
  })

  // Migración única: subir notas viejas guardadas en localStorage (versión anterior, sin servidor) y borrarlas de ahí.
  useEffect(() => {
    const legacyKey = `ventas_notas_agente_${ventasNombre ?? 'default'}`
    const raw = localStorage.getItem(legacyKey)
    if (!raw) return
    let legacyNotas: { titulo: string; contenido: string }[] = []
    try { legacyNotas = JSON.parse(raw) } catch { legacyNotas = [] }
    if (legacyNotas.length === 0) { localStorage.removeItem(legacyKey); return }

    ;(async () => {
      const subidas: Nota[] = []
      for (const n of legacyNotas) {
        try {
          const creada = await ventasService.createNotaAgente(n.titulo || 'Nota migrada', n.contenido ?? '')
          subidas.push(creada)
        } catch {
          return // si falla una, se deja la clave para reintentar la próxima vez
        }
      }
      localStorage.removeItem(legacyKey)
      queryClient.setQueryData<Nota[]>(['ventas', 'notas-agente'], (prev) => [...subidas, ...(prev ?? [])])
      toast.success(`${subidas.length} nota(s) migrada(s) al servidor`)
    })()
  }, [ventasNombre, queryClient])

  // drag state
  const W = 720, H = 480
  const POS_KEY = `ventas_notas_pos_${ventasNombre ?? 'default'}`

  const initPos = (): { x: number; y: number } => {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        return {
          x: Math.min(Math.max(0, saved.x), window.innerWidth  - W),
          y: Math.min(Math.max(0, saved.y), window.innerHeight - H),
        }
      }
    } catch { /* ignore */ }
    return { x: Math.max(0, window.innerWidth / 2 - W / 2), y: 80 }
  }

  const [pos, setPos]   = useState<{ x: number; y: number }>(initPos)
  const posRef          = useRef(pos)       // siempre actualizado, sin closure stale
  const isDragging      = useRef(false)

  // mantener posRef sincronizado con pos
  useEffect(() => { posRef.current = pos }, [pos])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    const startX = e.clientX - posRef.current.x
    const startY = e.clientY - posRef.current.y

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const x = Math.min(Math.max(0, ev.clientX - startX), window.innerWidth  - W)
      const y = Math.min(Math.max(0, ev.clientY - startY), window.innerHeight - H)
      posRef.current = { x, y }
      setPos({ x, y })
    }
    const onUp = () => {
      isDragging.current = false
      localStorage.setItem(POS_KEY, JSON.stringify(posRef.current))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [POS_KEY, W, H])

  const notaActiva = notas.find((n) => n.id === activa) ?? null

  const guardarCambios = useCallback(() => {
    if (!activa) return
    updateMutation.mutate({ id: activa, titulo: editTitulo.trim() || 'Sin título', contenido: editContenido })
  }, [activa, editTitulo, editContenido, updateMutation])

  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(guardarCambios, 2000)
    return () => clearTimeout(t)
  }, [dirty, guardarCambios])

  // Guardar cambios pendientes solo al desmontar el modal (cerrar), no en cada
  // cambio de `dirty`/`guardarCambios` — de lo contrario el cleanup se dispara
  // en cada re-render (p.ej. cuando updateMutation hace setDirty(false) al
  // guardar), volviendo a llamar guardarCambios() y provocando un loop de
  // actualizaciones de estado (React error #185).
  const dirtyRef = useRef(dirty)
  const guardarCambiosRef = useRef(guardarCambios)
  useEffect(() => { dirtyRef.current = dirty; guardarCambiosRef.current = guardarCambios })
  useEffect(() => () => { if (dirtyRef.current) guardarCambiosRef.current() }, [])

  const abrirNota = (n: Nota) => {
    if (dirty) guardarCambios()
    setActiva(n.id); setEditTitulo(n.titulo); setEditContenido(n.contenido); setDirty(false)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const nuevaNota = () => {
    if (dirty) guardarCambios()
    createMutation.mutate()
  }

  const eliminarNota = (id: number) => {
    deleteMutation.mutate(id)
    if (activa === id) {
      const fallback = notas.find((n) => n.id !== id) ?? null
      setActiva(fallback?.id ?? null); setEditTitulo(fallback?.titulo ?? ''); setEditContenido(fallback?.contenido ?? ''); setDirty(false)
    }
  }

  const descargarNota = (n: Nota) => {
    const blob = new Blob([`${n.titulo}\n${'─'.repeat(40)}\n${n.contenido}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `nota_${n.titulo.replace(/\s+/g,'_').slice(0,30)}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  const descargarTodas = () => {
    const texto = notas.map((n) => `${n.titulo}\n${'─'.repeat(40)}\n${n.contenido}\n`).join('\n\n')
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `mis_notas_${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url)
  }

  const fmtFecha = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) } catch { return '' }
  }

  return (
    <div
      ref={dragRef}
      className="fixed z-[200] flex flex-col rounded-2xl border border-gray-200 bg-card shadow-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: 720, height: 480 }}
    >
      {/* Barra de título arrastrable */}
      <div
        onMouseDown={onMouseDown}
        className="flex cursor-grab items-center gap-2 border-b border-gray-100 bg-amber-50 px-4 py-2.5 select-none active:cursor-grabbing"
      >
        <NotebookPen className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="flex-1 text-[0.82rem] font-bold text-amber-800">Mis Notas</span>
        {notas.length > 0 && (
          <button onClick={descargarTodas} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-card px-2 py-1 text-[0.68rem] font-semibold text-amber-700 hover:bg-amber-100 transition-colors" title="Descargar todas">
            <Download className="h-3 w-3" /> Todas
          </button>
        )}
        <button onClick={() => { if (dirty) guardarCambios(); onClose() }} className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lista de notas */}
        <div className="flex w-48 flex-shrink-0 flex-col border-r border-gray-100">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-[0.72rem] font-semibold text-gray-500">{notas.length} nota{notas.length !== 1 ? 's' : ''}</span>
            <button onClick={nuevaNota} className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors" title="Nueva nota">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notas.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-300">
                <NotebookPen className="h-7 w-7" />
                <p className="text-[0.68rem] text-center leading-relaxed">Sin notas.<br/>Pulsa + para crear.</p>
              </div>
            ) : notas.map((n) => (
              <div
                key={n.id}
                onClick={() => abrirNota(n)}
                className={clsx(
                  'group relative cursor-pointer border-b border-gray-50 px-3 py-2 transition-colors',
                  activa === n.id ? 'bg-amber-50 border-l-2 border-l-amber-500' : 'hover:bg-gray-50',
                )}
              >
                <p className={clsx('truncate text-[0.75rem] font-semibold', activa === n.id ? 'text-amber-700' : 'text-gray-800')}>
                  {n.titulo || 'Sin título'}
                </p>
                <p className="mt-0.5 truncate text-[0.62rem] text-gray-400">{fmtFecha(n.fecha)}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); eliminarNota(n.id) }}
                  className="absolute right-1.5 top-1.5 hidden rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-400 group-hover:flex"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {notaActiva ? (
            <>
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <input
                  value={editTitulo}
                  onChange={(e) => { setEditTitulo(e.target.value); setDirty(true) }}
                  onBlur={guardarCambios}
                  className="flex-1 border-0 bg-transparent text-[0.85rem] font-bold text-gray-900 outline-none placeholder-gray-300"
                  placeholder="Título"
                />
                <span className={clsx('text-[0.62rem]', dirty ? 'text-yellow-500' : 'text-gray-300')}>
                  {dirty ? 'Sin guardar...' : 'Guardado ✓'}
                </span>
                <button onClick={guardarCambios} className="flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[0.68rem] font-semibold text-amber-700 hover:bg-amber-100 transition-colors">
                  <Save className="h-3 w-3" /> Guardar
                </button>
                <button onClick={() => descargarNota(notaActiva)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[0.68rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                  <Download className="h-3 w-3" /> .txt
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={editContenido}
                onChange={(e) => { setEditContenido(e.target.value); setDirty(true) }}
                onBlur={guardarCambios}
                placeholder="Escribe aquí tus anotaciones..."
                className="flex-1 resize-none border-0 bg-transparent p-3 font-mono text-[0.8rem] text-gray-700 placeholder-gray-300 outline-none leading-relaxed"
              />
              <div className="border-t border-gray-50 px-3 py-1 text-right text-[0.62rem] text-gray-300">
                {editContenido.length} chars · {editContenido.split('\n').length} líneas
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-300">
              <NotebookPen className="h-10 w-10" />
              <p className="text-[0.78rem] text-gray-400">Selecciona una nota o crea una nueva</p>
              <button onClick={nuevaNota} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-[0.78rem] font-bold text-white hover:bg-amber-600 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Nueva nota
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Helper tab button ──────────────────────────────────── */
function TabBtn({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button onClick={onClick}
      className={clsx('flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[0.78rem] font-semibold transition-all',
        active ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
      {icon}{label}
    </button>
  )
}

/* re-export para usarlo en otros archivos si se necesita */
export { TabBtn }
export type { Tab }
