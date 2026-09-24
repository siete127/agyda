import { ListTree } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function ClasificacionesClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Clasificaciones"
      subtitulo="Clasificación interna del cliente (distinta de Tipo y Categoría)."
      icon={ListTree}
      service={crmCatalogosClienteService.clasificaciones}
      queryKey="crm-catalogo-clasificaciones-cliente"
    />
  )
}
