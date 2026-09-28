import { Users } from 'lucide-react'
import {
  ClienteExpediente, EXPEDIENTE_TAB_KEYS, EXPEDIENTE_SUB_DEFAULT, EXPEDIENTE_SUB_VALIDAS,
  type ExpedienteTab,
} from './ClienteExpediente'

// Columna derecha del layout de 2 columnas de "Clientes" (reemplaza el
// drawer lateral que se superponía a la lista) — siempre montada, sin
// overlay ni portal, con placeholder cuando no hay cliente seleccionado.
// Estado del expediente en la URL con prefijo `exp` para no chocar con el
// `tab` del shell: ?tab=clientes&id=5&exp=atencion&sub=casos
export function ClienteDetallePanel({ contactoId, expParam, subParam, onExp, onSub }: {
  contactoId: number | null
  expParam: string | null
  subParam: string | null
  onExp: (t: ExpedienteTab) => void
  onSub: (s: string) => void
}) {
  if (contactoId == null) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-card/50 text-center">
        <Users className="h-8 w-8 text-gray-300" />
        <p className="text-sm font-semibold text-gray-500">Selecciona un cliente para ver su expediente</p>
      </div>
    )
  }

  const tab: ExpedienteTab = EXPEDIENTE_TAB_KEYS.includes(expParam as ExpedienteTab)
    ? (expParam as ExpedienteTab) : 'resumen'
  const subGrupo = (tab === 'atencion' || tab === 'comercial') ? tab : null
  const sub = subGrupo && subParam && EXPEDIENTE_SUB_VALIDAS[subGrupo].includes(subParam)
    ? subParam
    : subGrupo ? EXPEDIENTE_SUB_DEFAULT[subGrupo] : ''

  return (
    <ClienteExpediente
      contactoId={contactoId}
      tab={tab}
      sub={sub}
      onTab={onExp}
      onSub={onSub}
      compact
    />
  )
}
