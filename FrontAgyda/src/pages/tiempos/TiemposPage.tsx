import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Clock, LogIn, Coffee, ListTree } from 'lucide-react'
import { tiemposService } from '@/services/tiempos.service'
import { STATUS_LABELS } from '@/types/tiempos.types'
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

export function TiemposPage() {
  const [agenteId, setAgenteId] = useState<number | ''>('')
  const [fecha, setFecha] = useState(hoy())

  const { data: agentes = [], isLoading: loadingAgentes } = useQuery({
    queryKey: ['tiempos-mis-agentes'],
    queryFn: () => tiemposService.getMisAgentes(),
  })

  const agenteSeleccionado = useMemo(() => {
    if (agenteId !== '') return agenteId
    return agentes.length > 0 ? agentes[0].id : ''
  }, [agenteId, agentes])

  const { data, isLoading } = useQuery({
    queryKey: ['tiempos-agente', agenteSeleccionado, fecha],
    queryFn: () => tiemposService.getTiempos(Number(agenteSeleccionado), fecha),
    enabled: agenteSeleccionado !== '',
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Clock className="h-5 w-5 text-brand" /> Tiempos
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Bitácora detallada de sesiones y pausas por agente</p>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Agente</label>
          <select
            value={agenteSeleccionado}
            onChange={(e) => setAgenteId(e.target.value ? Number(e.target.value) : '')}
            disabled={loadingAgentes}
            className="field min-w-[220px]"
          >
            {agentes.length === 0 && <option value="">Sin agentes disponibles</option>}
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
        </div>
      </div>

      {agenteSeleccionado === '' ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Clock className="h-8 w-8" />
          <p className="text-sm">No tienes agentes asignados para consultar</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !data || data.sesiones.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ListTree className="h-8 w-8" />
          <p className="text-sm">Sin registros de tiempo para esta fecha</p>
        </div>
      ) : (
        <>
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
              <div><p className="text-sm font-bold text-gray-900 leading-tight">{data.sesiones.length}</p><p className="text-[0.68rem] text-gray-500">Registros</p></div>
            </div>
          </div>

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
        </>
      )}
    </div>
  )
}
