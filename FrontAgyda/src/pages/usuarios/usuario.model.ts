export interface Usuario {
  id: number
  nombres: string
  apellidos: string
  login: string
  correo: string
  tipoUsuario: string
  genero: 'M' | 'F' | ''
  activo: boolean
  status: boolean
  puesto: string
  departamento: string
  fotoPerfil: string | null
  campana: string | null
  fechaIngreso: string | null
}

export function parseUsuario(r: Record<string, unknown>): Usuario {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  return {
    id: Number(r['id'] ?? r['ID'] ?? r['usuarioId'] ?? 0),
    // El backend guarda el nombre en un solo campo (NEUS_NOMBRES). No hay
    // apellidos por separado — 'apellidos' queda vacío por compatibilidad.
    nombres: s(['nombres', 'NOMBRES', 'nombre', 'firstName']).replace(/\s+/g, ' ').trim(),
    apellidos: s(['apellidos', 'APELLIDOS', 'lastName']),
    login: s(['usuario', 'USUARIO', 'login', 'username']),
    correo: s(['correo', 'CORREO', 'email', 'EMAIL']),
    tipoUsuario: s(['tipoUsuario', 'tipo_usuario', 'TIPO_USUARIO', 'rol', 'role']),
    genero: (s(['genero', 'GENERO', 'gender']).toUpperCase() === 'F' ? 'F' : s(['genero', 'GENERO', 'gender']).toUpperCase() === 'M' ? 'M' : ''),
    activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? r['active'] ?? true),
    status: Boolean(r['status'] ?? r['STATUS'] ?? r['NEUS_STATUS'] ?? false),
    puesto: s(['puesto', 'PUESTO', 'cargo', 'position']),
    departamento: s(['departamento', 'DEPARTAMENTO', 'area', 'department']),
    fotoPerfil: s(['fotoPerfil', 'foto_perfil', 'FOTO_PERFIL', 'foto', 'fotoUrl', 'FOTO_URL']) || null,
    campana: s(['campana', 'CAMPANA']) || null,
    fechaIngreso: s(['fechaIngreso', 'fecha_ingreso', 'FECHA_INGRESO', 'NEUS_FECHA_INGRESO']) || null,
  }
}

// Prefijo correcto para el avatar: respeta URLs absolutas del backend
// (https://intranet.ardabytec.vip/...) y antepone /uploads/ a los nombres sueltos.
export function fotoUsuarioSrc(foto: string | null | undefined): string | undefined {
  if (!foto) return undefined
  return /^https?:\/\//i.test(foto) ? foto : `/uploads/${foto}`
}

export const ROL_COLORS: Record<string, string> = {
  AD: 'bg-red-100 text-red-700',
  TI: 'bg-blue-100 text-blue-700',
  CC: 'bg-purple-100 text-purple-700',
  CL: 'bg-gray-100 text-gray-600',
  ST: 'bg-green-100 text-green-700',
  VE: 'bg-amber-100 text-amber-700',
}
