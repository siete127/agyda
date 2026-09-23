import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ListChecks, Clock, AlertCircle, ChevronLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { useSocketEvent } from '@/hooks/useSocket'
import { casoService } from '@/services/caso.service'
import {
  CASO_TIPO_CONFIG, ESTATUS_CASO_CONFIG, PRIORIDAD_CASO_CONFIG,
  type Caso, type CasoTipo, type CasoEstatus, type CasoPrioridad,
} from '@/types/caso.types'
import { CasoDetalleModal } from './components/CasoDetalleModal'

// Fase 5: una sola query sobre CASOS (los 4 tipos), con detalle inline —
// ya no redirige a las pantallas viejas de cada tipo.
interface CasoAbierto {
  tipo: CasoTipo
  id: number
  folio: string
  titulo: string
  clienteNombre: string | null
  estatus: CasoEstatus
  prioridad: CasoPrioridad
  fechaLimiteSla: string | null
  fecha: string
  usuarioNombre?: string
  linkTo: string
}

function fmtFecha(f: string) {
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function SeguimientoPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [detalle, setDetalle] = useState<Caso | null>(null)
  const [cargandoId, setCargandoId] = useState<number | null>(null)

  const { data: casos = [], isLoading, error } = useQuery<CasoAbierto[]>({
    queryKey: ['seguimiento-casos-abiertos'],
    queryFn: async () => {
      const { data } = await api.get('/seguimiento/casos-abiertos')
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
  })

  // Eventos legacy (mientras conviven las pantallas viejas) + refetch por foco.
  useSocketEvent('consulta:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))
  useSocketEvent('aclaracion:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))
  useSocketEvent('queja:estatus', () => qc.invalidateQueries({ queryKey: ['seguimiento-casos-abiertos'] }))

  const abrirDetalle = async (c: CasoAbierto) => {
    setCargandoId(c.id)
    try {
      const full = await casoService.getById(c.id)
      setDetalle(full)
    } catch {
      navigate(c.linkTo) // fallback: abre la página de Casos con deep-link
    } finally {
      setCargandoId(null)
    }
  }

  const abiertos = casos.length
  const pendientes = casos.filter((c) => c.estatus === 'pendiente').length
  const enProceso = casos.filter((c) => c.estatus === 'en_proceso').length
  const vencidosSla = casos.filter((c) => c.fechaLimiteSla && new Date(c.fechaLimiteSla) < new Date()).length

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
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <ListChecks className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Seguimiento de Casos</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">
                {abiertos} caso{abiertos !== 1 ? 's' : ''} abierto{abiertos !== 1 ? 's' : ''} — consultas, aclaraciones, quejas e incidencias
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[0.7rem] font-semibold text-amber-500 uppercase tracking-wide">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700 mt-0.5">{pendientes}</p>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-[0.7rem] font-semibold text-blue-500 uppercase tracking-wide">En proceso</p>
          <p className="text-2xl font-bold text-blue-700 mt-0.5">{enProceso}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-[0.7rem] font-semibold text-red-500 uppercase tracking-wide">SLA vencido</p>
          <p className="text-2xl font-bold text-red-700 mt-0.5">{vencidosSla}</p>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar el seguimiento</p>
        </div>
      ) : casos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <ListChecks className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin casos abiertos</p>
            <p className="text-xs text-gray-400 mt-0.5">Todos los casos están resueltos o cerrados.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {casos.map((c) => {
            const tipoCfg = CASO_TIPO_CONFIG[c.tipo]
            const estCfg = ESTATUS_CASO_CONFIG[c.estatus] ?? ESTATUS_CASO_CONFIG['pendiente']
            const prioCfg = PRIORIDAD_CASO_CONFIG[c.prioridad]
            const vencida = c.fechaLimiteSla && new Date(c.fechaLimiteSla) < new Date()
            return (
              <button
                key={`${c.tipo}-${c.id}`}
                onClick={() => abrirDetalle(c)}
                disabled={cargandoId === c.id}
                className="w-full flex items-center gap-3 rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 text-left transition-all hover:shadow-md hover:border-brand/40 disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
                    <span className="text-[0.68rem] font-mono text-gray-400">{c.folio}</span>
                    {c.clienteNombre && <span className="text-[0.68rem] text-gray-400">· {c.clienteNombre}</span>}
                  </div>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{c.titulo}</p>
                  {c.usuarioNombre && <p className="text-[0.68rem] text-gray-400 truncate">por {c.usuarioNombre}</p>}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {vencida && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700"><Clock className="h-3 w-3" /> SLA</span>}
                    {c.tipo === 'incidencia' && <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>}
                    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold', estCfg.bg, estCfg.text)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0', estCfg.dot)} />
                      {estCfg.label}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                    <Clock className="h-3 w-3" /> {fmtFecha(c.fecha)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {detalle && (
        <CasoDetalleModal
          caso={detalle}
          onClose={() => setDetalle(null)}
          queryKeysToInvalidate={[
            ['seguimiento-casos-abiertos'],
            ['casos'],
            ...(detalle.contactoId ? [['cliente-casos', detalle.contactoId]] : []),
          ]}
        />
      )}
    </div>
  )
}
