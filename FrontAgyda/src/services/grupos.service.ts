import { api } from '@/lib/axios'

// Configuración → Usuarios y Seguridad → Grupos: todos los grupos de usuarios
// de AGYDA (skills, supervisores, niveles de soporte, avisos…) en un solo lugar.

export interface SegmentoGrupos {
  key: string
  nombre: string
  descripcion: string
}

export interface GrupoUsuarios {
  id: number | string
  nombre: string
  descripcion: string | null
  contexto?: string | null
  miembros: number
  sistema?: boolean
}

export interface TipoGrupo {
  key: string
  segmento: string
  nombre: string
  descripcion: string
  miembroLabel: string
  puedeCrear: boolean
  puedeEliminar: boolean
  puedeEditarMiembros: boolean
  /** Un usuario solo puede estar en un grupo de este tipo: agregarlo lo mueve. */
  unico: boolean
  crearCampos: ('nombre' | 'descripcion' | 'campaniaId')[]
  /** El grupo también tiene clientes asignados (grupos de atención a clientes). */
  conClientes: boolean
  /** El grupo tiene configuración propia (grupos del omnicanal: canales, modo y marcador). */
  conConfig: boolean
  /** Al eliminarlo se puede elegir qué de lo enlazado se borra también. */
  conEnlaces?: boolean
  grupos: GrupoUsuarios[]
  error?: string
}

export interface MiembroGrupo {
  usuarioId: number
  nombre: string
  extra?: string | null
}

export interface ClienteDeGrupo {
  clienteId: number
  nombre: string
  extra?: string | null
}

export type ModalidadGrupo = 'omnicanal' | 'marcador' | 'ambos'

/** Algo enlazado a un grupo; `bloqueado` = lo usa otro grupo/campaña y no se borra aquí. */
export interface EnlaceGrupo {
  id: number
  nombre: string
  bloqueado: string | null
  campania?: string | null
  skill?: string | null
  tipo?: string
  conversaciones?: number
}
export interface EnlacesGrupo {
  campanias: EnlaceGrupo[]
  skills: EnlaceGrupo[]
  canales: EnlaceGrupo[]
  formularios: EnlaceGrupo[]
  agentes: number
  supervisores: number
  clientes: number
}
export type SeleccionBorrar = { campanias: number[]; skills: number[]; canales: number[]; formularios: number[] }

/** Skill del omnicanal: sus canales (y qué equipos lo controlan). */
export interface ConfigSkill {
  id: number
  campaniaId: number
  canalIds: number[]
  canales: { id: number; nombre: string; tipo: string; habilitado: boolean; grupoId: number | null; grupoNombre: string | null }[]
  equipos: { id: number; nombre: string }[]
}

/** Campaña disponible para un grupo de Contact Center. */
export interface CampaniaDeGrupo {
  id: number
  nombre: string
  asignada: boolean
  /** Formulario que abre el link del marcador del grupo en esta campaña (null = el de la campaña). */
  formularioId: number | null
  otrosGrupos: string | null
  formularios: { id: number; nombre: string }[]
  /** Ruta del link del marcador del grupo para esta campaña (null si la campaña no tiene URL). */
  linkMarcador: string | null
  skills: { id: number; nombre: string; canales: number; asignado: boolean; otrosGrupos: string | null }[]
}

/** Grupo de Contact Center: todo lo que se le asigna y reciben sus integrantes. */
export interface ConfigEquipo {
  id: number
  modalidad: ModalidadGrupo
  webphoneVistaId: number | null
  ventasCampanaId: number | null
  campanias: CampaniaDeGrupo[]
  campaniaIds: number[]
  skillIds: number[]
  supervisorIds: number[]
  supervisores: { usuarioId: number; nombre: string }[]
  vistas: { id: number; nombre: string }[]
  campanasVentas: { id: number; nombre: string }[]
}

export interface ResultadoSyncEquipo {
  modalidad?: ModalidadGrupo
  campanias?: number
  skills?: number
  agentes?: number
  supervisores?: number
  conMarcador?: number
  conVentas?: number
  canales?: number
}

export interface OpcionesGrupos {
  campanias: { id: number; nombre: string }[]
  usuarios: { id: number; nombre: string; tipo: string; puesto: string | null; fotoUrl: string | null }[]
  /** Clientes con el grupo de atención que ya los atiende (si tienen). */
  clientes: { id: number; nombre: string; grupo: string | null }[]
}

export const gruposService = {
  resumen: async (): Promise<{ segmentos: SegmentoGrupos[]; tipos: TipoGrupo[] }> => {
    const { data } = await api.get('/grupos')
    return data.data
  },
  opciones: async (): Promise<OpcionesGrupos> => {
    const { data } = await api.get('/grupos/opciones')
    return data.data
  },
  miembros: async (tipo: string, id: number | string): Promise<MiembroGrupo[]> => {
    const { data } = await api.get(`/grupos/${tipo}/${encodeURIComponent(String(id))}/miembros`)
    return data.data ?? []
  },
  agregarMiembros: (tipo: string, id: number | string, usuarioIds: number[]) =>
    api.post(`/grupos/${tipo}/${encodeURIComponent(String(id))}/miembros`, { usuarioIds }).then((r) => r.data),
  quitarMiembro: (tipo: string, id: number | string, usuarioId: number) =>
    api.delete(`/grupos/${tipo}/${encodeURIComponent(String(id))}/miembros/${usuarioId}`).then((r) => r.data),
  leerConfig: async <T = ConfigSkill | ConfigEquipo>(tipo: string, id: number | string): Promise<T> => {
    const { data } = await api.get(`/grupos/${tipo}/${encodeURIComponent(String(id))}/config`)
    return data.data
  },
  guardarConfig: (tipo: string, id: number | string, body: Record<string, unknown>) =>
    api.put(`/grupos/${tipo}/${encodeURIComponent(String(id))}/config`, body)
      .then((r) => r.data as { data: ResultadoSyncEquipo }),
  clientes: async (tipo: string, id: number | string): Promise<ClienteDeGrupo[]> => {
    const { data } = await api.get(`/grupos/${tipo}/${encodeURIComponent(String(id))}/clientes`)
    return data.data ?? []
  },
  agregarClientes: (tipo: string, id: number | string, clienteIds: number[]) =>
    api.post(`/grupos/${tipo}/${encodeURIComponent(String(id))}/clientes`, { clienteIds }).then((r) => r.data),
  quitarCliente: (tipo: string, id: number | string, clienteId: number) =>
    api.delete(`/grupos/${tipo}/${encodeURIComponent(String(id))}/clientes/${clienteId}`).then((r) => r.data),
  crear: (tipo: string, body: { nombre: string; descripcion?: string; campaniaId?: number }) =>
    api.post(`/grupos/${tipo}`, body).then((r) => r.data as { data: { id: number } }),
  /** Lo enlazado a un grupo de Contact Center, para elegir qué borrar con él. */
  enlaces: async (tipo: string, id: number | string): Promise<EnlacesGrupo | null> => {
    const { data } = await api.get(`/grupos/${tipo}/${encodeURIComponent(String(id))}/enlaces`)
    return data.data ?? null
  },
  /** borrar: lo enlazado que también se borra (agentes y supervisores nunca). */
  eliminar: (tipo: string, id: number | string, borrar?: SeleccionBorrar) =>
    api.delete(`/grupos/${tipo}/${encodeURIComponent(String(id))}`, borrar ? { data: { borrar } } : undefined)
      .then((r) => r.data as { data?: { borrado: Record<string, number> | null } }),
}
