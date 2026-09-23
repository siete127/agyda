import { api } from '@/lib/axios'
import type { CatalogoClienteItem, CrearCatalogoClienteItemPayload, ActualizarCatalogoClienteItemPayload } from '@/types/crmCatalogosCliente.types'

// Catálogos administrables de Clientes (Configuración → CRM → Clientes).
// Un solo factory genera los 4 métodos por catálogo — mismo patrón que el
// backend (crmCatalogosClienteController.js), evita repetir 6 veces el CRUD.
function crearServicio(ruta: string) {
  return {
    async list(incluirInactivas = false): Promise<CatalogoClienteItem[]> {
      const { data } = await api.get(`/crm/catalogos/${ruta}`, { params: incluirInactivas ? { incluirInactivas: '1' } : undefined })
      return (data?.data ?? []) as CatalogoClienteItem[]
    },
    async crear(payload: CrearCatalogoClienteItemPayload): Promise<void> {
      await api.post(`/crm/catalogos/${ruta}`, payload)
    },
    async actualizar(id: number, payload: ActualizarCatalogoClienteItemPayload): Promise<void> {
      await api.put(`/crm/catalogos/${ruta}/${id}`, payload)
    },
    async toggleActiva(id: number): Promise<void> {
      await api.patch(`/crm/catalogos/${ruta}/${id}/activa`)
    },
  }
}

export const crmCatalogosClienteService = {
  tipos: crearServicio('tipos-cliente'),
  segmentos: crearServicio('segmentos'),
  categorias: crearServicio('categorias-cliente'),
  industrias: crearServicio('industrias'),
  clasificaciones: crearServicio('clasificaciones-cliente'),
  etiquetas: crearServicio('etiquetas'),
  tiposAcceso: crearServicio('tipos-acceso-portal'),
}
