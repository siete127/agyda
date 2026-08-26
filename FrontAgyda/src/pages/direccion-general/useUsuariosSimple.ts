import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'

export interface UsuarioSimple {
  id: number
  nombre: string
}

export function useUsuariosSimple() {
  return useQuery({
    queryKey: ['usuarios-simple'],
    queryFn: async (): Promise<UsuarioSimple[]> => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({
        id: Number(r['id'] ?? r['ID'] ?? 0),
        nombre: String(r['nombre'] ?? r['nombres'] ?? r['NOMBRES'] ?? ''),
      }))
    },
    staleTime: 5 * 60_000,
  })
}
