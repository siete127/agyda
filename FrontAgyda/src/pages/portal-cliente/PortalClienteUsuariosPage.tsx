import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Users, Plus, ShieldCheck, Power, ChevronRight, Mail, User as UserIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { portalClienteService, type PortalUsuario } from '@/services/portalCliente.service'
import { usePortalAcciones } from '@/hooks/usePortalAcciones'
import { PortalHero } from './components/PortalHero'

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Usuarios</span>
    </div>
  )
}

const SUBROL_COLORES: Record<string, string> = {
  Admin: 'bg-violet-100 text-violet-700',
  Supervisor: 'bg-blue-100 text-blue-700',
  Apoyo: 'bg-amber-100 text-amber-700',
  Agente: 'bg-gray-100 text-gray-600',
}

function SubrolBadge({ nombre }: { nombre: string }) {
  return (
    <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold', SUBROL_COLORES[nombre] ?? 'bg-gray-100 text-gray-600')}>
      {nombre}
    </span>
  )
}

function ModalInvitar({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [subrolId, setSubrolId] = useState<number | ''>('')

  const { data: subroles = [] } = useQuery({
    queryKey: ['portal-subroles-disponibles'],
    queryFn: () => portalClienteService.getSubrolesDisponibles(),
  })

  const crear = useMutation({
    mutationFn: () => portalClienteService.crearUsuario({ nombre, correo, subrolId: Number(subrolId) }),
    onSuccess: () => {
      toast.success('Usuario invitado — se le envió su acceso por correo')
      onCreado()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e?.response?.data?.message || 'No se pudo invitar al usuario')
    },
  })

  return (
    <Modal isOpen onClose={onClose} title="Invitar usuario" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-ink-secondary">Nombre</label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo"
              className="w-full rounded-xl border border-surface-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-ink-secondary">Correo</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="correo@empresa.com"
              className="w-full rounded-xl border border-surface-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-ink-secondary">Sub-rol</label>
          <select value={subrolId} onChange={(e) => setSubrolId(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-xl border border-surface-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand">
            <option value="">Selecciona un sub-rol…</option>
            {subroles.map((r) => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface">
            Cancelar
          </button>
          <button
            onClick={() => crear.mutate()}
            disabled={!nombre || !correo || !subrolId || crear.isPending}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {crear.isPending ? 'Invitando…' : 'Invitar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function FilaUsuario({ usuario, onCambiado }: { usuario: PortalUsuario; onCambiado: () => void }) {
  const [editando, setEditando] = useState(false)

  const { data: subroles = [] } = useQuery({
    queryKey: ['portal-subroles-disponibles'],
    queryFn: () => portalClienteService.getSubrolesDisponibles(),
    enabled: editando,
  })

  const cambiarSubrol = useMutation({
    mutationFn: (subrolId: number) => portalClienteService.actualizarUsuario(usuario.id, { subrolId }),
    onSuccess: () => { toast.success('Sub-rol actualizado'); onCambiado(); setEditando(false) },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message || 'No se pudo actualizar'),
  })

  const toggleActivo = useMutation({
    mutationFn: () => portalClienteService.actualizarUsuario(usuario.id, { activo: !usuario.activo }),
    onSuccess: () => { toast.success(usuario.activo ? 'Usuario desactivado' : 'Usuario activado'); onCambiado() },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message || 'No se pudo actualizar'),
  })

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-surface-border bg-card px-4 py-3.5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <UserIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{usuario.nombre}{usuario.esAncla && <span className="ml-1.5 text-[0.65rem] font-normal text-ink-tertiary">(cuenta principal)</span>}</p>
        <p className="truncate text-xs text-ink-tertiary">{usuario.usuario}</p>
      </div>

      {editando ? (
        <select
          autoFocus
          defaultValue={usuario.subrolId}
          onChange={(e) => cambiarSubrol.mutate(Number(e.target.value))}
          onBlur={() => setEditando(false)}
          className="rounded-full border border-surface-border bg-card px-2.5 py-1 text-xs outline-none"
        >
          {subroles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      ) : (
        <button onClick={() => setEditando(true)} disabled={usuario.esAncla} className={clsx(!usuario.esAncla && 'cursor-pointer')} title={usuario.esAncla ? 'La cuenta principal siempre es Admin' : 'Cambiar sub-rol'}>
          <SubrolBadge nombre={usuario.subrolNombre} />
        </button>
      )}

      <span className={clsx('text-[0.7rem] font-semibold', usuario.activo ? 'text-emerald-600' : 'text-ink-tertiary')}>
        {usuario.activo ? 'Activo' : 'Inactivo'}
      </span>

      {!usuario.esAncla && (
        <button
          onClick={() => toggleActivo.mutate()}
          title={usuario.activo ? 'Desactivar' : 'Activar'}
          className="rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-surface hover:text-ink"
        >
          <Power className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function PortalClienteUsuariosPage() {
  const qc = useQueryClient()
  const [showInvitar, setShowInvitar] = useState(false)
  const { puede } = usePortalAcciones()

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['portal-usuarios'],
    queryFn: () => portalClienteService.getUsuarios(),
  })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['portal-usuarios'] })

  if (!puede('gestionar-usuarios')) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldCheck className="h-10 w-10 text-ink-tertiary" />
        <p className="text-sm font-semibold text-ink">No tienes permiso para gestionar usuarios</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Breadcrumb />
      <div className="mt-3">
        <PortalHero icon={Users} titulo="Usuarios de mi empresa" descripcion="Invita a tu equipo y asígnales un sub-rol dentro del portal." />
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setShowInvitar(true)}
          className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Invitar
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Cargando…</p>
        ) : usuarios.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Aún no hay usuarios registrados.</p>
        ) : (
          usuarios.map((u) => <FilaUsuario key={u.id} usuario={u} onCambiado={refrescar} />)
        )}
      </div>

      {showInvitar && (
        <ModalInvitar onClose={() => setShowInvitar(false)} onCreado={() => { setShowInvitar(false); refrescar() }} />
      )}
    </div>
  )
}
