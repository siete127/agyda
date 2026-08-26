import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, BarChart2, X } from 'lucide-react'
import { api } from '@/lib/axios'

interface QuejaStat {
  usuarioId: number
  usuarioNombre: string | null
  usuarioRol: string | null
  total: number
}

const ROLES: Record<string, string> = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes' }

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function getRankColor(pct: number) {
  if (pct >= 0.75) return { bar: 'from-red-500 to-red-600', badge: 'bg-red-100 text-red-700 border-red-200', rank: 'bg-red-500 text-white', row: 'bg-red-50/30' }
  if (pct >= 0.45) return { bar: 'from-orange-400 to-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200', rank: 'bg-orange-400 text-white', row: 'bg-orange-50/30' }
  if (pct >= 0.20) return { bar: 'from-amber-400 to-amber-500', badge: 'bg-amber-100 text-amber-700 border-amber-200', rank: 'bg-amber-400 text-white', row: 'bg-amber-50/20' }
  return { bar: 'from-yellow-300 to-yellow-400', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', rank: 'bg-yellow-300 text-yellow-800', row: '' }
}

export function QuejasDashboardPage() {
  const navigate = useNavigate()
  const today = localDateStr()
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState(today)

  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  const { data: stats = [], isLoading, error } = useQuery<QuejaStat[]>({
    queryKey: ['quejas-stats', desde, hasta],
    queryFn: async () => {
      const { data } = await api.get('/quejas/stats', {
        headers: { tipousuario: 'AD' },
        params: { desde: desde || undefined, hasta: hasta || undefined },
      })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
    enabled: !rangoInvalido,
  })

  const maxTotal = useMemo(() => stats.reduce((m, s) => Math.max(m, s.total), 0), [stats])
  const totalQuejas = useMemo(() => stats.reduce((sum, s) => sum + s.total, 0), [stats])

  function irAQuejasDe(stat: QuejaStat) {
    const params = new URLSearchParams()
    if (stat.usuarioNombre) params.set('nombre', stat.usuarioNombre)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    navigate(`/quejas?${params.toString()}`)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/quejas')}
                className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Volver
              </button>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Dashboard de Quejas</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {totalQuejas} {totalQuejas === 1 ? 'queja' : 'quejas'} · {stats.length} {stats.length === 1 ? 'persona' : 'personas'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filtro de fechas */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
        </div>
        {desde && (
          <button onClick={() => setDesde('')} className="flex items-center gap-1 text-[0.75rem] text-gray-400 hover:text-gray-600 px-2 py-1.5">
            <X className="h-3.5 w-3.5" /> Quitar desde
          </button>
        )}
      </div>

      {rangoInvalido && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700">La fecha "Desde" no puede ser posterior a la fecha "Hasta".</p>
        </div>
      )}

      {/* Ranking */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {/* Cabecera del panel */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Quejas por persona</h2>
            <p className="text-[0.72rem] text-gray-400 mt-0.5">Haz clic en una tarjeta para ver el detalle</p>
          </div>
          <div className="flex items-center gap-3 text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-yellow-300" />Pocas</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-amber-400" />Moderado</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-orange-400" />Alto</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm bg-red-500" />Crítico</span>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-5">
          {rangoInvalido ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <AlertCircle className="h-8 w-8 text-amber-300" />
              <p className="text-sm">Corrige el rango de fechas para ver los datos</p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-50 p-4 space-y-3 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-28 rounded bg-gray-200" />
                      <div className="h-2.5 w-16 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="h-4 rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-red-500 text-sm">Error al cargar estadísticas</div>
          ) : stats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <BarChart2 className="h-8 w-8 text-gray-300" />
              <p className="text-sm">Sin quejas en este período</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {stats.map((s, i) => {
                const nombre = s.usuarioNombre ?? `Usuario #${s.usuarioId}`
                const pct = maxTotal > 0 ? s.total / maxTotal : 0
                const colors = getRankColor(pct)
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

                return (
                  <button
                    key={s.usuarioId ?? i}
                    onClick={() => irAQuejasDe(s)}
                    className={`flex flex-col gap-3 rounded-xl border border-gray-100 p-4 hover:border-brand/30 hover:shadow-sm transition-all text-left cursor-pointer ${colors.row}`}
                  >
                    {/* Cabecera: posición + nombre + badge */}
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[0.75rem] font-bold ${colors.rank}`}>
                        {medal ?? `#${i + 1}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.88rem] font-semibold text-gray-800 leading-tight truncate">{nombre}</p>
                        {s.usuarioRol && (
                          <p className="text-[0.7rem] font-medium text-gray-400 uppercase tracking-wide mt-0.5">
                            {ROLES[s.usuarioRol] ?? s.usuarioRol}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Barra */}
                    <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${colors.bar}`}
                        style={{ width: `${Math.max(pct * 100, 3)}%` }}
                      />
                    </div>

                    {/* Badge */}
                    <div className={`self-start inline-flex items-center rounded-full border px-3 py-1 text-[0.75rem] font-bold ${colors.badge}`}>
                      {s.total} {s.total === 1 ? 'queja' : 'quejas'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
