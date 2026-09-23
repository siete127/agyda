import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { CatalogoListaGestion, type CatalogoService } from '@/components/crm/CatalogoListaGestion'

export function CatalogoClienteTab({ titulo, subtitulo, icon: Icon, service, queryKey }: {
  titulo: string
  subtitulo: string
  icon: LucideIcon
  service: CatalogoService
  queryKey: string
}) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => service.list(true),
  })

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">{titulo}</h2>
            <p className="text-[0.82rem] text-gray-400">{subtitulo}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <CatalogoListaGestion items={items} isLoading={isLoading} service={service} queryKey={queryKey} />
      </div>
    </div>
  )
}
