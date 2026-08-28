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
  key: 'marcador' | 'contingencia' | 'sistemas' | 'gestion-mis'
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

export interface PersonalizacionConfig {
  branding: Branding
  headerButtons: HeaderButton[]
  dashboard: { cards: DashboardCard[] }
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
}
