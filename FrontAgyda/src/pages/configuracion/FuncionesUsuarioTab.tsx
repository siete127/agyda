import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Tag, Plus, Trash2, Lock, Search, X, Loader2, UserPlus, Power } from 'lucide-react'
import { funcionesUsuarioService, type FuncionUsuario } from '@/services/funcionesUsuario.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'
import { Avatar } from '@/components/ui/Avatar'

const card = 'rounded-2xl border border-gray-100 bg-card p-5 shadow-card'
const field = 'w-full rounded-xl border border-gray-200 bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const COLORES = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#4B5563']
type ErrApi = { response?: { data?: { message?: string } } }
const msg = (e: ErrApi, def: string) => e?.response?.data?.message ?? def

// Configuración → Usuarios y Seguridad → Funciones de usuarios. Etiquetas que
// se asignan a cualquier usuario (sin importar su rol) para marcar que cumple
// una función; el sistema usa las suyas por clave (ej. "Asesor de clientes").
export function FuncionesUsuarioTab() {
  const qc = useQueryClient()
  const { can } = useActionAccess()
  const rol = (useAuthStore((s) => s.user?.tipoUsuario) ?? '').toUpperCase()
  const puedeEditar = ['AD', 'TI'].includes(rol) && can('usuarios', 'editar')

  const { data: funciones = [], isLoading } = useQuery({ queryKey: ['funciones-usuario'], queryFn: () => funcionesUsuarioService.listar() })
  const [selId, setSelId] = useState<number | null>(null)
  const sel = funciones.find((f) => f.id === selId) ?? funciones[0] ?? null
  const [nueva, setNueva] = useState('')
  const inval = () => qc.invalidateQueries({ queryKey: ['funciones-usuario'] })

  const crear = useMutation({
    mutationFn: () => funcionesUsuarioService.crear({ nombre: nueva.trim(), color: COLORES[funciones.length % COLORES.length] }),
    onSuccess: (r) => { setNueva(''); inval(); setSelId(r.id); toast.success('Función creada') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo crear')),
  })

  return (
    <div className="space-y-4 pb-20">
      <div className={clsx(card, 'flex items-start gap-3.5')}>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Tag className="h-5 w-5" /></div>
        <div>
          <h2 className="text-base font-bold text-ink">Funciones de usuarios</h2>
          <p className="mt-0.5 text-[0.8rem] text-ink-tertiary">
            Etiquetas que marcan qué función cumple una persona, sin importar su rol. Por ejemplo, quienes tengan
            <b> Asesor de clientes</b> reciben los avisos de los clientes del portal que aún no tienen asesor.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className={clsx(card, 'h-fit space-y-3 !p-3')}>
          {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div> : (
            <div className="space-y-1">
              {funciones.map((f) => (
                <button key={f.id} onClick={() => setSelId(f.id)}
                  className={clsx('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition',
                    sel?.id === f.id ? 'bg-violet-50' : 'hover:bg-gray-50', !f.activo && 'opacity-50')}>
                  <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: f.color ?? '#9CA3AF' }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      {f.nombre} {f.esSistema && <Lock className="h-3 w-3 flex-shrink-0 text-ink-tertiary" />}
                    </span>
                    {!f.activo && <span className="text-[0.65rem] text-ink-tertiary">Desactivada</span>}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-bold text-ink-tertiary">{f.usuarios}</span>
                </button>
              ))}
            </div>
          )}
          {puedeEditar && (
            <div className="flex gap-2 border-t border-gray-100 pt-3">
              <input className={clsx(field, '!py-2')} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva función…"
                onKeyDown={(e) => { if (e.key === 'Enter' && nueva.trim()) crear.mutate() }} />
              <button onClick={() => crear.mutate()} disabled={!nueva.trim() || crear.isPending} title="Crear"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {sel && <DetalleFuncion key={sel.id} funcion={sel} puedeEditar={puedeEditar} onCambio={inval} onEliminada={() => { setSelId(null); inval() }} />}
      </div>
    </div>
  )
}

function DetalleFuncion({ funcion, puedeEditar, onCambio, onEliminada }: {
  funcion: FuncionUsuario; puedeEditar: boolean; onCambio: () => void; onEliminada: () => void
}) {
  const qc = useQueryClient()
  const { data: asignados = [], isLoading } = useQuery({
    queryKey: ['funciones-usuario-usuarios', funcion.id],
    queryFn: () => funcionesUsuarioService.usuarios(funcion.id),
  })
  const { data: todos = [] } = useUsuariosSimple()
  const [busca, setBusca] = useState('')
  const [descripcion, setDescripcion] = useState(funcion.descripcion ?? '')
  const invalUsuarios = () => { qc.invalidateQueries({ queryKey: ['funciones-usuario-usuarios', funcion.id] }); onCambio() }

  const candidatos = useMemo(() => {
    const ya = new Set(asignados.map((a) => a.id))
    const q = busca.trim().toLowerCase()
    return todos.filter((u) => !ya.has(u.id) && u.nombre && (!q || u.nombre.toLowerCase().includes(q))).slice(0, 8)
  }, [todos, asignados, busca])

  const actualizar = useMutation({
    mutationFn: (body: Parameters<typeof funcionesUsuarioService.actualizar>[1]) => funcionesUsuarioService.actualizar(funcion.id, body),
    onSuccess: () => { onCambio(); toast.success('Guardado') },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo guardar')),
  })
  const eliminar = useMutation({
    mutationFn: () => funcionesUsuarioService.eliminar(funcion.id),
    onSuccess: () => { toast.success('Función eliminada'); onEliminada() },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo eliminar')),
  })
  const agregar = useMutation({
    mutationFn: (usuarioId: number) => funcionesUsuarioService.agregarUsuarios(funcion.id, [usuarioId]),
    onSuccess: () => { setBusca(''); invalUsuarios() },
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo asignar')),
  })
  const quitar = useMutation({
    mutationFn: (usuarioId: number) => funcionesUsuarioService.quitarUsuario(funcion.id, usuarioId),
    onSuccess: invalUsuarios,
    onError: (e: ErrApi) => toast.error(msg(e, 'No se pudo quitar')),
  })

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="h-4 w-4 rounded-full" style={{ background: funcion.color ?? '#9CA3AF' }} />
          <h3 className="text-base font-bold text-ink">{funcion.nombre}</h3>
          {funcion.esSistema && <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-ink-tertiary"><Lock className="h-3 w-3" /> Del sistema</span>}
          {puedeEditar && (
            <div className="ml-auto flex items-center gap-1.5">
              {COLORES.map((c) => (
                <button key={c} onClick={() => actualizar.mutate({ color: c })} title="Color"
                  className={clsx('h-5 w-5 rounded-full ring-offset-2 transition', funcion.color === c && 'ring-2 ring-gray-400')} style={{ background: c }} />
              ))}
              <button onClick={() => actualizar.mutate({ activo: !funcion.activo })} title={funcion.activo ? 'Desactivar' : 'Activar'}
                className={clsx('ml-2 flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-gray-50', funcion.activo ? 'text-emerald-600' : 'text-ink-tertiary')}>
                <Power className="h-4 w-4" />
              </button>
              {!funcion.esSistema && (
                <button onClick={() => { if (window.confirm(`¿Eliminar la función "${funcion.nombre}"? Se quitará a todos los usuarios que la tienen.`)) eliminar.mutate() }}
                  title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
        <textarea className={clsx(field, 'resize-none')} rows={2} value={descripcion} disabled={!puedeEditar}
          onChange={(e) => setDescripcion(e.target.value)} placeholder="¿Para qué sirve esta función?"
          onBlur={() => { if (puedeEditar && descripcion !== (funcion.descripcion ?? '')) actualizar.mutate({ descripcion }) }} />
        {!funcion.activo && <p className="mt-2 text-[0.72rem] text-amber-600">Desactivada: sus usuarios no reciben lo que esta función implica.</p>}
      </div>

      <div className={card}>
        <p className="mb-3 text-sm font-bold text-ink">Usuarios con esta función ({asignados.length})</p>
        {puedeEditar && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input className={clsx(field, 'pl-9')} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un usuario para agregar…" />
            {busca.trim() && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-100 bg-card shadow-lg">
                {candidatos.length === 0 ? <p className="px-3 py-2.5 text-xs text-ink-tertiary">Sin resultados</p> : candidatos.map((u) => (
                  <button key={u.id} onClick={() => agregar.mutate(u.id)} disabled={agregar.isPending}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-violet-50">
                    <UserPlus className="h-4 w-4 text-violet-500" /> {u.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
          : asignados.length === 0 ? <p className="py-4 text-center text-sm text-ink-tertiary">Nadie tiene esta función todavía.</p> : (
            <div className="space-y-1.5">
              {asignados.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
                  <Avatar name={u.nombre} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{u.nombre}</p>
                    <p className="truncate text-[0.7rem] text-ink-tertiary">{u.rol}{u.correo ? ` · ${u.correo}` : ' · sin correo registrado'}</p>
                  </div>
                  {puedeEditar && (
                    <button onClick={() => quitar.mutate(u.id)} title="Quitar" className="rounded-lg p-1.5 text-ink-tertiary transition hover:bg-red-50 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
