import { History, ClipboardList, CalendarClock, ListTree, CalendarDays } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { SeguimientoTab } from './SeguimientoTab'
import { TareasTab } from './TareasTab'
import { RenovacionesTab } from './RenovacionesTab'
import { HistorialTab } from './HistorialTab'
import { ClienteCitasTab } from './ClienteCitasTab'

// Fase 7: agrupa las pestañas viejas (bitácora / tareas / renovaciones /
// historial) bajo una sola de nivel superior, con sub-tabs internos.
// CRM Cliente Fase 3: se agrega "Citas" (agenda + tratamientos del cliente).
export type SubSeguimiento = 'bitacora' | 'tareas' | 'citas' | 'renovaciones' | 'historial'

const SUBS: TabItem<SubSeguimiento>[] = [
  { key: 'bitacora', label: 'Bitácora', icon: History },
  { key: 'tareas', label: 'Tareas y recordatorios', icon: ClipboardList },
  { key: 'citas', label: 'Citas', icon: CalendarDays },
  { key: 'renovaciones', label: 'Renovaciones', icon: CalendarClock },
  { key: 'historial', label: 'Historial', icon: ListTree },
]

export function SeguimientoConsolidadoTab({ contactoId, clienteNombre, sub, onSubChange }: {
  contactoId: number
  clienteNombre: string
  sub: SubSeguimiento
  onSubChange: (s: SubSeguimiento) => void
}) {
  return (
    <div className="space-y-4">
      <Tabs tabs={SUBS} value={sub} onChange={onSubChange} variant="sub" />
      {sub === 'bitacora' && <SeguimientoTab contactoId={contactoId} />}
      {sub === 'tareas' && <TareasTab contactoId={contactoId} />}
      {sub === 'citas' && <ClienteCitasTab contactoId={contactoId} clienteNombre={clienteNombre} />}
      {sub === 'renovaciones' && <RenovacionesTab contactoId={contactoId} />}
      {sub === 'historial' && <HistorialTab contactoId={contactoId} />}
    </div>
  )
}
