import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Megaphone, Search, Users } from 'lucide-react'
import { api } from '@/lib/axios'
import { Spinner } from '@/components/ui/Spinner'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { useActionAccess } from '@/hooks/useActionAccess'

interface AgenteCampana {
  neusId: number
  nombre: string
  campanaId: number | null
  campanaNombre: string | null
  fechaAsignacion: string | null
}

interface CampanaDisponible {
  id: number
  nombre: string
  color: string | null
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function CampanasPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeGestionar = can('accesos', 'gestionar')
  const [search, setSearch] = useState('')
  const [filtroCampana, setFiltroCampana] = useState('todas')

  const { data: agentes = [], isLoading } = useQuery({
    queryKey: ['campanas-agentes'],
    queryFn: async () => {
      const { data } = await api.get('/campanas/agentes')
      return (data?.data ?? []) as AgenteCampana[]
    },
    staleTime: 30_000,
  })

  const { data: campanasDisponibles = [] } = useQuery({
    queryKey: ['campanas-disponibles'],
    queryFn: async () => {
      const { data } = await api.get('/campanas/disponibles')
      return (data?.data ?? []) as CampanaDisponible[]
    },
    staleTime: 60_000,
  })

  const asignar = useMutation({
    mutationFn: ({ neusId, campanaId }: { neusId: number; campanaId: number }) => {
      const campana = campanasDisponibles.find((c) => c.id === campanaId)
      return api.put(`/campanas/agentes/${neusId}`, { campanaId, campanaNombre: campana?.nombre ?? '' })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas-agentes'] }); toast.success('Campaña asignada') },
    onError: () => toast.error('Error al asignar campaña'),
  })

  const quitar = useMutation({
    mutationFn: (neusId: number) => api.delete(`/campanas/agentes/${neusId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campanas-agentes'] }); toast.success('Campaña quitada') },
    onError: () => toast.error('Error al quitar campaña'),
  })

  const filtrados = agentes.filter((a) => {
    const matchSearch = a.nombre.toLowerCase().includes(search.toLowerCase())
    const matchCampana = filtroCampana === 'todas'
      || (filtroCampana === 'sin_campana' ? !a.campanaId : a.campanaNombre === filtroCampana)
    return matchSearch && matchCampana
  })

  const campanasEnUso = Array.from(new Set(agentes.map((a) => a.campanaNombre).filter(Boolean))) as string[]
  const sinCampana = agentes.filter((a) => !a.campanaId).length

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/operaciones')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Operaciones
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #713F12 0%, #CA8A04 25%, #FDE047 50%, #CA8A04 75%, #713F12 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Megaphone className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Campañas</h1>
                <p className="mt-0.5 text-xs text-yellow-100/90">
                  {agentes.length} agente{agentes.length !== 1 ? 's' : ''} CC · {sinCampana} sin campaña
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agente..."
              className="field py-2 pl-9 text-sm"
            />
          </div>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFiltroCampana('todas')}
            className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', filtroCampana === 'todas' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            Todas <span className="opacity-70">({agentes.length})</span>
          </button>
          <button
            onClick={() => setFiltroCampana('sin_campana')}
            className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', filtroCampana === 'sin_campana' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
          >
            Sin campaña <span className="opacity-70">({sinCampana})</span>
          </button>
          {campanasEnUso.map((nombre) => {
            const count = agentes.filter((a) => a.campanaNombre === nombre).length
            const active = filtroCampana === nombre
            return (
              <button
                key={nombre}
                onClick={() => setFiltroCampana(nombre)}
                className={clsx('rounded-full px-3 py-1 text-[0.7rem] font-semibold transition-colors', active ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}
              >
                {nombre} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtrados.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-50">
            <Users className="h-7 w-7 text-yellow-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">Sin resultados</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agente</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaña</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Asignada</th>
                {puedeGestionar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map((a) => (
                <tr key={a.neusId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-[0.82rem] font-semibold text-gray-800">{a.nombre}</td>
                  <td className="px-4 py-3">
                    {a.campanaNombre ? (
                      <span className="chip text-[0.65rem] bg-amber-50 text-amber-700">{a.campanaNombre}</span>
                    ) : (
                      <span className="text-[0.75rem] text-gray-300 italic">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[0.75rem] text-gray-400">
                    {a.fechaAsignacion ? fmtFecha(a.fechaAsignacion) : '—'}
                  </td>
                  {puedeGestionar && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          value={a.campanaId ?? ''}
                          onChange={(e) => { if (e.target.value) asignar.mutate({ neusId: a.neusId, campanaId: Number(e.target.value) }) }}
                          className="field py-1.5 text-[0.75rem]"
                        >
                          <option value="">Selecciona…</option>
                          {campanasDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                        {a.campanaId && (
                          <button
                            onClick={() => quitar.mutate(a.neusId)}
                            className="rounded-lg px-2 py-1.5 text-[0.68rem] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
