import { clsx } from 'clsx'
import { Video, Phone, Calendar } from 'lucide-react'
import { CITA_MODALIDAD_CONFIG, ESTATUS_CITA_CONFIG, type Cita } from '@/types/cita.types'
import { calcularPosicion, HORA_INICIO, type CitaConColumna } from './AgendaTimelineComun'

const MODALIDAD_ICON = { videollamada: Video, telefonica: Phone, generica: Calendar }

function fmtHora(f: string) {
  try { return new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

// Bloque posicionado absolutamente dentro del timeline — color por modalidad
// (confirmado con el usuario), badge de estatus pequeño dentro del bloque.
export function AgendaBloqueCita({ item, onClick, horaInicio = HORA_INICIO }: { item: CitaConColumna; onClick: (c: Cita) => void; horaInicio?: number }) {
  const { cita, columna, totalColumnas } = item
  const { top, height } = calcularPosicion(cita.fechaHora, cita.duracionMin, horaInicio)
  const modalCfg = CITA_MODALIDAD_CONFIG[cita.modalidad]
  const estCfg = ESTATUS_CITA_CONFIG[cita.estatus]
  const Icon = MODALIDAD_ICON[cita.modalidad]

  return (
    <button
      onClick={() => onClick(cita)}
      style={{
        top, height,
        left: `${(columna / totalColumnas) * 100}%`,
        width: `${100 / totalColumnas}%`,
      }}
      className={clsx(
        'absolute overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md',
        modalCfg.bg, modalCfg.text, 'border-white/60',
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Icon className="h-2.5 w-2.5 flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-semibold">{cita.titulo}</span>
        <span className={clsx('h-1.5 w-1.5 flex-shrink-0 rounded-full', estCfg.dot)} title={estCfg.label} />
      </div>
      {cita.contactoNombre && <p className="truncate text-[0.6rem] opacity-80">{cita.contactoNombre}</p>}
      <p className="truncate text-[0.58rem] font-medium opacity-70">{fmtHora(cita.fechaHora)}</p>
    </button>
  )
}
