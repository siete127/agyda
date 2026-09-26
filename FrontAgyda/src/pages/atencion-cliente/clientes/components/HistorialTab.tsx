import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui/Spinner'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { HistorialEventosList } from './HistorialEventosList'

export function HistorialTab({ contactoId }: { contactoId: number }) {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['cliente-historial', contactoId],
    queryFn: () => clienteSeguimientoService.getHistorial(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Historial de comunicaciones</p>
        <p className="text-[0.68rem] text-gray-400">Línea de tiempo con todas las interacciones registradas con este cliente</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : (
        <HistorialEventosList eventos={eventos} />
      )}
    </div>
  )
}
