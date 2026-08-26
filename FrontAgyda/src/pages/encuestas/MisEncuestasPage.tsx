import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, CheckCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { encuestasService } from '@/services/encuestas.service'
import { ResponderEncuesta } from './ResponderEncuesta'
import type { Encuesta } from '@/types/encuesta.types'

export function MisEncuestasPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [respondiendoManual, setRespondiendoManual] = useState<Encuesta | null>(null)
  const [deepLinkCerrado, setDeepLinkCerrado] = useState(false)

  const { data: encuestas = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mis-encuestas', user?.id],
    queryFn: () => encuestasService.getMisPendientes(user!.id),
    enabled: !!user?.id,
  })

  // Abrir directamente la encuesta indicada por ?encuesta=<id>, ej. desde una notificación
  const encuestaIdParam = searchParams.get('encuesta')
  const deepLinkMatch = !deepLinkCerrado && encuestaIdParam
    ? encuestas.find((e) => e.id === Number(encuestaIdParam) && !e.respondida) ?? null
    : null
  const respondiendo = respondiendoManual ?? deepLinkMatch

  if (respondiendo) {
    const encuestaActual = respondiendo
    return (
      <div className="max-w-2xl mx-auto">
        <ResponderEncuesta
          encuesta={encuestaActual}
          onSubmit={(respuestas) => encuestasService.responder(encuestaActual.id, encuestaActual.asignacionId, { respuestas })}
          onDone={() => {
            setRespondiendoManual(null)
            setDeepLinkCerrado(true)
            qc.invalidateQueries({ queryKey: ['mis-encuestas'] })
            navigate('/dashboard')
          }}
          onCancel={() => { setRespondiendoManual(null); setDeepLinkCerrado(true) }}
        />
      </div>
    )
  }

  const pendientes = encuestas.filter((e) => !e.respondida && e.estado !== 'cerrada')
  const completadas = encuestas.filter((e) => e.respondida)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Mis encuestas</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {completadas.length} completada{completadas.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-48 rounded-lg bg-gray-100 mb-2" />
              <div className="h-3 w-64 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      ) : encuestas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <ClipboardList className="h-7 w-7 text-brand/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin encuestas</p>
            <p className="text-xs text-gray-400 mt-0.5">No tienes encuestas asignadas</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {pendientes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-amber-500" />
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Pendientes</span>
                <span className="chip bg-amber-100 text-amber-700 text-[0.65rem]">{pendientes.length}</span>
              </div>
              {pendientes.map((e) => (
                <div key={e.id} className="card p-4 flex items-center justify-between gap-4 hover:shadow-card-md transition-shadow">
                  <div className="min-w-0">
                    <p className="text-[0.85rem] font-semibold text-gray-900 truncate">{e.titulo}</p>
                    {e.descripcion && <p className="text-xs text-gray-500 mt-0.5 truncate">{e.descripcion}</p>}
                    <p className="text-[0.65rem] text-gray-400 mt-1">{e.preguntas.length} pregunta{e.preguntas.length !== 1 ? 's' : ''}</p>
                  </div>
                  <Button size="sm" onClick={() => setRespondiendoManual(e)} className="flex-shrink-0">Responder</Button>
                </div>
              ))}
            </section>
          )}

          {completadas.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-emerald-500" />
                <span className="text-[0.68rem] font-bold text-gray-500 uppercase tracking-widest">Completadas</span>
              </div>
              {completadas.map((e) => (
                <div key={e.id} className="card p-4 flex items-center gap-3 opacity-70">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-[0.82rem] font-medium text-gray-700">{e.titulo}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
