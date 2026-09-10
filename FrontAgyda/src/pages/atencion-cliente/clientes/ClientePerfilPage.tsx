import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, User, FileText, Building2, History, Inbox } from 'lucide-react'
import { clsx } from 'clsx'
import { Spinner } from '@/components/ui/Spinner'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES } from '@/types/crm.types'
import { DatosGeneralesTab } from './components/DatosGeneralesTab'
import { DocumentosTab } from './components/DocumentosTab'
import { SeguimientoConsolidadoTab, type SubSeguimiento } from './components/SeguimientoConsolidadoTab'
import { CasosPagosTab, type SubCasosPagos } from './components/CasosPagosTab'

// Fase 7: expediente de 9 pestañas → 4.
//   datos       → DatosGeneralesTab
//   seguimiento → bitácora + tareas + renovaciones + historial (sub-tabs)
//   casos-pagos → casos del cliente + control de pagos + satisfacción (sub-tabs)
//   documentos  → DocumentosTab
// Estado en la URL: ?tab=casos-pagos&sub=casos — permite que Historial y las
// notificaciones enlacen a la sección exacta.
type Tab = 'datos' | 'seguimiento' | 'casos-pagos' | 'documentos'
const TAB_KEYS: Tab[] = ['datos', 'seguimiento', 'casos-pagos', 'documentos']

const SUB_DEFAULT: Record<'seguimiento' | 'casos-pagos', string> = {
  seguimiento: 'bitacora',
  'casos-pagos': 'casos',
}
const SUB_VALIDAS: Record<'seguimiento' | 'casos-pagos', string[]> = {
  seguimiento: ['bitacora', 'tareas', 'citas', 'renovaciones', 'historial'],
  'casos-pagos': ['casos', 'pagos', 'satisfaccion'],
}

export function ClientePerfilPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contactoId = Number(id)
  const [params, setParams] = useSearchParams()

  const tab: Tab = TAB_KEYS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'datos'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); p.delete('sub'); return p }, { replace: true })

  const subGrupo = (tab === 'seguimiento' || tab === 'casos-pagos') ? tab : null
  const subRaw = params.get('sub')
  const sub = subGrupo && subRaw && SUB_VALIDAS[subGrupo].includes(subRaw)
    ? subRaw
    : subGrupo ? SUB_DEFAULT[subGrupo] : ''
  const setSub = (s: string) => setParams((p) => { p.set('sub', s); return p }, { replace: true })

  const { data: cliente, isLoading, error } = useQuery({
    queryKey: ['cliente-expediente', contactoId],
    queryFn: () => crmService.getExpediente(contactoId),
    enabled: Number.isFinite(contactoId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm font-semibold text-gray-700">No se pudo cargar el cliente</p>
        <button onClick={() => navigate('/atencion-cliente/clientes')} className="text-xs font-medium text-brand hover:underline">
          Volver a Clientes
        </button>
      </div>
    )
  }

  const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === cliente.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]

  const TABS: TabItem<Tab>[] = [
    { key: 'datos', label: 'Datos', icon: User },
    { key: 'seguimiento', label: 'Seguimiento', icon: History },
    { key: 'casos-pagos', label: 'Casos y pagos', icon: Inbox },
    { key: 'documentos', label: 'Documentos', icon: FileText, badge: cliente.conteos?.documentos },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente/clientes')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Clientes
      </button>

      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <User className="h-6 w-6 text-white" />
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

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'datos' && <DatosGeneralesTab cliente={cliente} />}
      {tab === 'seguimiento' && (
        <SeguimientoConsolidadoTab
          contactoId={cliente.id}
          clienteNombre={cliente.nombre}
          sub={sub as SubSeguimiento}
          onSubChange={setSub}
        />
      )}
      {tab === 'casos-pagos' && (
        <CasosPagosTab
          contactoId={cliente.id}
          clienteNombre={cliente.nombre}
          sub={sub as SubCasosPagos}
          onSubChange={setSub}
          conteos={cliente.conteos}
        />
      )}
      {tab === 'documentos' && <DocumentosTab contactoId={cliente.id} />}
    </div>
  )
}
