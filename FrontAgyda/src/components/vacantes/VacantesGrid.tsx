import { Briefcase, MapPin, Users, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { Vacante, Modalidad } from '@/types/vacante.types'

const MODALIDADES: { value: Modalidad; label: string }[] = [
  { value: 'remoto', label: 'Remoto' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'hibrido', label: 'Híbrido' },
]

const modalidadLabel = (m: Modalidad | null) => MODALIDADES.find((x) => x.value === m)?.label ?? '—'

interface VacantesGridProps {
  vacantes: Vacante[]
  isAdmin: boolean
  onVerPostulantes: (v: Vacante) => void
  onEditar: (v: Vacante) => void
  onEliminar: (v: Vacante) => void
  onToggleActivo: (id: number, activo: boolean) => void
}

export function VacantesGrid({ vacantes, isAdmin, onVerPostulantes, onEditar, onEliminar, onToggleActivo }: VacantesGridProps) {
  if (vacantes.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <Briefcase className="h-8 w-8" />
        <p className="text-sm">No hay vacantes registradas</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vacantes.map((v) => (
        <div key={v.id} className={clsx('card p-4 flex flex-col gap-2.5', !v.activo && 'opacity-60')}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm text-gray-900 leading-snug">{v.titulo}</h3>
            <span className={clsx(
              'flex-shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold',
              v.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
            )}>
              {v.activo ? 'Publicada' : 'Despublicada'}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            {v.ubicacion && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {v.ubicacion}</span>}
            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {modalidadLabel(v.modalidad)}</span>
          </div>

          <p className="text-xs text-gray-600 line-clamp-2">{v.descripcion}</p>

          <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100">
            <button
              onClick={() => onVerPostulantes(v)}
              className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Users className="h-3.5 w-3.5" /> Postulantes
            </button>

            {isAdmin && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onToggleActivo(v.id, !v.activo)}
                  title={v.activo ? 'Despublicar' : 'Publicar'}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  {v.activo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onEditar(v)}
                  title="Editar"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => onEliminar(v)}
                  title="Eliminar"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
