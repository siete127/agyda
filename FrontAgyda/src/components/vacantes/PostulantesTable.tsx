import { FileText, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import type { Postulante, PostulanteEstado } from '@/types/vacante.types'

const ESTADOS: { value: PostulanteEstado; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'revisado', label: 'Revisado' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'descartado', label: 'Descartado' },
]

const ESTADO_COLORS: Record<PostulanteEstado, string> = {
  nuevo: 'bg-blue-50 text-blue-700',
  revisado: 'bg-amber-50 text-amber-700',
  contactado: 'bg-emerald-50 text-emerald-700',
  descartado: 'bg-gray-100 text-gray-500',
}

function formatFechaHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface PostulantesTableProps {
  postulantes: Postulante[]
  onEstadoChange: (vacanteId: number, postId: number, estado: PostulanteEstado) => void
  showReclutamientoLink?: boolean
}

export function PostulantesTable({ postulantes, onEstadoChange, showReclutamientoLink = true }: PostulantesTableProps) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500">
            <th className="px-4 py-2.5 font-semibold">Postulante</th>
            <th className="px-4 py-2.5 font-semibold">Vacante</th>
            <th className="px-4 py-2.5 font-semibold">Contacto</th>
            <th className="px-4 py-2.5 font-semibold">Fecha</th>
            <th className="px-4 py-2.5 font-semibold">CV</th>
            <th className="px-4 py-2.5 font-semibold">Estado</th>
            {showReclutamientoLink && <th className="px-4 py-2.5 font-semibold"></th>}
          </tr>
        </thead>
        <tbody>
          {postulantes.map((p) => (
            <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.nombre}</td>
              <td className="px-4 py-2.5 text-gray-600">{p.vacanteTitulo ?? `#${p.vacanteId}`}</td>
              <td className="px-4 py-2.5 text-gray-600">
                <div>{p.email}</div>
                {p.telefono && <div className="text-gray-400">{p.telefono}</div>}
              </td>
              <td className="px-4 py-2.5 text-gray-500">{formatFechaHora(p.fecha)}</td>
              <td className="px-4 py-2.5">
                <a
                  href={p.cvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-semibold text-brand hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> Ver
                </a>
              </td>
              <td className="px-4 py-2.5">
                <select
                  value={p.estado}
                  onChange={(e) => onEstadoChange(p.vacanteId, p.id, e.target.value as PostulanteEstado)}
                  className={clsx('rounded-lg border-0 px-2 py-1 text-[0.7rem] font-semibold', ESTADO_COLORS[p.estado])}
                >
                  {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </td>
              {showReclutamientoLink && (
                <td className="px-4 py-2.5 text-right">
                  <Link
                    to="/rh/reclutamiento"
                    className="flex items-center justify-end gap-1 font-semibold text-brand hover:underline whitespace-nowrap"
                  >
                    Ver en Reclutamiento y selección <ExternalLink className="h-3 w-3" />
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { ESTADOS as POSTULANTE_ESTADOS_OPTIONS }
