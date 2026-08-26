import { useQuery } from '@tanstack/react-query'
import { emailMarketingService } from '@/services/emailMarketing.service'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { EmailEnvioEstado } from '@/types/emailMarketing.types'
import { clsx } from 'clsx'

const ESTADO_COLOR: Record<EmailEnvioEstado, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  enviado: 'bg-emerald-100 text-emerald-700',
  fallido: 'bg-red-100 text-red-700',
  omitido_baja: 'bg-orange-100 text-orange-700',
}

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })
}

export function ReporteCampaniaModal({ campaniaId, onClose }: { campaniaId: number; onClose: () => void }) {
  const { data: reporte, isLoading: cargandoReporte } = useQuery({
    queryKey: ['email-reporte', campaniaId],
    queryFn: () => emailMarketingService.getReporte(campaniaId),
    refetchInterval: 10_000,
  })
  const { data: envios = [], isLoading: cargandoEnvios } = useQuery({
    queryKey: ['email-envios', campaniaId],
    queryFn: () => emailMarketingService.getEnvios(campaniaId),
    refetchInterval: 10_000,
  })

  return (
    <Modal isOpen onClose={onClose} title="Reporte de la campaña" size="lg">
      <div className="space-y-4">
        {cargandoReporte ? (
          <div className="flex justify-center py-6"><Spinner size="sm" /></div>
        ) : reporte && (
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-lg font-bold text-emerald-700">{reporte.enviado}</p>
              <p className="text-[11px] text-emerald-600 uppercase tracking-wide">Enviados</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 text-center">
              <p className="text-lg font-bold text-gray-700">{reporte.pendiente}</p>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide">Pendientes</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-center">
              <p className="text-lg font-bold text-red-700">{reporte.fallido}</p>
              <p className="text-[11px] text-red-600 uppercase tracking-wide">Fallidos</p>
            </div>
            <div className="rounded-xl bg-orange-50 p-3 text-center">
              <p className="text-lg font-bold text-orange-700">{reporte.omitido_baja}</p>
              <p className="text-[11px] text-orange-600 uppercase tracking-wide">Bajas omitidas</p>
            </div>
          </div>
        )}

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[45vh] overflow-y-auto">
            {cargandoEnvios ? (
              <div className="flex justify-center py-8"><Spinner size="sm" /></div>
            ) : envios.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Sin envíos todavía</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Correo</th>
                    <th className="text-left px-4 py-2">Estado</th>
                    <th className="text-left px-4 py-2">Enviado</th>
                    <th className="text-left px-4 py-2">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {envios.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 text-gray-700">{e.correo}</td>
                      <td className="px-4 py-2">
                        <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', ESTADO_COLOR[e.estado])}>
                          {e.estado}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatFecha(e.fechaEnvio)}</td>
                      <td className="px-4 py-2 text-red-500 text-xs truncate max-w-[200px]">{e.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
