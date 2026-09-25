import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MonitorCheck, AlertCircle, CheckCircle2, XCircle, Wrench, Layers } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

// Datos de TI_STAFF_STATUS (GET /tickets/ti/staff): el área real solo puede ser
// TI o ST, y junto con el nivel decide a qué grupo de soporte se le asignan tickets.
interface StaffTI {
  id: number
  nombre: string
  puesto?: string
  fotoUrl?: string | null
  area: 'TI' | 'ST'
  nivel: number
  disponible: boolean
  grupoNombre?: string | null
}

type Cambio = Pick<StaffTI, 'area' | 'nivel' | 'disponible'>

const AREAS: { value: StaffTI['area']; label: string }[] = [
  { value: 'TI', label: 'Tecnologías de la información (TI)' },
  { value: 'ST', label: 'Soporte técnico (ST)' },
]
const NIVELES = [1, 2, 3]

function StaffCard({
  miembro,
  canEdit,
  guardando,
  onGuardar,
}: {
  miembro: StaffTI
  canEdit: boolean
  guardando: boolean
  onGuardar: (cambio: Partial<Cambio>) => void
}) {
  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={miembro.fotoUrl} name={miembro.nombre} size="lg" />
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

      {/* Área y nivel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          {canEdit ? (
            <select
              value={miembro.area}
              disabled={guardando}
              className="field py-1 text-xs flex-1"
              onChange={(e) => onGuardar({ area: e.target.value as StaffTI['area'] })}
            >
              {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          ) : (
            <span className="text-xs text-gray-600">{AREAS.find((a) => a.value === miembro.area)?.label ?? miembro.area}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          {canEdit ? (
            <select
              value={miembro.nivel}
              disabled={guardando}
              className="field py-1 text-xs flex-1"
              onChange={(e) => onGuardar({ nivel: Number(e.target.value) })}
            >
              {NIVELES.map((n) => <option key={n} value={n}>Nivel {n}</option>)}
            </select>
          ) : (
            <span className="text-xs text-gray-600">Nivel {miembro.nivel}</span>
          )}
        </div>
        {miembro.grupoNombre && (
          <p className="text-[0.7rem] text-gray-400">Grupo: {miembro.grupoNombre}</p>
        )}
      </div>

      {/* Toggle disponibilidad */}
      {canEdit && (
        <button
          disabled={guardando}
          onClick={() => onGuardar({ disponible: !miembro.disponible })}
          className={clsx(
            'w-full rounded-xl py-2 text-xs font-semibold transition-colors disabled:opacity-50',
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
  const isAdmin = user?.tipoUsuario?.toUpperCase() === 'AD'
  const { can } = useActionAccess()
  // El backend (POST /tickets/ti/staff) exige AD y staff-ti:actualizar o tickets:gestionar-staff-ti.
  const canEdit = isAdmin && (can('staff-ti', 'actualizar') || can('tickets', 'gestionar-staff-ti'))
  const qc = useQueryClient()

  const { data: staff = [], isLoading, error } = useQuery<StaffTI[]>({
    queryKey: ['staff-ti'],
    queryFn: async () => {
      const [rStaff, rUsuarios] = await Promise.all([
        api.get('/tickets/ti/staff'),
        // Solo para foto y puesto; si falla, la tarjeta usa iniciales.
        api.get('/usuarios').catch(() => ({ data: [] })),
      ])
      const usuarios = (Array.isArray(rUsuarios.data) ? rUsuarios.data : (rUsuarios.data?.data ?? [])) as Record<string, unknown>[]
      const porId = new Map(usuarios.map((u) => [Number(u['id']), u]))
      const lista = (rStaff.data?.data ?? []) as Record<string, unknown>[]
      return lista.map((s): StaffTI => {
        const u = porId.get(Number(s['userId']))
        return {
          id: Number(s['userId']),
          nombre: String(s['nombre'] ?? ''),
          puesto: u ? String(u['puesto'] ?? '') : '',
          fotoUrl: u ? (u['fotoUrl'] as string | null) : null,
          area: String(s['area']).toUpperCase() === 'ST' ? 'ST' : 'TI',
          nivel: Number(s['nivel']) || 1,
          disponible: s['disponible'] === true || s['disponible'] === 1,
          grupoNombre: (s['grupoNombre'] as string | null) ?? null,
        }
      })
    },
    staleTime: 60_000,
  })

  // El endpoint reescribe área, nivel y disponibilidad juntos: se mandan los tres
  // con los valores actuales para no pisar lo que no se está cambiando.
  const guardar = useMutation({
    mutationFn: ({ miembro, cambio }: { miembro: StaffTI; cambio: Partial<Cambio> }) =>
      api.post('/tickets/ti/staff', {
        userId: miembro.id,
        area: cambio.area ?? miembro.area,
        nivel: cambio.nivel ?? miembro.nivel,
        disponible: cambio.disponible ?? miembro.disponible,
      }),
    onSuccess: (_, { cambio }) => {
      qc.invalidateQueries({ queryKey: ['staff-ti'] })
      toast.success(cambio.disponible !== undefined ? 'Estado actualizado' : 'Staff actualizado')
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al actualizar'),
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
            <p className="text-xs text-gray-400 mt-0.5">No hay usuarios TI o de Soporte técnico en el sistema.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((m) => (
            <StaffCard
              key={m.id}
              miembro={m}
              canEdit={canEdit}
              guardando={guardar.isPending && guardar.variables?.miembro.id === m.id}
              onGuardar={(cambio) => guardar.mutate({ miembro: m, cambio })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
