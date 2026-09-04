import { api } from '@/lib/axios'
import type { Sede, CategoriaConSubcategorias, Especialidad, CodigoCierre, Clasificacion, MotivoEspera, Impacto, Urgencia, CeldaMatrizPrioridad, IntegracionConfig, Proveedor, Servicio, DiaFestivo, Elemento } from '@/types/catalogosTi.types'

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

  // Elementos (tercer nivel, colgado de subcategoría)
  async createElemento(payload: { subcategoriaId: number; nombre: string; orden?: number }): Promise<Elemento> {
    const { data } = await api.post('/catalogos-ti/elementos', payload)
    return data.data
  },
  async updateElemento(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/elementos/${id}`, payload)
  },
  async toggleElementoActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/elementos/${id}/activa`)
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

  // Códigos de cierre de tickets
  async getCodigosCierre(incluirInactivas = false): Promise<CodigoCierre[]> {
    const { data } = await api.get('/catalogos-ti/codigos-cierre', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createCodigoCierre(payload: { nombre: string; orden?: number }): Promise<CodigoCierre> {
    const { data } = await api.post('/catalogos-ti/codigos-cierre', payload)
    return data.data
  },
  async updateCodigoCierre(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/codigos-cierre/${id}`, payload)
  },
  async toggleCodigoCierreActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/codigos-cierre/${id}/activa`)
  },

  // Clasificaciones de ticket
  async getClasificaciones(incluirInactivas = false): Promise<Clasificacion[]> {
    const { data } = await api.get('/catalogos-ti/clasificaciones', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createClasificacion(payload: { clave: string; nombre: string; orden?: number }): Promise<Clasificacion> {
    const { data } = await api.post('/catalogos-ti/clasificaciones', payload)
    return data.data
  },
  async updateClasificacion(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/clasificaciones/${id}`, payload)
  },
  async toggleClasificacionActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/clasificaciones/${id}/activa`)
  },

  // Motivos de espera de ticket
  async getMotivosEspera(incluirInactivas = false): Promise<MotivoEspera[]> {
    const { data } = await api.get('/catalogos-ti/motivos-espera', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createMotivoEspera(payload: { clave: string; nombre: string; orden?: number }): Promise<MotivoEspera> {
    const { data } = await api.post('/catalogos-ti/motivos-espera', payload)
    return data.data
  },
  async updateMotivoEspera(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/motivos-espera/${id}`, payload)
  },
  async toggleMotivoEsperaActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/motivos-espera/${id}/activa`)
  },

  // Impactos de ticket
  async getImpactos(incluirInactivas = false): Promise<Impacto[]> {
    const { data } = await api.get('/catalogos-ti/impactos', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createImpacto(payload: { clave: string; nombre: string; orden?: number }): Promise<Impacto> {
    const { data } = await api.post('/catalogos-ti/impactos', payload)
    return data.data
  },
  async updateImpacto(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/impactos/${id}`, payload)
  },
  async toggleImpactoActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/impactos/${id}/activa`)
  },

  // Urgencias de ticket
  async getUrgencias(incluirInactivas = false): Promise<Urgencia[]> {
    const { data } = await api.get('/catalogos-ti/urgencias', { params: incluirInactivas ? { incluirInactivas: '1' } : {} })
    return data?.data ?? []
  },
  async createUrgencia(payload: { clave: string; nombre: string; orden?: number }): Promise<Urgencia> {
    const { data } = await api.post('/catalogos-ti/urgencias', payload)
    return data.data
  },
  async updateUrgencia(id: number, payload: { nombre: string; orden?: number }): Promise<void> {
    await api.put(`/catalogos-ti/urgencias/${id}`, payload)
  },
  async toggleUrgenciaActiva(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/urgencias/${id}/activa`)
  },

  // Matriz de prioridad (Impacto x Urgencia -> Prioridad)
  async getMatrizPrioridad(): Promise<CeldaMatrizPrioridad[]> {
    const { data } = await api.get('/catalogos-ti/matriz-prioridad')
    return data?.data ?? []
  },
  async setCeldaMatrizPrioridad(payload: { impacto: string; urgencia: string; prioridad: string }): Promise<void> {
    await api.put('/catalogos-ti/matriz-prioridad', payload)
  },

  // Proveedores
  async getProveedores(incluirInactivos = false): Promise<Proveedor[]> {
    const { data } = await api.get('/catalogos-ti/proveedores', { params: incluirInactivos ? { incluirInactivos: '1' } : {} })
    return data?.data ?? []
  },
  async createProveedor(payload: { nombre: string; contacto?: string; telefono?: string; correo?: string }): Promise<Proveedor> {
    const { data } = await api.post('/catalogos-ti/proveedores', payload)
    return data.data
  },
  async updateProveedor(id: number, payload: { nombre: string; contacto?: string; telefono?: string; correo?: string }): Promise<void> {
    await api.put(`/catalogos-ti/proveedores/${id}`, payload)
  },
  async toggleProveedorActivo(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/proveedores/${id}/activo`)
  },

  // Servicios
  async getServicios(incluirInactivos = false): Promise<Servicio[]> {
    const { data } = await api.get('/catalogos-ti/servicios', { params: incluirInactivos ? { incluirInactivos: '1' } : {} })
    return data?.data ?? []
  },
  async createServicio(payload: { nombre: string; descripcion?: string; proveedorId?: number | null }): Promise<Servicio> {
    const { data } = await api.post('/catalogos-ti/servicios', payload)
    return data.data
  },
  async updateServicio(id: number, payload: { nombre: string; descripcion?: string; proveedorId?: number | null }): Promise<void> {
    await api.put(`/catalogos-ti/servicios/${id}`, payload)
  },
  async toggleServicioActivo(id: number): Promise<void> {
    await api.patch(`/catalogos-ti/servicios/${id}/activo`)
  },

  // Config general (zona horaria informativa)
  async getConfigGeneral(): Promise<{ zonaHoraria: string }> {
    const { data } = await api.get('/catalogos-ti/config-general')
    return data?.data ?? { zonaHoraria: 'America/Mexico_City' }
  },
  async updateConfigGeneral(zonaHoraria: string): Promise<void> {
    await api.put('/catalogos-ti/config-general', { zonaHoraria })
  },

  // Días festivos (excluidos del cálculo de SLA)
  async getDiasFestivos(): Promise<DiaFestivo[]> {
    const { data } = await api.get('/catalogos-ti/dias-festivos')
    return data?.data ?? []
  },
  async createDiaFestivo(payload: { fecha: string; descripcion?: string }): Promise<DiaFestivo> {
    const { data } = await api.post('/catalogos-ti/dias-festivos', payload)
    return data.data
  },
  async deleteDiaFestivo(id: number): Promise<void> {
    await api.delete(`/catalogos-ti/dias-festivos/${id}`)
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
