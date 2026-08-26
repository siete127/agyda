import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MonitorCheck, AlertCircle, CheckCircle2, XCircle, Wrench } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

interface StaffTI {
  id: number
  nombre: string
  puesto?: string
  area?: string
  disponible: boolean
  foto?: string
}

const AREAS = [
  'Soporte',
  'Desarrollo',
  'Infraestructura',
  'Base de datos',
  'Seguridad',
  'Redes',
]

function Avatar({ nombre, foto }: { nombre: string; foto?: string }) {
  if (foto) {
    return (
      <img
        src={foto.startsWith('http') ? foto : `/uploads/${foto}`}
        alt={nombre}
        className="h-12 w-12 rounded-2xl object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  const initials = nombre.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
      {initials}
    </div>
  )
}

function StaffCard({
  miembro,
  canEdit,
  onToggle,
  onAreaChange,
}: {
  miembro: StaffTI
  canEdit: boolean
  onToggle: (id: number, val: boolean) => void
  onAreaChange: (id: number, area: string) => void
}) {
  const [editingArea, setEditingArea] = useState(false)

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar nombre={miembro.nombre} foto={miembro.foto} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{miembro.nombre}</h3>
          {miembro.puesto && <p className="text-[0.72rem] text-gray-500 truncate">{miembro.puesto}</p>}
        </div>
        <span className={clsx(
          'flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold',
          miembro.disponible
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-red-100 text-red-600',
        )}>
          {miembro.disponible
            ? <><CheckCircle2 className="h-3 w-3" /> Disponible</>
            : <><XCircle className="h-3 w-3" /> Ocupado</>}
        </span>
      </div>

      {/* Área */}
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        {canEdit && editingArea ? (
          <select
            defaultValue={miembro.area ?? ''}
            className="field py-1 text-xs flex-1"
            autoFocus
            onBlur={(e) => { onAreaChange(miembro.id, e.target.value); setEditingArea(false) }}
            onChange={(e) => { onAreaChange(miembro.id, e.target.value); setEditingArea(false) }}
          >
            <option value="">Sin área</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : (
          <span
            className={clsx('text-xs text-gray-600', canEdit && 'cursor-pointer hover:text-indigo-600 hover:underline')}
            onClick={() => canEdit && setEditingArea(true)}
          >
            {miembro.area || 'Sin área asignada'}
          </span>
        )}
      </div>

      {/* Toggle disponibilidad */}
      {canEdit && (
        <button
          onClick={() => onToggle(miembro.id, !miembro.disponible)}
          className={clsx(
            'w-full rounded-xl py-2 text-xs font-semibold transition-colors',
            miembro.disponible
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          )}
        >
          {miembro.disponible ? 'Marcar como ocupado' : 'Marcar como disponible'}
        </button>
      )}
    </div>
  )
}

export function StaffTiPage() {
  const user = useAuthStore((s) => s.user)
  const isTI = user?.tipoUsuario?.toUpperCase() === 'TI'
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD'
  const canEdit = isTI || isAdmin
  const qc = useQueryClient()

  const { data: staff = [], isLoading, error } = useQuery<StaffTI[]>({
    queryKey: ['staff-ti'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const all: StaffTI[] = Array.isArray(data) ? data : (data?.data ?? [])
      return all.filter(
        (u: StaffTI & { tipoUsuario?: string }) =>
          (u as unknown as { tipoUsuario?: string }).tipoUsuario?.toUpperCase() === 'TI',
      )
    },
    staleTime: 60_000,
  })

  const toggleDisponible = useMutation({
    mutationFn: ({ id, disponible }: { id: number; disponible: boolean }) =>
      api.patch(`/usuarios/${id}`, { disponible }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-ti'] })
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al actualizar estado'),
  })

  const cambiarArea = useMutation({
    mutationFn: ({ id, area }: { id: number; area: string }) =>
      api.patch(`/usuarios/${id}`, { area }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-ti'] })
      toast.success('Área actualizada')
    },
    onError: () => toast.error('Error al actualizar área'),
  })

  const disponibles = staff.filter((s) => s.disponible).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <MonitorCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Staff de TI</h1>
              <p className="mt-0.5 text-xs text-blue-200/80">
                {disponibles}/{staff.length} disponibles ahora
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-gray-100" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-gray-100" />
                  <div className="h-2.5 w-20 rounded bg-gray-100" />
                </div>
              </div>
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-8 w-full rounded-xl bg-gray-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card flex items-center gap-3 p-5 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm">Error al cargar staff</p>
        </div>
      ) : staff.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <MonitorCheck className="h-7 w-7 text-blue-300" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin staff TI registrado</p>
            <p className="text-xs text-gray-400 mt-0.5">No hay usuarios con tipo TI en el sistema.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((m) => (
            <StaffCard
              key={m.id}
              miembro={m}
              canEdit={canEdit}
              onToggle={(id, val) => toggleDisponible.mutate({ id, disponible: val })}
              onAreaChange={(id, area) => cambiarArea.mutate({ id, area })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
