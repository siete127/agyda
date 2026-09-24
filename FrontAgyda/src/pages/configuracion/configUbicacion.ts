import { createContext, useContext } from 'react'

// Módulo del sidebar (moduleKey) desde el que se abrió la pantalla de
// configuración actual — p. ej. 'asistencia' o 'operaciones' para una misma
// configuración compartida. null = sección General o sin módulo.
export const ConfigModuloContext = createContext<string | null>(null)

export function useConfigModulo(): string | null {
  return useContext(ConfigModuloContext)
}
