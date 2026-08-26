import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, DollarSign, Target, Users, AlertTriangle, Play, Trophy, Settings, ShieldCheck } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { crmService } from '@/services/crm.service'
import { CRM_ETAPAS } from '@/types/crm.types'
import { useCurrentUser } from '@/hooks/useAuth'

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const ETAPA_COLOR: Record<string, string> = {
  prospecto: '#94a3b8', contactado: '#60a5fa', propuesta: '#a78bfa',
  negociacion: '#fbbf24', ganado: '#34d399', perdido: '#f87171',
}

/* ═══════════════════════════════════════════════════
   KPI CARD
═══════════════════════════════════════════════════ */
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={clsx('rounded-2xl border p-4 flex flex-col gap-1', color)}>
      <p className="text-[0.68rem] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-[1.4rem] font-black leading-none">{value}</p>
      {sub && <p className="text-[0.68rem] opacity-60">{sub}</p>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   REPORTES TAB
═══════════════════════════════════════════════════ */
export function CRMReportesTab() {
  const user   = useCurrentUser()
  const qc     = useQueryClient()
  const isAD   = user?.tipoUsuario === 'AD'
  const now    = new Date()
  const [cuotaMes, setCuotaMes] = useState(now.getMonth() + 1)
  const [cuotaAnio, setCuotaAnio] = useState(now.getFullYear())
  const [showCuotaModal, setShowCuotaModal] = useState(false)
  const [showReglaModal, setShowReglaModal] = useState(false)
  const [reglaForm, setReglaForm] = useState({ etapaTrigger: 'prospecto', tipoActividad: 'tarea', descripcion: '', diasOffset: 1 })
  const [showAddAcceso, setShowAddAcceso] = useState(false)
  const [accesoUserId, setAccesoUserId] = useState<number | ''>('')

  const { data: kpis, isLoading: loadKpis } = useQuery({
    queryKey: ['crm-kpis'],
    queryFn: crmService.getKpis,
    staleTime: 60_000,
  })
  const { data: embudo = [], isLoading: loadEmbudo } = useQuery({
    queryKey: ['crm-embudo'],
    queryFn: crmService.getEmbudo,
    staleTime: 60_000,
  })
  const { data: forecast = [], isLoading: loadForecast } = useQuery({
    queryKey: ['crm-forecast'],
    queryFn: crmService.getForecast,
    staleTime: 60_000,
  })
  const { data: responsables = [], isLoading: loadResp } = useQuery({
    queryKey: ['crm-responsables'],
    queryFn: crmService.getPorResponsable,
    staleTime: 60_000,
    enabled: isAD,
  })
  const { data: cuotas = [], isLoading: loadCuotas } = useQuery({
    queryKey: ['crm-cuotas', cuotaAnio, cuotaMes],
    queryFn: () => crmService.getCuotas(cuotaAnio, cuotaMes),
    staleTime: 60_000,
    enabled: isAD,
  })
  const { data: reglas = [], refetch: refetchReglas } = useQuery({
    queryKey: ['crm-automatizaciones-reglas'],
    queryFn: crmService.getAutomatizacionesReglas,
    enabled: isAD,
    staleTime: 60_000,
  })
  const { data: accesos = [], refetch: refetchAccesos } = useQuery({
    queryKey: ['crm-accesos'],
    queryFn: crmService.getAccesosCRM,
    enabled: isAD,
    staleTime: 60_000,
  })
  const { data: usuariosList = [] } = useQuery({
    queryKey: ['usuarios-list'],
    queryFn: async () => {
      const { data } = await import('@/lib/axios').then(m => m.api.get('/usuarios'))
      const arr = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (arr as Record<string, unknown>[])
        .filter((u) => u['NEUS_ACTIVO'] === true || u['NEUS_ACTIVO'] === 1)
        .map((u) => ({ id: Number(u['NEUS_ID'] ?? u['id']), nombre: String(u['NEUS_NOMBRE'] ?? u['NEUS_NOMBRES'] ?? '') }))
    },
    staleTime: 300_000,
    enabled: isAD,
  })

  const runAuto = useMutation({
    mutationFn: crmService.runAutomatizaciones,
    onSuccess: () => {
      toast.success('Automatizaciones ejecutadas')
      qc.invalidateQueries({ queryKey: ['crm-kpis'] })
      qc.invalidateQueries({ queryKey: ['crm-oportunidades'] })
    },
    onError: () => toast.error('Error al ejecutar'),
  })

  const crearRegla = useMutation({
    mutationFn: () => crmService.createAutomatizacionRegla(reglaForm),
    onSuccess: () => { refetchReglas(); setShowReglaModal(false); toast.success('Regla creada') },
    onError: () => toast.error('Error al crear regla'),
  })
  const toggleRegla = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => crmService.updateAutomatizacionRegla(id, { activo }),
    onSuccess: () => refetchReglas(),
    onError: () => toast.error('Error al actualizar regla'),
  })
  const eliminarRegla = useMutation({
    mutationFn: (id: number) => crmService.deleteAutomatizacionRegla(id),
    onSuccess: () => { refetchReglas(); toast.success('Regla eliminada') },
    onError: () => toast.error('Error al eliminar regla'),
  })
  const toggleAcceso = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => crmService.updateAccesoCRM(id, { activo }),
    onSuccess: () => refetchAccesos(),
    onError: () => toast.error('Error al actualizar acceso'),
  })
  const agregarAcceso = useMutation({
    mutationFn: (userId: number) => crmService.addAccesoCRM(userId),
    onSuccess: () => { refetchAccesos(); setShowAddAcceso(false); setAccesoUserId(''); toast.success('Acceso agregado') },
    onError: () => toast.error('Error al agregar acceso'),
  })
  const eliminarAcceso = useMutation({
    mutationFn: (id: number) => crmService.deleteAccesoCRM(id),
    onSuccess: () => { refetchAccesos(); toast.success('Acceso eliminado') },
    onError: () => toast.error('Error al eliminar acceso'),
  })

  // Preparar datos del embudo en orden
  const embudoOrdenado = CRM_ETAPAS.map((e) => {
    const found = embudo.find((d) => d.etapa === e.key)
    return { etapa: e.key, label: e.label, total: found?.total ?? 0, valor: found?.valor ?? 0 }
  }).filter((d) => d.total > 0)

  // Forecast: agrupar por mes-anio y sumar valor
  const forecastMeses: Record<string, number> = {}
  forecast.forEach((f) => {
    const key = `${f.anio}-${String(f.mes).padStart(2,'0')}`
    forecastMeses[key] = (forecastMeses[key] ?? 0) + f.valor
  })
  const forecastData = Object.entries(forecastMeses)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key, valor]) => {
      const [anio, mes] = key.split('-')
      return { label: `${MESES[parseInt(mes)-1]} ${anio}`, valor }
    })

  const fmtMXN = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {loadKpis ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Pipeline activo" value={fmtMXN(kpis.valorPipeline)} sub={`${kpis.totalActivas} oportunidades`} color="bg-blue-50 border-blue-100 text-blue-800" />
          <KpiCard label="Ganado" value={fmtMXN(kpis.valorGanado)} sub={`${kpis.totalGanadas} cerradas`} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
          <KpiCard label="Perdidas" value={String(kpis.totalPerdidas)} sub="oportunidades" color="bg-red-50 border-red-100 text-red-700" />
          <KpiCard label="Vencidas" value={String(kpis.vencidas)} sub="fecha cierre pasada" color={kpis.vencidas > 0 ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-gray-50 border-gray-100 text-gray-600"} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Embudo */}
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-5">
          <h3 className="text-[0.82rem] font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand" /> Embudo de ventas
          </h3>
          {loadEmbudo ? <div className="flex justify-center py-8"><Spinner /></div> : embudoOrdenado.length === 0 ? (
            <p className="text-[0.78rem] text-gray-400 py-8 text-center">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {embudoOrdenado.map((d) => {
                const maxTotal = Math.max(...embudoOrdenado.map((x) => x.total), 1)
                return (
                  <div key={d.etapa}>
                    <div className="flex items-center justify-between text-[0.72rem] mb-1">
                      <span className="font-semibold text-gray-700">{d.label}</span>
                      <span className="text-gray-500">{d.total} · {fmtMXN(d.valor)}</span>
                    </div>
                    <div className="h-5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(d.total / maxTotal) * 100}%`, backgroundColor: ETAPA_COLOR[d.etapa] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Forecast */}
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-5">
          <h3 className="text-[0.82rem] font-bold text-gray-800 mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Forecast por mes de cierre
          </h3>
          {loadForecast ? <div className="flex justify-center py-8"><Spinner /></div> : forecastData.length === 0 ? (
            <p className="text-[0.78rem] text-gray-400 py-8 text-center">Sin oportunidades con fecha de cierre próxima</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={forecastData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmtMXN(Number(v))} />
                <Bar dataKey="valor" fill="#4f46e5" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Por responsable (solo AD) */}
      {isAD && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-[0.82rem] font-bold text-gray-800 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" /> Por responsable
            </h3>
          </div>
          {loadResp ? <div className="flex justify-center py-8"><Spinner /></div> : responsables.length === 0 ? (
            <p className="text-[0.78rem] text-gray-400 py-8 text-center">Sin datos</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {responsables.map((r) => (
                <div key={r.usuarioId} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-[0.68rem] font-bold">
                    {r.nombre?.charAt(0) ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.82rem] font-semibold text-gray-800">{r.nombre}</p>
                    <p className="text-[0.68rem] text-gray-400">{r.total} ops · {r.ganadas} ganadas · {r.perdidas} perdidas</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[0.78rem] font-bold text-emerald-700">{fmtMXN(r.valorGanado)}</p>
                    <p className="text-[0.65rem] text-gray-400">pipeline {fmtMXN(r.valorPipeline)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cuotas (solo AD) */}
      {isAD && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
            <h3 className="text-[0.82rem] font-bold text-gray-800 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" /> Cuotas mensuales
            </h3>
            <div className="flex items-center gap-2">
              <select value={cuotaMes} onChange={(e) => setCuotaMes(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-2 py-1 text-[0.72rem] outline-none focus:border-brand">
                {MESES.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={cuotaAnio} onChange={(e) => setCuotaAnio(Number(e.target.value))}
                className="rounded-lg border border-gray-200 px-2 py-1 text-[0.72rem] outline-none focus:border-brand">
                {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <button onClick={() => setShowCuotaModal(true)}
                className="rounded-lg bg-brand px-3 py-1 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
                + Asignar
              </button>
            </div>
          </div>
          {loadCuotas ? <div className="flex justify-center py-8"><Spinner /></div> : cuotas.length === 0 ? (
            <p className="text-[0.78rem] text-gray-400 py-8 text-center">Sin cuotas para este periodo</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {cuotas.map((c) => {
                const pct = c.meta > 0 ? Math.min(100, Math.round((c.logrado / c.meta) * 100)) : 0
                return (
                  <div key={c.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[0.82rem] font-semibold text-gray-800">{c.nombre}</p>
                      <p className="text-[0.72rem] font-bold text-gray-700">{fmtMXN(c.logrado)} / {fmtMXN(c.meta)}</p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[0.65rem] text-gray-400 mt-0.5">{pct}% completado</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Automatizaciones */}
      {isAD && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.82rem] font-bold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Automatizaciones CRM
            </p>
            <p className="text-[0.72rem] text-amber-700 mt-0.5">
              Corre cada día a las 8 AM: crea tareas para opos sin actividad (+7d) y alerta fechas de cierre vencidas.
            </p>
          </div>
          <button
            onClick={() => runAuto.mutate()}
            disabled={runAuto.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-[0.78rem] font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {runAuto.isPending ? <Spinner size="sm" /> : <Play className="h-3.5 w-3.5" />} Ejecutar ahora
          </button>
        </div>
      )}

      {/* ── Pivot: Revenue por etapa y mes ── */}
      <PivotEtapaMes forecast={forecast} loadForecast={loadForecast} fmtMXN={fmtMXN} />

      {/* Accesos CRM (solo AD) */}
      {isAD && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
            <h3 className="text-[0.82rem] font-bold text-gray-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-500" /> Administración de Accesos CRM
            </h3>
            <button
              onClick={() => setShowAddAcceso(true)}
              className="rounded-lg bg-brand px-3 py-1 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors"
            >
              + Agregar acceso
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {(accesos as any[]).length === 0 && (
              <p className="text-[0.78rem] text-gray-400 py-6 text-center">Sin accesos configurados</p>
            )}
            {(accesos as any[]).map((a) => (
              <div key={a.id ?? a.accesoId} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-[0.68rem] font-bold">
                  {(a.nombre ?? a.usuario ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.82rem] font-semibold text-gray-800">{a.nombre}</p>
                  <p className="text-[0.68rem] text-gray-400">{a.tipoUsuario} · {a.usuario}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {a.accesoId != null && (
                    <>
                      <button
                        onClick={() => toggleAcceso.mutate({ id: a.accesoId, activo: !a.accesoActivo })}
                        className={clsx('h-5 w-9 rounded-full transition-colors relative', a.accesoActivo ? 'bg-indigo-500' : 'bg-gray-200')}
                      >
                        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', a.accesoActivo ? 'translate-x-4' : 'translate-x-0.5')} />
                      </button>
                      <button
                        onClick={() => eliminarAcceso.mutate(a.accesoId)}
                        className="text-red-400 hover:text-red-600 text-[0.72rem]"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                  {a.accesoId == null && (
                    <span className="text-[0.72rem] text-gray-400 italic">Sin acceso</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reglas de Automatización (solo AD) */}
      {isAD && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-wrap gap-2">
            <h3 className="text-[0.82rem] font-bold text-gray-800 flex items-center gap-2">
              <Settings className="h-4 w-4 text-violet-500" /> Reglas de Automatización por Etapa
            </h3>
            <button
              onClick={() => { setReglaForm({ etapaTrigger: 'prospecto', tipoActividad: 'tarea', descripcion: '', diasOffset: 1 }); setShowReglaModal(true) }}
              className="rounded-lg bg-brand px-3 py-1 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors"
            >
              + Nueva regla
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.78rem]">
              <thead>
                <tr className="text-left text-[0.68rem] text-gray-500 bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-2 font-medium">Etapa trigger</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium text-center">Días</th>
                  <th className="px-3 py-2 font-medium text-center">Activo</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(reglas as any[]).length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-gray-400 text-[0.78rem]">Sin reglas configuradas</td></tr>
                )}
                {(reglas as any[]).map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-2.5">
                      <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-medium bg-violet-100 text-violet-700 capitalize">{r.etapaTrigger}</span>
                    </td>
                    <td className="px-3 py-2.5 capitalize text-gray-600">{r.tipoActividad}</td>
                    <td className="px-3 py-2.5 text-gray-700 max-w-[200px] truncate">{r.descripcion}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{r.diasOffset}d</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => toggleRegla.mutate({ id: r.id, activo: !r.activo })}
                        className={clsx('h-5 w-9 rounded-full transition-colors relative', r.activo ? 'bg-violet-500' : 'bg-gray-200')}
                      >
                        <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', r.activo ? 'translate-x-4' : 'translate-x-0.5')} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => eliminarRegla.mutate(r.id)} className="text-red-400 hover:text-red-600 text-[0.72rem]">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCuotaModal && (
        <CuotaModal
          anio={cuotaAnio}
          mes={cuotaMes}
          onClose={() => setShowCuotaModal(false)}
          onSaved={() => { setShowCuotaModal(false); qc.invalidateQueries({ queryKey: ['crm-cuotas'] }) }}
        />
      )}

      {showReglaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowReglaModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h4 className="font-semibold text-gray-900 text-[0.9rem]">Nueva regla de automatización</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-[0.72rem] font-semibold text-gray-600 mb-1">Etapa trigger</label>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.82rem] outline-none focus:border-brand"
                  value={reglaForm.etapaTrigger}
                  onChange={e => setReglaForm(f => ({ ...f, etapaTrigger: e.target.value }))}
                >
                  {['prospecto','contactado','propuesta','negociacion','ganado','perdido'].map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[0.72rem] font-semibold text-gray-600 mb-1">Tipo de actividad</label>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.82rem] outline-none focus:border-brand"
                  value={reglaForm.tipoActividad}
                  onChange={e => setReglaForm(f => ({ ...f, tipoActividad: e.target.value }))}
                >
                  {['llamada','email','reunion','nota','tarea'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[0.72rem] font-semibold text-gray-600 mb-1">Descripción</label>
                <input
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.82rem] outline-none focus:border-brand"
                  value={reglaForm.descripcion}
                  onChange={e => setReglaForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej. Llamar al cliente para seguimiento"
                />
              </div>
              <div>
                <label className="block text-[0.72rem] font-semibold text-gray-600 mb-1">Días de offset (vencimiento)</label>
                <input
                  type="number" min="1" max="90"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.82rem] outline-none focus:border-brand"
                  value={reglaForm.diasOffset}
                  onChange={e => setReglaForm(f => ({ ...f, diasOffset: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setShowReglaModal(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button
                onClick={() => crearRegla.mutate()}
                disabled={!reglaForm.descripcion.trim() || crearRegla.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {crearRegla.isPending && <Spinner size="sm" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddAcceso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddAcceso(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h4 className="font-semibold text-gray-900 text-[0.9rem]">Agregar acceso CRM</h4>
            <div>
              <label className="block text-[0.72rem] font-semibold text-gray-600 mb-1">Usuario (AD/TI)</label>
              <select
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.82rem] outline-none focus:border-brand"
                value={accesoUserId}
                onChange={e => setAccesoUserId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Seleccionar...</option>
                {(usuariosList as any[]).map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setShowAddAcceso(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button
                onClick={() => accesoUserId !== '' && agregarAcceso.mutate(Number(accesoUserId))}
                disabled={accesoUserId === '' || agregarAcceso.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {agregarAcceso.isPending && <Spinner size="sm" />} Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CuotaModal({ anio, mes, onClose, onSaved }: {
  anio: number; mes: number; onClose: () => void; onSaved: () => void
}) {
  const [usuarioId, setUsuarioId] = useState<number | ''>('')
  const [meta, setMeta]           = useState('')
  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-list'],
    queryFn: async () => {
      const { data } = await import('@/lib/axios').then(m => m.api.get('/usuarios'))
      const arr = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (arr as Record<string, unknown>[])
        .filter((u) => u['NEUS_ACTIVO'] === true || u['NEUS_ACTIVO'] === 1)
        .map((u) => ({ id: Number(u['NEUS_ID'] ?? u['id']), nombre: String(u['NEUS_NOMBRE'] ?? '') }))
    },
    staleTime: 300_000,
  })
  const save = useMutation({
    mutationFn: () => crmService.upsertCuota({ usuarioId: Number(usuarioId), anio, mes, meta: parseFloat(meta) }),
    onSuccess: () => { toast.success('Cuota guardada'); onSaved() },
    onError: () => toast.error('Error'),
  })
  return (
    <Modal isOpen title={`Cuota — ${MESES[mes-1]} ${anio}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="field-label">Vendedor</label>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value ? Number(e.target.value) : '')} className="field-input">
            <option value="">Seleccionar...</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Meta ($)</label>
          <input type="number" value={meta} onChange={(e) => setMeta(e.target.value)} className="field-input" placeholder="50000" min="0" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={() => save.mutate()} disabled={!usuarioId || !meta || save.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {save.isPending && <Spinner size="sm" />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════
   PIVOT — Revenue por etapa y mes
═══════════════════════════════════════════════════ */
const PIVOT_ETAPAS = ['prospecto', 'contactado', 'propuesta', 'negociacion']
const PIVOT_ETAPA_LABELS: Record<string, string> = {
  prospecto: 'Prospecto', contactado: 'Contactado', propuesta: 'Propuesta', negociacion: 'Negociación',
}

function PivotEtapaMes({
  forecast,
  loadForecast,
  fmtMXN,
}: {
  forecast: { anio: number; mes: number; etapa: string; total: number; valor: number }[]
  loadForecast: boolean
  fmtMXN: (n: number) => string
}) {
  const now = new Date()

  const meses = useMemo(() => {
    const result: { label: string; key: string }[] = []
    for (let offset = -1; offset <= 6; offset++) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const anio = d.getFullYear()
      const mes  = d.getMonth() + 1
      result.push({
        key: `${anio}-${String(mes).padStart(2, '0')}`,
        label: `${MESES[mes - 1]} ${anio}`,
      })
    }
    return result
  }, [])

  const pivot = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    forecast.forEach((f) => {
      if (!PIVOT_ETAPAS.includes(f.etapa)) return
      const key = `${f.anio}-${String(f.mes).padStart(2, '0')}`
      if (!map[key]) map[key] = {}
      map[key][f.etapa] = (map[key][f.etapa] ?? 0) + f.valor
    })
    return map
  }, [forecast])

  const totalesPorEtapa = useMemo(() =>
    PIVOT_ETAPAS.reduce<Record<string, number>>((acc, etapa) => {
      acc[etapa] = meses.reduce((s, m) => s + (pivot[m.key]?.[etapa] ?? 0), 0)
      return acc
    }, {}),
  [pivot, meses])

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-[0.82rem] font-bold text-gray-800 flex items-center gap-2">
          <span className="text-purple-500">⊞</span> Revenue por etapa y mes
        </h3>
      </div>
      {loadForecast ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-auto w-full text-[0.72rem]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-[0.68rem] font-bold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">Mes</th>
                {PIVOT_ETAPAS.map((e) => (
                  <th key={e} className="px-4 py-2.5 text-right text-[0.68rem] font-bold uppercase tracking-wide" style={{ color: ETAPA_COLOR[e] }}>
                    {PIVOT_ETAPA_LABELS[e]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {meses.map((m) => (
                <tr key={m.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-gray-700 sticky left-0 bg-white">{m.label}</td>
                  {PIVOT_ETAPAS.map((e) => {
                    const val = pivot[m.key]?.[e] ?? 0
                    return (
                      <td key={e} className={clsx('px-4 py-2.5 text-right tabular-nums', val > 0 ? 'text-gray-800 font-medium' : 'text-gray-300')}>
                        {val > 0 ? fmtMXN(val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-4 py-2.5 font-bold text-gray-700 text-[0.72rem] uppercase sticky left-0 bg-gray-50">Total</td>
                {PIVOT_ETAPAS.map((e) => (
                  <td key={e} className="px-4 py-2.5 text-right font-bold text-gray-800 tabular-nums">
                    {totalesPorEtapa[e] > 0 ? fmtMXN(totalesPorEtapa[e]) : '—'}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
