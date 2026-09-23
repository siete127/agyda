import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { ChevronLeft, Inbox, Clock, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'
import {
  CASO_TIPO_CONFIG, PRIORIDAD_CASO_CONFIG, ESTATUS_CASO_CONFIG, ORIGEN_CASO_LABEL,
  type Caso, type CasoTipo, type CasoEstatus, type CasoPrioridad,
} from '@/types/caso.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevoCasoModal } from './components/NuevoCasoModal'
import { CasoDetalleModal } from './components/CasoDetalleModal'

const ESTATUS_ABIERTOS: CasoEstatus[] = ['pendiente', 'en_proceso', 'en_espera_cliente', 'escalado']

export function CasosPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'casos-gestionar')
  const [searchParams, setSearchParams] = useSearchParams()

  const [filtroTipo, setFiltroTipo] = useState<CasoTipo | ''>((searchParams.get('tipo') as CasoTipo) || '')
  const [filtroEstatus, setFiltroEstatus] = useState<CasoEstatus | ''>('')
  const [filtroPrioridad, setFiltroPrioridad] = useState<CasoPrioridad | ''>('')
  // Vista rápida: 'todos' o 'abiertos' (worklist — reemplaza la pantalla vieja
  // "Seguimiento"). El redirect de /atencion-cliente/seguimiento trae ?estatus=abiertos.
  const [vista, setVista] = useState<'todos' | 'abiertos'>(searchParams.get('estatus') === 'abiertos' ? 'abiertos' : 'todos')
  const [detalle, setDetalle] = useState<Caso | null>(null)
  const [nuevo, setNuevo] = useState(false)

  const { data: casos = [], isLoading } = useQuery({
    queryKey: ['casos', filtroTipo, filtroEstatus, filtroPrioridad],
    queryFn: () => casoService.getAll({
      tipo: filtroTipo || undefined,
      estatus: filtroEstatus || undefined,
      prioridad: filtroPrioridad || undefined,
    }),
    staleTime: 15_000,
  })

  // Deep-link: /atencion-cliente/casos?casoId=123 abre el detalle directo.
  const casoIdParam = searchParams.get('casoId')
  useEffect(() => {
    if (!casoIdParam) return
    const id = Number(casoIdParam)
    if (detalle?.id === id) return
    const enLista = casos.find((c) => c.id === id)
    if (enLista) { setDetalle(enLista); return }
    casoService.getById(id).then(setDetalle).catch(() => {
      setSearchParams((p) => { p.delete('casoId'); return p }, { replace: true })
    })
  }, [casoIdParam, casos]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrarDetalle = () => {
    setDetalle(null)
    if (searchParams.has('casoId')) {
      setSearchParams((p) => { p.delete('casoId'); return p }, { replace: true })
    }
  }

  const abiertos = casos.filter((c) => ESTATUS_ABIERTOS.includes(c.estatus))
  const vencidosSla = abiertos.filter((c) => c.fechaLimiteSla && new Date(c.fechaLimiteSla) < new Date())
  const casosVisibles = vista === 'abiertos' ? abiertos : casos

  return (
    <div className="space-y-5 animate-fade-in">
      {!embedded && (
        <>
          <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
          </button>

          <div className="card overflow-hidden">
            <div
              className="animate-gradient-x relative overflow-hidden px-6 py-5"
              style={{
                backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
                backgroundSize: '200% 100%',
              }}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <Inbox className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">Casos</h1>
                    <p className="mt-0.5 text-xs text-blue-100/80">
                      {abiertos.length} abierto{abiertos.length !== 1 ? 's' : ''}
                      {vencidosSla.length > 0 && ` · ${vencidosSla.length} con SLA vencido`}
                    </p>
                  </div>
                </div>
                {puedeGestionar && (
                  <button onClick={() => setNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-white/25 transition-colors">
                    <Plus className="h-4 w-4" /> Nuevo caso
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {embedded && puedeGestionar && (
        <div className="flex justify-end">
          <button onClick={() => setNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> Nuevo caso
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {(['todos', 'abiertos'] as const).map((v) => (
            <button key={v} onClick={() => setVista(v)}
              className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-all',
                vista === v ? 'bg-card shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
              {v === 'todos' ? 'Todos' : 'Abiertos'}
              {v === 'abiertos' && abiertos.length > 0 && <span className="ml-1 text-[0.65rem] text-gray-400">{abiertos.length}</span>}
            </button>
          ))}
        </div>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as CasoTipo | '')} className="field w-auto">
          <option value="">Todos los tipos</option>
          {(Object.keys(CASO_TIPO_CONFIG) as CasoTipo[]).map((t) => <option key={t} value={t}>{CASO_TIPO_CONFIG[t].label}</option>)}
        </select>
        <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as CasoEstatus | '')} className="field w-auto">
          <option value="">Todos los estatus</option>
          {(Object.keys(ESTATUS_CASO_CONFIG) as CasoEstatus[]).map((e) => <option key={e} value={e}>{ESTATUS_CASO_CONFIG[e].label}</option>)}
        </select>
        <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value as CasoPrioridad | '')} className="field w-auto">
          <option value="">Todas las prioridades</option>
          {(Object.keys(PRIORIDAD_CASO_CONFIG) as CasoPrioridad[]).map((p) => <option key={p} value={p}>{PRIORIDAD_CASO_CONFIG[p].label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : casosVisibles.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Inbox className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">{vista === 'abiertos' ? 'Sin casos abiertos' : 'Sin casos'}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {casosVisibles.map((c) => {
              const tipoCfg = CASO_TIPO_CONFIG[c.tipo]
              const estCfg = ESTATUS_CASO_CONFIG[c.estatus]
              const prioCfg = PRIORIDAD_CASO_CONFIG[c.prioridad]
              const vencida = c.fechaLimiteSla && c.estatus !== 'resuelto' && c.estatus !== 'cerrado' && new Date(c.fechaLimiteSla) < new Date()
              const cliente = c.contactoNombre || c.clienteNombreLibre
              return (
                <button key={c.id} onClick={() => setDetalle(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{c.folio} — {c.titulo}</p>
                    <p className="text-[0.7rem] text-gray-400">
                      {cliente ? `${cliente} · ` : ''}{ORIGEN_CASO_LABEL[c.origen]} · {new Date(c.fechaCreacion).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
                    {vencida && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700"><Clock className="h-3 w-3" /> SLA</span>}
                    {c.tipo === 'incidencia' && <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>}
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

      {nuevo && <NuevoCasoModal onClose={() => setNuevo(false)} />}
      {detalle && (
        <CasoDetalleModal
          caso={detalle}
          onClose={cerrarDetalle}
          queryKeysToInvalidate={[['casos'], ...(detalle.contactoId ? [['cliente-casos', detalle.contactoId]] : [])]}
        />
      )}
    </div>
  )
}
