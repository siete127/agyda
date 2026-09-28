import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'

// Asistente "Crear empresa" (backend: routes/empresaAsistente.js). Todo lo
// capturado es un borrador en el servidor; la empresa se crea al final con
// POST /borradores/:id/crear. Exige accesos/crear-empresas en Ardaby Tec.

export interface ModuloCatalogo { key: string; nombre: string; descripcion: string }
export interface AccionCatalogo { key: string; nombre: string; descripcion: string }
export interface PlantillaModulos { key: string; nombre: string; descripcion: string; modulos: string[] }
export interface EmpresaCatalogo { key: string; nombre: string; modulos: string[] }
export interface RolSistema { key: string; nombre: string; descripcion: string; rolBase: string; modulos: string[] }
export interface CatalogoAsistente {
  modulos: ModuloCatalogo[]
  acciones: Record<string, AccionCatalogo[]>
  plantillas: PlantillaModulos[]
  rolesSistema: RolSistema[]
  empresas: EmpresaCatalogo[]
}

// ── Borrador ──
export interface RolBorrador {
  key: string              // 'sys:AD' (sistema) o 'n:<id>' (propio)
  nombre: string
  descripcion?: string
  esSistema: boolean
  rolBase?: string
  modulos: string[]
  acciones: Record<string, string[]>
  editado?: boolean        // false = sus módulos siguen a los elegidos para la empresa
}
export interface PerfilBorrador { key: string; nombre: string; descripcion?: string; rolKey: string; puesto?: string; departamento?: string }
export interface UsuarioBorrador { key: string; nombres: string; usuario: string; correo?: string; perfilKey?: string; esAdmin?: boolean; contra?: string }
export interface DatosBorrador {
  empresa: { nombre: string; codigo: string }
  modulos: string[]
  roles: RolBorrador[]
  perfiles: PerfilBorrador[]
  usuarios: UsuarioBorrador[]
}
export type EstadoBorrador = 'borrador' | 'creando' | 'error' | 'creada' | 'terminado'
export interface Pendiente { paso: string; texto: string }
export interface AvanceCreacion { etapa?: string; completadas: string[]; usuariosTotal?: number; usuariosHechos?: number }
export interface CredencialCreada { nombre: string; usuario: string; perfil: string | null; contraTemporal: string | null }
export interface BorradorResumen {
  id: number; nombre: string | null; codigo: string | null; paso: number; estado: EstadoBorrador; empKey: string | null
  usuarioNombre: string | null; esMio: boolean; actualizado: string; creado: string; interrumpido: boolean
  avance: AvanceCreacion | null; error: string | null
  resumen: { modulos: number; roles: number; perfiles: number; usuarios: number }
}
export interface Borrador extends BorradorResumen {
  datos: DatosBorrador
  pendientes: Pendiente[]
  resultado?: { creados: CredencialCreada[]; yaExistian: string[] } | null
}

const base = '/empresas-asistente'
const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data)

export const empresasAsistenteService = {
  puedo: () => data<{ puede: boolean }>(api.get(`${base}/puedo`)),
  catalogo: () => data<CatalogoAsistente>(api.get(`${base}/catalogo`)),
  sugerirCodigo: (nombre: string) => data<{ codigo: string }>(api.get(`${base}/codigo`, { params: { nombre } })),
  revisarCodigo: (codigo: string) => data<{ codigo: string; disponible: boolean; motivo?: string }>(api.get(`${base}/codigo`, { params: { codigo } })),
  borradores: () => data<BorradorResumen[]>(api.get(`${base}/borradores`)),
  borrador: (id: number) => data<Borrador>(api.get(`${base}/borradores/${id}`)),
  crearBorrador: (datos: DatosBorrador, paso: number) => data<{ id: number }>(api.post(`${base}/borradores`, { datos, paso })),
  guardarBorrador: (id: number, datos: DatosBorrador, paso: number) => data<{ pendientes: Pendiente[] }>(api.put(`${base}/borradores/${id}`, { datos, paso })),
  descartar: (id: number) => api.delete(`${base}/borradores/${id}`),
  crearEmpresa: (id: number) => data<{ estado: string }>(api.post(`${base}/borradores/${id}/crear`)),
  terminar: (id: number) => api.post(`${base}/borradores/${id}/terminar`),
}

// Evento para abrir el asistente en un borrador (lo dispara "Continuar" en la
// pantalla Empresas; lo escucha ConfiguracionPage). null = asistente nuevo.
export const EVENTO_ASISTENTE_EMPRESA = 'agyda:asistente-empresa'
export function abrirAsistenteEmpresa(borradorId: number | null) {
  window.dispatchEvent(new CustomEvent(EVENTO_ASISTENTE_EMPRESA, { detail: { borradorId } }))
}

// ¿El usuario puede crear/configurar empresas? (permiso explícito, solo en Ardaby Tec)
export function usePuedeGestionarEmpresas() {
  const { data, isLoading } = useQuery({
    queryKey: ['empresas-asistente-puedo'],
    queryFn: empresasAsistenteService.puedo,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { puede: !!data?.puede, isLoading }
}
