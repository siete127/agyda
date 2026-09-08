import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Users, AlertTriangle, Download } from 'lucide-react'
import { reporteDiarioService } from '@/services/reporteDiario.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import { Spinner } from '@/components/ui/Spinner'
import { TIPIFICACIONES_LLAMADA_LABEL } from '@/constants/tipificacionesLlamada'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function hace30Dias() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function ReportesDiariosPage() {
  const [desde, setDesde] = useState(hace30Dias())
  const [hasta, setHasta] = useState(hoy())

  const { data, isLoading } = useQuery({
    queryKey: ['operaciones-reporte-postulantes', desde, hasta],
    queryFn: () => reporteDiarioService.getPostulantes({ desde, hasta }),
  })

  const porCampaniaTotales = new Map<string, number>()
  data?.porCampania.forEach((c) => porCampaniaTotales.set(c.campania, (porCampaniaTotales.get(c.campania) ?? 0) + c.total))
  const campaniaItems = Array.from(porCampaniaTotales.entries()).map(([campania, total]) => ({ campania, total }))
  const totalPostulantes = campaniaItems.reduce((a, c) => a + c.total, 0)
  const campaniaTop = campaniaItems.slice().sort((a, b) => b.total - a.total)[0]
  const maxCampania = Math.max(1, ...campaniaItems.map((c) => c.total))
  const maxTip = data ? Math.max(1, ...data.porTipificacion.map((t) => t.total)) : 1
  const maxAgente = data ? Math.max(1, ...data.productividadAgentes.map((a) => a.notas)) : 1

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand" /> Reportería de postulantes
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Volumen, tipificación y seguimiento en un rango de fechas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="field" max={hasta} />
          <span className="text-xs text-ink-tertiary">a</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="field" min={desde} max={hoy()} />
          <a
            href={reporteDiarioService.excelPostulantesUrl({ desde, hasta })}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[0.75rem] font-semibold text-ink-secondary transition hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </a>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          <DashboardStatRow
            stats={[
              { key: 'total', icon: ClipboardList, label: 'Postulantes en el rango', value: totalPostulantes, tone: 'brand' },
              { key: 'sin-tip', icon: AlertTriangle, label: 'Sin tipificar', value: data.sinTipificar.total, tone: 'warn' },
              { key: 'top-campania', icon: Users, label: 'Campaña con más volumen', value: campaniaTop?.campania ?? '—', tone: 'success' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Por campaña</h3>
              {campaniaItems.length === 0 ? (
                <p className="text-xs text-ink-tertiary py-4 text-center">Sin postulantes en este rango</p>
              ) : (
                <ProgressBarList
                  items={campaniaItems.map((c) => ({ key: c.campania, label: c.campania, value: c.total, max: maxCampania }))}
                />
              )}
            </div>

            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">Por tipificación</h3>
              {data.porTipificacion.length === 0 ? (
                <p className="text-xs text-ink-tertiary py-4 text-center">Sin postulantes en este rango</p>
              ) : (
                <ProgressBarList
                  items={data.porTipificacion.map((t) => ({
                    key: t.tipificacion ?? 'sin-tipificar',
                    label: t.tipificacion ? (TIPIFICACIONES_LLAMADA_LABEL[t.tipificacion] || t.etiqueta) : 'Sin tipificar',
                    value: t.total, max: maxTip,
                  }))}
                />
              )}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Productividad por agente (notas registradas)</h3>
            {data.productividadAgentes.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-4 text-center">Sin notas registradas en este rango</p>
            ) : (
              <ProgressBarList
                items={data.productividadAgentes.map((a) => ({
                  key: String(a.usuarioId), label: a.usuarioNombre || `Usuario ${a.usuarioId}`, value: a.notas, max: maxAgente,
                }))}
              />
            )}
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-ink">Sin tipificar — más antiguos</h3>
            {data.sinTipificar.masAntiguos.length === 0 ? (
              <p className="text-xs text-ink-tertiary py-4 text-center">No hay postulantes sin tipificar en este rango</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Teléfono</th>
                      <th className="px-3 py-2">Campaña</th>
                      <th className="px-3 py-2">Días esperando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sinTipificar.masAntiguos.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-semibold text-ink">{p.nombre}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.telefono}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.campania}</td>
                        <td className="px-3 py-2 text-ink-secondary">{p.diasEsperando}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
