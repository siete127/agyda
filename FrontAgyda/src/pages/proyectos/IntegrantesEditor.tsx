import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, UserPlus, Crown } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '@/lib/axios'
import { ROL_PROYECTO_LABEL, type IntegranteProyecto, type RolProyecto } from '@/types/proyecto.types'

const ROLES = Object.keys(ROL_PROYECTO_LABEL) as RolProyecto[]
const ROL_CHIP: Record<RolProyecto, string> = {
  lider: 'bg-amber-100 text-amber-700',
  miembro: 'bg-brand/10 text-brand',
  revisor: 'bg-violet-100 text-violet-700',
}

/**
 * Integrantes de un proyecto con su rol (líder / miembro / revisor): los
 * mismos roles en Nuevo proyecto, Editar proyecto y los proyectos que nacen
 * de un producto en Clientes.
 */
export function IntegrantesEditor({ value, onChange, alto = 'max-h-40' }: {
  value: IntegranteProyecto[]
  onChange: (v: IntegranteProyecto[]) => void
  alto?: string
}) {
  const [busqueda, setBusqueda] = useState('')
  const [rolNuevo, setRolNuevo] = useState<RolProyecto>(value.some((i) => i.rol === 'lider') ? 'miembro' : 'lider')

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-todos'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({
          id: Number(r['id'] ?? r['ID'] ?? 0),
          nombre: String(r['nombres'] ?? r['NOMBRES'] ?? r['nombre'] ?? ''),
          tipoUsuario: String(r['tipoUsuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
          activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? true),
        }))
        .filter((u) => u.activo && u.nombre)
    },
    staleTime: 300_000,
  })

  const elegidos = new Set(value.map((i) => i.nombre.toLowerCase()))
  const t = busqueda.trim().toLowerCase()
  const candidatos = usuarios.filter((u) => !elegidos.has(u.nombre.toLowerCase()) && (!t || u.nombre.toLowerCase().includes(t)))

  const agregar = (nombre: string) => {
    onChange([...value, { nombre, rol: rolNuevo }])
    setBusqueda('')
    if (rolNuevo === 'lider') setRolNuevo('miembro')
  }
  const quitar = (nombre: string) => onChange(value.filter((i) => i.nombre !== nombre))
  const cambiarRol = (nombre: string, rol: RolProyecto) => onChange(value.map((i) => (i.nombre === nombre ? { ...i, rol } : i)))
  const sinLider = value.length > 0 && !value.some((i) => i.rol === 'lider')

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className={clsx('space-y-1 overflow-y-auto', alto)}>
          {value.map((i) => (
            <div key={i.nombre} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
              {i.rol === 'lider' && <Crown className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}
              <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-gray-800">{i.nombre}</span>
              <select
                value={i.rol}
                onChange={(e) => cambiarRol(i.nombre, e.target.value as RolProyecto)}
                className={clsx('rounded-md border-0 px-1.5 py-0.5 text-[0.68rem] font-semibold', ROL_CHIP[i.rol])}
              >
                {ROLES.map((r) => <option key={r} value={r}>{ROL_PROYECTO_LABEL[r]}</option>)}
              </select>
              <button type="button" onClick={() => quitar(i.nombre)} className="text-gray-300 transition-colors hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {sinLider && <p className="text-[0.68rem] text-amber-600">Sin líder: el líder puede administrar integrantes y tareas.</p>}

      <div className="flex gap-2">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario para agregar…" className="field flex-1 text-sm" />
        <select value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as RolProyecto)} className="field w-28 text-sm">
          {ROLES.map((r) => <option key={r} value={r}>{ROL_PROYECTO_LABEL[r]}</option>)}
        </select>
      </div>
      {busqueda.trim() && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-1">
          {candidatos.length === 0 ? (
            <p className="px-2 py-1.5 text-[0.72rem] text-gray-400">Sin resultados</p>
          ) : candidatos.slice(0, 8).map((u) => (
            <button key={u.id} type="button" onClick={() => agregar(u.nombre)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.78rem] text-gray-700 transition-colors hover:bg-brand/5">
              <UserPlus className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
              <span className="flex-1">{u.nombre}</span>
              <span className="text-[0.65rem] text-gray-400">{u.tipoUsuario}</span>
            </button>
          ))}
        </div>
      )}
      {value.length === 0 && !busqueda.trim() && <p className="text-[0.7rem] text-gray-400">Sin integrantes todavía.</p>}
    </div>
  )
}
