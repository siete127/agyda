import { createContext, useContext } from 'react'
import type { PersonalizacionConfig, Branding } from '@/services/personalizacion.service'

export const DEFAULT_BRANDING: Branding = {
  nombreCorto: 'AGYDA',
  nombreLargo: 'Ardaby Tec',
  eslogan: 'Soluciones en tecnología',
  logoPrincipalId: null,
  logoCompactoId: null,
  faviconId: null,
  loginImagenId: null,
  colorBrand: '#2F6FED',
}

export const DEFAULT_CONFIG: PersonalizacionConfig = {
  branding: DEFAULT_BRANDING,
  headerButtons: [
    { key: 'contingencia', label: 'Marcador contingencia', url: '', visible: true },
    { key: 'marcador', label: 'Marcador', url: '', visible: true },
    { key: 'sistemas', label: 'Sistemas', url: '', visible: true },
    { key: 'gestion-mis', label: 'Gestión MIS', url: '', visible: true },
  ],
  dashboard: { cards: [] },
}

export const PersonalizacionContext = createContext<PersonalizacionConfig>(DEFAULT_CONFIG)

export function usePersonalizacion(): PersonalizacionConfig {
  return useContext(PersonalizacionContext)
}
