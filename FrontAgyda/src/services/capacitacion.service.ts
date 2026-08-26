import { api } from '@/lib/axios'
import { parseCurso, parseMiCurso, type Curso, type MiCurso, type Material } from '@/types/capacitacion.types'

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

  async update(id: number, payload: { titulo: string; descripcion: string; categoria?: string; duracionMin?: number; duracionMinAgregar?: number; activo?: boolean }): Promise<Curso> {
    const { data } = await api.put(`/capacitacion/cursos/${id}`, payload)
    return parseCurso((data?.data ?? data) as Record<string, unknown>)
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
