import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { Globe2 } from 'lucide-react'
import type { PreguntaCerradaResultado, PreguntaAbiertaResultado } from '@/types/encuesta.types'

const OPCION_PALETTE_R = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#6B7280', '#DC2626']

export function PreguntaCerradaChart({ pregunta }: { pregunta: PreguntaCerradaResultado }) {
  const data = pregunta.opciones.map((o) => ({ name: o.opcion, total: o.total }))
  const totalRespuestas = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="card p-5">
      <h4 className="text-[0.8rem] font-bold text-gray-700 mb-1">{pregunta.pregunta}</h4>
      <p className="text-[0.65rem] text-gray-400 mb-3">{totalRespuestas} respuesta{totalRespuestas !== 1 ? 's' : ''}</p>
      {totalRespuestas === 0 ? (
        <p className="text-[0.75rem] text-gray-400 py-8 text-center">Sin respuestas aún</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => <Cell key={i} fill={OPCION_PALETTE_R[i % OPCION_PALETTE_R.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="total" nameKey="name" outerRadius={80} label>
                {data.map((_, i) => <Cell key={i} fill={OPCION_PALETTE_R[i % OPCION_PALETTE_R.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function PreguntaAbiertaTabla({ pregunta }: { pregunta: PreguntaAbiertaResultado }) {
  const fmt = (f: string) => {
    try { return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return f }
  }

  return (
    <div className="card p-5">
      <h4 className="text-[0.8rem] font-bold text-gray-700 mb-1">{pregunta.pregunta}</h4>
      <p className="text-[0.65rem] text-gray-400 mb-3">{pregunta.respuestas.length} respuesta{pregunta.respuestas.length !== 1 ? 's' : ''}</p>
      {pregunta.respuestas.length === 0 ? (
        <p className="text-[0.75rem] text-gray-400 py-8 text-center">Sin respuestas aún</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-3">Respondiente</th>
                <th className="py-2 pr-3">Respuesta</th>
                <th className="py-2 pr-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {pregunta.respuestas.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="py-2 pr-3 text-[0.75rem] font-semibold text-gray-700 whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      {r.respondiente}
                      {r.esPublico && (
                        <span className="chip bg-blue-100 text-blue-700 text-[0.6rem] inline-flex items-center gap-0.5">
                          <Globe2 className="h-2.5 w-2.5" /> público
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-[0.75rem] text-gray-600">{r.respuesta}</td>
                  <td className="py-2 pr-3 text-[0.68rem] text-gray-400 whitespace-nowrap">{fmt(r.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
