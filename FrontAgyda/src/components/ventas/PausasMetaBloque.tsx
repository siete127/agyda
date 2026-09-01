import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Coffee, Utensils, GraduationCap, FileText, ChevronRight, Loader2, Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ventasAreaService, type MetaPausaAgente } from '@/services/ventasArea.service'

function fmt(s: number): string {
  if (!s) return '0m'
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const TIPOS = [
  { key: 'banioSeg', label: 'Baño', icon: Coffee, tile: 'bg-brand/10 text-brand' },
  { key: 'comidaSeg', label: 'Comida', icon: Utensils, tile: 'bg-amber-100 text-amber-600' },
  { key: 'capacitacionSeg', label: 'Capacitación', icon: GraduationCap, tile: 'bg-violet-100 text-violet-600' },
  { key: 'permisoSeg', label: 'Permiso', icon: FileText, tile: 'bg-rose-100 text-rose-600' },
] as const

function CardAgente({ a }: { a: MetaPausaAgente }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="truncate text-[0.88rem] font-bold text-gray-900">{a.nombre}</p>
        <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[0.7rem] font-semibold text-gray-500">
          Total {fmt(a.totalSeg)}
        </span>
      </div>
      {a.sinRegistro ? (
        <p className="text-[0.76rem] text-gray-400">Sin registro de pausas / asistencia hoy.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {TIPOS.map((t) => (
            <div key={t.key} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
              <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', t.tile)}>
                <t.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">{t.label}</p>
                <p className="text-[0.9rem] font-bold tabular-nums text-gray-800">{fmt(a[t.key])}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* Bloque "Tiempo en pausa hoy" que va debajo de la barra de una meta. Muestra el
   total (baño+comida+capacitación+permiso) y, al hacer clic, abre una tabla de
   cards con el desglose por persona según el alcance de la meta. */
export function PausasMetaBloque({ metaId, nombreMeta }: { metaId: number; nombreMeta?: string }) {
  const [abierto, setAbierto] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['meta-pausas', metaId],
    queryFn: () => ventasAreaService.getMetaPausas(metaId),
    staleTime: 30_000,
    refetchInterval: abierto ? 30_000 : false,
  })

  const totalSeg = data?.agentes.reduce((s, a) => s + a.totalSeg, 0) ?? 0
  const nAgentes = data?.agentes.length ?? 0

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-surface/60 px-3 py-2.5 text-left transition-colors hover:border-brand/30 hover:bg-surface"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
          <Clock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.72rem] font-semibold text-gray-700">Tiempo en pausa hoy</p>
          <p className="text-[0.66rem] text-gray-400">
            Baño, comida, capacitación y permiso
            {nAgentes > 1 ? ` · ${nAgentes} agentes` : ''}
          </p>
        </div>
        <span className="flex-shrink-0 text-[0.95rem] font-black tabular-nums text-gray-800">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : fmt(totalSeg)}
        </span>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
      </button>

      <Modal isOpen={abierto} onClose={() => setAbierto(false)} title={`Tiempos de pausa · hoy${nombreMeta ? ` · ${nombreMeta}` : ''}`} size="lg">
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
        ) : !data || data.agentes.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Sin agentes para esta meta.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[0.76rem] text-gray-400">
              {data.alcance === 'campana'
                ? 'Desglose por cada agente de la campaña.'
                : 'Desglose del asesor de la meta.'}
            </p>
            <div className={clsx('grid gap-3', data.agentes.length > 1 ? 'sm:grid-cols-2' : '')}>
              {data.agentes.map((a) => <CardAgente key={a.agenteId} a={a} />)}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
