import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'
import type { Caso } from '@/types/caso.types'
import { CasoFilaResumen } from './CasoFilaResumen'

// Otros casos de ESTE MISMO cliente — distinto de "Actividades" (que es el
// timeline de auditoría de este caso puntual). Mismo queryKey que
// ClienteCasosTab.tsx para compartir caché entre expediente y esta vista.
export function CasoHistorialTab({ caso, onAbrirCaso }: { caso: Caso; onAbrirCaso: (c: Caso) => void }) {
  const { data: casos = [], isLoading } = useQuery({
    queryKey: ['cliente-casos', caso.contactoId],
    queryFn: () => casoService.getByContacto(caso.contactoId as number),
    enabled: caso.contactoId != null,
    staleTime: 15_000,
  })

  if (caso.contactoId == null) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-card py-10 text-center text-[0.78rem] text-gray-400">
        Este caso no está ligado a un cliente registrado.
      </div>
    )
  }

  const otros = casos.filter((c) => c.id !== caso.id)

  return (
    <div className="rounded-2xl border border-gray-100 bg-card overflow-hidden">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : otros.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Este cliente no tiene otros casos</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {otros.map((c) => <CasoFilaResumen key={c.id} caso={c} onClick={() => onAbrirCaso(c)} />)}
        </div>
      )}
    </div>
  )
}
