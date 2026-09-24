import { Factory } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function IndustriasClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Industrias"
      subtitulo="Giro o industria del cliente. Ej. Manufactura, Retail, Servicios financieros."
      icon={Factory}
      service={crmCatalogosClienteService.industrias}
      queryKey="crm-catalogo-industrias"
    />
  )
}
