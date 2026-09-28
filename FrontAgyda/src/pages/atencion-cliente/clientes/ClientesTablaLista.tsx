import { clsx } from 'clsx'
import { Building2, KeyRound } from 'lucide-react'
import { CLIENTE_ESTATUS_COLORES, type CRMContacto } from '@/types/crm.types'

function fmtFecha(f: string | null) {
  if (!f) return 'Sin actividad'
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return 'Sin actividad' }
}

// Tabla compacta para la columna izquierda del layout de 2 columnas —
// reemplaza el grid de tarjetas grandes que usaba esta pantalla antes.
// El estatus va debajo del nombre (no en su propia columna) para que quepa
// completo aunque el espacio se comparta con el panel de detalle a la derecha.
export function ClientesTablaLista({ clientes, seleccionadoId, onSeleccionar }: {
  clientes: CRMContacto[]
  seleccionadoId: number | null
  onSeleccionar: (id: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-100 text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">
            <th className="px-3 py-2.5">Cliente / Empresa</th>
            <th className="w-40 px-3 py-2.5 text-right whitespace-nowrap">Última actividad</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {clientes.map((c) => {
            const cfg = CLIENTE_ESTATUS_COLORES.find((e) => e.key === c.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]
            const activo = c.id === seleccionadoId
            return (
              <tr
                key={c.id}
                onClick={() => onSeleccionar(c.id)}
                className={clsx('cursor-pointer transition-colors', activo ? 'bg-brand/5' : 'hover:bg-gray-50')}
              >
                <td className="max-w-0 px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={clsx(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[0.68rem] font-bold',
                      activo ? 'bg-brand text-white' : 'bg-gray-100 text-gray-500',
                    )}>
                      {c.nombre?.slice(0, 2).toUpperCase() || '—'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[0.82rem] font-semibold text-gray-800">{c.nombre}</p>
                        {c.neusId && (
                          <span title="Con acceso al portal">
                            <KeyRound className="h-3 w-3 flex-shrink-0 text-blue-400" />
                          </span>
                        )}
                      </div>
                      {c.empresa && (
                        <p className="flex min-w-0 items-center gap-1 text-[0.68rem] text-gray-400">
                          <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                          <span className="truncate">{c.empresa}</span>
                        </p>
                      )}
                      <div className="mt-1">
                        {c.esCliente ? (
                          <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', cfg.bg, cfg.text)}>
                            <span className={clsx('h-1.5 w-1.5 flex-shrink-0 rounded-full', cfg.dot)} /> {cfg.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" /> Sin alta
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right align-top">
                  <p className="text-[0.72rem] text-gray-500">{fmtFecha(c.ultimaActividad)}</p>
                  {c.ultimaActividadTitulo && (
                    <p className="mt-0.5 break-words text-[0.65rem] text-gray-400">
                      {c.ultimaActividadTitulo}
                    </p>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
