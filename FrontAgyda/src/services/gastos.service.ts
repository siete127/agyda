import { api } from '@/lib/axios'
import type { GastoCategoria, Gasto, GastoReporte, GastoComentario } from '@/types/gasto.types'

function parseGasto(r: Record<string, unknown>): Gasto {
  return {
    id:              Number(r['id']),
    categoriaId:     Number(r['categoriaId']),
    categoriaNombre: String(r['categoriaNombre'] ?? ''),
    categoriaCodigo: String(r['categoriaCodigo'] ?? ''),
    descripcion:     String(r['descripcion'] ?? ''),
    fecha:           String(r['fecha'] ?? ''),
    monto:           Number(r['monto'] ?? 0),
    cantidad:        r['cantidad'] != null ? Number(r['cantidad']) : null,
    pagadoPor:       (r['pagadoPor'] as 'empleado' | 'empresa') ?? 'empleado',
    reciboUrl:       r['reciboUrl'] ? String(r['reciboUrl']) : null,
    reporteId:       r['reporteId'] != null ? Number(r['reporteId']) : null,
    notas:           r['notas'] ? String(r['notas']) : null,
    estatus:         (r['estatus'] as Gasto['estatus']) ?? 'borrador',
    fechaReg:        r['fechaReg'] ? String(r['fechaReg']) : undefined,
  }
}

function parseReporte(r: Record<string, unknown>): GastoReporte {
  return {
    id:            Number(r['id']),
    titulo:        String(r['titulo'] ?? ''),
    usuarioId:     Number(r['usuarioId']),
    usuarioNombre: String(r['usuarioNombre'] ?? ''),
    managerId:     r['managerId'] != null ? Number(r['managerId']) : null,
    managerNombre: r['managerNombre'] ? String(r['managerNombre']) : null,
    total:         Number(r['total'] ?? 0),
    estatus:       (r['estatus'] as GastoReporte['estatus']) ?? 'borrador',
    metodoPago:    r['metodoPago'] ? String(r['metodoPago']) : null,
    notas:         r['notas'] ? String(r['notas']) : null,
    fechaReg:      String(r['fechaReg'] ?? ''),
    fechaEnvio:    r['fechaEnvio'] ? String(r['fechaEnvio']) : null,
    fechaPago:     r['fechaPago'] ? String(r['fechaPago']) : null,
    numGastos:     r['numGastos'] != null ? Number(r['numGastos']) : undefined,
    gastos:        Array.isArray(r['gastos']) ? (r['gastos'] as Record<string, unknown>[]).map(parseGasto) : undefined,
    comentarios:   Array.isArray(r['comentarios']) ? r['comentarios'] as GastoComentario[] : undefined,
  }
}

export const gastosService = {
  async getCategorias(): Promise<GastoCategoria[]> {
    const { data } = await api.get('/gastos/categorias')
    return data.data ?? []
  },

  async getMisGastos(): Promise<Gasto[]> {
    const { data } = await api.get('/gastos')
    return (data.data ?? []).map((r: Record<string, unknown>) => parseGasto(r))
  },

  async createGasto(payload: {
    categoriaId: number; descripcion: string; fecha: string
    monto: number; cantidad?: number | null; pagadoPor: 'empleado' | 'empresa'; notas?: string
  }): Promise<number> {
    const { data } = await api.post('/gastos', payload)
    return data.data.id
  },

  async updateGasto(id: number, payload: {
    categoriaId: number; descripcion: string; fecha: string
    monto: number; cantidad?: number | null; pagadoPor: 'empleado' | 'empresa'; notas?: string
  }): Promise<void> {
    await api.put(`/gastos/${id}`, payload)
  },

  async deleteGasto(id: number): Promise<void> {
    await api.delete(`/gastos/${id}`)
  },

  async uploadRecibo(gastoId: number, file: File): Promise<string> {
    const form = new FormData()
    form.append('recibo', file)
    const { data } = await api.post(`/gastos/${gastoId}/recibo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data.reciboUrl
  },

  async getMisReportes(): Promise<GastoReporte[]> {
    const { data } = await api.get('/gastos/reportes')
    return (data.data ?? []).map((r: Record<string, unknown>) => parseReporte(r))
  },

  async createReporte(payload: { titulo: string; gastoIds: number[] }): Promise<number> {
    const { data } = await api.post('/gastos/reportes', payload)
    return data.data.id
  },

  async getReporte(id: number): Promise<GastoReporte> {
    const { data } = await api.get(`/gastos/reportes/${id}`)
    return parseReporte(data.data)
  },

  async enviarReporte(id: number): Promise<void> {
    await api.post(`/gastos/reportes/${id}/enviar`)
  },

  async addComentario(reporteId: number, texto: string): Promise<void> {
    await api.post(`/gastos/reportes/${reporteId}/comentarios`, { texto })
  },

  async getAllReportes(params?: {
    estatus?: string; usuarioId?: number; fechaDesde?: string; fechaHasta?: string
  }): Promise<GastoReporte[]> {
    const { data } = await api.get('/gastos/admin/reportes', { params })
    return (data.data ?? []).map((r: Record<string, unknown>) => parseReporte(r))
  },

  async aprobarReporte(id: number, gastoIdsRechazados?: number[]): Promise<void> {
    await api.post(`/gastos/admin/reportes/${id}/aprobar`, { gastoIdsRechazados: gastoIdsRechazados ?? [] })
  },

  async rechazarReporte(id: number, notas?: string): Promise<void> {
    await api.post(`/gastos/admin/reportes/${id}/rechazar`, { notas })
  },

  async registrarPago(id: number, metodoPago: string): Promise<void> {
    await api.post(`/gastos/admin/reportes/${id}/pago`, { metodoPago })
  },

  async createCategoria(payload: {
    codigo: string; nombre: string; descripcion?: string
    tipo: 'monto' | 'kilometraje'; tarifaKm?: number; orden?: number
  }): Promise<number> {
    const { data } = await api.post('/gastos/admin/categorias', payload)
    return data.data.id
  },

  async updateCategoria(id: number, payload: {
    nombre: string; descripcion?: string; tipo: 'monto' | 'kilometraje'
    tarifaKm?: number; activo?: boolean; orden?: number
  }): Promise<void> {
    await api.put(`/gastos/admin/categorias/${id}`, payload)
  },
}
