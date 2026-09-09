import { Inbox, DollarSign, Smile } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { ClienteCasosTab } from './ClienteCasosTab'
import { PagosTab } from './PagosTab'
import { EncuestasTab } from './EncuestasTab'

// Fase 7: agrupa Casos del cliente + control de pagos + satisfacción bajo una
// sola pestaña de nivel superior, con sub-tabs internos.
export type SubCasosPagos = 'casos' | 'pagos' | 'satisfaccion'

export function CasosPagosTab({ contactoId, clienteNombre, sub, onSubChange, conteos }: {
  contactoId: number
  clienteNombre: string
  sub: SubCasosPagos
  onSubChange: (s: SubCasosPagos) => void
  conteos?: { pagos?: number; encuestas?: number }
}) {
  const SUBS: TabItem<SubCasosPagos>[] = [
    { key: 'casos', label: 'Casos', icon: Inbox },
    { key: 'pagos', label: 'Control de pagos', icon: DollarSign, badge: conteos?.pagos },
    { key: 'satisfaccion', label: 'Satisfacción', icon: Smile, badge: conteos?.encuestas },
  ]
  return (
    <div className="space-y-4">
      <Tabs tabs={SUBS} value={sub} onChange={onSubChange} variant="sub" />
      {sub === 'casos' && <ClienteCasosTab contactoId={contactoId} clienteNombre={clienteNombre} />}
      {sub === 'pagos' && <PagosTab contactoId={contactoId} />}
      {sub === 'satisfaccion' && <EncuestasTab contactoId={contactoId} />}
    </div>
  )
}
