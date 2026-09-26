import { History, ClipboardList, CalendarDays, CalendarClock, Inbox } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { SeguimientoTab } from './SeguimientoTab'
import { TareasTab } from './TareasTab'
import { ClienteCitasTab } from './ClienteCitasTab'
import { RenovacionesTab } from './RenovacionesTab'
import { ClienteCasosTab } from './ClienteCasosTab'

// Fusiona lo que antes eran las pestañas "Seguimiento" (bitácora/tareas/
// citas/renovaciones) y "Casos" (de "Casos, pagos y ventas") — la sub-tab
// "historial" de Seguimiento se retira de aquí porque ahora es la tab de
// nivel superior "Actividad" del expediente rediseñado.
export type SubAtencion = 'bitacora' | 'tareas' | 'citas' | 'renovaciones' | 'casos'

const SUBS: TabItem<SubAtencion>[] = [
  { key: 'bitacora', label: 'Bitácora', icon: History },
  { key: 'tareas', label: 'Tareas y recordatorios', icon: ClipboardList },
  { key: 'citas', label: 'Citas', icon: CalendarDays },
  { key: 'renovaciones', label: 'Renovaciones', icon: CalendarClock },
  { key: 'casos', label: 'Casos', icon: Inbox },
]

export function AtencionTab({ contactoId, clienteNombre, sub, onSubChange }: {
  contactoId: number
  clienteNombre: string
  sub: SubAtencion
  onSubChange: (s: SubAtencion) => void
}) {
  return (
    <div className="space-y-4">
      <Tabs tabs={SUBS} value={sub} onChange={onSubChange} variant="sub" />
      {sub === 'bitacora' && <SeguimientoTab contactoId={contactoId} />}
      {sub === 'tareas' && <TareasTab contactoId={contactoId} />}
      {sub === 'citas' && <ClienteCitasTab contactoId={contactoId} clienteNombre={clienteNombre} />}
      {sub === 'renovaciones' && <RenovacionesTab contactoId={contactoId} />}
      {sub === 'casos' && <ClienteCasosTab contactoId={contactoId} clienteNombre={clienteNombre} />}
    </div>
  )
}
