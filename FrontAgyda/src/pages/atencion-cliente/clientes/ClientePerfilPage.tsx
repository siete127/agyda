import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import {
  ClienteExpediente, EXPEDIENTE_TAB_KEYS, EXPEDIENTE_SUB_DEFAULT, EXPEDIENTE_SUB_VALIDAS,
  type ExpedienteTab,
} from './ClienteExpediente'

// Ruta /atencion-cliente/clientes/:id — wrapper delgado que lee tab/sub de la
// URL y monta el expediente. Se mantiene para deep-links y compatibilidad; el
// módulo "Seguimiento de clientes" usa el mismo cuerpo dentro del ClienteDrawer.
export function ClientePerfilPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const contactoId = Number(id)
  const [params, setParams] = useSearchParams()

  const tab: ExpedienteTab = EXPEDIENTE_TAB_KEYS.includes(params.get('tab') as ExpedienteTab)
    ? (params.get('tab') as ExpedienteTab) : 'datos'
  const setTab = (t: ExpedienteTab) => setParams((p) => { p.set('tab', t); p.delete('sub'); return p }, { replace: true })

  const subGrupo = (tab === 'seguimiento' || tab === 'casos-pagos') ? tab : null
  const subRaw = params.get('sub')
  const sub = subGrupo && subRaw && EXPEDIENTE_SUB_VALIDAS[subGrupo].includes(subRaw)
    ? subRaw
    : subGrupo ? EXPEDIENTE_SUB_DEFAULT[subGrupo] : ''
  const setSub = (s: string) => setParams((p) => { p.set('sub', s); return p }, { replace: true })

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/atencion-cliente/clientes')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Clientes
      </button>
      <ClienteExpediente contactoId={contactoId} tab={tab} sub={sub} onTab={setTab} onSub={setSub} />
    </div>
  )
}
