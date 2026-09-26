import { DollarSign, Smile, Briefcase } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { PagosTab } from './PagosTab'
import { EncuestasTab } from './EncuestasTab'
import { ComercialTab } from './ComercialTab'
import type { ExpedienteOportunidad } from '@/services/crm.service'

// Fusiona lo que antes era "Control de pagos", "Satisfacción" y "Comercial"
// dentro de "Casos, pagos y ventas" — separado de Casos, que ahora vive en
// la tab "Atención" (junto a bitácora/tareas/citas/renovaciones).
export type SubComercial = 'pagos' | 'satisfaccion' | 'comercial'

export function ComercialConsolidadoTab({ contactoId, sub, onSubChange, conteos, oportunidades }: {
  contactoId: number
  sub: SubComercial
  onSubChange: (s: SubComercial) => void
  conteos?: { pagos?: number; encuestas?: number; oportunidades?: number }
  oportunidades?: ExpedienteOportunidad[]
}) {
  const SUBS: TabItem<SubComercial>[] = [
    { key: 'pagos', label: 'Control de pagos', icon: DollarSign, badge: conteos?.pagos },
    { key: 'satisfaccion', label: 'Satisfacción', icon: Smile, badge: conteos?.encuestas },
    { key: 'comercial', label: 'Comercial', icon: Briefcase, badge: conteos?.oportunidades },
  ]
  return (
    <div className="space-y-4">
      <Tabs tabs={SUBS} value={sub} onChange={onSubChange} variant="sub" />
      {sub === 'pagos' && <PagosTab contactoId={contactoId} />}
      {sub === 'satisfaccion' && <EncuestasTab contactoId={contactoId} />}
      {sub === 'comercial' && <ComercialTab oportunidades={oportunidades ?? []} />}
    </div>
  )
}
