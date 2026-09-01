import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { HeartHandshake, ChevronRight, Clock, Calendar, ClipboardList } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { noticiasService } from '@/services/noticias.service'
import { NewsSection } from '@/components/ui/NewsSection'
import { NoticiaDetalle } from '@/pages/noticias/NoticiasPage'
import { Spinner } from '@/components/ui/Spinner'
import type { Noticia } from '@/types/noticia.types'

interface Evento {
  id: number
  titulo: string
  fechaInicio: string
  todoElDia: boolean
  color?: string
}

function parseEvento(r: Record<string, unknown>): Evento {
  const s = (...keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['idEvento'] ?? r['id_evento'] ?? r['id'] ?? 0),
    titulo: s('titulo', 'title', 'nombre'),
    fechaInicio: s('fechaInicio', 'fecha_inicio', 'fecha'),
    todoElDia: Boolean(r['todoElDia'] ?? r['todo_el_dia']),
    color: r['color'] ? String(r['color']) : undefined,
  }
}

interface EncuestaPendiente {
  encuestaId: number
  titulo: string
  descripcion: string
  totalPreguntas: number
  respondida: number
  asignado: number
}

export function ClimaLaboralPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [detalle, setDetalle] = useState<Noticia | null>(null)

  const { data: noticias = [], isLoading: cargandoNoticias } = useQuery({
    queryKey: ['noticias'],
    queryFn: () => noticiasService.getAll(),
    staleTime: 60_000,
  })

  const { data: eventos = [], isLoading: cargandoEventos } = useQuery({
    queryKey: ['eventos-proximos-clima'],
    queryFn: async () => {
      const { data } = await api.get('/eventos/proximos', { params: { dias: 14, limite: 5 } })
      const list = Array.isArray(data) ? data : (data?.data ?? data?.eventos ?? [])
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      return (list as Record<string, unknown>[])
        .map(parseEvento)
        .filter((e) => new Date(e.fechaInicio) >= hoy)
        .sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())
        .slice(0, 4)
    },
    staleTime: 60_000,
  })

  const { data: encuestas = [], isLoading: cargandoEncuestas } = useQuery({
    queryKey: ['encuestas-noticias', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/encuestas/noticias', {
        params: { userId: user?.id, tipoUsuario: user?.tipoUsuario },
      })
      return (Array.isArray(data) ? data : (data?.data ?? [])) as EncuestaPendiente[]
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  })

  const pendientes = encuestas.filter((e) => !e.respondida && e.asignado)
  const isLoading = cargandoNoticias || cargandoEventos || cargandoEncuestas

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center gap-3">
          <HeartHandshake className="h-6 w-6 text-blue-300" />
          <div>
            <h1 className="text-lg font-bold">Clima laboral</h1>
            <p className="text-xs text-blue-200/70">Comunicados, encuestas, eventos y actividades internas</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div className="flex flex-col gap-5">
          <NewsSection
            title="Comunicados recientes"
            items={noticias.slice(0, 6)}
            onOpen={setDetalle}
            onVerTodas={() => navigate('/noticias')}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {pendientes.length > 0 && (
              <div className="rounded-2xl border border-surface-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-brand" />
                    <h3 className="text-[0.9rem] font-semibold text-ink">Encuestas pendientes</h3>
                  </div>
                  <button
                    onClick={() => navigate('/noticias')}
                    className="flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand-dark transition-colors"
                  >
                    Responder <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="divide-y divide-surface-border/60">
                  {pendientes.map((e) => (
                    <div key={e.encuestaId} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.8rem] font-semibold text-ink truncate">{e.titulo}</p>
                        <p className="text-[0.68rem] text-ink-tertiary truncate">{e.totalPreguntas} pregunta{e.totalPreguntas !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                        Pendiente
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-surface-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
                <h3 className="text-[0.9rem] font-semibold text-ink">Próximos eventos</h3>
                {eventos.length > 0 && (
                  <button
                    onClick={() => navigate('/calendario')}
                    className="flex items-center gap-1 text-[0.75rem] font-medium text-brand hover:text-brand-dark transition-colors"
                  >
                    Ver calendario <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
              {eventos.length > 0 ? (
                <div className="divide-y divide-surface-border/60">
                  {eventos.map((e) => {
                    const [y, m, d] = (e.fechaInicio || '').split('T')[0].split('-').map(Number)
                    const hora = e.fechaInicio.includes('T') ? e.fechaInicio.split('T')[1]?.slice(0, 5) : null
                    const hex = e.color?.startsWith('#') ? e.color : '#2F6FED'
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <div
                          className="flex h-9 w-9 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center"
                          style={{ backgroundColor: `${hex}14`, border: `1px solid ${hex}30` }}
                        >
                          <span className="text-[0.5rem] font-bold uppercase" style={{ color: hex }}>
                            {new Date(y, m - 1, d).toLocaleDateString('es-MX', { month: 'short' })}
                          </span>
                          <span className="text-[0.85rem] font-black leading-none" style={{ color: hex }}>{d}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.76rem] font-semibold text-ink truncate">{e.titulo}</p>
                          <p className="text-[0.62rem] text-ink-tertiary flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            {e.todoElDia ? 'Todo el día' : hora ?? 'Todo el día'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center px-5 py-6 text-center">
                  <Calendar className="h-6 w-6 mb-2" style={{ color: '#C9D6F0' }} />
                  <p className="text-[0.75rem] font-medium text-ink">No hay eventos próximos.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detalle && <NoticiaDetalle noticia={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}
