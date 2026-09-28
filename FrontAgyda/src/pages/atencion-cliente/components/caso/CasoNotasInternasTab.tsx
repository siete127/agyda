import { HiloComentarios } from './HiloComentarios'

// Notas que el equipo interno escribe entre sí sobre el caso — nunca se
// notifican al Portal de Cliente ni aparecen en su chat (CCO_VISIBLE_CLIENTE=0).
export function CasoNotasInternasTab({ casoId, puedeGestionar }: { casoId: number; puedeGestionar: boolean }) {
  return (
    <HiloComentarios
      casoId={casoId}
      visibleCliente={false}
      puedeEscribir={puedeGestionar}
      placeholder="Agregar nota interna (no visible para el cliente)..."
    />
  )
}
