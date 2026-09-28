import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'

// Asistente "Crear empresa" (backend: routes/empresaAsistente.js). Todo exige
// la acción accesos/crear-empresas marcada explícitamente en Ardaby Tec.

export interface ModuloCatalogo { key: string; nombre: string; descripcion: string }
export interface AccionCatalogo { key: string; nombre: string; descripcion: string }
export interface PlantillaModulos { key: string; nombre: string; descripcion: string; modulos: string[] }
export interface EmpresaCatalogo { key: string; nombre: string; modulos: string[] }
export interface CatalogoAsistente {
  modulos: ModuloCatalogo[]
  acciones: Record<string, AccionCatalogo[]>
  plantillas: PlantillaModulos[]
  empresas: EmpresaCatalogo[]
}

export interface AvanceAsistente { paso?: number; completos?: string[]; terminado?: boolean }
export interface RolEmpresa { rolId: number; nombre: string; descripcion: string | null; rolBase: string; esSistema: boolean; modulos: string[]; acciones: Record<string, string[]> }
export interface PerfilEmpresa { perfilId: number; nombre: string; descripcion: string | null; rolId: number | null; rolNombre: string | null; puesto: string | null; departamento: string | null; idHorario: number | null }
export interface UsuarioEmpresa { id: number; nombre: string; usuario: string; tipo: string; correo: string | null; puesto: string | null; activo: boolean }
export interface EstadoEmpresa {
  empresa: { key: string; nombre: string; estricto: boolean }
  asistente: AvanceAsistente | null
  preparacion: { estado: 'preparando' | 'listo' | 'error'; error?: string; errorAnterior?: string }
  modulos?: string[]
  roles?: RolEmpresa[]
  perfiles?: PerfilEmpresa[]
  usuarios?: UsuarioEmpresa[]
  horarios?: { id: number; horario: string; nomenclatura: string }[]
}

export interface DatosRol { nombre?: string; descripcion?: string; modulos: string[]; acciones: Record<string, string[]> }
export interface DatosPerfil { nombre: string; descripcion?: string; rolId: number | null; puesto?: string; departamento?: string; idHorario?: number | null }
export interface DatosUsuario { nombres: string; usuario: string; correo?: string; perfilId?: number | null; rolId?: number | null; contra?: string }
export interface FilaImportar { nombres: string; usuario: string; correo?: string; perfil?: string; contra?: string }
export interface UsuarioCreado { id: number; nombre: string; usuario: string; perfil: string | null; contraTemporal: string | null }
export interface VistaPreviaImportar {
  total: number; validas: number; conError: number
  filas: { fila: number; nombres: string; usuario: string; correo: string; perfil: string | null; errores: string[] }[]
}
export interface ResultadoImportar { creados: UsuarioCreado[]; fallidos: { fila: number; usuario: string; error: string }[]; omitidos: number }

const base = '/empresas-asistente'
const data = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data)

export const empresasAsistenteService = {
  puedo: () => data<{ puede: boolean }>(api.get(`${base}/puedo`)),
  catalogo: () => data<CatalogoAsistente>(api.get(`${base}/catalogo`)),
  sugerirCodigo: (nombre: string) => data<{ codigo: string }>(api.get(`${base}/codigo`, { params: { nombre } })),
  crear: (nombre: string, codigo: string) => data<{ key: string; nombre: string }>(api.post(base, { nombre, codigo })),
  estado: (empKey: string) => data<EstadoEmpresa>(api.get(`${base}/${empKey}`)),
  guardarAvance: (empKey: string, avance: AvanceAsistente) => data<AvanceAsistente>(api.put(`${base}/${empKey}/asistente`, avance)),
  guardarModulos: (empKey: string, modulos: string[]) => data<{ activos: string[] }>(api.put(`${base}/${empKey}/modulos`, { modulos })),
  crearRol: (empKey: string, d: DatosRol) => data<{ rolId: number }>(api.post(`${base}/${empKey}/roles`, d)),
  actualizarRol: (empKey: string, rolId: number, d: DatosRol) => api.put(`${base}/${empKey}/roles/${rolId}`, d),
  eliminarRol: (empKey: string, rolId: number) => api.delete(`${base}/${empKey}/roles/${rolId}`),
  guardarPerfil: (empKey: string, d: DatosPerfil, perfilId?: number) =>
    perfilId ? api.put(`${base}/${empKey}/perfiles/${perfilId}`, d) : api.post(`${base}/${empKey}/perfiles`, d),
  eliminarPerfil: (empKey: string, perfilId: number) => api.delete(`${base}/${empKey}/perfiles/${perfilId}`),
  crearUsuario: (empKey: string, d: DatosUsuario) => data<UsuarioCreado>(api.post(`${base}/${empKey}/usuarios`, d)),
  revisarImportacion: (empKey: string, filas: FilaImportar[]) =>
    data<VistaPreviaImportar>(api.post(`${base}/${empKey}/usuarios/importar`, { filas, confirmar: false })),
  confirmarImportacion: (empKey: string, filas: FilaImportar[]) =>
    data<ResultadoImportar>(api.post(`${base}/${empKey}/usuarios/importar`, { filas, confirmar: true }, { timeout: 180_000 })),
}

// Evento para abrir el asistente en una empresa a medio configurar (lo dispara
// "Continuar" en la pantalla Empresas; lo escucha ConfiguracionPage).
export const EVENTO_ASISTENTE_EMPRESA = 'agyda:asistente-empresa'
export function abrirAsistenteEmpresa(empKey: string | null) {
  window.dispatchEvent(new CustomEvent(EVENTO_ASISTENTE_EMPRESA, { detail: { empKey } }))
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
