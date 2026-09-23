import { KeyRound } from 'lucide-react'
import { CatalogoClienteTab } from './CatalogoClienteTab'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'

export function TiposAccesoPortalConfigTab() {
  return (
    <CatalogoClienteTab
      titulo="Tipos de acceso al portal"
      subtitulo="Ej. Reclutamiento, Facturación, Completo. Solo aplica a clientes con acceso al sistema (portal-cliente)."
      icon={KeyRound}
      service={crmCatalogosClienteService.tiposAcceso}
      queryKey="crm-catalogo-tipos-acceso-portal"
    />
  )
}
