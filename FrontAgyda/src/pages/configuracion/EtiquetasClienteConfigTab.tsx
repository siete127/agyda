import { Tags } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function EtiquetasClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Etiquetas"
      subtitulo="Etiquetas libres, un cliente puede tener varias a la vez."
      icon={Tags}
      service={crmCatalogosClienteService.etiquetas}
      queryKey="crm-catalogo-etiquetas"
    />
  )
}
