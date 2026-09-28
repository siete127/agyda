import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Clock, Check, Flag } from 'lucide-react'
import { casoService } from '@/services/caso.service'
import { CASO_TIPO_CONFIG, PRIORIDAD_CASO_CONFIG, ESTATUS_CASO_CONFIG, ORIGEN_CASO_LABEL, type Caso, type CasoEstatus } from '@/types/caso.types'

const ESTATUS_DESCRIPCION: Record<CasoEstatus, string> = {
  pendiente: 'Recién creado, todavía sin atender',
  en_proceso: 'Un agente ya está trabajando en el caso',
  en_espera_cliente: 'Se necesita una respuesta del cliente para continuar',
  resuelto: 'Ya se dio solución al caso',
  escalado: 'Se subió a un nivel de atención mayor porque no se resolvió en el flujo normal',
  cerrado: 'El caso quedó finalizado y archivado',
}

export function CasoHeaderCentral({ caso, puedeGestionar, queryKeysToInvalidate }: {
  caso: Caso
  puedeGestionar: boolean
  queryKeysToInvalidate: unknown[][]
}) {
  const qc = useQueryClient()
  const tipoCfg = CASO_TIPO_CONFIG[caso.tipo]
  const prioCfg = PRIORIDAD_CASO_CONFIG[caso.prioridad]
  const estCfg = ESTATUS_CASO_CONFIG[caso.estatus]
  const esIncidencia = caso.tipo === 'incidencia'
  const clienteMostrado = caso.contactoNombre || caso.clienteNombreLibre
  const vencida = caso.fechaLimiteSla && caso.estatus !== 'resuelto' && caso.estatus !== 'cerrado' && new Date(caso.fechaLimiteSla) < new Date()
  const yaResuelto = caso.estatus === 'resuelto' || caso.estatus === 'cerrado'

  const resolver = useMutation({
    mutationFn: () => casoService.updateEstatus(caso.id, 'resuelto'),
    onSuccess: () => {
      toast.success('Caso marcado como resuelto')
      for (const key of queryKeysToInvalidate) qc.invalidateQueries({ queryKey: key })
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo actualizar el estatus'),
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-800">{caso.folio}</p>
          <h3 className="mt-0.5 text-sm text-gray-700">{caso.titulo}</h3>
          {clienteMostrado && <p className="mt-1 text-xs text-gray-500">{clienteMostrado}</p>}
        </div>
        {puedeGestionar && !yaResuelto && (
          <button
            onClick={() => resolver.mutate()}
            disabled={resolver.isPending}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Check className="h-3.5 w-3.5" /> Resolver caso
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
        {esIncidencia && (
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', prioCfg.bg, prioCfg.text)}>
            <Flag className="h-3 w-3" /> {prioCfg.label}
          </span>
        )}
        <span title={ESTATUS_DESCRIPCION[caso.estatus]} className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', estCfg.bg, estCfg.text)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
        </span>
        {caso.origen !== 'manual' && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[0.68rem] font-semibold text-gray-500">{ORIGEN_CASO_LABEL[caso.origen]}</span>}
        {vencida && (
          <span title="El tiempo límite de atención (según la prioridad) ya se cumplió sin resolver el caso" className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-red-700">
            <Clock className="h-3 w-3" /> SLA vencido
          </span>
        )}
      </div>
    </div>
  )
}
