import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { AlertTriangle, Copy, Crown, Loader2, Mail, Plus, Send, Trash2, User, Users, X } from 'lucide-react'
import { clienteUsuariosService } from '@/services/clienteUsuarios.service'
import type { PortalResultadoAcceso, PortalUsuario } from '@/services/portalCliente.service'

const msgError = (e: unknown, f: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? f
const input = 'w-full rounded-xl border border-gray-200 bg-card py-2.5 pl-9 pr-3 text-[0.85rem] text-gray-900 placeholder-gray-400 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/15'

// Cuando el correo no salió: los datos para entregarlos a mano (solo se ven esta vez).
function AccesoManual({ nombre, r, onCerrar }: { nombre: string; r: PortalResultadoAcceso; onCerrar: () => void }) {
  const link = `${window.location.origin}/login`
  const copiar = (t: string) => { navigator.clipboard.writeText(t); toast.success('Copiado') }
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2 text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p className="flex-1 text-[0.75rem]"><b>No se pudo enviar el correo</b>{r.motivo ? ` (${r.motivo})` : ''}. Comparte estos datos con {nombre}: solo se muestran esta vez.</p>
        <button onClick={onCerrar} className="rounded p-0.5 hover:bg-amber-100" aria-label="Cerrar"><X className="h-3.5 w-3.5" /></button>
      </div>
      {[['Usuario', r.acceso?.usuario ?? ''], ['Contraseña', r.acceso?.password ?? ''], ['Enlace', link]].map(([l, v]) => (
        <div key={l} className="flex items-center gap-2">
          <span className="w-20 flex-shrink-0 text-[0.68rem] font-semibold text-amber-900/70">{l}</span>
          <code className="min-w-0 flex-1 break-all rounded-lg bg-card px-2 py-1 text-[0.75rem]">{v}</code>
          <button onClick={() => copiar(v)} title="Copiar" className="rounded p-1 text-amber-700 hover:bg-amber-100"><Copy className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button onClick={() => copiar(`Acceso al portal\nUsuario: ${r.acceso?.usuario}\nContraseña: ${r.acceso?.password}\n${link}`)}
        className="flex items-center gap-1 text-[0.7rem] font-semibold text-amber-800 hover:underline"><Copy className="h-3 w-3" /> Copiar todo</button>
    </div>
  )
}

/**
 * Todos los usuarios del portal de la empresa cliente: los que se crean aquí y
 * los que el cliente da de alta desde su portal. Se agregan (con acceso por
 * correo), se cambia su sub-rol, se activan/desactivan, se les reenvía el
 * acceso y se dan de baja. La cuenta principal se administra en "Acceso al sistema".
 */
export function UsuariosEmpresaCliente({ clienteId, empresa }: { clienteId: number; empresa: string }) {
  const qc = useQueryClient()
  const clave = ['cliente-usuarios', clienteId]
  const { data: usuarios = [], isLoading } = useQuery({ queryKey: clave, queryFn: () => clienteUsuariosService.listar(clienteId) })
  const { data: subroles = [] } = useQuery({ queryKey: ['portal-subroles-agyda'], queryFn: clienteUsuariosService.subroles, staleTime: 5 * 60_000 })
  const [nuevo, setNuevo] = useState<{ nombre: string; correo: string; subrolId: number | null } | null>(null)
  const [manual, setManual] = useState<{ nombre: string; r: PortalResultadoAcceso } | null>(null)
  const refrescar = () => qc.invalidateQueries({ queryKey: clave })

  const avisarAcceso = (nombre: string, r: PortalResultadoAcceso, hecho: string) => {
    if (r?.correoEnviado) toast.success(`${hecho} · se le envió su acceso por correo`)
    else { toast(`${hecho} · el correo no salió`, { icon: '⚠️' }); setManual({ nombre, r }) }
  }
  const crear = useMutation({
    mutationFn: () => clienteUsuariosService.crear(clienteId, { nombre: nuevo!.nombre.trim(), correo: nuevo!.correo.trim(), subrolId: (nuevo!.subrolId ?? subrolInicial)! }),
    onSuccess: (r) => { refrescar(); avisarAcceso(nuevo!.nombre.trim(), r, 'Usuario creado'); setNuevo(null) },
    onError: (e) => toast.error(msgError(e, 'No se pudo crear el usuario')),
  })
  const actualizar = useMutation({
    mutationFn: (x: { u: PortalUsuario; subrolId?: number; activo?: boolean }) => clienteUsuariosService.actualizar(clienteId, x.u.id, { subrolId: x.subrolId, activo: x.activo }),
    onSuccess: (_r, x) => { refrescar(); toast.success(x.activo === undefined ? 'Sub-rol actualizado' : x.activo ? 'Usuario activado' : 'Usuario desactivado') },
    onError: (e) => toast.error(msgError(e, 'No se pudo actualizar')),
  })
  const reenviar = useMutation({
    mutationFn: (u: PortalUsuario) => clienteUsuariosService.reenviarAcceso(clienteId, u.id),
    onSuccess: (r, u) => avisarAcceso(u.nombre, r, 'Contraseña nueva generada'),
    onError: (e) => toast.error(msgError(e, 'No se pudo reenviar el acceso')),
  })
  const eliminar = useMutation({
    mutationFn: (u: PortalUsuario) => clienteUsuariosService.eliminar(clienteId, u.id),
    onSuccess: () => { refrescar(); toast.success('Usuario dado de baja') },
    onError: (e) => toast.error(msgError(e, 'No se pudo dar de baja')),
  })
  const ocupado = actualizar.isPending || reenviar.isPending || eliminar.isPending
  const activos = usuarios.filter((u) => u.activo).length
  const subrolInicial = subroles.find((s) => s.nombre === 'Agente')?.id ?? subroles[0]?.id ?? null
  const correoOk = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim())

  return (
    <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5 border-b border-gray-100 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Users className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9rem] font-bold text-gray-800">Usuarios de la empresa</p>
          <p className="text-[0.68rem] text-gray-400">Quienes entran al portal por {empresa || 'este cliente'}, también los que ellos dan de alta</p>
        </div>
        {!isLoading && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.66rem] font-bold text-violet-700">{activos} activo{activos !== 1 ? 's' : ''}</span>}
      </div>

      {manual && <div className="mb-3"><AccesoManual nombre={manual.nombre} r={manual.r} onCerrar={() => setManual(null)} /></div>}

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-violet-500" /></div>
      ) : usuarios.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-[0.78rem] text-gray-400">Todavía no tiene usuarios en el portal</p>
      ) : (
        <ul className="space-y-2">
          {usuarios.map((u) => (
            <li key={u.id} className={clsx('flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5', u.activo ? 'border-gray-100' : 'border-dashed border-gray-200 bg-gray-50/60 opacity-70')}>
              <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[0.8rem] font-bold', u.esAncla ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700')}>
                {u.esAncla ? <Crown className="h-4 w-4" /> : (u.nombre || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[0.82rem] font-semibold text-gray-800">
                  <span className="truncate">{u.nombre}</span>
                  {u.esAncla && <span className="flex-shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-amber-700">Cuenta principal</span>}
                  {!u.activo && <span className="flex-shrink-0 rounded-full bg-gray-200 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-gray-500">Inactivo</span>}
                </p>
                <p className="truncate text-[0.7rem] text-gray-400">{u.usuario}</p>
              </div>
              <select value={u.subrolId} disabled={ocupado} aria-label={`Sub-rol de ${u.nombre}`}
                onChange={(e) => actualizar.mutate({ u, subrolId: Number(e.target.value) })}
                className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.72rem] font-semibold text-gray-700 outline-none focus:border-violet-400">
                {subroles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                {!subroles.some((s) => s.id === u.subrolId) && <option value={u.subrolId}>{u.subrolNombre}</option>}
              </select>
              {u.esAncla ? (
                <span className="text-[0.64rem] text-gray-400" title="Su acceso se administra en Acceso al sistema">Acceso arriba</span>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => actualizar.mutate({ u, activo: !u.activo })} disabled={ocupado} title={u.activo ? 'Desactivar' : 'Activar'}
                    className={clsx('relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50', u.activo ? 'bg-violet-600' : 'bg-gray-200')}
                    aria-label={u.activo ? `Desactivar a ${u.nombre}` : `Activar a ${u.nombre}`}>
                    <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform', u.activo ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <button onClick={() => reenviar.mutate(u)} disabled={ocupado || !u.activo} title="Generar contraseña nueva y reenviar el acceso"
                    className="ml-1 rounded-lg p-1.5 text-gray-400 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { if (window.confirm(`¿Dar de baja a ${u.nombre}? Ya no podrá entrar al portal.`)) eliminar.mutate(u) }} disabled={ocupado || !u.activo} title="Dar de baja"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        {nuevo ? (
          <div className="space-y-2.5 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                <input autoFocus className={input} placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
              </div>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
                <input className={input} type="email" placeholder="Correo (será su usuario)" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.72rem] font-semibold text-gray-600">Sub-rol</span>
              {subroles.map((s) => (
                <button key={s.id} type="button" onClick={() => setNuevo({ ...nuevo, subrolId: s.id })}
                  className={clsx('rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold transition',
                    (nuevo.subrolId ?? subrolInicial) === s.id ? 'border-violet-400 bg-violet-600 text-white' : 'border-gray-200 bg-card text-gray-600 hover:border-gray-300')}>
                  {s.nombre}
                </button>
              ))}
            </div>
            <p className="text-[0.66rem] text-gray-400">Se le genera una contraseña y se le envía su acceso por correo.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNuevo(null)} className="rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button onClick={() => crear.mutate()}
                disabled={!nuevo.nombre.trim() || !correoOk(nuevo.correo) || !(nuevo.subrolId ?? subrolInicial) || crear.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.78rem] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                {crear.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Crear y enviar acceso
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setNuevo({ nombre: '', correo: '', subrolId: subrolInicial })}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-200 px-4 py-2.5 text-[0.8rem] font-semibold text-violet-700 transition hover:border-violet-400 hover:bg-violet-50/60">
            <Plus className="h-4 w-4" /> Agregar usuario de la empresa
          </button>
        )}
      </div>
    </div>
  )
}
