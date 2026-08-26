import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Smile, Clock, AlertCircle, ChevronLeft, Plus, Pencil, BarChart3 } from 'lucide-react'
import { api } from '@/lib/axios'
import { clsx } from 'clsx'
import { parseEncuesta, type Encuesta } from '@/types/encuesta.types'
import { CrearEncuestaModal, EditarEncuestaModal, ResultadosModal } from '@/pages/encuestas/EncuestasPage'
import { useActionAccess } from '@/hooks/useActionAccess'

const ESTADO_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  borrador: { label: 'Borrador', bg: 'bg-gray-100',    text: 'text-gray-600',    border: 'border-gray-200',    dot: 'bg-gray-400' },
  activa:   { label: 'Activa',   bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  cerrada:  { label: 'Cerrada',  bg: 'bg-red-100',      text: 'text-red-600',    border: 'border-red-200',     dot: 'bg-red-400' },
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function SatisfaccionPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'clientes-encuestas')
  const [showCrear, setShowCrear] = useState(false)
  const [editando, setEditando] = useState<Encuesta | null>(null)
  const [verResultados, setVerResultados] = useState<Encuesta | null>(null)

  const { data: encuestas = [], isLoading, error } = useQuery<Encuesta[]>({
    queryKey: ['encuestas-satisfaccion'],
    queryFn: async () => {
      const { data } = await api.get('/encuestas/categoria/satisfaccion')
      const arr = Array.isArray(data) ? data : (data?.data ?? [])
      return (arr as Record<string, unknown>[]).map(parseEncuesta)
    },
    staleTime: 30_000,
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['encuestas-satisfaccion'] })
    qc.invalidateQueries({ queryKey: ['encuestas-admin'] })
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      {/* Header */}
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
                <Smile className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Encuestas de Satisfacción</h1>
                <p className="mt-0.5 text-xs text-yellow-100/90">
                  {encuestas.length} encuesta{encuestas.length !== 1 ? 's' : ''} de satisfacción
                </p>
              </div>
            </div>
            {puedeGestionar && (
              <button
                onClick={() => setShowCrear(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-yellow-700 hover:bg-yellow-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Nueva encuesta
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-4 w-2/3 rounded-lg bg-gray-100" />
              <div className="h-3 w-full rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar encuestas de satisfacción</p>
        </div>
      ) : encuestas.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-50">
            <Smile className="h-7 w-7 text-yellow-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin encuestas de satisfacción aún</p>
            {puedeGestionar && <p className="text-xs text-gray-400 mt-0.5">Usa el botón "Nueva encuesta" para crear la primera.</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {encuestas.map((e) => {
            const cfg = ESTADO_CFG[e.estado] ?? ESTADO_CFG['borrador']
            return (
              <div
                key={e.id}
                className="flex h-full flex-col rounded-2xl border border-gray-200/60 bg-white shadow-sm p-5 gap-3 transition-all hover:shadow-md hover:border-yellow-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-100">
                      <Smile className="h-4 w-4 text-yellow-600" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{e.titulo}</h3>
                  </div>
                  <span className={clsx('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold', cfg.bg, cfg.text, cfg.border)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>
                {e.descripcion && <p className="flex-1 text-sm text-gray-500 leading-relaxed line-clamp-2">{e.descripcion}</p>}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <div className="flex items-center gap-1.5 text-[0.68rem] text-gray-400">
                    <Clock className="h-3 w-3" /> {fmtFecha(e.fechaFin ?? '')}
                  </div>
                  <button onClick={() => setVerResultados(e)} className="flex items-center gap-1 text-[0.72rem] font-medium text-yellow-600 hover:underline">
                    <BarChart3 className="h-3 w-3" /> Ver resultados
                  </button>
                </div>
                {puedeGestionar && (
                  <button
                    onClick={() => setEditando(e)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:border-yellow-400 hover:text-yellow-700 transition-colors"
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCrear && <CrearEncuestaModal categoriaFija="satisfaccion" onClose={() => { setShowCrear(false); invalidar() }} />}
      {editando && <EditarEncuestaModal encuesta={editando} onClose={() => { setEditando(null); invalidar() }} />}
      {verResultados && <ResultadosModal encuesta={verResultados} onClose={() => setVerResultados(null)} />}
    </div>
  )
}
