import { clsx } from 'clsx'
import { CASO_TIPO_CONFIG, ESTATUS_CASO_CONFIG, type Caso } from '@/types/caso.types'

// Fila compacta de un caso, compartida por "Historial" (todos los casos del
// mismo cliente) y "Casos relacionados" (versión truncada en la columna
// derecha) — mismo dataset (casoService.getByContacto), misma presentación.
export function CasoFilaResumen({ caso, onClick }: { caso: Caso; onClick: () => void }) {
  const tipoCfg = CASO_TIPO_CONFIG[caso.tipo]
  const estCfg = ESTATUS_CASO_CONFIG[caso.estatus]
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors">
      <div className="min-w-0">
        <p className="truncate text-[0.78rem] font-semibold text-gray-800">{caso.folio} — {caso.titulo}</p>
        <p className="text-[0.68rem] text-gray-400">{new Date(caso.fechaCreacion).toLocaleDateString('es-MX')}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className={clsx('rounded-full px-2 py-0.5 text-[0.6rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold', estCfg.bg, estCfg.text)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
        </span>
      </div>
    </button>
  )
}
