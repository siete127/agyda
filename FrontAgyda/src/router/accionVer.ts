// Acción de Accesos que exige cada módulo para mostrar su página (menú y ruta).
// Basta con tener UNA de la lista. Sin configurar el módulo = permitido (can()).
// Solo oculta la página: los endpoints de consulta siguen abiertos porque los
// usan widgets del dashboard y otras pantallas.
export const ACCION_VER: Record<string, string[]> = {
  noticias:    ['ver'],
  calendario:  ['ver'],
  organigrama: ['ver'],
  reglamento:  ['ver'],
  'mi-area':   ['ver'],
  'ventas-area': ['ver'],
  vacaciones:  ['ver'],
  gastos:      ['ver', 'aprobar-reporte', 'registrar-pago'],
  activos:     ['ver'],
  evaluacion:  ['ver'],
  expedientes: ['ver-propio', 'ver-otros'],
}

export function puedeVerModulo(moduleKey: string, can: (modulo: string, accion: string) => boolean): boolean {
  const acciones = ACCION_VER[moduleKey]
  if (!acciones) return true
  return acciones.some((a) => can(moduleKey, a))
}
