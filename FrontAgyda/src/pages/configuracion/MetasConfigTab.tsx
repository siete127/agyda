import { useQuery } from '@tanstack/react-query'
import { ListChecks, Info } from 'lucide-react'
import { personalizacionService } from '@/services/personalizacion.service'

function CardSeccion({ icon: Icon, titulo, subtitulo, children }: {
  icon: React.ElementType; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-[0.95rem] font-bold text-gray-900">{titulo}</p>
          <p className="text-[0.78rem] text-gray-400">{subtitulo}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function MetasConfigTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['personalizacion'],
    queryFn: () => personalizacionService.get(),
  })

  const estatusContados = data?.ventas.estatusContados ?? ['Aprobada', 'Formalizada', 'Formalizado', 'Garantizada']

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Metas</h2>
            <p className="text-[0.82rem] text-gray-400">
              Las metas se capturan por asesor/campaña desde CRM → Metas. Aquí solo se muestra la regla que define su avance.
            </p>
          </div>
        </div>
      </div>

      <CardSeccion icon={ListChecks} titulo="Estatus de venta contados" subtitulo="Una venta cuenta para el avance de una meta cuando su estatus está en esta lista.">
        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {estatusContados.map((e) => (
              <span key={e} className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-[0.78rem] font-semibold text-violet-700">
                {e}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-[0.68rem] text-gray-400">
          Esta lista se edita en Configuración → CRM → Ventas → «Estatus de venta contados» — es compartida con Comisiones e Incentivos.
        </p>
      </CardSeccion>

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          Metas no tiene parámetros propios adicionales por ahora — la creación y edición de metas por asesor/campaña se hace desde CRM → Metas.
        </p>
      </div>
    </div>
  )
}
