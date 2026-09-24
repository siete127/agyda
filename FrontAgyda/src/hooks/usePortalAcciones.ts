import { useQuery } from '@tanstack/react-query'
import { portalClienteService } from '@/services/portalCliente.service'

// Acciones del sub-rol del usuario del Portal de Cliente logueado (Admin,
// Supervisor, Apoyo, Agente o uno personalizado). Se usa para gatear
// botones/secciones por acción — la defensa real sigue siendo el backend
// (requirePortalAction en cada endpoint).
export function usePortalAcciones() {
  const { data: acciones = [], isLoading } = useQuery({
    queryKey: ['portal-mis-acciones'],
    queryFn: () => portalClienteService.getMisAcciones(),
    staleTime: 60_000,
  })
  const puede = (accionKey: string) => acciones.includes(accionKey)
  return { acciones, puede, isLoading }
}
