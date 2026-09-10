import { Inbox, DollarSign, Smile, Briefcase } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { ClienteCasosTab } from './ClienteCasosTab'
import { PagosTab } from './PagosTab'
import { EncuestasTab } from './EncuestasTab'
import { ComercialTab } from './ComercialTab'
import type { ExpedienteOportunidad } from '@/services/crm.service'

// Fase 7: agrupa Casos del cliente + control de pagos + satisfacción bajo una
// sola pestaña de nivel superior, con sub-tabs internos.
// Después: se suma "Comercial" (oportunidades + cotizaciones, solo lectura) para
// dar contexto de venta del cliente sin salir de Atención al Cliente.
export type SubCasosPagos = 'casos' | 'pagos' | 'satisfaccion' | 'comercial'

export function CasosPagosTab({ contactoId, clienteNombre, sub, onSubChange, conteos, oportunidades }: {
  contactoId: number
  clienteNombre: string
  sub: SubCasosPagos
  onSubChange: (s: SubCasosPagos) => void
  conteos?: { pagos?: number; encuestas?: number; oportunidades?: number }
  oportunidades?: ExpedienteOportunidad[]
}) {
  const SUBS: TabItem<SubCasosPagos>[] = [
    { key: 'casos', label: 'Casos', icon: Inbox },
    { key: 'pagos', label: 'Control de pagos', icon: DollarSign, badge: conteos?.pagos },
    { key: 'satisfaccion', label: 'Satisfacción', icon: Smile, badge: conteos?.encuestas },
    { key: 'comercial', label: 'Comercial', icon: Briefcase, badge: conteos?.oportunidades },
  ]
  return (
    <div className="space-y-4">
      <Tabs tabs={SUBS} value={sub} onChange={onSubChange} variant="sub" />
      {sub === 'casos' && <ClienteCasosTab contactoId={contactoId} clienteNombre={clienteNombre} />}
      {sub === 'pagos' && <PagosTab contactoId={contactoId} />}
      {sub === 'satisfaccion' && <EncuestasTab contactoId={contactoId} />}
      {sub === 'comercial' && <ComercialTab oportunidades={oportunidades ?? []} />}
    </div>
  )
}
