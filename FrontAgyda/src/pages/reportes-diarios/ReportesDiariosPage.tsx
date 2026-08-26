import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Users, ListChecks, Coffee } from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import { Spinner } from '@/components/ui/Spinner'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

const PAUSA_LABELS: Record<string, string> = {
  banio: 'Baño',
  comida: 'Comida',
  capacitacion: 'Capacitación',
  permiso: 'Permiso',
}

export function ReportesDiariosPage() {
  const [fecha, setFecha] = useState(hoy())

  const { data, isLoading } = useQuery({
    queryKey: ['operaciones-reporte-diario', fecha],
    queryFn: () => reporteDiarioService.get(fecha),
  })

  const maxCampania = data ? Math.max(1, ...data.porCampania.map((c) => c.count)) : 1
  const maxRanking = data ? Math.max(1, ...data.rankingPausas.map((r) => r.minutosPausa)) : 1

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-brand" /> Reportes diarios
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Resumen consolidado de operación por día</p>
        </div>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" max={hoy()} />
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'asignado', icon: ListChecks, label: 'Registros asignados', value: data.totalAsignado, tone: 'brand' },
              { key: 'agentes-asignacion', icon: Users, label: 'Agentes con asignación', value: data.agentesConAsignacion, tone: 'brand' },
              { key: 'agentes-trabajaron', icon: Users, label: 'Agentes que trabajaron', value: data.agentesTrabajaron, tone: 'success' },
              { key: 'pausa-total', icon: Coffee, label: 'Minutos en pausa (total)', value: Object.values(data.minutosPorTipo).reduce((a, b) => a + b, 0), tone: 'warn' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Asignación por campaña</h2>
              {data.porCampania.length === 0 ? (
                <p className="text-xs text-ink-tertiary py-4 text-center">Sin asignaciones este día</p>
              ) : (
                <ProgressBarList
                  items={data.porCampania.map((c) => ({ key: c.campania, label: c.campania, value: c.count, max: maxCampania }))}
                />
              )}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 text-sm font-bold text-ink">Minutos en pausa por tipo</h2>
              <div className="space-y-3">
                {Object.entries(data.minutosPorTipo).map(([key, min]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-600">{PAUSA_LABELS[key] ?? key}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-900">{min} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">Agentes con más tiempo en pausa</h2>
            {data.rankingPausas.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-4 text-center">Sin registros de pausa este día</p>
            ) : (
              <ProgressBarList
                items={data.rankingPausas.map((r) => ({ key: String(r.agenteId), label: r.nombre, value: r.minutosPausa, max: maxRanking }))}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
