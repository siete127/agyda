import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'

export type AssetTipo = 'logo-principal' | 'logo-compacto' | 'favicon' | 'login'

export type SidebarEstilo = 'degradado-azul' | 'solido-oscuro' | 'color-marca' | 'gradiente-marca'

export interface Branding {
  nombreCorto: string
  nombreLargo: string
  eslogan: string
  logoPrincipalId: number | null
  logoCompactoId: number | null
  faviconId: number | null
  loginImagenId: number | null
  colorBrand: string
  sidebarEstilo: SidebarEstilo
  sidebarBurbujas: boolean
  fondoClaro: string
  fondoOscuro: string
}

export interface HeaderButton {
  key: 'marcador' | 'contingencia'
  label: string
  url: string
  visible: boolean
}

export interface DashboardCard {
  id: string
  x: number
  y: number
  w: number
  h: number
  visible: boolean
}

export interface Institucional {
  mision: string
  vision: string
  valores: string[]
}

export type EnlaceTopbarIcono =
  | 'link' | 'phone' | 'headset' | 'monitor' | 'chart' | 'ticket' | 'mail'
  | 'globe' | 'rocket' | 'grid' | 'bell' | 'calendar' | 'folder' | 'shield' | 'zap'

export type EnlaceTopbarModo = 'pestana' | 'flotante' | 'ventana'

export interface EnlaceTopbar {
  id: string
  label: string
  url: string
  icono: EnlaceTopbarIcono
  color: string
  modo: EnlaceTopbarModo
  visible: boolean
}

export type MascotaMovimiento = 'ninguno' | 'flotar' | 'saludar' | 'latir' | 'balanceo'
export type MascotaVelocidad = 'lenta' | 'normal' | 'rapida'

/** Una mascota individual: imagen/video + movimiento. */
export interface MascotaParte {
  mediaId: number | null
  tipo: 'imagen' | 'video' | null
  movimiento: MascotaMovimiento
  velocidad: MascotaVelocidad
}

/** Dos mascotas independientes: la de la card del inicio y el widget flotante. */
export interface Mascota {
  inicio: MascotaParte
  flotante: MascotaParte & { habilitado: boolean }
}

export const ESTATUS_VENTA_VALIDOS = [
  'Prospecto', 'Cotizada', 'Aprobada', 'Formalizada', 'Formalizado', 'Garantizada', 'Cancelada', 'Rechazada',
] as const

// Módulos que cuentan ventas, cada uno con su propia lista de estatus contados.
export const USOS_ESTATUS_CONTADOS = [
  { key: 'metas', label: 'Metas', impacto: 'Avance de las metas por asesor y campaña (y "Mis metas" del asesor).' },
  { key: 'comisiones', label: 'Comisiones', impacto: 'Ventas provisionales del mes (el tramo que Nómina aún no calcula) usadas en las fórmulas de comisión.' },
  { key: 'incentivos', label: 'Incentivos', impacto: 'Ventas provisionales del mes (el tramo que Nómina aún no calcula) usadas en las fórmulas de incentivo.' },
] as const

export type UsoEstatusContados = (typeof USOS_ESTATUS_CONTADOS)[number]['key']

export interface VentasConfig {
  margen: { verdeMin: number; amarilloMin: number; rojoMax: number; requiereOverride: boolean }
  iva: { tasaDefault: number }
  // Valor general de "venta contada" — el que usa un módulo sin lista propia.
  estatusContados: string[]
  // Lista de cada módulo (el backend siempre la devuelve completa, resuelta).
  estatusContadosPorUso?: Record<UsoEstatusContados, string[]>
}

export interface ProspeccionConfig {
  ventanaAnalisisDias: number
}

export interface EmailMarketingConfig {
  emailsPorHoraDefault: number
}

export interface PersonalizacionConfig {
  branding: Branding
  headerButtons: HeaderButton[]
  dashboard: { cards: DashboardCard[] }
  institucional: Institucional
  enlacesTopbar: EnlaceTopbar[]
  mascota: Mascota
  ventas: VentasConfig
  prospeccion: ProspeccionConfig
  emailMarketing: EmailMarketingConfig
}

export const personalizacionService = {
  async get(): Promise<PersonalizacionConfig> {
    const { data } = await api.get('/personalizacion')
    return data.data as PersonalizacionConfig
  },

  async updateBranding(branding: Partial<Branding>): Promise<Branding> {
    const { data } = await api.put('/personalizacion/branding', branding)
    return data.data as Branding
  },

  async updateHeaderButtons(buttons: HeaderButton[]): Promise<HeaderButton[]> {
    const { data } = await api.put('/personalizacion/header-buttons', buttons)
    return data.data as HeaderButton[]
  },

  async updateInstitucional(inst: Institucional): Promise<Institucional> {
    const { data } = await api.put('/personalizacion/institucional', inst)
    return data.data as Institucional
  },

  async updateEnlacesTopbar(enlaces: EnlaceTopbar[]): Promise<EnlaceTopbar[]> {
    // Se envía como objeto (no array crudo) para que una lista vacía viaje bien
    // — el backend acepta tanto `[...]` como `{ enlacesTopbar: [...] }`.
    const { data } = await api.put('/personalizacion/enlaces-topbar', { enlacesTopbar: enlaces })
    return data.data as EnlaceTopbar[]
  },

  async updateVentas(v: Pick<VentasConfig, 'margen' | 'iva'>): Promise<VentasConfig> {
    const { data } = await api.put('/personalizacion/ventas', v)
    return data.data as VentasConfig
  },

  // Aplica la lista de estatus contados solo a los módulos elegidos.
  async updateEstatusContados(estatus: string[], usos: UsoEstatusContados[]): Promise<VentasConfig> {
    const { data } = await api.put('/personalizacion/ventas/estatus-contados', { estatus, usos })
    return data.data as VentasConfig
  },

  async updateProspeccion(p: ProspeccionConfig): Promise<ProspeccionConfig> {
    const { data } = await api.put('/personalizacion/prospeccion', p)
    return data.data as ProspeccionConfig
  },

  async updateEmailMarketing(e: EmailMarketingConfig): Promise<EmailMarketingConfig> {
    const { data } = await api.put('/personalizacion/email-marketing', e)
    return data.data as EmailMarketingConfig
  },

  async updateDashboard(cards: DashboardCard[]): Promise<{ cards: DashboardCard[] }> {
    const { data } = await api.put('/personalizacion/dashboard', { cards })
    return data.data as { cards: DashboardCard[] }
  },

  async subirAsset(tipo: AssetTipo, file: File): Promise<number> {
    const form = new FormData()
    form.append('archivo', file)
    form.append('tipo', tipo)
    const { data } = await api.post('/personalizacion/assets', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data.id as number
  },

  // URL para <img src>. El endpoint acepta ?token= (authenticateToken).
  assetUrl(id: number | null | undefined): string | null {
    if (!id) return null
    const token = useAuthStore.getState().token
    return `/api/personalizacion/assets/${id}/ver${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },

  // ── Mascota ──
  async subirMascotaMedia(file: File, uso: 'inicio' | 'flotante'): Promise<{ id: number; tipo: 'imagen' | 'video' }> {
    const form = new FormData()
    form.append('archivo', file)
    form.append('uso', uso)
    const { data } = await api.post('/personalizacion/mascota/media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.data
  },

  async updateMascota(m: Mascota): Promise<Mascota> {
    const { data } = await api.put('/personalizacion/mascota', m)
    return data.data as Mascota
  },

  // URL para <img>/<video> de un archivo de MEDIA_EMPRESA.
  mediaUrl(id: number | null | undefined): string | null {
    if (!id) return null
    const token = useAuthStore.getState().token
    return `/api/personalizacion/media/${id}${token ? `?token=${encodeURIComponent(token)}` : ''}`
  },
}
