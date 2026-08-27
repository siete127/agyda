import { api } from '@/lib/axios'
import type { Sede, CategoriaConSubcategorias, Especialidad, IntegracionConfig } from '@/types/catalogosTi.types'

export const catalogosTiService = {
  // Sedes
  async getSedes(incluirInactivas = false): Promise<Sede[]> {
    const { data } = await api.get('/catalogos-ti/sedes', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createSede(payload: { nombre: string; direccion?: string }): Promise<Sede> {
    const { data } = await api.post('/catalogos-ti/sedes', payload)
    return data.data
  },
  async updateSede(id: number, payload: { nombre: string; direccion?: string }): Promise<void> {
    await api.put(`/catalogos-ti/sedes/${id}`, payload)
  },
  async toggleSedeActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/sedes/${id}/activa`)
  },

  // Categorías / Subcategorías
  async getCategorias(incluirInactivas = false): Promise<CategoriaConSubcategorias[]> {
    const { data } = await api.get('/catalogos-ti/categorias', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createCategoria(payload: { nombre: string; orden?: number }): Promise<CategoriaConSubcategorias> {
    const { data } = await api.post('/catalogos-ti/categorias', payload)
    return data.data
  },
  async updateCategoria(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/categorias/${id}`, payload)
  },
  async toggleCategoriaActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/categorias/${id}/activa`)
  },
  async createSubcategoria(payload: { categoriaId: number; nombre: string; orden?: number }): Promise<void> {
    await api.post('/catalogos-ti/subcategorias', payload)
  },
  async updateSubcategoria(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/subcategorias/${id}`, payload)
  },
  async toggleSubcategoriaActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/subcategorias/${id}/activa`)
  },

  // Especialidades
  async getEspecialidades(incluirInactivas = false): Promise<Especialidad[]> {
    const { data } = await api.get('/catalogos-ti/especialidades', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createEspecialidad(nombre: string): Promise<Especialidad> {
    const { data } = await api.post('/catalogos-ti/especialidades', { nombre })
    return data.data
  },
  async updateEspecialidad(id: number, nombre: string): Promise<void> {
    await api.put(`/catalogos-ti/especialidades/${id}`, { nombre })
  },
  async toggleEspecialidadActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/especialidades/${id}/activa`)
  },

  // Integraciones (placeholder clave/valor, sin cifrado)
  async getIntegraciones(): Promise<IntegracionConfig[]> {
    const { data } = await api.get('/catalogos-ti/integraciones')
    return data?.data ?? []
  },
  async setIntegracion(clave: string, valor: string): Promise<void> {
    await api.put('/catalogos-ti/integraciones', { clave, valor })
  },
  async deleteIntegracion(id: number): Promise<void> {
    await api.delete(`/catalogos-ti/integraciones/${id}`)
  },
}
