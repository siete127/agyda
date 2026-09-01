import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  History, ClipboardList, DollarSign, Smile, AlertOctagon, CalendarClock, FileText, Clock, User,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { HISTORIAL_TIPO_LABEL, type HistorialTipo } from '@/types/clienteSeguimiento.types'

const TIPO_ICONO: Record<HistorialTipo, React.ElementType> = {
  seguimiento: History, tarea: ClipboardList, pago: DollarSign, encuesta: Smile,
  incidencia: AlertOctagon, renovacion: CalendarClock, documento: FileText,
}

const TIPO_COLOR: Record<HistorialTipo, { bg: string; text: string }> = {
  seguimiento: { bg: 'bg-blue-50', text: 'text-blue-600' },
  tarea: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  pago: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  encuesta: { bg: 'bg-amber-50', text: 'text-amber-600' },
  incidencia: { bg: 'bg-red-50', text: 'text-red-600' },
  renovacion: { bg: 'bg-purple-50', text: 'text-purple-600' },
  documento: { bg: 'bg-gray-100', text: 'text-gray-600' },
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

export function HistorialTab({ contactoId }: { contactoId: number }) {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['cliente-historial', contactoId],
    queryFn: () => clienteSeguimientoService.getHistorial(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Historial de comunicaciones</p>
        <p className="text-[0.68rem] text-gray-400">Línea de tiempo con todas las interacciones registradas con este cliente</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : eventos.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin actividad registrada todavía</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {eventos.map((e) => {
            const Icon = TIPO_ICONO[e.tipo]
            const cfg = TIPO_COLOR[e.tipo]
            return (
              <div key={`${e.tipo}-${e.id}`} className="flex items-start gap-3 px-4 py-3">
                <div className={clsx('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
                  <Icon className={clsx('h-4 w-4', cfg.text)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', cfg.bg, cfg.text)}>{HISTORIAL_TIPO_LABEL[e.tipo]}</span>
                    <p className="text-[0.8rem] font-semibold text-gray-800">{e.titulo}</p>
                  </div>
                  {e.detalle && <p className="mt-0.5 text-sm text-gray-600">{e.detalle}</p>}
                  <p className="mt-1 flex items-center gap-2 text-[0.68rem] text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtFecha(e.fecha)}</span>
                    {e.usuarioNombre && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {e.usuarioNombre}</span>}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
