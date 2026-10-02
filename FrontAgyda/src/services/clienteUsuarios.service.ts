import { api } from '@/lib/axios'
import type { PortalUsuario, PortalResultadoAcceso } from '@/services/portalCliente.service'

// Usuarios del portal de un cliente, gestionados desde AGYDA (Clientes → Editar).
// Son los mismos que el cliente ve en "Usuarios" de su portal.
export const clienteUsuariosService = {
  subroles: () => api.get('/clientes/portal-subroles').then((r) => (r.data?.data ?? []) as { id: number; nombre: string }[]),
  listar: (clienteId: number) => api.get(`/clientes/${clienteId}/usuarios`).then((r) => (r.data?.data ?? []) as PortalUsuario[]),
  crear: (clienteId: number, body: { nombre: string; correo: string; subrolId: number }) =>
    api.post(`/clientes/${clienteId}/usuarios`, body).then((r) => r.data?.data as { neusId: number } & PortalResultadoAcceso),
  actualizar: (clienteId: number, puId: number, body: { subrolId?: number; activo?: boolean }) =>
    api.put(`/clientes/${clienteId}/usuarios/${puId}`, body).then((r) => r.data),
  reenviarAcceso: (clienteId: number, puId: number) =>
    api.post(`/clientes/${clienteId}/usuarios/${puId}/reenviar-acceso`).then((r) => r.data?.data as PortalResultadoAcceso),
  eliminar: (clienteId: number, puId: number) => api.delete(`/clientes/${clienteId}/usuarios/${puId}`).then((r) => r.data),
}
