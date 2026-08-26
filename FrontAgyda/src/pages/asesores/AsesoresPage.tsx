import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Headset, LogIn, Coffee, UserCheck, ListTree } from 'lucide-react'
import { asesoresService } from '@/services/asesores.service'
import { TIPO_PAUSA_LABELS } from '@/types/asesores.types'
import { Spinner } from '@/components/ui/Spinner'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function formatHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatMinutos(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}min`
}

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-emerald-100 text-emerald-700',
  sanitario: 'bg-amber-100 text-amber-700',
  comida: 'bg-orange-100 text-orange-700',
  capacitacion: 'bg-blue-100 text-blue-700',
  'capacitación': 'bg-blue-100 text-blue-700',
  permiso: 'bg-purple-100 text-purple-700',
  desconocido: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, string> = {
  online: 'Disponible',
  sanitario: 'Baño',
  comida: 'Comida',
  capacitacion: 'Capacitación',
  'capacitación': 'Capacitación',
  permiso: 'Permiso',
  desconocido: 'Desconocido',
}

export function AsesoresPage() {
  const [fecha, setFecha] = useState(hoy())

  const { data, isLoading } = useQuery({
    queryKey: ['asesores-mi-resumen', fecha],
    queryFn: () => asesoresService.getMiResumen(fecha),
    refetchInterval: 15_000,
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Headset className="h-5 w-5 text-brand" /> Asesores
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Mi día — estado y tiempos personales</p>
        </div>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <div className={clsx('card p-4 flex items-center gap-3', data.estado === 'pausa' && 'border-amber-200 bg-amber-50/40')}>
            <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full', data.estado === 'pausa' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')}>
              {data.estado === 'pausa' ? <Coffee className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {data.estado === 'pausa' ? `En ${TIPO_PAUSA_LABELS[data.tipoPausaActual ?? ''] ?? data.tipoPausaActual}` : 'Disponible'}
              </p>
              <p className="text-xs text-gray-500">Estado actual</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><LogIn className="h-4 w-4" /></div>
              <div><p className="text-sm font-bold text-gray-900 leading-tight">{formatHora(data.primeraEntrada)}</p><p className="text-[0.68rem] text-gray-500">Primera entrada</p></div>
            </div>
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Coffee className="h-4 w-4" /></div>
              <div><p className="text-sm font-bold text-gray-900 leading-tight">{formatMinutos(data.minutosEnPausa)}</p><p className="text-[0.68rem] text-gray-500">Tiempo en pausa</p></div>
            </div>
            <div className="card p-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600"><ListTree className="h-4 w-4" /></div>
              <div><p className="text-sm font-bold text-gray-900 leading-tight">{data.sesiones.length}</p><p className="text-[0.68rem] text-gray-500">Registros hoy</p></div>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">Minutos por tipo de pausa</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(data.minutosPorTipo).map(([key, min]) => (
                <div key={key} className="rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-base font-bold text-gray-900">{min}</p>
                  <p className="text-[0.65rem] text-gray-500">{TIPO_PAUSA_LABELS[key] ?? key} (min)</p>
                </div>
              ))}
            </div>
          </div>

          {data.sesiones.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-semibold">Estado</th>
                    <th className="px-4 py-2.5 font-semibold">Inicio</th>
                    <th className="px-4 py-2.5 font-semibold">Fin</th>
                    <th className="px-4 py-2.5 font-semibold">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sesiones.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5">
                        <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', STATUS_COLOR[s.statusClave] ?? STATUS_COLOR.desconocido)}>
                          {STATUS_LABELS[s.statusClave] ?? s.statusClave}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{formatHora(s.fechaInicio)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{s.fechaFin ? formatHora(s.fechaFin) : <span className="text-emerald-600 font-medium">en curso</span>}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{formatMinutos(s.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
