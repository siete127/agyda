import { api } from '@/lib/axios'
import { publicApi } from '@/lib/axios-public'
import { parseCurso, parseMiCurso, parseCursoAsignado, type Curso, type MiCurso, type Material, type CursoAsignado, type CursoAcceso } from '@/types/capacitacion.types'

export const capacitacionService = {
  async getCursos(includeInactive = false): Promise<Curso[]> {
    const { data } = await api.get('/capacitacion/cursos', { params: includeInactive ? { includeInactive: 1 } : {} })
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseCurso)
  },

  async getById(id: number): Promise<Curso> {
    const { data } = await api.get(`/capacitacion/cursos/${id}`)
    return parseCurso((data?.data ?? data) as Record<string, unknown>)
  },

  async create(payload: { titulo: string; descripcion: string; categoria?: string; duracionMin?: number }): Promise<Curso> {
    const { data } = await api.post('/capacitacion/cursos', payload)
    return parseCurso((data?.data ?? data) as Record<string, unknown>)
  },

  async update(id: number, payload: { titulo: string; descripcion: string; categoria?: string; duracionMin?: number; duracionMinAgregar?: number; activo?: boolean; acceso?: CursoAcceso }): Promise<Curso> {
    const { data } = await api.put(`/capacitacion/cursos/${id}`, payload)
    return parseCurso((data?.data ?? data) as Record<string, unknown>)
  },

  // ── Asignación de cursos a usuarios (AD/TI) ──
  async getAsignados(cursoId: number): Promise<CursoAsignado[]> {
    const { data } = await api.get(`/capacitacion/cursos/${cursoId}/asignados`)
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseCursoAsignado)
  },
  async asignarUsuarios(cursoId: number, usuarioIds: number[]): Promise<{ asignados: number; nuevas: number }> {
    const { data } = await api.post(`/capacitacion/cursos/${cursoId}/asignar`, { usuarioIds })
    return data?.data
  },
  async desasignarUsuario(cursoId: number, usuarioId: number): Promise<void> {
    await api.delete(`/capacitacion/cursos/${cursoId}/asignados/${usuarioId}`)
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/capacitacion/cursos/${id}`)
  },

  async subirMaterial(cursoId: number, file: File): Promise<Material> {
    const form = new FormData()
    form.append('archivo', file)
    const { data } = await api.post(`/capacitacion/cursos/${cursoId}/materiales`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data?.data as Material
  },

  async eliminarMaterial(materialId: number): Promise<void> {
    await api.delete(`/capacitacion/materiales/${materialId}`)
  },

  async timerPlay(cursoId: number): Promise<{ timerCorriendo: boolean; timerSegundos: number }> {
    const { data } = await api.post(`/capacitacion/cursos/${cursoId}/timer/play`)
    return data?.data
  },

  async timerPause(cursoId: number): Promise<{ timerCorriendo: boolean; timerSegundos: number }> {
    const { data } = await api.post(`/capacitacion/cursos/${cursoId}/timer/pause`)
    return data?.data
  },

  async timerAgregar(cursoId: number, minutos: number): Promise<{ timerCorriendo: boolean; timerSegundos: number }> {
    const { data } = await api.post(`/capacitacion/cursos/${cursoId}/timer/agregar`, { minutos })
    return data?.data
  },

  async inscribirse(cursoId: number): Promise<void> {
    await api.post(`/capacitacion/cursos/${cursoId}/inscribirse`)
  },

  async completar(cursoId: number): Promise<void> {
    await api.post(`/capacitacion/cursos/${cursoId}/completar`)
  },

  async getMisCursos(): Promise<MiCurso[]> {
    const { data } = await api.get('/capacitacion/mis-cursos')
    const list = Array.isArray(data) ? data : (data?.data ?? [])
    return (list as Record<string, unknown>[]).map(parseMiCurso)
  },

  async descargarConstancia(cursoId: number, tituloCurso: string): Promise<void> {
    const { data } = await api.get(`/capacitacion/cursos/${cursoId}/constancia`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `Constancia - ${tituloCurso}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}

/* ── Curso público — sin sesión (número + nombre) ── */
export const capacitacionPublicoService = {
  async getBySlug(slug: string): Promise<Curso> {
    const { data } = await publicApi.get(`/capacitacion/publico/${slug}`)
    return parseCurso((data?.data ?? data) as Record<string, unknown>)
  },
  async registrar(slug: string, numero: string, nombre: string): Promise<{ inscripcionId: number }> {
    const { data } = await publicApi.post(`/capacitacion/publico/${slug}/registrar`, { numero, nombre })
    return data?.data
  },
  async completar(slug: string, inscripcionId: number): Promise<void> {
    await publicApi.post(`/capacitacion/publico/${slug}/completar`, { inscripcionId })
  },
}
