import { api } from '@/lib/axios'

// Funciones de usuario: etiquetas asignables a cualquier usuario sin importar
// su rol (ej. "Asesor de clientes" = recibe los avisos de clientes sin asesor).
export interface FuncionUsuario {
  id: number
  clave: string
  nombre: string
  descripcion: string | null
  color: string | null
  esSistema: boolean
  activo: boolean
  usuarios: number
}
export interface UsuarioConFuncion {
  id: number
  nombre: string
  usuario: string
  correo: string | null
  rol: string
  asignadoEn: string
}

export const funcionesUsuarioService = {
  async listar(): Promise<FuncionUsuario[]> {
    const { data } = await api.get('/funciones-usuario')
    return (data?.data ?? []) as FuncionUsuario[]
  },
  async crear(body: { nombre: string; descripcion?: string; color?: string }): Promise<{ id: number }> {
    const { data } = await api.post('/funciones-usuario', body)
    return data?.data
  },
  async actualizar(id: number, body: Partial<Pick<FuncionUsuario, 'nombre' | 'descripcion' | 'color' | 'activo'>>): Promise<void> {
    await api.put(`/funciones-usuario/${id}`, body)
  },
  async eliminar(id: number): Promise<void> {
    await api.delete(`/funciones-usuario/${id}`)
  },
  async usuarios(id: number): Promise<UsuarioConFuncion[]> {
    const { data } = await api.get(`/funciones-usuario/${id}/usuarios`)
    return (data?.data ?? []) as UsuarioConFuncion[]
  },
  async agregarUsuarios(id: number, usuarioIds: number[]): Promise<void> {
    await api.post(`/funciones-usuario/${id}/usuarios`, { usuarioIds })
  },
  async quitarUsuario(id: number, usuarioId: number): Promise<void> {
    await api.delete(`/funciones-usuario/${id}/usuarios/${usuarioId}`)
  },
}
