export interface Noticia {
  id: number
  titulo: string
  contenido: string
  imagenPortada: string | null
  imagenFoco: 'top' | 'center' | 'bottom'
  imagenes: string[]
  autorId: number
  autorNombre: string
  fechaCreacion: string
  fechaActualizacion: string | null
  activo: boolean
  destacada: boolean
  categoria: string
  comentariosHabilitados: boolean
  reaccionesTotal: number
  miReaccion: string | null
}

export interface NoticiaComentario {
  id: number
  noticiaId: number
  autorId: number
  autorNombre: string
  contenido: string
  fecha: string
}

export type ReaccionTipo = 'like' | 'love' | 'haha' | 'sad' | 'angry'

export const REACCIONES: { tipo: ReaccionTipo; emoji: string; label: string }[] = [
  { tipo: 'like',  emoji: '👍', label: 'Me gusta' },
  { tipo: 'love',  emoji: '❤️', label: 'Me encanta' },
  { tipo: 'haha',  emoji: '😂', label: 'Me divierte' },
  { tipo: 'sad',   emoji: '😢', label: 'Me entristece' },
  { tipo: 'angry', emoji: '😡', label: 'Me enoja' },
]

export function parseNoticia(raw: Record<string, unknown>): Noticia {
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null) return raw[k]
      const lk = k.toLowerCase()
      const found = Object.keys(raw).find((rk) => rk.toLowerCase() === lk)
      if (found !== undefined) return raw[found]
    }
    return undefined
  }

  const parseImages = (v: unknown): string[] => {
    if (!v) return []
    if (Array.isArray(v)) return v.map(String).filter(Boolean)
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return []
      if (s.startsWith('[')) {
        try { return JSON.parse(s) as string[] } catch { /* fall through */ }
      }
      return s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean)
    }
    return []
  }

  const parseBool = (v: unknown, def = false): boolean => {
    if (v === null || v === undefined) return def
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v === 1
    const s = String(v).toLowerCase().trim()
    if (['true', '1', 's', 'si', 'sí', 'active', 'activo'].includes(s)) return true
    if (['false', '0', 'n', 'no', 'inactive', 'inactivo'].includes(s)) return false
    return def
  }

  const imagenes = parseImages(pick('imagenes', 'images', 'galeria', 'fotos'))
  const portada = pick('imagenPortada', 'imagen_portada', 'portada', 'imagen', 'cover', 'URL_IMAGEN')

  const focoRaw = pick('imagenFoco', 'imagen_foco', 'foco', 'NOTI_FOCO')
  const focoVal = focoRaw ? String(focoRaw).toLowerCase() : 'center'
  const imagenFoco = (['top', 'center', 'bottom'].includes(focoVal) ? focoVal : 'center') as 'top' | 'center' | 'bottom'

  return {
    id: Number(pick('id', 'Id', 'ID', 'idNoticia', 'noticiaId') ?? 0),
    titulo: String(pick('titulo', 'Titulo', 'TITULO', 'title', 'nombre') ?? ''),
    contenido: String(pick('contenido', 'cuerpo', 'descripcion', 'body') ?? ''),
    imagenPortada: portada ? String(portada) : (imagenes[0] ?? null),
    imagenFoco,
    imagenes,
    autorId: Number(pick('autorId', 'autor_id', 'UsuarioID', 'usuarioId') ?? 0),
    autorNombre: String(pick('autorNombre', 'autor', 'usuarioNombre', 'nombres') ?? ''),
    fechaCreacion: String(pick('fechaCreacion', 'fecha', 'fecha_publicacion', 'createdAt', 'Fecha', 'FECHA') ?? new Date().toISOString()),
    fechaActualizacion: pick('fechaActualizacion', 'updatedAt', 'updated_at') ? String(pick('fechaActualizacion', 'updatedAt', 'updated_at')) : null,
    activo: parseBool(pick('activo', 'activa', 'habilitado', 'visible', 'status'), true),
    destacada: parseBool(pick('destacada', 'destacado', 'featured')),
    categoria: String(pick('categoria', 'tipo', 'tipoNoticia', 'category') ?? 'Comunicado'),
    comentariosHabilitados: parseBool(pick('comentariosHabilitados', 'commentsEnabled', 'comentarios'), true),
    reaccionesTotal: Number(pick('reaccionesTotal', 'reacciones_total', 'totalReacciones') ?? 0),
    miReaccion: pick('miReaccion', 'mi_reaccion', 'myReaction', 'reaccion') ? String(pick('miReaccion', 'mi_reaccion', 'myReaction', 'reaccion')) : null,
  }
}
