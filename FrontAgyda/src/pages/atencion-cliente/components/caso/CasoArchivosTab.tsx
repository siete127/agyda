import { EvidenciasSection } from './EvidenciasSection'

export function CasoArchivosTab({ casoId, puedeGestionar }: { casoId: number; puedeGestionar: boolean }) {
  return <EvidenciasSection casoId={casoId} puedeGestionar={puedeGestionar} />
}
