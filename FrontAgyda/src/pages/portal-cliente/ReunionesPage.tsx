import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Calendar, Clock, MapPin, Video, Check, CalendarX2, X } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalCita } from '@/types/portalCliente.types'

function CambioModal({ cita, onClose }: { cita: PortalCita; onClose: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<'reprogramar' | 'cancelar'>('reprogramar')
  const [fechaPropuesta, setFechaPropuesta] = useState('')
  const [motivo, setMotivo] = useState('')

  const enviar = useMutation({
    mutationFn: () => portalClienteService.solicitarCambioCita(cita.id, {
      tipo, fechaPropuesta: tipo === 'reprogramar' ? fechaPropuesta || undefined : undefined, motivo: motivo || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-citas'] })
      toast.success('Solicitud enviada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo enviar la solicitud'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Solicitar cambio de cita</h3>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setTipo('reprogramar')} className={clsx('flex-1 rounded-xl border py-2 text-xs font-semibold', tipo === 'reprogramar' ? 'border-brand bg-brand/5 text-brand' : 'border-surface-border text-ink-tertiary')}>Reprogramar</button>
            <button type="button" onClick={() => setTipo('cancelar')} className={clsx('flex-1 rounded-xl border py-2 text-xs font-semibold', tipo === 'cancelar' ? 'border-brand bg-brand/5 text-brand' : 'border-surface-border text-ink-tertiary')}>Cancelar</button>
          </div>
          {tipo === 'reprogramar' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Fecha propuesta</label>
              <input type="datetime-local" value={fechaPropuesta} onChange={(e) => setFechaPropuesta(e.target.value)} className="w-full rounded-xl border border-surface-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-tertiary">Motivo (opcional)</label>
            <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full resize-none rounded-xl border border-surface-border bg-card px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-surface-border px-4 py-2 text-xs font-semibold text-ink-secondary">Cancelar</button>
          <button onClick={() => enviar.mutate()} disabled={enviar.isPending} className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white disabled:opacity-60">Enviar solicitud</button>
        </div>
      </div>
    </div>
  )
}

function CitaCard({ cita }: { cita: PortalCita }) {
  const qc = useQueryClient()
  const [showCambio, setShowCambio] = useState(false)

  const confirmar = useMutation({
    mutationFn: () => portalClienteService.confirmarCita(cita.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-citas'] })
      toast.success('Cita confirmada')
    },
    onError: () => toast.error('No se pudo confirmar'),
  })

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">{cita.titulo}</p>
            {cita.tratamientoNombre && (
              <p className="text-xs text-ink-tertiary">{cita.tratamientoNombre}{cita.numeroSesion ? ` — Sesión ${cita.numeroSesion}${cita.tratamientoTotalSesiones ? `/${cita.tratamientoTotalSesiones}` : ''}` : ''}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-tertiary">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(cita.fechaHora).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="flex items-center gap-1 capitalize">
                {cita.modalidad === 'videollamada' ? <Video className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                {cita.modalidad}
              </span>
            </div>
          </div>
        </div>
        <span className={clsx('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
          cita.confirmadaPorCliente ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
          {cita.estatus}
        </span>
      </div>

      {cita.solicitudPendienteTipo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Ya tienes una solicitud de {cita.solicitudPendienteTipo === 'cancelar' ? 'cancelación' : 'reprogramación'} pendiente de revisión.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {cita.enlace && (
          <a href={cita.enlace} target="_blank" rel="noreferrer" className="flex-1 rounded-full bg-brand py-2 text-center text-xs font-bold text-white hover:bg-brand-dark">
            Unirme
          </a>
        )}
        {!cita.confirmadaPorCliente && (
          <button onClick={() => confirmar.mutate()} disabled={confirmar.isPending} className="flex flex-1 items-center justify-center gap-1 rounded-full border border-emerald-500 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 disabled:opacity-60">
            <Check className="h-3.5 w-3.5" /> Confirmar
          </button>
        )}
        {!cita.solicitudPendienteTipo && (
          <button onClick={() => setShowCambio(true)} className="flex-1 rounded-full border border-surface-border py-2 text-xs font-bold text-ink-secondary hover:bg-surface">
            Solicitar cambio
          </button>
        )}
      </div>

      {showCambio && <CambioModal cita={cita} onClose={() => setShowCambio(false)} />}
    </div>
  )
}

const HISTORIAL_ESTATUS_BADGE: Record<string, string> = {
  asistio: 'bg-emerald-50 text-emerald-600',
  no_asistio: 'bg-red-50 text-red-600',
  cancelada: 'bg-surface text-ink-tertiary',
}

function HistorialRow({ cita }: { cita: PortalCita }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface text-ink-tertiary">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">{cita.titulo}</p>
          {cita.tratamientoNombre && <p className="text-xs text-ink-tertiary">{cita.tratamientoNombre}{cita.numeroSesion ? ` — Sesión ${cita.numeroSesion}` : ''}</p>}
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-tertiary">
            <Clock className="h-3 w-3" />{new Date(cita.fechaHora).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>
      <span className={clsx('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', HISTORIAL_ESTATUS_BADGE[cita.estatus] ?? 'bg-surface text-ink-tertiary')}>
        {cita.estatus.replace('_', ' ')}
      </span>
    </div>
  )
}

type ReunionesTab = 'proximas' | 'historial'

export function ReunionesPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: ReunionesTab = tabParam === 'historial' ? 'historial' : 'proximas'
  const setTab = (t: ReunionesTab) => setParams(t === 'proximas' ? {} : { tab: t }, { replace: true })

  const proximas = useQuery({ queryKey: ['portal-citas'], queryFn: () => portalClienteService.getCitas(), enabled: tab === 'proximas' })
  const historial = useQuery({ queryKey: ['portal-citas-historial'], queryFn: () => portalClienteService.getCitasHistorial(), enabled: tab === 'historial' })

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold text-ink">Reuniones</h1>
        <p className="mt-1 text-sm text-ink-tertiary">Tus reuniones y citas con nosotros.</p>
      </div>

      <div className="flex w-fit gap-1 rounded-full bg-surface p-1">
        <button
          onClick={() => setTab('proximas')}
          className={clsx('rounded-full px-4 py-2 text-xs font-semibold transition-colors', tab === 'proximas' ? 'bg-card text-ink shadow-sm' : 'text-ink-tertiary hover:text-ink-secondary')}
        >
          Próximas
        </button>
        <button
          onClick={() => setTab('historial')}
          className={clsx('rounded-full px-4 py-2 text-xs font-semibold transition-colors', tab === 'historial' ? 'bg-card text-ink shadow-sm' : 'text-ink-tertiary hover:text-ink-secondary')}
        >
          Historial
        </button>
      </div>

      {tab === 'proximas' ? (
        proximas.isLoading ? (
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />)}
          </div>
        ) : (proximas.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center">
            <Calendar className="h-8 w-8 text-ink-tertiary/50" />
            <p className="text-sm font-semibold text-ink">No tienes reuniones próximas</p>
            <p className="text-xs text-ink-tertiary">Cuando se agende una cita contigo, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {(proximas.data ?? []).map((c) => <CitaCard key={c.id} cita={c} />)}
          </div>
        )
      ) : historial.isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      ) : (historial.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center">
          <CalendarX2 className="h-8 w-8 text-ink-tertiary/50" />
          <p className="text-sm font-semibold text-ink">Sin reuniones pasadas</p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border rounded-2xl border border-surface-border bg-card shadow-card">
          {(historial.data ?? []).map((c) => <HistorialRow key={c.id} cita={c} />)}
        </div>
      )}
    </div>
  )
}
