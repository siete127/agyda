import { HiloComentarios } from './HiloComentarios'

export function CasoConversacionTab({ casoId, puedeGestionar }: { casoId: number; puedeGestionar: boolean }) {
  return (
    <HiloComentarios
      casoId={casoId}
      visibleCliente
      puedeEscribir={puedeGestionar}
      placeholder="Escribe una respuesta..."
    />
  )
}
