import { FolderTree } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function CategoriasClienteConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Categorías"
      subtitulo="Categoría comercial del cliente, elegible al dar de alta o editar su perfil."
      icon={FolderTree}
      service={crmCatalogosClienteService.categorias}
      queryKey="crm-catalogo-categorias-cliente"
    />
  )
}
