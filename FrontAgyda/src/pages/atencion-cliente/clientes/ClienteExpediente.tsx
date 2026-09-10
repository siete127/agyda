import { useQuery } from '@tanstack/react-query'
import { User, FileText, Building2, History, Inbox } from 'lucide-react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { DatosGeneralesTab } from './components/DatosGeneralesTab'
import { DocumentosTab } from './components/DocumentosTab'
import { SeguimientoConsolidadoTab, type SubSeguimiento } from './components/SeguimientoConsolidadoTab'
import { CasosPagosTab, type SubCasosPagos } from './components/CasosPagosTab'

// Cuerpo del expediente del cliente — extraído de ClientePerfilPage para que lo
// compartan la ruta /clientes/:id (wrapper que lee la URL) y el ClienteDrawer
// del módulo "Seguimiento de clientes" (le pasa tab/sub por props).
//
// Expediente de 4 pestañas:
//   datos       → DatosGeneralesTab
//   seguimiento → bitácora + tareas + citas + renovaciones + historial (sub-tabs)
//   casos-pagos → casos del cliente + control de pagos + satisfacción (sub-tabs)
//   documentos  → DocumentosTab

export type ExpedienteTab = 'datos' | 'seguimiento' | 'casos-pagos' | 'documentos'
export const EXPEDIENTE_TAB_KEYS: ExpedienteTab[] = ['datos', 'seguimiento', 'casos-pagos', 'documentos']

export const EXPEDIENTE_SUB_DEFAULT: Record<'seguimiento' | 'casos-pagos', string> = {
  seguimiento: 'bitacora',
  'casos-pagos': 'casos',
}
export const EXPEDIENTE_SUB_VALIDAS: Record<'seguimiento' | 'casos-pagos', string[]> = {
  seguimiento: ['bitacora', 'tareas', 'citas', 'renovaciones', 'historial'],
  'casos-pagos': ['casos', 'pagos', 'satisfaccion'],
}

export function ClienteExpediente({ contactoId, tab, sub, onTab, onSub, compact }: {
  contactoId: number
  tab: ExpedienteTab
  sub: string
  onTab: (t: ExpedienteTab) => void
  onSub: (s: string) => void
  compact?: boolean
}) {
  const { data: cliente, isLoading, error } = useQuery({
    queryKey: ['cliente-expediente', contactoId],
    queryFn: () => crmService.getExpediente(contactoId),
    enabled: Number.isFinite(contactoId),
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  }
  if (error || !cliente) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm font-semibold text-gray-700">No se pudo cargar el cliente</p>
      </div>
    )
  }

  const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === cliente.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]
  const TABS: TabItem<ExpedienteTab>[] = [
    { key: 'datos', label: 'Datos', icon: User },
    { key: 'seguimiento', label: 'Seguimiento', icon: History },
    { key: 'casos-pagos', label: 'Casos y pagos', icon: Inbox },
    { key: 'documentos', label: 'Documentos', icon: FileText, badge: cliente.conteos?.documentos },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <div className={clsx('card overflow-hidden', compact && 'rounded-xl')}>
        <div
          className={clsx('animate-gradient-x relative overflow-hidden', compact ? 'px-5 py-4' : 'px-6 py-5')}
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className={clsx('flex items-center justify-center rounded-xl bg-white/10', compact ? 'h-10 w-10' : 'h-12 w-12')}>
              <User className={compact ? 'h-5 w-5 text-white' : 'h-6 w-6 text-white'} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">{cliente.nombre}</h1>
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', cfg.bg, cfg.text)}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} /> {cfg.label}
                </span>
              </div>
              {cliente.empresa && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-100/80">
                  <Building2 className="h-3 w-3" /> {cliente.empresa}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={onTab} />

      {tab === 'datos' && <DatosGeneralesTab cliente={cliente} />}
      {tab === 'seguimiento' && (
        <SeguimientoConsolidadoTab
          contactoId={cliente.id}
          clienteNombre={cliente.nombre}
          sub={sub as SubSeguimiento}
          onSubChange={onSub}
        />
      )}
      {tab === 'casos-pagos' && (
        <CasosPagosTab
          contactoId={cliente.id}
          clienteNombre={cliente.nombre}
          sub={sub as SubCasosPagos}
          onSubChange={onSub}
          conteos={cliente.conteos}
        />
      )}
      {tab === 'documentos' && <DocumentosTab contactoId={cliente.id} />}
    </div>
  )
}
