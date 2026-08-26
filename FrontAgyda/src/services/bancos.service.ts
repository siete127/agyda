import { api } from '@/lib/axios'
import type { CuentaBancaria, CrearCuentaPayload, MovimientoBancario, CrearMovimientoPayload } from '@/types/bancos.types'

export const bancosService = {
  async listCuentas(): Promise<CuentaBancaria[]> {
    const { data } = await api.get('/finanzas/bancos/cuentas')
    return (data?.data ?? []) as CuentaBancaria[]
  },

  async crearCuenta(payload: CrearCuentaPayload): Promise<void> {
    await api.post('/finanzas/bancos/cuentas', payload)
  },

  async eliminarCuenta(id: number): Promise<void> {
    await api.delete(`/finanzas/bancos/cuentas/${id}`)
  },

  async listMovimientos(cuentaId: number): Promise<MovimientoBancario[]> {
    const { data } = await api.get(`/finanzas/bancos/cuentas/${cuentaId}/movimientos`)
    return (data?.data ?? []) as MovimientoBancario[]
  },

  async crearMovimiento(cuentaId: number, payload: CrearMovimientoPayload): Promise<void> {
    await api.post(`/finanzas/bancos/cuentas/${cuentaId}/movimientos`, payload)
  },

  async eliminarMovimiento(movId: number): Promise<void> {
    await api.delete(`/finanzas/bancos/movimientos/${movId}`)
  },
}
