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
  sidebarEstilo: 'degradado-azul',
  sidebarBurbujas: true,
  fondoClaro: '#F7F9FC',
  fondoOscuro: '#0F131B',
}

export const DEFAULT_CONFIG: PersonalizacionConfig = {
  branding: DEFAULT_BRANDING,
  // Este default solo se usa mientras la query real está en curso o si falla
  // silenciosamente — marcador/contingencia arrancan ocultos aquí para que un
  // fallo de red nunca los deje expuestos por accidente hasta que se cargue
  // la configuración real desde el backend.
  headerButtons: [
    { key: 'contingencia', label: 'Marcador contingencia', url: '', visible: false },
    { key: 'marcador', label: 'Marcador', url: '', visible: false },
  ],
  dashboard: { cards: [] },
  institucional: {
    mision: 'Soporte TI, marcación y software que hacen crecer tu negocio.',
    vision: 'Liderar la automatización con IA en soluciones empresariales.',
    valores: ['Innovación', 'Enfoque al cliente', 'Aprendizaje', 'Calidad', 'Integridad', 'Trabajo en equipo', 'Confianza'],
  },
  enlacesTopbar: [],
  mascota: {
    inicio:   { mediaId: null, tipo: null, movimiento: 'flotar', velocidad: 'normal' },
    flotante: { habilitado: false, mediaId: null, tipo: null, movimiento: 'flotar', velocidad: 'normal' },
  },
  ventas: {
    margen: { verdeMin: 25, amarilloMin: 15, rojoMax: 15, requiereOverride: true },
    iva: { tasaDefault: 0.16 },
  },
}

// Layout por defecto del inicio — el orden/tamaño que ya tenía la portada,
// portado a una grilla de 12 columnas. Se usa cuando la empresa no ha
// personalizado su dashboard.
export const DASHBOARD_DEFAULT: PersonalizacionConfig['dashboard']['cards'] = [
  { id: 'bienvenida',      x: 0, y: 0, w: 5, h: 3, visible: true },
  { id: 'marca',           x: 5, y: 0, w: 4, h: 5, visible: true },
  { id: 'lo-importante',   x: 9, y: 0, w: 3, h: 4, visible: true },
  { id: 'legales',         x: 0, y: 3, w: 5, h: 2, visible: true },
  { id: 'cita',            x: 9, y: 4, w: 3, h: 1, visible: true },
  { id: 'ultimas-noticias', x: 0, y: 5, w: 8, h: 5, visible: true },
  { id: 'proximos-eventos', x: 8, y: 5, w: 4, h: 3, visible: true },
  { id: 'cumpleanos',      x: 8, y: 8, w: 4, h: 3, visible: true },
  { id: 'soporte',         x: 8, y: 11, w: 4, h: 2, visible: true },
  { id: 'accesos-rapidos', x: 0, y: 13, w: 12, h: 3, visible: true },
]

export const PersonalizacionContext = createContext<PersonalizacionConfig>(DEFAULT_CONFIG)

export function usePersonalizacion(): PersonalizacionConfig {
  return useContext(PersonalizacionContext)
}
