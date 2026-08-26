import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasSession } from '@/hooks/useVentasSession'
import { useVentasStore } from '@/stores/ventas.store'
import { useAuthStore } from '@/stores/auth.store'
import { ventasService } from '@/services/ventas.service'
import { VENTA_ESTADO_COLORS, VENTA_ESTADOS, type VentaEstado } from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  ShoppingCart, Upload, Phone, User, AlertCircle,
  ImageIcon, Calendar, Clock, ChevronDown, RefreshCw, ExternalLink,
} from 'lucide-react'

/* ─── Sesión wrapper ──────────────────────────────────────────── */
export function VentasAgentePage() {
  const { isReady, error, retry } = useVentasSession()

  if (!isReady) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-gray-500">Conectando con sistema de Ventas...</p>
    </div>
  )

  if (error) return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <AlertCircle className="h-7 w-7 text-red-400" />
      </div>
      <p className="text-sm text-gray-600 text-center max-w-xs">{error}</p>
      <button onClick={retry} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark transition-colors">
        <RefreshCw className="h-4 w-4" /> Reintentar
      </button>
    </div>
  )

  return <VentasAgenteContent />
}

/* ─── Contenido principal ────────────────────────────────────── */
const BANAMEX_ID = 4

function VentasAgenteContent() {
  const qc = useQueryClient()
  const { activeCampaignId, ventasCampaigns, setActiveCampaign } = useVentasStore()
  const user = useAuthStore((s) => s.user)

  const campaignId = activeCampaignId ?? ventasCampaigns[0]?.id ?? null

  /* Estatus de la campaña desde la DB */
  const { data: campanaStatuses = [] } = useQuery({
    queryKey: ['campana-statuses-agente', campaignId],
    queryFn:  () => campaignId ? ventasService.getCampanaStatuses(campaignId) : Promise.resolve([]),
    staleTime: 60_000,
    enabled: !!campaignId,
  })

  // Estatus activos de la campaña, o fallback según campaña
  const estatusOptions: string[] = campanaStatuses.length > 0
    ? campanaStatuses.filter((s) => s.activo).map((s) => s.nombreEstado)
    : campaignId === BANAMEX_ID
      ? ['Aprobada', 'Declinado', 'Formalizado', 'Agendada']
      : ['Aprobada', 'Rechazada', 'Agendada']

  const estatusInicial = estatusOptions[0] ?? 'Aprobada'

  const [form, setForm] = useState({
    nombreCliente: '', telefonoCliente: '', estatus: 'Aprobada' as VentaEstado,
    fechaAgendada: '', horaAgendada: '',
  })

  // Cuando llegan los estatus de la DB, actualizar el estatus inicial del form
  useEffect(() => {
    if (estatusOptions.length > 0) {
      setForm((f) => ({ ...f, estatus: estatusOptions[0] as VentaEstado }))
    }
  }, [campanaStatuses.length, campaignId])
  const [evidenciaFile,    setEvidenciaFile]    = useState<File | null>(null)
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null)
  const [phoneWarning,     setPhoneWarning]     = useState(false)
  const [agendada,         setAgendada]         = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Ventas del día */
  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-hoy', activeCampaignId],
    queryFn:  () => ventasService.getVentasHoy(),
    staleTime: 30_000,
  })

  /* Validar teléfono duplicado */
  const checkPhone = async (tel: string) => {
    if (tel.length >= 10) {
      const dup = await ventasService.checkPhone(tel)
      setPhoneWarning(dup)
    } else {
      setPhoneWarning(false)
    }
  }

  /* Crear venta */
  const crear = useMutation({
    mutationFn: async () => {
      let evidenciaUrl: string | undefined
      if (evidenciaFile) evidenciaUrl = await ventasService.uploadEvidencia(evidenciaFile)
      return ventasService.createVenta({
        nombreCliente:  form.nombreCliente.trim(),
        telefonoCliente:form.telefonoCliente.trim(),
        estatus:        form.estatus,
        campaignId:     activeCampaignId ?? ventasCampaigns[0]?.id ?? 0,
        evidencia:      evidenciaUrl,
        ...(agendada && form.estatus === 'Agendada' ? { fechaAgendada: form.fechaAgendada, horaAgendada: form.horaAgendada } : {}),
      })
    },
    onSuccess: () => {
      toast.success('Venta registrada correctamente')
      setForm({ nombreCliente: '', telefonoCliente: '', estatus: estatusInicial as VentaEstado, fechaAgendada: '', horaAgendada: '' })
      setEvidenciaFile(null); setEvidenciaPreview(null); setPhoneWarning(false); setAgendada(false)
      qc.invalidateQueries({ queryKey: ['ventas-hoy'] })
    },
    onError: () => toast.error('Error al registrar la venta'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEvidenciaFile(file)
    setEvidenciaPreview(URL.createObjectURL(file))
  }

  const canSubmit = form.nombreCliente.trim() && form.telefonoCliente.trim().length >= 10 && !crear.isPending

  const abrirWebform = () => {
    const tel    = form.telefonoCliente.replace(/\D/g, '')
    const nombre = encodeURIComponent(user?.nombres ?? '')
    const id     = user?.id ?? ''
    const params = tel ? `?cliente=${tel}&agente=${nombre}&agenteId=${id}` : `?agente=${nombre}&agenteId=${id}`
    window.open(`https://intranet.ardabytec.vip/crm${params}`, '_blank', 'width=900,height=700,noopener')
  }

  /* Stats rápidas */
  const aprobadas  = ventas.filter((v) => v.estatus === 'Aprobada').length
  const pendientes = ventas.filter((v) => v.estatus === 'Pendiente').length
  const rechazadas = ventas.filter((v) => v.estatus === 'Rechazada').length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-brand" /> Mis Ventas
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">Registra y gestiona tus ventas del día</p>
        </div>
        {ventasCampaigns.length > 1 && (
          <div className="relative">
            <select
              value={activeCampaignId ?? ''}
              onChange={(e) => setActiveCampaign(Number(e.target.value))}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10"
            >
              {ventasCampaigns.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        )}
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Aprobadas',  value: aprobadas,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pendientes', value: pendientes, color: 'text-yellow-600',  bg: 'bg-yellow-50'  },
          { label: 'Rechazadas', value: rechazadas, color: 'text-red-500',     bg: 'bg-red-50'     },
        ].map((s) => (
          <div key={s.label} className={clsx('rounded-2xl border border-gray-200/60 p-4 shadow-sm', s.bg)}>
            <p className={clsx('text-2xl font-black tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[0.72rem] font-medium text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[400px_1fr]">
        {/* ── Formulario ── */}
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-[0.88rem] font-bold text-gray-900">Nueva venta</h2>
          </div>
          <div className="p-5 space-y-4">
            {/* Nombre cliente */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre del cliente</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.nombreCliente}
                  onChange={(e) => setForm((f) => ({ ...f, nombreCliente: e.target.value }))}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] text-gray-800 placeholder-gray-400 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
                />
              </div>
            </div>

            {/* Teléfono */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.telefonoCliente}
                  onChange={(e) => { setForm((f) => ({ ...f, telefonoCliente: e.target.value })); checkPhone(e.target.value) }}
                  placeholder="10 dígitos"
                  maxLength={15}
                  className={clsx(
                    'w-full rounded-xl border bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] text-gray-800 placeholder-gray-400 outline-none transition focus:bg-white focus:ring-2',
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
            </div>

            {/* Botón Web Form */}
            <button
              type="button"
              onClick={abrirWebform}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[0.82rem] font-semibold text-white hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Web Form del CRM
            </button>

            {/* Estado */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Estado</label>
              <div className="relative">
                <select
                  value={form.estatus}
                  onChange={(e) => {
                    const v = e.target.value as VentaEstado
                    setForm((f) => ({ ...f, estatus: v }))
                    setAgendada(v === 'Agendada')
                  }}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] text-gray-800 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
                >
                  {estatusOptions.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            {/* Fecha/hora si es agendada */}
            {agendada && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Fecha</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input type="date" value={form.fechaAgendada} onChange={(e) => setForm((f) => ({ ...f, fechaAgendada: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Hora</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input type="time" value={form.horaAgendada} onChange={(e) => setForm((f) => ({ ...f, horaAgendada: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
                  </div>
                </div>
              </div>
            )}

            {/* Evidencia */}
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Evidencia (opcional)</label>
              <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handleFile} />
              {evidenciaPreview ? (
                <div className="relative overflow-hidden rounded-xl border border-gray-200">
                  <img src={evidenciaPreview} alt="Evidencia" className="h-36 w-full object-cover" />
                  <button onClick={() => { setEvidenciaFile(null); setEvidenciaPreview(null) }}
                    className="absolute right-2 top-2 rounded-lg bg-black/50 px-2 py-1 text-[0.65rem] font-semibold text-white hover:bg-black/70 transition-colors">
                    Cambiar
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-5 text-[0.78rem] font-medium text-gray-400 transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand">
                  <ImageIcon className="h-4 w-4" /> Subir imagen
                </button>
              )}
            </div>

            {/* Botón */}
            <button
              onClick={() => crear.mutate()}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-[0.82rem] font-bold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {crear.isPending ? <Spinner size="sm" /> : <Upload className="h-4 w-4" />}
              {crear.isPending ? 'Registrando...' : 'Registrar venta'}
            </button>
          </div>
        </div>

        {/* ── Lista ventas del día ── */}
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
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
            <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
              {ventas.map((v) => (
                <div key={v.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  {v.evidencia ? (
                    <img src={v.evidencia} alt="ev" className="h-20 w-20 flex-shrink-0 rounded-xl object-cover border border-gray-100 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(v.evidencia!, '_blank')} />
                  ) : (
                    <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
                      <ImageIcon className="h-6 w-6 text-gray-300" />
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
                      {v.fecha ? new Date(v.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
