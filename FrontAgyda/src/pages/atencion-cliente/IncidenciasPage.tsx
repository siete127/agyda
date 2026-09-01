import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { ChevronLeft, AlertOctagon, Clock } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { incidenciaService } from '@/services/incidencia.service'
import {
  PRIORIDAD_INCIDENCIA_CONFIG, ESTATUS_INCIDENCIA_CONFIG, ORIGEN_INCIDENCIA_LABEL,
  type Incidencia, type IncidenciaEstatus, type IncidenciaPrioridad,
} from '@/types/incidencia.types'
import { IncidenciaDetalleModal } from './clientes/components/IncidenciaDetalleModal'

export function IncidenciasPage() {
  const navigate = useNavigate()
  const [filtroEstatus, setFiltroEstatus] = useState<IncidenciaEstatus | ''>('')
  const [filtroPrioridad, setFiltroPrioridad] = useState<IncidenciaPrioridad | ''>('')
  const [detalle, setDetalle] = useState<Incidencia | null>(null)

  const { data: incidencias = [], isLoading } = useQuery({
    queryKey: ['incidencias', filtroEstatus, filtroPrioridad],
    queryFn: () => incidenciaService.getAll({
      estatus: filtroEstatus || undefined,
      prioridad: filtroPrioridad || undefined,
    }),
    staleTime: 15_000,
  })

  const abiertas = incidencias.filter((i) => i.estatus === 'pendiente' || i.estatus === 'en_proceso' || i.estatus === 'en_espera_cliente' || i.estatus === 'escalado')
  const vencidasSla = abiertas.filter((i) => i.fechaLimiteSla && new Date(i.fechaLimiteSla) < new Date())

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #450A0A 0%, #B91C1C 25%, #F87171 50%, #B91C1C 75%, #450A0A 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <AlertOctagon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Incidencias</h1>
              <p className="mt-0.5 text-xs text-red-100/80">
                {abiertas.length} abierta{abiertas.length !== 1 ? 's' : ''}
                {vencidasSla.length > 0 && ` · ${vencidasSla.length} con SLA vencido`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as IncidenciaEstatus | '')} className="field w-auto">
          <option value="">Todos los estatus</option>
          {(Object.keys(ESTATUS_INCIDENCIA_CONFIG) as IncidenciaEstatus[]).map((e) => (
            <option key={e} value={e}>{ESTATUS_INCIDENCIA_CONFIG[e].label}</option>
          ))}
        </select>
        <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value as IncidenciaPrioridad | '')} className="field w-auto">
          <option value="">Todas las prioridades</option>
          {(Object.keys(PRIORIDAD_INCIDENCIA_CONFIG) as IncidenciaPrioridad[]).map((p) => (
            <option key={p} value={p}>{PRIORIDAD_INCIDENCIA_CONFIG[p].label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : incidencias.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertOctagon className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Sin incidencias</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {incidencias.map((inc) => {
              const prioCfg = PRIORIDAD_INCIDENCIA_CONFIG[inc.prioridad]
              const estCfg = ESTATUS_INCIDENCIA_CONFIG[inc.estatus]
              const vencida = inc.fechaLimiteSla && inc.estatus !== 'resuelto' && inc.estatus !== 'cerrado' && new Date(inc.fechaLimiteSla) < new Date()
              return (
                <button key={inc.id} onClick={() => setDetalle(inc)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{inc.folio} — {inc.titulo}</p>
                    <p className="text-[0.7rem] text-gray-400">{inc.contactoNombre} · {ORIGEN_INCIDENCIA_LABEL[inc.origen]} · {new Date(inc.fechaCreacion).toLocaleDateString('es-MX')}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {vencida && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700"><Clock className="h-3 w-3" /> SLA</span>}
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {detalle && <IncidenciaDetalleModal incidencia={detalle} onClose={() => setDetalle(null)} queryKeysToInvalidate={[['incidencias'], ['cliente-incidencias', detalle.contactoId]]} />}
    </div>
  )
}
