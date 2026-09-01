import { createPortal } from 'react-dom'
import { X, Phone, User, Building2, Clock, Tag, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import type { Venta } from '@/types/ventas.types'
import { VENTA_ESTADO_COLORS } from '@/types/ventas.types'
import { useVentasStore } from '@/stores/ventas.store'

const ESTADO_ES_RECHAZO = (e: string) =>
  ['rechazada', 'declinado', 'cancelada'].includes(e.toLowerCase())

function fmtFechaHora(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { fecha: iso || '—', hora: '' }
  return {
    fecha: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
  }
}

function Row({ icon: Icon, label, children }: {
  icon: typeof Phone; label: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <div className="mt-0.5 text-[0.86rem] font-medium text-gray-800">{children}</div>
      </div>
    </div>
  )
}

export function VentaResumenModal({ venta, onClose }: { venta: Venta; onClose: () => void }) {
  const { ventasCampaigns } = useVentasStore()
  const campana = ventasCampaigns.find((c) => c.id === venta.campaignId)
  const { fecha, hora } = fmtFechaHora(venta.fecha)
  const esRechazo = ESTADO_ES_RECHAZO(venta.estatus)
  const acento = esRechazo ? '#EF4444' : '#10B981'

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md animate-slide-up overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="h-1.5 w-full" style={{ background: acento }} />

        <div className="flex items-start justify-between px-5 pt-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
              style={{ background: `${acento}18` }}
            >
              {esRechazo ? '❌' : '💰'}
            </div>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: acento }}>
                {esRechazo ? 'Venta rechazada' : 'Venta registrada'}
              </p>
              <span className={clsx('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-bold', VENTA_ESTADO_COLORS[venta.estatus] ?? 'bg-gray-100 text-gray-600')}>
                {venta.estatus}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-gray-50 px-5 py-3">
          <Row icon={User} label="Agente">{venta.nombreAgente || '—'}</Row>
          <Row icon={Building2} label="Campaña">
            {campana?.nombre ?? (venta.campaignId ? `Campaña #${venta.campaignId}` : '—')}
          </Row>
          <Row icon={User} label="Cliente">{venta.nombreCliente || '—'}</Row>
          <Row icon={Phone} label="Teléfono del cliente">
            <a href={`tel:${venta.telefonoCliente}`} className="text-brand hover:underline">
              {venta.telefonoCliente || '—'}
            </a>
          </Row>
          <Row icon={Clock} label="Fecha y hora">
            {fecha}{hora && <span className="text-gray-400"> · {hora}</span>}
          </Row>
          <Row icon={Tag} label="ID de venta">#{venta.id}</Row>
          {(venta.fechaAgendada || venta.horaAgendada) && (
            <Row icon={Clock} label="Agendada para">
              {venta.fechaAgendada ?? ''} {venta.horaAgendada ?? ''}
            </Row>
          )}
        </div>

        {venta.evidencia && (
          <div className="border-t border-gray-100 px-5 py-3">
            <a
              href={venta.evidencia}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold text-brand hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver evidencia
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
