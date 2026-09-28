import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Lock, Paperclip, History, Clock3 } from 'lucide-react'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { casoService } from '@/services/caso.service'
import type { Caso } from '@/types/caso.types'
import { CasoHeaderCentral } from './CasoHeaderCentral'
import { CasoConversacionTab } from './CasoConversacionTab'
import { CasoNotasInternasTab } from './CasoNotasInternasTab'
import { CasoArchivosTab } from './CasoArchivosTab'
import { CasoActividadesTab } from './CasoActividadesTab'
import { CasoHistorialTab } from './CasoHistorialTab'
import { CasoInfoColumnaDerecha } from './CasoInfoColumnaDerecha'

type TabCentral = 'conversacion' | 'notas' | 'archivos' | 'actividades' | 'historial'

export function CasoDetalleColumnas({ caso, puedeGestionar, queryKeysToInvalidate, onAbrirCaso }: {
  caso: Caso
  puedeGestionar: boolean
  queryKeysToInvalidate: unknown[][]
  onAbrirCaso: (c: Caso) => void
}) {
  const [tab, setTab] = useState<TabCentral>('conversacion')

  // Reset a la tab por defecto cada vez que se selecciona un caso distinto —
  // evita arrastrar, por ejemplo, "Notas internas" abierta al cambiar de caso.
  useEffect(() => { setTab('conversacion') }, [caso.id])

  const { data: evidencias = [] } = useQuery({
    queryKey: ['caso-evidencias', caso.id],
    queryFn: () => casoService.getEvidencias(caso.id),
    staleTime: 15_000,
  })

  const TABS: TabItem<TabCentral>[] = [
    { key: 'conversacion', label: 'Conversación', icon: MessageCircle },
    { key: 'notas', label: 'Notas internas', icon: Lock },
    { key: 'archivos', label: 'Archivos', icon: Paperclip, badge: evidencias.length },
    { key: 'actividades', label: 'Actividades', icon: Clock3 },
    { key: 'historial', label: 'Historial', icon: History },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <CasoHeaderCentral caso={caso} puedeGestionar={puedeGestionar} queryKeysToInvalidate={queryKeysToInvalidate} />
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="min-h-[320px]">
          {tab === 'conversacion' && <CasoConversacionTab casoId={caso.id} puedeGestionar={puedeGestionar} />}
          {tab === 'notas' && <CasoNotasInternasTab casoId={caso.id} puedeGestionar={puedeGestionar} />}
          {tab === 'archivos' && <CasoArchivosTab casoId={caso.id} puedeGestionar={puedeGestionar} />}
          {tab === 'actividades' && <CasoActividadesTab casoId={caso.id} />}
          {tab === 'historial' && <CasoHistorialTab caso={caso} onAbrirCaso={onAbrirCaso} />}
        </div>
      </div>
      <CasoInfoColumnaDerecha
        caso={caso}
        puedeGestionar={puedeGestionar}
        queryKeysToInvalidate={queryKeysToInvalidate}
        onVerHistorial={() => setTab('historial')}
        onAbrirCaso={onAbrirCaso}
      />
    </div>
  )
}
