export type UserRole = 'AD' | 'TI' | 'CC' | 'CL' | 'ST' | 'VE'

export interface User {
  id: number
  nombres: string
  usuario: string
  tipoUsuario: UserRole | string
  activo: boolean
  status: boolean
  base: string
  fechaRegistro: string | null
  fechaIngreso: string | null
  ventasUsuario: string
  ventasPassword: string
  ventasRol: string
  accessToken: string
  codigo?: string | null
  empresa?: string
  genero?: 'M' | 'F' | null
  perfilAlias?: string | null
  perfilFotoUrl?: string | null
  perfilPortadaUrl?: string | null
  debeCambiarPassword?: boolean
  // Portal de Cliente: solo presentes cuando tipoUsuario === 'CL'. Sirven
  // para gatear UI (el backend revalida en cada request vía requirePortalAction).
  portalEmpresaContId?: number | null
  portalEsAncla?: boolean
  portalSubrolId?: number | null
  portalSubrolNombre?: string | null
}
