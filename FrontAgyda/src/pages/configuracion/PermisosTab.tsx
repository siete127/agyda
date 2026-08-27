import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/axios'
import { Avatar } from '@/components/ui/Avatar'
import { clsx } from 'clsx'
import { PermisosUsuarioModal } from '../usuarios/PermisosUsuarioModal'

interface Usuario {
  id: number
  nombres: string
  apellidos: string
  login: string
  tipoUsuario: string
  activo: boolean
  status: boolean
  fotoPerfil: string | null
}

function parseUsuario(r: Record<string, unknown>): Usuario {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['usuarioId'] ?? 0),
    nombres: s(['nombres', 'NOMBRES', 'nombre', 'firstName']),
    apellidos: s(['apellidos', 'APELLIDOS', 'lastName']),
    login: s(['usuario', 'USUARIO', 'login', 'username']),
    tipoUsuario: s(['tipoUsuario', 'tipo_usuario', 'TIPO_USUARIO', 'rol', 'role']),
    activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? r['active'] ?? true),
    status: Boolean(r['status'] ?? r['STATUS'] ?? r['NEUS_STATUS'] ?? false),
    fotoPerfil: s(['fotoPerfil', 'foto_perfil', 'FOTO_PERFIL', 'foto']) || null,
  }
}

const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700', TI: 'bg-blue-100 text-blue-700', CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600', ST: 'bg-green-100 text-green-700', VE: 'bg-amber-100 text-amber-700',
}

// Editor de permisos por usuario individual (módulos y funciones granulares)
// — vivía como acción rápida dentro de Usuarios, ahora agrupado aquí junto al
// resto de la configuración del sistema.
export function PermisosTab() {
  const [search, setSearch] = useState('')
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map(parseUsuario)
    },
  })

  const filtrados = usuarios.filter((u) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return `${u.nombres} ${u.apellidos} ${u.login}`.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar usuario…"
          className="field w-full pl-9 text-[0.82rem]"
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-card divide-y divide-gray-50">
        {isLoading ? (
          <div className="flex justify-center py-10"><ShieldCheck className="h-5 w-5 animate-pulse text-gray-300" /></div>
        ) : filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Sin resultados</p>
        ) : (
          filtrados.map((u) => {
            const rolUpper = u.tipoUsuario.toUpperCase()
            return (
              <button
                key={u.id}
                onClick={() => setSeleccionado(u)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <Avatar src={u.fotoPerfil ? `/uploads/${u.fotoPerfil}` : undefined} name={`${u.nombres} ${u.apellidos}`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.82rem] font-semibold text-gray-800 truncate">{u.nombres} {u.apellidos}</p>
                  <p className="text-[0.7rem] text-gray-400">@{u.login}</p>
                </div>
                {rolUpper && (
                  <span className={clsx('chip text-[0.65rem]', ROL_COLORS[rolUpper] ?? 'bg-gray-100 text-gray-600')}>
                    {rolUpper}
                  </span>
                )}
                <ShieldCheck className="h-4 w-4 flex-shrink-0 text-gray-300" />
              </button>
            )
          })
        )}
      </div>

      {seleccionado && (
        <PermisosUsuarioModal
          usuarioId={seleccionado.id}
          nombre={`${seleccionado.nombres} ${seleccionado.apellidos}`.trim()}
          tipoUsuario={seleccionado.tipoUsuario}
          login={seleccionado.login}
          fotoPerfil={seleccionado.fotoPerfil}
          activo={seleccionado.activo}
          status={seleccionado.status}
          onClose={() => setSeleccionado(null)}
        />
      )}
    </div>
  )
}
