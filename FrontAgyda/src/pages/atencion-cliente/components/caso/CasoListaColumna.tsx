import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Search, SlidersHorizontal, Inbox, Clock, Flag } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import {
  CASO_TIPO_CONFIG, PRIORIDAD_CASO_CONFIG, ESTATUS_CASO_CONFIG,
  type Caso, type CasoEstatus, type CasoTipo, type CasoPrioridad,
} from '@/types/caso.types'

type TabEstatus = 'todos' | CasoEstatus | 'alta_prioridad'

const ESTATUS_DESCRIPCION: Record<CasoEstatus, string> = {
  pendiente: 'Recién creado, todavía sin atender',
  en_proceso: 'Un agente ya está trabajando en el caso',
  en_espera_cliente: 'Se necesita una respuesta del cliente para continuar',
  resuelto: 'Ya se dio solución al caso',
  escalado: 'Se subió a un nivel de atención mayor porque no se resolvió en el flujo normal',
  cerrado: 'El caso quedó finalizado y archivado',
}

const TABS_ESTATUS: { key: TabEstatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendiente', label: 'Nuevos' },
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'en_espera_cliente', label: 'En seguimiento' },
  { key: 'cerrado', label: 'Cerrados' },
  { key: 'alta_prioridad', label: 'Alta prioridad' },
]

export interface CasoFiltros {
  tipo: CasoTipo | ''
  prioridad: CasoPrioridad | ''
}

export function CasoListaColumna({ casos, isLoading, seleccionadoId, onSeleccionar, filtros, onFiltrosChange }: {
  casos: Caso[]
  isLoading: boolean
  seleccionadoId: number | null
  onSeleccionar: (c: Caso) => void
  filtros: CasoFiltros
  onFiltrosChange: (f: CasoFiltros) => void
}) {
  const [tabEstatus, setTabEstatus] = useState<TabEstatus>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)

  const conteos = useMemo(() => {
    const m = {} as Record<TabEstatus, number>
    for (const t of TABS_ESTATUS) {
      if (t.key === 'todos') m[t.key] = casos.length
      else if (t.key === 'alta_prioridad') m[t.key] = casos.filter((c) => c.prioridad === 'alta' || c.prioridad === 'critica').length
      else m[t.key] = casos.filter((c) => c.estatus === t.key).length
    }
    return m
  }, [casos])

  const filtrosActivos = (filtros.tipo ? 1 : 0) + (filtros.prioridad ? 1 : 0)

  const visibles = useMemo(() => {
    let arr = casos
    if (tabEstatus === 'alta_prioridad') arr = arr.filter((c) => c.prioridad === 'alta' || c.prioridad === 'critica')
    else if (tabEstatus !== 'todos') arr = arr.filter((c) => c.estatus === tabEstatus)
    if (filtros.tipo) arr = arr.filter((c) => c.tipo === filtros.tipo)
    if (filtros.prioridad) arr = arr.filter((c) => c.prioridad === filtros.prioridad)
    const q = busqueda.trim().toLowerCase()
    if (q) {
      arr = arr.filter((c) => {
        const cliente = (c.contactoNombre || c.clienteNombreLibre || '').toLowerCase()
        return c.folio.toLowerCase().includes(q) || c.titulo.toLowerCase().includes(q) || cliente.includes(q)
      })
    }
    return arr
  }, [casos, tabEstatus, filtros, busqueda])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, cliente, asunto..."
            className="w-full rounded-xl border border-gray-200 bg-card py-2 pl-9 pr-3 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
        <button
          onClick={() => setFiltrosAbiertos((v) => !v)}
          className={clsx(
            'relative flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl border transition-colors',
            filtrosAbiertos || filtrosActivos > 0 ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 bg-card text-gray-500 hover:bg-gray-50',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {filtrosActivos > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[0.6rem] font-bold text-white">
              {filtrosActivos}
            </span>
          )}
        </button>
      </div>

      {filtrosAbiertos && (
        <div className="card flex flex-col gap-2 p-3">
          <select value={filtros.tipo} onChange={(e) => onFiltrosChange({ ...filtros, tipo: e.target.value as CasoTipo | '' })} className="field text-[0.8rem]">
            <option value="">Todos los tipos</option>
            {(Object.keys(CASO_TIPO_CONFIG) as CasoTipo[]).map((t) => <option key={t} value={t}>{CASO_TIPO_CONFIG[t].label}</option>)}
          </select>
          <select value={filtros.prioridad} onChange={(e) => onFiltrosChange({ ...filtros, prioridad: e.target.value as CasoPrioridad | '' })} className="field text-[0.8rem]">
            <option value="">Todas las prioridades</option>
            {(Object.keys(PRIORIDAD_CASO_CONFIG) as CasoPrioridad[]).map((p) => <option key={p} value={p}>{PRIORIDAD_CASO_CONFIG[p].label}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TABS_ESTATUS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTabEstatus(t.key)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition-all',
              tabEstatus === t.key ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-card text-gray-600 hover:border-gray-300',
            )}
          >
            {t.label}
            <span className={clsx('rounded-full px-1 text-[0.62rem] font-bold', tabEstatus === t.key ? 'bg-white/25' : 'bg-gray-100 text-gray-500')}>
              {conteos[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : visibles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Inbox className="h-7 w-7 text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">Sin casos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visibles.map((c) => {
              const tipoCfg = CASO_TIPO_CONFIG[c.tipo]
              const estCfg = ESTATUS_CASO_CONFIG[c.estatus]
              const prioCfg = PRIORIDAD_CASO_CONFIG[c.prioridad]
              const vencida = c.fechaLimiteSla && c.estatus !== 'resuelto' && c.estatus !== 'cerrado' && new Date(c.fechaLimiteSla) < new Date()
              const cliente = c.contactoNombre || c.clienteNombreLibre
              const activo = c.id === seleccionadoId
              return (
                <button
                  key={c.id}
                  onClick={() => onSeleccionar(c)}
                  className={clsx('flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors', activo ? 'bg-brand/5' : 'hover:bg-gray-50')}
                >
                  <div className={clsx(
                    'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[0.65rem] font-bold',
                    activo ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500',
                  )}>
                    {(cliente || '—').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] font-semibold text-gray-800">{cliente || c.folio}</p>
                    {c.contactoEmpresa && <p className="truncate text-[0.68rem] text-gray-400">{c.contactoEmpresa}</p>}
                    <p className="mt-0.5 truncate text-[0.72rem] text-gray-500">{c.titulo}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        title={ESTATUS_DESCRIPCION[c.estatus]}
                        className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', estCfg.bg, estCfg.text)}
                      >
                        <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                      </span>
                      {c.tipo === 'incidencia' && (
                        <span className={clsx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', prioCfg.bg, prioCfg.text)}>
                          <Flag className="h-2.5 w-2.5" /> {prioCfg.label}
                        </span>
                      )}
                      {vencida && (
                        <span
                          title="El tiempo límite de atención (según la prioridad) ya se cumplió sin resolver el caso"
                          className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-red-700"
                        >
                          <Clock className="h-2.5 w-2.5" /> Vencido
                        </span>
                      )}
                      <span className={clsx('rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
