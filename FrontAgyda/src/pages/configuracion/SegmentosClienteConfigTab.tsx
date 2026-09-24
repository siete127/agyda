import { Layers } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function SegmentosClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Segmentos"
      subtitulo="Segmentación comercial del cliente (distinto del semáforo de estatus, que es visual/automático)."
      icon={Layers}
      service={crmCatalogosClienteService.segmentos}
      queryKey="crm-catalogo-segmentos"
    />
  )
}
