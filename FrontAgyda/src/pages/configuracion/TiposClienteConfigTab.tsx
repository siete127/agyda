import { Tag } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function TiposClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Tipos de cliente"
      subtitulo="Ej. Persona física, Persona moral, Gobierno. Se elige al dar de alta un cliente."
      icon={Tag}
      service={crmCatalogosClienteService.tipos}
      queryKey="crm-catalogo-tipos-cliente"
    />
  )
}
